#!/usr/bin/env node
// Offset-preserving G6 patches. No packages required; see analysis/MODDING.md.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const ORIGINAL = path.join(ROOT, 'tests/original/backup1.bin');
const NAME = 'hx330x_sdk.bin';
const SIZE = 0x100000;
const SHA256 = '278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hex = n => `0x${n.toString(16).toUpperCase()}`;
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
function check(condition, message) { if (!condition) throw new Error(message); }
function image(source) {
  check([SIZE, SIZE - 1].includes(source.length), 'Expected a 1 MiB image or an already trimmed export.');
  const b = source.length === SIZE ? Buffer.from(source) : Buffer.concat([source, Buffer.from([255])]);
  check(b.subarray(4, 8).toString() === 'BLDR', 'BLDR header not found.');
  check(b[SIZE - 1] === 255, 'Final byte is not FF; refusing to discard it.');
  return b;
}
function id(value) {
  const n = typeof value === 'number' ? value : /^[0-9a-f]{1,2}$/i.test(value) ? parseInt(value, 16) : Number(value);
  check(Number.isInteger(n) && n >= 1 && n <= 0x2C, `Unsupported effect ID: ${value}`);
  return n;
}
function bytes(value) {
  check(typeof value === 'string', 'Patch bytes must be a hex string.');
  const s = value.replace(/\s/g, '');
  check(s.length > 0 && s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s), 'Invalid patch hex.');
  return Buffer.from(s, 'hex');
}
function cycle(source, ids) {
  ids = ids.map(id);
  check(ids.length >= 1 && ids.length <= 26, 'Use 1..26 IDs; Normal is an additional implicit position.');
  check(new Set(ids).size === ids.length, 'Use distinct IDs so parameter caches cannot hide a change.');
  check(source.subarray(0x39940, 0x39944).toString('hex') === '190043bd', 'Forward wrap instruction differs.');
  check(source.subarray(0x39968, 0x3996C).toString('hex') === '1900609c', 'Reverse wrap instruction differs.');
  const table = Buffer.alloc(26); ids.forEach((n, i) => { table[i] = n; });
  return [
    { offset: 0x39940, data: Buffer.from([ids.length - 1, 0, 0x43, 0xBD]), note: 'forward wrap' },
    { offset: 0x39968, data: Buffer.from([ids.length - 1, 0, 0x60, 0x9C]), note: 'reverse wrap' },
    { offset: 0x7C504, data: table, note: 'cycle IDs; inactive slots zeroed' },
  ];
}
function patchImage(source, patches, timestamp) {
  const b = image(source);
  check(Number.isInteger(timestamp) && timestamp > b.readUInt32LE(0x14) && timestamp <= 0x7FFFFFFF,
    'Timestamp must exceed the source timestamp and fit a positive signed 32-bit word.');
  const ranges = [];
  for (const p of patches) {
    check(Number.isInteger(p.offset) && p.offset >= 0x200 && p.data.length > 0 && p.offset + p.data.length < SIZE,
      `Patch outside payload: ${p.offset}`);
    check(!ranges.some(([lo, hi]) => p.offset < hi && p.offset + p.data.length > lo), `Overlapping patch at ${hex(p.offset)}`);
    if (p.expect) check(p.expect.length === p.data.length && b.subarray(p.offset, p.offset + p.data.length).equals(p.expect),
      `Original bytes differ at ${hex(p.offset)}`);
    p.data.copy(b, p.offset);
    ranges.push([p.offset, p.offset + p.data.length]);
  }
  b.writeUInt32LE(timestamp, 0x14); // Full little-endian Unix timestamp, not just its low byte.
  return b.subarray(0, SIZE - 1); // Remove exactly the final FF; never trim the entire FF tail.
}
function presets(source) {
  const active = [0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x20, 0x21];
  const normal = { id: 0, label: 'Normal', detail: 'Original mode-dependent baseline.' };
  const make = (folder, title, summary) => ({ folder, title, summary, filters: [normal], patches: [] });
  const add = (build, offset, data, note) => build.patches.push({ offset, data: Buffer.from(data), expect: source.subarray(offset, offset + data.length), note });
  function effect(build, effectId, kind, offset) {
    check(effectId >= 0x19 && effectId !== 0x1F, 'Custom test IDs must avoid hard-coded LUT/1F paths.');
    for (const [type, table] of [['matrix', 0x81404], ['curve', 0x814B4], ['color', 0x81564]]) {
      add(build, table + (effectId - 1) * 4, u32(type === kind ? 0x06000000 + offset : 0), `${hex(effectId)} ${type} pointer`);
    }
    add(build, 0x813D8 + effectId - 1, Buffer.from([0]), `${hex(effectId)} baseline edge stage`);
  }
  function finish(build) {
    build.patches.unshift(...cycle(source, build.filters.slice(1).map(f => f.id)));
    return build;
  }
  const curve = make('filters-01-curve', '17-value curve', 'Large strength changes and broad index bands; other stages restore baseline.');
  const vectors = [
    ['All 0', Array(17).fill(0), 'Zero control.'],
    ['All 31', Array(17).fill(31), 'Maximum 5-bit value; compare directly with position 2.'],
    ['All 8', Array(17).fill(8), 'Low fixed strength.'],
    ['All 16', Array(17).fill(16), 'Middle fixed strength; not assumed identical to Normal.'],
    ['Indices 0..5 only', Array.from({ length: 17 }, (_, i) => i <= 5 ? 31 : 0), 'Low index band at 31; everything else 0.'],
    ['Indices 6..11 only', Array.from({ length: 17 }, (_, i) => i >= 6 && i <= 11 ? 31 : 0), 'Middle index band at 31; everything else 0.'],
    ['Indices 12..16 only', Array.from({ length: 17 }, (_, i) => i >= 12 ? 31 : 0), 'High index band at 31; everything else 0.'],
  ];
  const curveOffsets = [0x8164C, 0x81660, 0x81674, 0x81688, 0x8169C, 0x816B0, 0x816C4];
  vectors.forEach(([label, values, detail], i) => {
    effect(curve, active[i], 'curve', curveOffsets[i]);
    add(curve, curveOffsets[i], Buffer.from(values), label);
    curve.filters.push({ id: active[i], label, detail });
  });
  const matrix = make('filters-02-matrix', 'Color matrix', 'Strong component isolation, swaps and offsets; fixed identity is the control.');
  const matrices = [
    ['Identity', [256,0,0, 0,256,0, 0,0,256], [0,0,0], 'Compare subsequent positions with this fixed matrix.'],
    ['Component 0 only', [256,0,0, 0,0,0, 0,0,0], [0,0,0], 'Only the first diagonal component passes.'],
    ['Component 1 only', [0,0,0, 0,256,0, 0,0,0], [0,0,0], 'Only the middle diagonal component passes.'],
    ['Component 2 only', [0,0,0, 0,0,0, 0,0,256], [0,0,0], 'Only the last diagonal component passes.'],
    ['Swap 0 and 2', [0,0,256, 0,256,0, 256,0,0], [0,0,0], 'Swap the outer components; identify their visible colors.'],
    ['Copy component 0', [256,0,0, 256,0,0, 256,0,0], [0,0,0], 'Repeat one record row; tests matrix orientation and component meaning.'],
    ['Identity + offsets 32', [256,0,0, 0,256,0, 0,0,256], [32,32,32], 'Large offset change; compare with position 2.'],
  ];
  matrices.forEach(([label, coefficients, offsets, detail], i) => {
    const offset = 0x816D6 + i * 24, data = Buffer.alloc(24);
    [...coefficients, ...offsets].forEach((v, j) => data.writeUInt16LE(v, j * 2));
    effect(matrix, active[i], 'matrix', offset);
    add(matrix, offset, data, label);
    matrix.filters.push({ id: active[i], label, detail });
  });
  const color = make('filters-03-lut-color', 'Posterization and 88-byte controls', 'Four-level LUT and large word-0/word-2 changes, with original 1E as the fixed-record control.');
  const poster = Buffer.concat([0,85,170,255].map(v => Buffer.alloc(64, v)));
  add(color, 0x8E520, poster, 'L1 four-level quantization');
  color.filters.push({ id: 0x06, label: 'Four-level posterization', detail: 'Each channel maps to 0,85,170,255 instead of inversion.' });
  color.filters.push({ id: 0x1E, label: 'Original 1E control', detail: 'Original words 0/2 = 255/200; other record fields remain original.' });
  [[2,0], [2,255], [0,0], [0,128]].forEach(([word, value], i) => {
    const offset = 0x81614 + 88 * i, data = Buffer.from(source.subarray(0xA3D8, 0xA430));
    data.writeUInt32LE(value, word * 4);
    effect(color, active[i], 'color', offset);
    add(color, offset, data, `88-byte word ${word} = ${value}`);
    color.filters.push({ id: active[i], label: `Word ${word} = ${value}`, detail: `Only word ${word} differs from position 3; ${word === 2 ? 'brightness/EV-related' : 'contrast/gain hypothesis'}.` });
  });
  color.filters.push({ id: 0x01, label: 'Original grayscale', detail: 'Original matrix at 0x8177E is retained.' });
  // Four 88-byte records reuse only inactive edge/parameter templates, ending at 0x81774.
  check(0x81614 + 4 * 88 <= 0x8177E, 'Color probes overlap the grayscale matrix.');
  return [curve, matrix, color].map(finish);
}
function writeOutput(filename, data, force) {
  check(path.basename(filename) === NAME, `Export filename must be ${NAME}`);
  check(force || !fs.existsSync(filename), `${filename} exists; use --force to rebuild.`);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, data);
}
function catalog(outDir, source, results) {
  const lines = ['# Firmware test builds', '',
    'Flash the three filter builds in order 01 -> 02 -> 03. Follow the hardware requirement that each timestamp must be newer than the installed firmware. Rebuild before repeating an earlier test; its old file will have an older timestamp.', '',
    `Source: original backup, SHA-256 \`${sha(source)}\`. New files are **1,048,575 bytes**: full little-endian Unix timestamp at \`0x14..0x17\`, then exactly one final \`FF\` removed. Asset bytes are original.`, '',
    '| Folder | Unix timestamp | UTC | Description |', '| --- | ---: | --- | --- |'];
  for (const folder of ['2A', '2B', '2C']) {
    const file = path.join(outDir, folder, NAME);
    if (fs.existsSync(file)) {
      const b = fs.readFileSync(file), t = b.readUInt32LE(0x14);
      lines.push(`| [${folder}](${folder}/${NAME}) | ${t} | ${new Date(t * 1000).toISOString()} | Existing custom audio/photo test; ${b.length.toLocaleString('en-US')} bytes. |`);
    }
  }
  for (const r of results) lines.push(`| [${r.build.folder}](${r.build.folder}/${NAME}) | ${r.timestamp} | ${new Date(r.timestamp * 1000).toISOString()} | ${r.build.title}; Normal + 7 test filters. |`);
  lines.push('', 'Rebuild: `node tests/tools/patch_g6.js --tests --force`. If the installed timestamp is higher, add `--min-timestamp NUMBER`. The helper chooses timestamps above that value and existing test files, increasing by one second per build. The binary header, not the folder name, identifies the update.', '',
    'All three builds are untested on hardware. Button behavior is original apart from the filter cycle length. Start in photo mode after a fresh boot: position 1 is Normal; tap Down to advance, Up to reverse. Both directions wrap through exactly eight positions.', '',
    'Keep a fixed scene and lighting, including gray, white, black and red/green/blue objects. Compare live view and saved JPEG; optionally repeat in video. Report `folder / position / visible change`. A black, white or unchanged result is useful evidence. Do not change EV/WB between comparisons.', '');
  for (const r of results) {
    lines.push(`## ${r.build.folder}`, '', r.build.summary, '', '| Position | Effect ID | Test | What to compare |', '| ---: | --- | --- | --- |');
    r.build.filters.forEach((f, i) => lines.push(`| ${i + 1} | \`${f.id.toString(16).toUpperCase().padStart(2, '0')}\` | ${f.label} | ${f.detail} |`));
    lines.push('', `SHA-256: \`${sha(r.data)}\`.`, '');
  }
  lines.push('Build 03 repurposes inactive edge/parameter templates at `0x81614..0x81773`; its eight selected effects do not use the overwritten kernels/matrices/17-byte records. Original grayscale at `0x8177E` remains intact. Nothing is placed in unused flash tail space.', '',
    'Technical details: [filters](../tests/FILTERS.md), [modding map and patch recipes](../tests/analysis/MODDING.md).', '');
  return lines.join('\n');
}
function main(argv) {
  const flags = new Set(['--tests', '--force', '--dry-run', '--help']);
  const values = new Set(['--input', '--recipe', '--cycle', '--output', '--out-dir', '--timestamp', '--min-timestamp']);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    check(flags.has(key) || values.has(key), `Unknown option: ${key}`);
    args[key] = flags.has(key) ? true : argv[++i];
    check(args[key] !== undefined, `Missing value for ${key}`);
  }
  if (args['--help']) return console.log('node tests/tools/patch_g6.js --tests [--force] [--dry-run] [--min-timestamp UNIX]\nnode tests/tools/patch_g6.js --input FILE --recipe JSON --output bin/FOLDER/hx330x_sdk.bin\nOptional: --cycle "01,06,19,1A,1D,27,2A" --timestamp UNIX');
  const input = path.resolve(args['--input'] || ORIGINAL), source = fs.readFileSync(input), full = image(source);
  const minimum = Math.max(full.readUInt32LE(0x14), Number(args['--min-timestamp'] || 0));
  check(Number.isInteger(minimum) && minimum >= 0, 'Invalid minimum timestamp.');
  if (args['--tests']) {
    check(!args['--recipe'] && !args['--cycle'] && !args['--output'], '--tests cannot combine recipe/cycle/output overrides.');
    check(sha(source) === SHA256, 'Filter test presets require the exact original backup.');
    const outDir = path.resolve(args['--out-dir'] || path.join(ROOT, 'bin')), builds = presets(full);
    let latest = minimum;
    for (const build of builds) {
      const file = path.join(outDir, build.folder, NAME);
      if (fs.existsSync(file)) latest = Math.max(latest, fs.readFileSync(file).readUInt32LE(0x14));
      check(args['--force'] || !fs.existsSync(file), `${file} exists; use --force.`);
    }
    const start = args['--timestamp'] ? Number(args['--timestamp']) : Math.max(Math.floor(Date.now() / 1000), latest + 1);
    check(start > latest, 'Build timestamps must exceed all existing test timestamps and the installed minimum.');
    const results = builds.map((build, i) => ({ build, timestamp: start + i, data: patchImage(full, build.patches, start + i) }));
    if (!args['--dry-run']) {
      for (const r of results) writeOutput(path.join(outDir, r.build.folder, NAME), r.data, args['--force']);
      fs.writeFileSync(path.join(outDir, 'README.md'), catalog(outDir, source, results));
    }
    for (const r of results) console.log(`${r.build.folder}: timestamp ${r.timestamp}, ${r.data.length} bytes, ${sha(r.data)}`);
  } else {
    check(args['--output'] && (args['--recipe'] || args['--cycle']), 'Supply --tests, or a recipe/cycle and --output.');
    const recipe = args['--recipe'] ? JSON.parse(fs.readFileSync(args['--recipe'], 'utf8')) : {};
    if (recipe.source_sha256) check(sha(source) === recipe.source_sha256.toLowerCase(), 'Recipe source SHA-256 differs.');
    const patches = (recipe.patches || []).map(p => ({ offset: Number(p.offset), expect: bytes(p.expect), data: bytes(p.data) }));
    const ids = args['--cycle'] ? args['--cycle'].split(',') : recipe.cycle_ids;
    if (ids) patches.unshift(...cycle(full, ids));
    const timestamp = args['--timestamp'] ? Number(args['--timestamp']) : Math.max(Math.floor(Date.now() / 1000), minimum + 1);
    check(timestamp > minimum, 'Timestamp must exceed --min-timestamp.');
    const output = path.resolve(args['--output']);
    check(output !== input && output !== ORIGINAL, 'Refusing to overwrite the source image.');
    const data = patchImage(source, patches, timestamp);
    if (!args['--dry-run']) writeOutput(output, data, args['--force']);
    console.log(`${output}: timestamp ${timestamp}, ${data.length} bytes, ${sha(data)}`);
  }
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { presets, patchImage, cycle, image, SHA256, SIZE };

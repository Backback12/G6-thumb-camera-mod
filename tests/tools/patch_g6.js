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
function presets(source, round = 1) {
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
  if (round === 2) {
    const matrix = make('filters-04-matrix-fields', 'Matrix sign and offset fields',
      'Identity control, red-coefficient sign boundary, then large equal-channel offset changes.');
    const probes = [
      ['Identity', 256, 0, 'Fixed RGB identity; compare every probe with position 1.'],
      ['Red coefficient 511', 511, 0, 'Largest positive signed-10-bit value, if signed; expect stronger red.'],
      ['Red coefficient 512', 512, 0, 'Sign boundary: red loss/clipping supports signed encoding; brighter red supports unsigned.'],
      ['Red coefficient 1023', 1023, 0, 'Encoded -1 in signed two\'s complement, nearly 4x if unsigned. Green/blue stay at 256.'],
      ['All offsets 63', 256, 63, 'Largest positive signed-7-bit value, if signed; compare with identity.'],
      ['All offsets 64', 256, 64, 'Offset sign boundary, if signed; compare directly with position 5.'],
      ['All offsets 127', 256, 127, 'Encoded -1 in signed two\'s complement; compare with identity and position 5.'],
    ];
    probes.forEach(([label, red, offsetValue, detail], i) => {
      const offset = 0x816D6 + i * 24, data = Buffer.alloc(24);
      [red,0,0, 0,256,0, 0,0,256, offsetValue,offsetValue,offsetValue]
        .forEach((v, j) => data.writeUInt16LE(v, j * 2));
      effect(matrix, active[i], 'matrix', offset);
      add(matrix, offset, data, label);
      matrix.filters.push({ id: active[i], label, detail });
    });
    const color = make('filters-05-color-fields', 'Contrast and adjacent color fields',
      'Fixed word-2 brightness of 128; isolate words 0, 1 and 3 with large changes.');
    const controls = [
      ['Fixed control', null, 128, 'Words 0..3 all 128; not assumed identical to Normal.'],
      ['Word 0 = 0', 0, 0, 'Compare black/white separation with position 1; brightness word 2 stays 128.'],
      ['Word 0 = 255', 0, 255, 'Compare directly with positions 1 and 2 for contrast/gain behavior.'],
      ['Word 1 = 0', 1, 0, 'Unknown field at B15C[15:8]; report any tint, brightness or unchanged image.'],
      ['Word 1 = 255', 1, 255, 'Opposite endpoint of word 1; all other words match position 1.'],
      ['Word 3 = 0', 3, 0, 'Unknown field at B15C[7:0]; compare with position 1.'],
      ['Word 3 = 255', 3, 255, 'Opposite endpoint of word 3; all other words match position 1.'],
    ];
    controls.forEach(([label, word, value, detail], i) => {
      // Four inactive edge/parameter records, then three records in the unused 1F-only tone table.
      const offset = i < 4 ? 0x81614 + i * 88 : 0x8DF20 + (i - 4) * 88;
      const data = Buffer.from(source.subarray(0xA3D8, 0xA430));
      for (let j = 0; j < 4; j++) data.writeUInt32LE(128, j * 4);
      if (word !== null) data.writeUInt32LE(value, word * 4);
      effect(color, active[i], 'color', offset);
      add(color, offset, data, label);
      color.filters.push({ id: active[i], label, detail });
    });
    return [matrix, color].map(finish);
  }
  check(round === 1, 'Unknown test round.');
  const curve = make('filters-01-curve', '17-value curve', 'Large strength changes and broad index bands; other stages restore baseline.');
  const vectors = [
    ['All 0', Array(17).fill(0), 'Zero control.'],
    ['All 31', Array(17).fill(31), 'Maximum 5-bit value; compare directly with position 1.'],
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
    ['Identity + offsets 32', [256,0,0, 0,256,0, 0,0,256], [32,32,32], 'Large offset change; compare with position 1.'],
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
    color.filters.push({ id: active[i], label: `Word ${word} = ${value}`, detail: `Only word ${word} differs from position 2; ${word === 2 ? 'brightness/EV-related' : 'contrast/gain hypothesis'}.` });
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
function catalog(outDir, source) {
  const results = [...presets(image(source), 1), ...presets(image(source), 2)].flatMap(build => {
    const filename = path.join(outDir, build.folder, NAME);
    if (!fs.existsSync(filename)) return [];
    const data = fs.readFileSync(filename);
    return [{ build, data, timestamp: data.readUInt32LE(0x14) }];
  });
  const lines = ['# Firmware test builds', '',
    'Next round: **04 -> 05**. Each timestamp must be newer than the installed firmware (last reported: build 03, Unix **1795244473**). Rebuild before repeating an older test.', '',
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
  lines.push('', 'Rebuild this round: `node tests/tools/patch_g6.js --tests --round 2 --force`. Use `--round 1` for 01..03. If needed, add `--min-timestamp NUMBER`. Timestamps exceed the minimum and all existing known filter builds; each output increases by one second. Earlier binaries are preserved unless their round is explicitly rebuilt.', '',
    'Recipes 01..03 have owner feedback agreeing between live view and saved photos; 04..05 await hardware testing. See [observations and confidence](../tests/FILTERS_Plan.md#hardware-feedback-round-1). Button behavior is original apart from cycle length.', '',
    '**Position 0 = startup Normal**, then seven short Down presses select 1..7; the eighth returns to 0. Up reverses. The previous catalog used 1..8 labels; these tables now use 0..7 to match the hardware log. The owner confirmed the extra 8 in the curve log was a numbering error.', '',
    'Use a fixed scene with gray/white/black and red/green/blue objects. Rough visible differences are sufficient; no narrow band measurements are requested. For 04/05, compare each probe with position 1. Keep EV/WB fixed, allow exposure to settle, and report `folder / position / visible change` (including unchanged, black or clipped).', '');
  for (const r of results) {
    lines.push(`## ${r.build.folder}`, '', r.build.summary, '', '| Position | Effect ID | Test | What to compare |', '| ---: | --- | --- | --- |');
    r.build.filters.forEach((f, i) => lines.push(`| ${i} | \`${f.id.toString(16).toUpperCase().padStart(2, '0')}\` | ${f.label} | ${f.detail} |`));
    lines.push('', `SHA-256: \`${sha(r.data)}\`.`, '');
  }
  lines.push('Build 03 repurposes inactive templates at `0x81614..0x81773`. Build 05 uses the same area for four 88-byte records and `0x8DF20..0x8E027` for three more, replacing part of the unused ID-1F-only tone table. Neither build selects edge/1F effects; grayscale matrix `0x8177E`, baseline tone table `0x8DD20`, and media remain intact. No flash-tail allocation or convolution tests are included.', '',
    'Technical details: [filter findings](../tests/FILTERS.md), [analysis and test plan](../tests/FILTERS_Plan.md), [patch recipes](../tests/analysis/MODDING.md).', '');
  return lines.join('\n');
}
function main(argv) {
  const flags = new Set(['--tests', '--force', '--dry-run', '--help']);
  const values = new Set(['--input', '--recipe', '--cycle', '--output', '--out-dir', '--timestamp', '--min-timestamp', '--round']);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    check(flags.has(key) || values.has(key), `Unknown option: ${key}`);
    args[key] = flags.has(key) ? true : argv[++i];
    check(args[key] !== undefined, `Missing value for ${key}`);
  }
  if (args['--help']) return console.log('node tests/tools/patch_g6.js --tests [--round 1|2] [--force] [--dry-run] [--min-timestamp UNIX]\nnode tests/tools/patch_g6.js --input FILE --recipe JSON --output bin/FOLDER/hx330x_sdk.bin\nOptional: --cycle "01,06,19,1A,1D,27,2A" --timestamp UNIX');
  const input = path.resolve(args['--input'] || ORIGINAL), source = fs.readFileSync(input), full = image(source);
  const minimum = Math.max(full.readUInt32LE(0x14), Number(args['--min-timestamp'] || 0));
  check(Number.isInteger(minimum) && minimum >= 0, 'Invalid minimum timestamp.');
  if (args['--tests']) {
    check(!args['--recipe'] && !args['--cycle'] && !args['--output'], '--tests cannot combine recipe/cycle/output overrides.');
    check(sha(source) === SHA256, 'Filter test presets require the exact original backup.');
    const outDir = path.resolve(args['--out-dir'] || path.join(ROOT, 'bin')), builds = presets(full, Number(args['--round'] || 1));
    let latest = minimum;
    for (const build of [...presets(full, 1), ...presets(full, 2)]) {
      const file = path.join(outDir, build.folder, NAME);
      if (fs.existsSync(file)) latest = Math.max(latest, fs.readFileSync(file).readUInt32LE(0x14));
      if (builds.some(b => b.folder === build.folder)) check(args['--force'] || !fs.existsSync(file), `${file} exists; use --force.`);
    }
    const start = args['--timestamp'] ? Number(args['--timestamp']) : Math.max(Math.floor(Date.now() / 1000), latest + 1);
    check(start > latest, 'Build timestamps must exceed all existing test timestamps and the installed minimum.');
    const results = builds.map((build, i) => ({ build, timestamp: start + i, data: patchImage(full, build.patches, start + i) }));
    if (!args['--dry-run']) {
      for (const r of results) writeOutput(path.join(outDir, r.build.folder, NAME), r.data, args['--force']);
      fs.writeFileSync(path.join(outDir, 'README.md'), catalog(outDir, source));
    }
    for (const r of results) console.log(`${r.build.folder}: timestamp ${r.timestamp}, ${r.data.length} bytes, ${sha(r.data)}`);
  } else {
    check(!args['--round'], '--round requires --tests.');
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

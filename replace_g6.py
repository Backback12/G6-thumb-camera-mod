#!/usr/bin/env python3
"""Build G6 project media and filter JSON from the original backup."""
from pathlib import Path
import io
import struct
import wave
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "backup1.bin"       # Original unmodified firmware
CUSTOM = ROOT / "custom"
OUTPUT = ROOT / "custom.bin"

# Foremost audit: filename -> byte offset in firmware
OFFSETS = {
    "00001552.jpg": 794626,
    "00001565.jpg": 801743,
    "00001580.jpg": 809196,
    "00001595.jpg": 816693,
    "00001609.jpg": 824308,
    "00000989.wav": 506556,
    "00001264.wav": 647280,
    "00001291.wav": 661198,
    "00001428.wav": 731302,
    "00001548.wav": 792744,
}


def clean_jpg(data):
    """Remove EXIF (APP1) and comment (COM) segments without re-encoding pixels."""
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise ValueError("not a complete JPEG")
    result = bytearray(data[:2])
    pos = 2
    while pos < len(data):
        if data[pos] != 0xff:
            raise ValueError("invalid JPEG marker")
        start = pos
        while pos < len(data) and data[pos] == 0xff:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker == 0xda:  # SOS: remaining bytes are compressed image data
            result += data[start:]
            return bytes(result)
        if marker == 0xd9:
            result += data[start:pos]
            return bytes(result)
        if marker in (0x01, *range(0xd0, 0xd8)):
            result += data[start:pos]
            continue
        seglen = int.from_bytes(data[pos:pos + 2], "big")
        if seglen < 2 or pos + seglen > len(data):
            raise ValueError("invalid JPEG segment")
        if marker not in (0xe1, 0xfe):
            result += data[start:pos + seglen]
        pos += seglen
    raise ValueError("JPEG has no image scan")


def clean_wav(data, original, capacity):
    """Strip non-PCM chunks, and frame-aligned crop if required."""
    with wave.open(io.BytesIO(original), "rb") as ref, wave.open(io.BytesIO(data), "rb") as src:
        fmt = lambda w: (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getcomptype())
        if fmt(src) != fmt(ref):
            raise ValueError(f"WAV format mismatch: {fmt(src)} != {fmt(ref)}")
        params = src.getparams()
        frames = src.readframes(src.getnframes())

    frame_bytes = params.nchannels * params.sampwidth
    # Standard PCM WAV uses a 44-byte header. Leave space for required padding.
    max_frames = max(0, (capacity - 44) // frame_bytes)
    total_frames = len(frames) // frame_bytes
    if total_frames > max_frames:
        print(f"  WARNING: cropping WAV from {total_frames} to {max_frames} frames")
        frames = frames[:max_frames * frame_bytes]
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setparams(params)
        wav.writeframes(frames)
    return out.getvalue()


def original_length(firmware, name, offset):
    if name.endswith(".wav"):
        if firmware[offset:offset + 4] != b"RIFF":
            raise ValueError("original WAV header not found")
        return struct.unpack_from("<I", firmware, offset + 4)[0] + 8
    if firmware[offset:offset + 2] != b"\xff\xd8":
        raise ValueError("original JPEG header not found")
    end = firmware.find(b"\xff\xd9", offset)
    if end < 0:
        raise ValueError("original JPEG end not found")
    return end + 2 - offset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, help='Project folder containing media and filters/')
    parser.add_argument('--timestamp', type=int)
    parser.add_argument('--min-timestamp', type=int, default=0)
    args = parser.parse_args()
    if not args.project and not any((CUSTOM / name).is_file() for name in OFFSETS):
        parser.error('Use --project custom/<project-folder> for the project layout')
    project = args.project.resolve() if args.project else CUSTOM
    output = project / 'hx330x_sdk.bin' if args.project else OUTPUT
    original_image = SOURCE.read_bytes()
    firmware = bytearray(original_image)
    if hashlib.sha256(firmware).hexdigest() != '278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184':
        raise ValueError('Source backup differs from the verified original')
    latest = max(struct.unpack_from('<I', firmware, 0x14)[0], args.min_timestamp)
    for folder in (ROOT / 'tests' / 'binaries', ROOT / 'custom'):
        for binary in folder.rglob('hx330x_sdk.bin'):
            with binary.open('rb') as stream:
                stream.seek(0x14)
                latest = max(latest, struct.unpack('<I', stream.read(4))[0])
    timestamp = args.timestamp if args.timestamp is not None else max(int(time.time()), latest + 1)
    if not latest < timestamp <= 0x7fffffff:
        raise ValueError('Timestamp must exceed all existing builds and the minimum')
    count = 0
    assets = []
    for name, offset in OFFSETS.items():
        path = project / name
        if not path.is_file():
            continue
        print(f"{name}:")
        try:
            capacity = original_length(firmware, name, offset)
            original = bytes(firmware[offset:offset + capacity])
            data = path.read_bytes()
            if name.endswith(".jpg"):
                data = clean_jpg(data)
            else:
                data = clean_wav(data, original, capacity)
            if len(data) > capacity:
                raise ValueError(f'{len(data)} bytes > {capacity} bytes')
            # Do not move neighboring assets; preserve unused original bytes.
            firmware[offset:offset + len(data)] = data
            print(f"  OK: {len(data)}/{capacity} bytes" + (" (original tail retained)" if len(data) < capacity else ""))
            count += 1
            assets.append(name)
        except (ValueError, EOFError, wave.Error) as err:
            raise ValueError(f'{name}: {err}') from err

    compiled = {'filters': []}
    if (project / 'filters').is_dir():
        with tempfile.TemporaryDirectory() as scratch:
            source_path, result_path = Path(scratch) / 'source.bin', Path(scratch) / 'result.bin'
            source_path.write_bytes(firmware)
            result = subprocess.run(['node', str(ROOT / 'tests/tools/compile_filters.js'), str(source_path), str(project / 'filters'), str(result_path)], check=True, capture_output=True, text=True)
            compiled = json.loads(result.stdout)
            firmware = bytearray(result_path.read_bytes())
    if firmware[:0xA600] != original_image[:0xA600]:
        raise ValueError('Boot/SD-update prefix was modified; refusing export')
    if firmware[0xF1200:] != original_image[0xF1200:]:
        raise ValueError('Trailing FF storage was modified; refusing export')
    struct.pack_into('<I', firmware, 0x14, timestamp)
    if len(firmware) != 0x100000 or firmware[-1] != 0xff:
        raise ValueError('Unexpected image size/tail')
    output.write_bytes(firmware[:-1])
    if args.project:
        built = datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
        title = re.sub(r'^\d+[-_]', '', project.name)
        lines = ['# ' + title, '', f'Built UTC: {built}. Unix timestamp: **{timestamp}**.', '',
                 'Source: original backup1.bin. Output: hx330x_sdk.bin (1,048,575 bytes); full LE32 timestamp at 0x14 and exactly one final FF removed.', '',
                 'Position 0 is startup Normal; short Down advances, Up reverses. These custom combinations await hardware testing. Preview assumptions in JSON are not firmware parameters.', '',
                 '| Position | Effect ID | Filter file |', '| ---: | --- | --- |', '| 0 | 00 | Normal |']
        for i, item in enumerate(compiled['filters'], 1):
            lines.append(f"| {i} | {item['id']:02X} | filters/{item['file']} |")
        lines += ['', 'Media replacements: ' + ', '.join(assets) + '.', '',
                  'All 18 channel tables (six RGB presets) are copied into a checked 4,608-byte heap allocation during a custom LUT change. The selected three tables are uploaded to the ISP, then the allocation is freed. No persistent RAM pointer or bank extension; allocation failure uses the stock LUT fallback. The matrix-only preset allocates no LUT memory.', '',
                  'The existing LUT switch at 0x5962C..0x5973B is replaced in place; parameter slots at 0x81614 are reused. LUT source data fits after the shortened 00001291.wav RIFF/PCM end, within its original 70,104-byte resource slot. Its playable bytes and source WAV are unchanged. No new code/data in the final FF area. Original LUT/tone libraries and loader are preserved.', '',
                  'Boot/SD-update bytes 0x200..0xA5FF are unchanged, as are other application routines outside the documented filter/cycle edits. Header timestamp changes at 0x14; output removes one final FF. Filter code is gated by the active ISP and custom effect ID, not inserted into boot/update entry points. Hardware validation after a full power cycle and during recording is still required.', '',
                  'SHA-256: `' + hashlib.sha256(firmware[:-1]).hexdigest() + '`.', '',
                  'Rebuild from repository root: `python replace_g6.py --project "' + project.relative_to(ROOT).as_posix() + '"`. Rebuilds choose a newer timestamp; rename the folder to match that timestamp when keeping another release.', '']
        if compiled.get('patches'):
            lines += ['## Filter patch map', '', '| Offset | Bytes | Change |', '| --- | ---: | --- |']
            for patch in compiled['patches']:
                lines.append(f"| 0x{patch['offset']:X} | {patch['length']} | {patch['note']} |")
            lines += ['', 'RAM ownership: original malloc 0x26760 / free 0x2695C. The allocator skips occupied blocks; returned spans must fit 0x02000000..0x02200000. No guessed fixed RAM address is used. The stock fixed bank 0x02008E40..0x0200953F and adjacent tone buffers are not expanded.', '']
        (project / 'README.md').write_text('\n'.join(lines), encoding='utf8')
    print(f'Saved {output}: {count} media replacements, {len(compiled["filters"])} filters + Normal, Unix {timestamp}')


if __name__ == "__main__":
    main()

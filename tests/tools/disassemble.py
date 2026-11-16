#!/usr/bin/env python3
"""Disassemble the copied little-endian OR1K firmware with Ubuntu binutils-or1k-elf.

Binutils 2.42 reads raw binary words as big-endian despite -EL, so a temporary
32-bit word-swapped view is needed. Offsets remain identical to the source.
The resulting listing is a broad *candidate* disassembly: data is decoded too.
"""
from pathlib import Path
import gzip
import re
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = root / 'original' / 'backup1.bin'
out = root / 'analysis'
objdump = shutil.which('or1k-elf-objdump')
if objdump is None:
    raise SystemExit('Install binutils-or1k-elf or add or1k-elf-objdump to PATH')
raw = source.read_bytes()
if len(raw) % 4:
    raise SystemExit('Image size is not word aligned')
with tempfile.TemporaryDirectory() as temp:
    swapped = Path(temp) / 'words_be.bin'
    swapped.write_bytes(b''.join(raw[i:i + 4][::-1] for i in range(0, len(raw), 4)))
    for start, stop, name in (
        (0x4C, 0x120, 'header_stub_00004c_000120.txt'),
        (0x200, 0x6C000, 'openrisc_000200_06c000.txt.gz'),
    ):
        result = subprocess.run(
            [objdump, '-D', '-b', 'binary', '-m', 'or1k', '-EB',
             f'--start-address={start}', f'--stop-address={stop}', str(swapped)],
            check=True, text=True, capture_output=True)
        if name.endswith('.gz'):
            with gzip.open(out / name, 'wt', compresslevel=9) as f:
                f.write(result.stdout)
            focused = []
            for line in result.stdout.splitlines():
                match = re.match(r'\s*([0-9a-f]+):', line)
                if match and any(lo <= int(match[1], 16) < hi for lo, hi in
                                 ((0xA6C, 0xBC4), (0x47A0, 0x4A2C),
                                  (0x4D874, 0x4D930), (0x4DDC8, 0x4DE24),
                                  (0x4E1D0, 0x4E2A0), (0x4E6AC, 0x4EA28),
                                  (0x4EB74, 0x4EC80))):
                    focused.append(line)
            (out / 'key_routines.txt').write_text('\n'.join(focused) + '\n')
        else:
            (out / name).write_text(result.stdout)
        print(name, len(result.stdout.splitlines()), 'lines')

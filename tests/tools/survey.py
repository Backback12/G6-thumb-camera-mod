#!/usr/bin/env python3
"""Read-only survey of the copied G6 firmware image.

Outputs are deliberately limited to metadata, not modified firmware images.
Run from the repository root: python3 tests/tools/survey.py
"""

from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from math import log2
from pathlib import Path
import json
import re
import struct
import wave
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "original" / "backup1.bin"
OUT = ROOT / "analysis"


def all_offsets(data: bytes, marker: bytes):
    pos = 0
    while (pos := data.find(marker, pos)) >= 0:
        yield pos
        pos += 1


def main():
    data = SOURCE.read_bytes()
    OUT.mkdir(exist_ok=True)
    header = {f"0x{off:02X}": struct.unpack_from("<I", data, off)[0]
              for off in (0, 0x10, 0x14, 0x18, 0x1C, 0x20, 0x24, 0x28, 0x34, 0x38)}
    timestamp = datetime.fromtimestamp(header["0x14"], timezone.utc).isoformat()
    manifest = {
        "source": "tests/original/backup1.bin",
        "size": len(data),
        "sha256": sha256(data).hexdigest(),
        "header_u32_le": header,
        "header_0x14_as_unix_utc": timestamp,
        "version_record_at_0x7CBC4": data[0x7CBC4:0x7CBD2].hex(" "),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    with (OUT / "strings.tsv").open("w") as f:
        f.write("offset_hex\tlength\ttext\n")
        for m in re.finditer(rb"[\x20-\x7e]{5,}", data):
            text = m.group().decode("ascii").replace("\\", "\\\\").replace("\t", "\\t")
            f.write(f"0x{m.start():06X}\t{m.end()-m.start()}\t{text}\n")

    with (OUT / "entropy_16k.tsv").open("w") as f:
        f.write("start_hex\tend_hex\tentropy_bits_per_byte\tzero_fraction\tff_fraction\n")
        for start in range(0, len(data), 0x4000):
            chunk = data[start:start + 0x4000]
            counts = Counter(chunk)
            entropy = -sum((n / len(chunk)) * log2(n / len(chunk)) for n in counts.values())
            f.write(f"0x{start:06X}\t0x{start+len(chunk):06X}\t{entropy:.3f}\t{counts[0]/len(chunk):.3f}\t{counts[255]/len(chunk):.3f}\n")

    # These are exact embedded-format matches. A JPEG EOI scan can end early if
    # malformed data embeds an EOI, so report its size as a scan bound only.
    with (OUT / "assets.tsv").open("w") as f:
        f.write("type\toffset_hex\tlength\tdetails\n")
        for off in all_offsets(data, b"RIFF"):
            if data[off + 8:off + 12] != b"WAVE":
                continue
            length = struct.unpack_from("<I", data, off + 4)[0] + 8
            if length > len(data) - off:
                continue
            try:
                with wave.open(BytesIO(data[off:off+length]), "rb") as w:
                    details = f"{w.getnchannels()}ch {w.getframerate()}Hz {w.getsampwidth()*8}bit {w.getnframes()}frames"
            except (wave.Error, EOFError):
                continue
            f.write(f"WAV\t0x{off:06X}\t{length}\t{details}\n")
        for off in all_offsets(data, b"\xff\xd8\xff"):
            end = data.find(b"\xff\xd9", off)
            if end < 0:
                continue
            length = end + 2 - off
            try:
                with Image.open(BytesIO(data[off:off+length])) as im:
                    details = f"{im.width}x{im.height} {im.mode}"
            except (OSError, ValueError):
                continue
            f.write(f"JPEG\t0x{off:06X}\t{length}\t{details}\n")

    # Aligned literal pointers help identify data tables. Instruction-encoded
    # movhi/ori pairs are not included here.
    with (OUT / "flash_pointers.tsv").open("w") as f:
        f.write("source_offset_hex\tflash_address_hex\ttarget_offset_hex\n")
        for pos in range(0, len(data) - 3, 4):
            value = struct.unpack_from("<I", data, pos)[0]
            if 0x06000000 <= value < 0x06000000 + len(data):
                f.write(f"0x{pos:06X}\t0x{value:08X}\t0x{value-0x06000000:06X}\n")

    # Menu order and ISP effect-table references, identified by the call chain
    # 0x398E4 -> sensor property 0x10000705 -> 0x59478.
    with (OUT / "filter_map.tsv").open("w") as f:
        f.write("menu_slot\teffect_id_hex\tbyte_stage\tparam24_address\tparam17_address\tparam88_address\n")
        for slot, effect_id in enumerate(data[0x7C504:0x7C504 + 26]):
            index = effect_id - 1
            byte_stage = data[0x813D8 + index]
            pointers = [struct.unpack_from("<I", data, base + index * 4)[0]
                        for base in (0x81404, 0x814B4, 0x81564)]
            f.write(f"{slot}\t0x{effect_id:02X}\t{byte_stage}\t" +
                    "\t".join(f"0x{value:08X}" for value in pointers) + "\n")


if __name__ == "__main__":
    main()

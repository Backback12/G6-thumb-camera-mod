#!/usr/bin/env python3
"""Replace known G6 camera JPG/WAV assets without shifting firmware offsets."""
from pathlib import Path
import io
import struct
import wave

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
    firmware = bytearray(SOURCE.read_bytes())
    count = 0
    for name, offset in OFFSETS.items():
        path = CUSTOM / name
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
                print(f"  ERROR: {len(data)} bytes > {capacity} bytes; skipped")
                continue
            # Do not move neighboring assets; preserve unused original bytes.
            firmware[offset:offset + len(data)] = data
            print(f"  OK: {len(data)}/{capacity} bytes" + (" (original tail retained)" if len(data) < capacity else ""))
            count += 1
        except (ValueError, EOFError, wave.Error) as err:
            print(f"  ERROR: {err}; skipped")

    # Set firmware version at offset 0x14
    current = firmware[0x14]
    print(f"Current firmware version byte: 0x{current:02X}")

    value = input("New version (hex, e.g. 2B; Enter to skip): ").strip()

    if value:
        new_version = int(value.removeprefix("0x"), 16)
        if not 0 <= new_version <= 0xFF:
            raise ValueError("Version must be between 00 and FF")

        firmware[0x14] = new_version
        print(f"Firmware version: 0x{current:02X} -> 0x{new_version:02X}")
    
    OUTPUT.write_bytes(firmware)
    print(f"Saved {OUTPUT.name}: {count} replacement(s), {len(firmware)} bytes")


if __name__ == "__main__":
    main()

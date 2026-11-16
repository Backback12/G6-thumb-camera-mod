# G6 firmware findings

All analysis uses `original/backup1.bin`, an exact 1,048,576-byte copy of `../backup1.bin`. Both have SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`. Offsets below are **file offsets**. The image is little-endian OpenRISC; flash is addressed as `0x06000000 + file offset`.

## Reproduce

- `python3 tests/tools/survey.py` produces the header, string, entropy, pointer, media and filter tables in `analysis/` (requires Pillow).
- `python3 tests/tools/disassemble.py` produces the compressed candidate assembly and `key_routines.txt` (requires `or1k-elf-objdump`). Data in the broad assembly listing also decodes as instructions.
- `tools/AnalyzeG6.java` produces `analysis/ghidra_focus.txt`. Import the copied image in Ghidra at `0x06000000` with the [OpenRISC LE language](https://github.com/aleph-void/ghidra-or1k-le-hack), then run the script. It maps the boot copy at file `0x200` to RAM `0x0` and the update copy at file `0x2E00` to RAM `0x02000000`. Ghidra's SPR decompile is imperfect; check `key_routines.txt` for the actual register operations.

The Ghidra project, Java 25, downloaded tools and scratch scripts were kept under `/tmp`, not this repository. These temporary files may disappear after a reboot.

## Confirmed from this image

| Feature | Evidence |
| --- | --- |
| Update gate | `hx330x_sdk.bin` is at `0x7E484`. The worker at `0x47A0` checks `BLDR` and reads header words `0x10` and `0x14` from installed flash and the SD file. Matching **both** words rejects the candidate; a difference in either passes this visible check. No greater-than comparison appears in this worker. Other update stages were not ruled out. |
| Header and displayed version | `0x14` is a 32-bit little-endian word, `0x6A057529`, equivalent to 2026-05-14 07:09:29 UTC as a Unix timestamp. The existing patch script changes only its low byte. `HF\0` is at `0x7CBC4`, followed by `9850-260513\0` at `0x7CBC7`; the displayed formatting is not decoded. |
| Media | Five valid WAVs and five valid JPEGs; offsets and sizes are in `analysis/assets.tsv`. The final 60,928 bytes (`0xF1200–0xFFFFF`) are `0xFF`, but are not proven safe for added content. |

The visible update gate checks **difference, not chronological order**. A current UTC Unix timestamp fits in the word; for example, 2026-11-15 00:00 UTC is `0x6AF8F600`. The latest representable timestamp is 2038-01-19 03:14:07 UTC if interpreted as signed, or 2106-02-07 06:28:15 UTC if unsigned. Firmware interpretation beyond the equality check, including any boot-ROM rule, is unverified. The field has 2³² values, so it is not infinite.

## LED and GPIO trace

The driver table at `0x8324–0x83B3` contains separate `lcd`, `led` and `ir` entries. Their handlers call a RAM routine at **`0x02002CAC`** (file `0x5AAC`) that reads an SPR, sets or clears a mask, and writes the SPR back. The register is `0x8000 + 4 × port index`. This is the pin-control path, not a file being switched on and off.

| Path | Static pin values | Calls and behavior | Physical identity |
| --- | --- | --- | --- |
| `lcd`, handler `0x0156D4` | Port 0, mask `0x0200` → SPR `0x8000`, bit 9 | Your `0x0396D4` requests 1, `0x03935C` requests 0, `0x040880` forwards a state, and `0x015770` calls the SPR writer. Event table `0x7D75C` maps key code `0x19` to `0x040068`, which reads the cached LCD state and requests the opposite state via `0x0408B0` → `0x04083C` → property `0x10000500`. | **LCD screen toggle confirmed** for the key's short event; physical backlight wiring is inferred. |
| `led`, handler `0x0157C0` | Port 4, mask `0x0800` → SPR `0x8010`, bit 11 | Init calls with 1 at `0x0397CC`; shutdown calls with 0 at `0x039390`. Video event callback `0x048294` and another callback `0x045F04` each send a saved bit, then XOR it with 1. | Strong **blue status LED** match from behavior; physical color and callback interval remain unmeasured. |
| `ir`, handler `0x014DD0` | Port 3, mask `0x0001` → SPR `0x800C`, bit 0 | Video button handler `0x0488A0` toggles this driver after three press events. Photo handler `0x046EB8` changes its mode. Capture code at `0x047090–0x0470C0` calls `1 → 0 → 1 → 0`, with 50 timer ticks between changes. | Strong **white photo light** match; physical color and tick duration remain unmeasured. |

The `lcd`, `led` and `ir` paths are distinct. In the decompiled photo/video callbacks, only `led` has the repeated XOR toggle and only `ir` has the capture pulses and held-button toggle. Direct writes elsewhere are not fully audited. The time represented by three button events and the blink callback schedule were not recovered.

## Filters, menu text and icons

Filter cycling at **`0x0398E4`** has unfiltered ID `0` plus 26 entries at `0x7C504`, while the owner observes **26 total visible states including normal**. That count difference is unresolved; ID `0x2C` has no separately observed state. The six final table IDs `0x27–0x2C` select a 5×5 signed 6-bit edge kernel at `0x81630` and stage values `0`, `20`, `40`; IDs `0x27–0x29` add a monochrome-like matrix and `0x2A–0x2C` use the baseline matrix. Other effects use per-channel LUTs, color matrices, 17-byte records that may control saturation, or one 88-byte record of unknown purpose. See **[FILTERS.md](FILTERS.md)** for separate appearance and full parameter tables. Reordering IDs at `0x7C504` is plausible but has not been camera-tested. The printable run at `0x7C511` is part of that ID table, not ASCII icon art.

Menu/UI text includes `Play Audio` (`0x7D7E0`), `Play Video` (`0x7D924`), `Power Off` (`0x7E048`), `Record Audio` (`0x7E052`), `Record Photo` (`0x7E0E0`), `Record Video` (`0x7E2C8`) and `SD Update` (`0x7E493`). Photo options `10M`, `12M`, `20M` start at `0x7E11A`; video options `720P`, `1080P`, `2K` start at `0x7E2D5`. Several labels are referenced by app descriptors around `0x9EDC–0xA278`. They are NUL-terminated; longer replacements need layout and pointer analysis. Numeric UI values `0x80000026/27` occur in photo/video layout records at `0x7E3A8/0x7E214` and in IR status UI calls, suggesting icon/resource IDs, but their pixel format is not decoded. No standalone ASCII icon table was established.

# G6 firmware findings

All analysis uses `original/backup1.bin`, 1,048,576 bytes with SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`. Offsets below are **file offsets**. The image is little-endian OpenRISC; flash is addressed as `0x06000000 + file offset`.

## Reproduce

- `node tests/tools/patch_g6.js --tests --round 4` creates build 07 (Normal + 20 LUT/color/bit probes), preserving 01..06. See [analysis/MODDING.md](analysis/MODDING.md) for timestamps and patch recipes.
- `node tests/filter-emulator/server.js` opens the dependency-free [filter editor](filter-emulator/README.md) at `http://127.0.0.1:8787`: six simultaneous before/after views, compact controls, neutral/factory comparisons, draggable LUT curves, Save JSON and Copy config. Unknown meanings are italicized; ISP equations remain approximate.

- `python3 tests/tools/survey.py` produces the header, string, entropy, pointer, media and filter tables in `analysis/` (requires Pillow).
- `powershell -NoProfile -ExecutionPolicy Bypass -File tests/tools/extract_ui.ps1` produces `analysis/icons.png`, `icons.tsv` and `ui_text.tsv` from the original (Windows/System.Drawing; no firmware writes).
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
| `ir`, handler `0x014DD0` | Port 3, mask `0x0001` → SPR `0x800C`, bit 0 | Video button handler `0x0488A0` toggles this driver on the third held-repeat event. Photo handler `0x046EB8` changes its mode. Capture code at `0x047090–0x0470C0` calls `1 → 0 → 1 → 0`, with 50 timer ticks between changes. | Strong **white photo light** match; physical color and tick duration remain unmeasured. |

The `lcd`, `led` and `ir` paths are distinct. In the decompiled photo/video callbacks, only `led` has the repeated XOR toggle and only `ir` has the capture pulses and held-button toggle. Direct writes elsewhere are not fully audited. The wall-clock hold duration and blink callback schedule remain unmeasured.

## Buttons and event dispatch

The `key` driver is registered at `0x836C`: init `0x14EB4`, control `0x15100`. Property `0x400` returns a packed event: low 16 bits = key ID, high 16 bits = `0` initial, `1` held repeat, `2` release. Polling at `0x412C8` queues it; dispatcher `0x3F900` splits it and calls the mode handler plus the global handler. Callback argument 2 is the argument count (`1`), not the hold state. Global entries are at `0x7D72C`, photo entries at `0xA1F4`, video entries at `0xA29C`, and settings entries at `0x9A00`.

| Physical action / key ID | Handler and use |
| --- | --- |
| Power tap `19` | Global `0x40068`, table entry `0x7D75C`. Initial event toggles cached LCD state at RAM `0x0201241D` through `0x408B0 -> 0x4083C -> lcd property 0x10000500`. |
| Power hold `1A` | Global `0x3FE0C` requests app state 1 through `0x3FC18`, separately from the LCD tap path. |
| Down `16` | Photo `0x46EB8`, video `0x488A0`. Release before three repeats calls `0x398E4(1)` to advance filters; the third repeat toggles the white light, suppressing filter advance on release. Settings `0x3C714` instead navigates the list on initial/repeat events. |
| Up `15`; rotation event `1E` | Photo `0x46980` and video `0x48390` decrement filters on initial `15`; settings `0x3C758` navigates the other way. Global `1E -> 0x4031C` toggles rotation. The physical Up-hold association fits the owner's observation; its low-level key mapping is not yet recovered. |
| Photo/select `14` | Photo `0x46F98` captures on initial event. Video `0x486D4` calls start `0x47E14` or stop `0x47EB0`. Settings `0x3C79C` selects the current option. |
| Menu tap `18`; hold `17` | Photo `0x46948` and video `0x48720` call mode cycler `0x3FC80` on tap (video guards recording). Hold event `17` reaches photo `0x46BCC` / video `0x48764`, opening settings through `0x494EC`. Owner confirms Menu hold opens settings. |

**Input origin:** boot defaults at file `0x1384` configure ADC channel 3 on port 0/mask `8000`, three resistor records at `0x139C/13A8/13B4` (`0/10000/51000`, tolerance 40), and a separate active-high power input on port 0/mask `4000`. The records map short/long codes `14/14`, `16/16`, `18/17`; power generates `19/1A`. These defaults do **not** explain all five physical buttons or the Up-to-`1E` conversion. Runtime configuration/another event source still needs tracing; no Up GPIO assignment is claimed. Driver debounce and repeat counters are visible at `0x15240..0x153B4`; do not equate three repeats with three separate clicks.

**White light:** Down hold changes setting `0x13` between `0x81000014` (off) and `0x81000015` (on), then photo `0x46C20 -> 0x40CD8 -> ir property 0x10000300`. Video additionally reads driver property `0x300`. This identifies the owner's white light as `ir`; `led` remains the separate status light. Other setting values exist, so this is not a complete flash-mode enum.

**Rotation:** `0x4031C` toggles RAM byte `0x0201242A` and calls `0x40218`. That routine blanks the LCD, calls `0x3A3BC` with both orientation flags equal, chooses a sensor path using the `H63P` / `H63S_DVP_L` identifier, waits 100 ticks, then restores the LCD. Display calls `0x201EC/0x202C8` change scan/orientation state; sensor calls include `0x5A2B8` and `0x16AF4/16B4C`. This fits the owner's observation that live view, icons, audio UI and settings all rotate. Saved JPEG/video orientation is untested. The event handler excludes app-state IDs `3/5/6/8`; it is not an unconditional global rotation API.

### Candidate button changes for hardware testing

These edits are **not applied**. Check the full original instruction bytes before patching; addresses and bytes are from this copied image. Test separately from filter batches.

| Goal | Exact file edit | Expected result / check |
| --- | --- | --- |
| Power tap wakes/keeps LCD on | `0x400B8: 02 00 60 9C -> 03 00 60 9C` | Changes the "LCD currently on" request from 2 (off) to 3 (on). The already-off case also requests 3. Retains the callback's activity bookkeeping and separate power-hold handler. Verify wake after the LCD timeout, long-power shutdown and mode changes. |
| Disable the rotation event | `0x4032C: 17 00 00 0C -> 17 00 00 00` | Replaces conditional `l.bnf` with unconditional `l.j` to the existing epilogue `0x40388`, skipping the rotation body. Verify Up tap, Menu hold and orientation across modes. Confirm this event is the actual Up-hold source on the camera first. |

The power edit disables only manual LCD-off on tap. Automatic LCD timeout remains: setting `9`, resolved by `0x49854`, is checked at `0x40920` against the last-activity tick at RAM `0x02010430`. Setting 8 is the separate idle-power path. No named registry switch for disabling only the tap was found; patch the event request rather than the GPIO driver.

To replace rotation with a specific filter later, change the `0x4036C..0x40384` action block while preserving callback guards/return handling. Keep cycle index RAM `0x02012508` consistent: for table slot `s` (`0..25`), set it to `s-1`, then call `0x398E4(1)`; normal uses `0x398E4(0)`. Calling `0x59478(id)` alone bypasses that index. Choose the desired ID and applicable modes before building this patch.

## Filters, menu text and icons

Filter cycling at **`0x0398E4`** includes Normal `00` plus 26 entries at `0x7C504`: 27 selectable positions, with two duplicate parameter combinations (`01/26`, `20/24`). The owner reports 26 visible states; no code path skipping `2C` was found. Hardware tests now confirm 17-byte saturation strength, brightness-dependent broad bands, RGB matrix mixing/swaps, and four-level channel posterization, agreeing in live view and saved photos. The 88-byte record's word 2 is a digital brightness/EV control; word 0 is probably contrast/gain. Matrix offset fields, other color words, exact saturation indexing and edge-control semantics remain unresolved. **[FILTERS.md](FILTERS.md)** is the concise byte/effect/confidence reference; **[FILTERS_Plan.md](FILTERS_Plan.md)** holds raw feedback, full ID maps and plans. The printable run at `0x7C511` is part of the ID table, not ASCII icon art.

Menu/UI text includes `Play Audio` (`0x7D7E0`), `Play Video` (`0x7D924`), `Power Off` (`0x7E048`), `Record Audio` (`0x7E052`), `Record Photo` (`0x7E0E0`), `Record Video` (`0x7E2C8`) and `SD Update` (`0x7E493`). Photo options `10M`, `12M`, `20M` start at `0x7E11A`; video options `720P`, `1080P`, `2K` start at `0x7E2D5`. Several labels are referenced by app descriptors around `0x9EDC–0xA278`. They are NUL-terminated; longer replacements need layout and pointer analysis. The bitmap and localized-text resources are decoded below; they use different ID namespaces.

## Bitmap icons and UI text

**69 bitmap icons recovered:** [contact sheet](analysis/icons.png), [full icon/offset table](analysis/icons.tsv). Sheet labels are the hexadecimal suffix of resource ID `0x800000xx`. Descriptions identify the visible artwork; the TSV separately records confirmed UI uses. Some sprites belong to features not exposed by this camera's menus.

The resource directory is at `0x9E000`, obtained from header word `0x18 << 9`. Entry 12 points to the **icon bank at `0xE6A9F`, length `0xA0C4`**; entry 13 points to the **256-entry palette at `0xF0B63`, length `0x400`**. The bank starts with 69 twelve-byte records: little-endian `u32 width, u32 height, u32 pixel_offset_relative_to_bank`. Pixels are uncompressed, row-major **8-bit palette indices**, exactly `width * height` bytes per icon. These are not embedded BMP/PNG files. All payloads fit contiguously inside the bank.

Loader `0x396B8..0x396C4` selects resource 12 and 69 cached IDs; `0x2FF4C/0x30000` resolve dimensions/pixels. Widget constructor `0x33350`, image setter `0x36568` and renderer `0x3220C` connect these IDs to the UI. Cache records at `0x87E8 + 16*id` all specify palette index `FE` as the transparency key. The preview interprets palette words as RGB565 in bits `0..15` plus opacity in `16..20`; exact panel color/opacity matching is unmeasured.

| Artwork / use | Resource ID suffix | Pixel file offset | Size |
| --- | --- | --- | --- |
| Flash auto | `25` | `0xEB9B3` | 20x16 |
| Flash off | `26` | `0xEBAF3` | 16x16 |
| Flash on | `27` | `0xEBBF3` | 16x16 |
| Battery: red empty, white empty, low fill, higher fill, full | `1E,1F,20,21,22` | `0xEB173,EB273,EB373,EB473,EB573` | 16x16 each |
| Battery with lightning / external power | `23` | `0xEB673` | 16x16 |
| Photo HUD: landscape symbol | `36` | `0xEDE03` | 16x16 |
| Video HUD: red video camera | `3A` | `0xEF243` | 16x16 |
| Audio artwork: microphone, muted microphone, small microphone | `00,2A,2B` | `0xE6DDB,EBEF3,EBFF3` | 24x24; 16x16; 16x16 |

Photo light handler `0x46C20` explicitly selects `26` for off, `27` for on and `25` for other/auto mode. Battery table `0x7E2E4` maps cached levels `0..3` to `1E..21`; code `0x48104` selects `22` for an out-of-range level and `23` when the external-power flag is set. The artwork alone must not be used to assume voltage thresholds. Photo/video layout references are at `0x7E1C4/0x7E330`. The audio sprites exist, but use of `2A/2B` by the active audio-mode screen was not established; `00` is confirmed in Audio/Beep sound settings.

**Settings:** 18 definitions at `0x9420..0x9574` associate setting IDs, bitmap IDs and text labels. The recovered associations are:

| Setting | Icon suffix | Setting | Icon suffix |
| --- | --- | --- | --- |
| Resolution | `14` | Image quality | `0A` |
| Cyclic Record | `0E` | Sequence | `3D` |
| Timed Capture | `17` | White Balance | `0C` |
| EV | `05` | Audio / Beep sound | `00` |
| Date Tag | `18` | Time Setting | `02` |
| Auto Power-Off | `12` | Language Setting | `0B` |
| Flicker | `09` | Screen savers | `16` |
| Format | `07` | Reset System | `13` |
| Version | `1B` | Rotation artwork present, no entry in this list | `15` |

**Text and ASCII:** `0x800000xx` selects a bitmap; **`0x810000xx` selects localized text**, not the same icon. Resource 11 at `0xD4DF3` has an `FON` header and 18 language blocks. English starts at `0xD4FF3` and contains 160 string records; [ui_text.tsv](analysis/ui_text.tsv) lists their IDs, dimensions, record offsets and decoded text. Examples: `81000014=Off`, `15=On`, `37=Screen rotation`, `40=Fill light`, `41=Flash`, `88=White Balance`, `98=EV`. Several language-name glyphs remain explicit `<glyph:...>` placeholders.

These labels are **glyph-index sequences**, not searchable ASCII strings. Resource 10 at `0xCA653` supplies 842 shared 1-bit glyphs; its records contain `u16 width, u16 height, u32 relative_pixel_offset`, starting after an 8-byte header. Rows use `ceil(width/8)` bytes, most-significant bit first. English decoding was checked by rendering original glyphs for English, Off, On, Resolution, White Balance and EV. Separate built-in ASCII fonts have pointer tables at `0x6BC2C` (6x16), `0x6C4FC` (9x16) and `0x6D3AC` (16x32), traced through `0x2F57C`. No standalone ASCII-art icon set was found; symbols such as HD, Hz and TF are already drawn into bitmap sprites.

For an in-place icon replacement, preserve its dimensions and byte count and use the existing palette. Changing a shared sprite changes every widget using it; changing a particular widget's resource ID can target only that occurrence. No firmware patches were applied.

## Further mod structures and test exports

[analysis/MODDING.md](analysis/MODDING.md) maps the main modification points. New traces establish a mode cycle `Video(2) -> Audio(3) -> Gallery(6) -> Photo(4)` with an omitted Play Audio app (`5`), a normal-startup mode request at `0x3A4B4`, and data-driven settings/options. Numeric resource lookup `0x49854` supplies timer/idle values, while burst modes have separate capture branches. The self-timer display explicitly handles only 0..10, despite an existing 30S label/value.

The EV setting resolves to a digital adjustment of the 88-byte record's word 2 on one sensor path; baseline sensor records also confirm that Normal varies by sensor profile. The eight-position test cycle is confirmed as startup 0 plus seven effects; the extra 8 in the owner's first curve log was a numbering error.

Seven filter binaries, timestamps and position lists are in [bin/README.md](../bin/README.md). 01..06 have feedback: individual offset fields support signed RGB biases; all 64 repeats blue-shadow noise, all 127 appears normal. **06/11, word 1 = 64**, adds a bookmarked primary palette without changing LUTs. This differs from **03/1**, whose four-level LUT deliberately posterizes each channel. Writer `4EB74` masks each of 17 stored saturation bytes to five bits; upper three bits are discarded. Build 07 varies/combines the two palette mechanisms and tests raw 16/48/32. [Logs/bookmarks](FILTERS_Plan.md#bookmarked-looks) retain exact parameters. Exports still use the original backup, full-word timestamps and one final-FF removal. Other button/settings mods remain documented only.

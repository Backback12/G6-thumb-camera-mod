# G6 modding map

Offsets are file offsets in the original `tests/original/backup1.bin`. Flash pointers are `0x06000000 + offset`; RAM pointers must not be converted that way. Hardware testing is still required for the proposed mods below.

| Area | Structure / entry point | Possible mods | Detail |
| --- | --- | --- | --- |
| Filter selection | Cycle `0x398E4`, IDs `0x7C504`, wrap instructions `0x39940/39968` | Reorder, shorten, expose hidden effects | [FILTERS.md](../FILTERS.md) |
| Filter processing | Apply `0x59478`; tables `0x813D8/81404/814B4/81564` | Mix matrices, LUTs, curves and kernels | [Byte/effect map](../FILTERS.md#parameter-map), [analysis/tests](../FILTERS_Plan.md#parameter-decoding) |
| Buttons | Global table `0x7D72C`; photo/video tables `0xA1F4/A29C` | LCD tap, rotation, alternate hold actions | [Button findings](../README.md#buttons-and-event-dispatch) |
| Mode selection | Mode manager `0x3FB34`, cycler `0x3FC80`, jump table `0x7D6E4` | Startup video/audio; include the audio player in mode cycling | Below |
| Settings | 20-byte definitions `0x9420..9574`; option arrays `0x9598..97DF` | Reorder/hide settings, edit available options | Below |
| Numeric option values | Resolver `0x49854`, lookup `0x7E564` | Timer lengths, screen/idle timeout values, wider EV steps | Below |
| HUD and icons | Widget records `0x7E188..7E45B`; sprite bank `0xE6A9F` | Move/resize/hide widgets, swap artwork, recolor palette | [Icon map](icons.tsv), [preview](icons.png) |
| UI text | `0x810000xx` text IDs; English block `0xD4FF3` | Replace labels with existing glyphs; expose dormant labels | [Text map](ui_text.tsv), [format](../README.md#bitmap-icons-and-ui-text) |
| Media | Resource directory `0x9E000`, 8-byte offset/length entries | Replace existing sounds and backgrounds | [Asset offsets](assets.tsv), [replace_g6.py](../../replace_g6.py) |

## Mode descriptors and cycling

`0x3FB34` builds a RAM table of app descriptors. Each descriptor starts with a label pointer and contains lifecycle callbacks; switching modes through `0x3FC18` runs the existing app logic rather than jumping directly to a drawing routine.

| Mode ID | Descriptor file offset | Label |
| ---: | --- | --- |
| `1` | `0xA14C` | Power Off |
| `2` | `0xA278` | Record Video |
| `3` | `0xA160` | Record Audio |
| `4` | `0xA1D4` | Record Photo |
| `5` | `0x9EDC` | Play Audio |
| `6` | `0x9F70` | Play Video / gallery app |

The normal Menu cycle is **2 -> 3 -> 6 -> 4 -> 2**. Mode 5 exists but is omitted from this cycle. The jump table at `0x7D6E4` contains code addresses for current modes `2..11`, not the next mode numbers themselves.

Two concrete future experiments, **not included in the filter binaries**:

- Startup video: `0x3A4B4: 04 00 60 9C -> 02 00 60 9C`; startup audio uses `03 00 60 9C`. This changes the normal-startup branch's requested app, preserving the separate alternate-startup branch.
- Route Menu to Play Audio: `0x3FCC8: 06 00 60 9C -> 05 00 60 9C`. The resulting cycle should be **2 -> 3 -> 5 -> 4 -> 2**. Keeping both Play Audio (`5`) and gallery (`6`) in the cycle needs an additional dispatch case; redirecting both to the same modified code block would create a self-loop. Entry/exit behavior and storage handling need a hardware check.

## Settings are data-driven

Each 20-byte definition contains five little-endian words: **setting ID, icon ID, text ID, option count, option-array RAM pointer**. Zero-count rows use an action callback instead of an option array. For example, EV at `0x9498` is setting `0x16`, icon `80000005`, label `81000098`, five options, and RAM pointer `02006930` (file `0x9730` in the boot copy).

`0x9418` contains the parent list's 18-row count; its children start at `0x9420`. Reordering records while preserving each complete record can change menu order. Reducing the count and moving wanted records to the front can hide unwanted settings. Do not increase it past allocated records. The selected value is a resource ID, not always a literal integer.

Option entries are eight bytes: metadata word, then value/text resource ID. In the listed arrays, metadata is zero. Useful arrays:

| Setting | Definition | Option array | Original choices |
| --- | --- | --- | --- |
| Timed Capture | `0x9470` | `0x9598` | Off, 2S, 5S, 10S |
| Sequence | `0x945C` | `0x95B8` | Off, Double Shot, Triple Shot, Quintuple Shot |
| Screen savers | `0x9538` | `0x95E0` | Off, 3, 5, 10 minutes |
| Auto Power-Off | `0x94FC` | `0x9698` | Off, 1, 3 minutes |
| EV | `0x9498` | `0x9730` | +2, +1, 0, -1, -2 |
| White Balance | `0x9484` | `0x9758` | Auto, Sunlight, Cloudy, Tungsten, Fluorescent |

`0x49854` resolves numeric values using `0x7E564 + 4*(text_id - 1)`, for text IDs **1..0x91 only**. Examples: `2S/5S/10S/30S` are IDs `2F/30/31/32`, mapping to `2/5/10/30` at `0x7E61C/620/624/628`. Minute choices map to `60/120/180/300/600` at `0x7E608..618`. Altering a shared lookup entry changes every setting using that ID; changing only the rendered text does not change the timer.

The self-timer consumes setting `0x21` at `0x47048`; countdown rendering `0x4655C` rejects values above **10** at `0x46568`. Thus the existing 30S label/value does not prove full 30-second UI support. Sequence values `9D..9F` are outside the numeric resolver range and are compared explicitly in `0x46F98`; burst count changes require the capture branches too.

EV labels +2..-2 map to internal values **5,4,3,2,1** at `0x7E5E4..5F4`. `0x49A20` passes range 5 and step 16 to `0x59260`. On its digital path, it adds **+32,+16,0,-16,-32** to the saved baseline of the 88-byte record's word 2, clamps to `0..255`, and writes `B15C[23:16]`. Another sensor path exists, so this is a conditional digital EV adjustment. Round-1 hardware confirms brightness changes at word 2. Word 0's contrast/gain interpretation has supporting observations; its formula remains unknown.

## Sensor profiles explain baseline differences

The sensor directory starts at `0x8CEEC`, using 68-byte descriptors relative to data base `0x8CEAC`. The first two configuration blocks are `0x91C20` (`H63P_DVP_720p`) and `0x92360` (`H63S_DVP_L`). Each is `0x740` bytes. Do not apply one sensor's defaults globally without checking which sensor is active.

- Their baseline 88-byte records at `0x9224C/0x9298C` start with `136,128,128,128` and `160,136,136,128`, respectively; both differ from effect `1E`'s `255,128,200,128`.
- Their 17-value curves at `0x9231C/0x92A5C` are identical: `8,10,12,14,16,18,19,20,21,22,23,24,24,24,22,22,20`. Hardware broad-band tests support brightness-dependent saturation; exact indexing is unresolved.

## Build and repeat experiments

The patch helper uses Node's standard library. It preserves offsets, checks original bytes, writes a **full 32-bit Unix timestamp at `0x14`**, then removes **exactly one final `FF` byte**. It accepts either the original 1,048,576-byte image or an already trimmed image; the latter is normalized internally so it is not shortened a second time. It does not perform JPG/WAV replacements.

```powershell
node tests/tools/patch_g6.js --tests --round 4
# Repeat LUT/color/bit build 07 with a newer timestamp:
node tests/tools/patch_g6.js --tests --round 4 --force
# Rebuild the original 01..03 recipes instead:
node tests/tools/patch_g6.js --tests --round 1 --force
# If the camera has a higher timestamp than the local files:
node tests/tools/patch_g6.js --tests --round 4 --force --min-timestamp LAST_INSTALLED_UNIX
```

The [binary catalog](../../bin/README.md) records all rounds' timestamps and zero-based positions. Round 1 = 01..03, round 2 = 04/05, round 3 = 06 (14 probes), round 4 = 07 (20 probes). Rebuilding one round preserves the others; all known builds contribute to the timestamp floor. Reusing an older file will not satisfy the owner's newer-timestamp requirement. The visible update worker established a difference check; stricter behavior elsewhere remains possible, so exports follow the hardware constraint. Raw feedback is in [FILTERS_Plan.md](../FILTERS_Plan.md).

The [local editor](../filter-emulator/README.md) shows simultaneous camera/chart/image pairs, reference values and LUT curves. Save JSON includes record hex and derived register fields; Copy config makes an importable delta from editor-neutral-v1. Both remain editor formats, not this helper's `--recipe`: storage offsets and enabled pointers must be allocated separately. Labels/preview assumptions do not establish unknown hardware structures or equations.

For a personal eight-position cycle of existing IDs:

```powershell
node tests/tools/patch_g6.js --cycle "01,06,19,1A,1D,27,2A" --output bin/eight-favorites/hx330x_sdk.bin
```

Quote the cycle list in PowerShell; otherwise it can parse IDs such as `1D` as numbers. For additional fixed-offset changes, supply `--recipe path/to/recipe.json`. Example recipe (hex strings, equal-length replacements):

```json
{
  "source_sha256": "278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184",
  "cycle_ids": ["01", "06", "19", "1A", "1D", "27", "2A"],
  "patches": [{"offset": "0x81756", "expect": "4D 00", "data": "00 01"}]
}
```

```powershell
node tests/tools/patch_g6.js --recipe recipe.json --output bin/my-filters/hx330x_sdk.bin
```

`--input FILE` chooses another source, `--timestamp UNIX` specifies a timestamp, and `--dry-run` validates without writing. `--min-timestamp` must be lower than the new timestamp. Existing binaries require `--force`; the source image is never overwritten. The media exporter [replace_g6.py](../../replace_g6.py) remains the separate asset workflow; these test exports follow the timestamp/tail convention requested for hardware testing.

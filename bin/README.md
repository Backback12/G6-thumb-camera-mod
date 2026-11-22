# Firmware test builds

Flash the three filter builds in order 01 -> 02 -> 03. Follow the hardware requirement that each timestamp must be newer than the installed firmware. Rebuild before repeating an earlier test; its old file will have an older timestamp.

Source: original backup, SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`. New files are **1,048,575 bytes**: full little-endian Unix timestamp at `0x14..0x17`, then exactly one final `FF` removed. Asset bytes are original.

| Folder | Unix timestamp | UTC | Description |
| --- | ---: | --- | --- |
| [2A](2A/hx330x_sdk.bin) | 1778742570 | 2026-05-14T07:09:30.000Z | Existing custom audio/photo test; 1,048,575 bytes. |
| [2B](2B/hx330x_sdk.bin) | 1778742571 | 2026-05-14T07:09:31.000Z | Existing custom audio/photo test; 1,048,576 bytes. |
| [2C](2C/hx330x_sdk.bin) | 1778742572 | 2026-05-14T07:09:32.000Z | Existing custom audio/photo test; 1,048,576 bytes. |
| [filters-01-curve](filters-01-curve/hx330x_sdk.bin) | 1795244471 | 2026-11-21T07:01:11.000Z | 17-value curve; Normal + 7 test filters. |
| [filters-02-matrix](filters-02-matrix/hx330x_sdk.bin) | 1795244472 | 2026-11-21T07:01:12.000Z | Color matrix; Normal + 7 test filters. |
| [filters-03-lut-color](filters-03-lut-color/hx330x_sdk.bin) | 1795244473 | 2026-11-21T07:01:13.000Z | Posterization and 88-byte controls; Normal + 7 test filters. |

Rebuild: `node tests/tools/patch_g6.js --tests --force`. If the installed timestamp is higher, add `--min-timestamp NUMBER`. The helper chooses timestamps above that value and existing test files, increasing by one second per build. The binary header, not the folder name, identifies the update.

All three builds are untested on hardware. Button behavior is original apart from the filter cycle length. Start in photo mode after a fresh boot: position 1 is Normal; tap Down to advance, Up to reverse. Both directions wrap through exactly eight positions.

Keep a fixed scene and lighting, including gray, white, black and red/green/blue objects. Compare live view and saved JPEG; optionally repeat in video. Report `folder / position / visible change`. A black, white or unchanged result is useful evidence. Do not change EV/WB between comparisons.

## filters-01-curve

Large strength changes and broad index bands; other stages restore baseline.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 1 | `00` | Normal | Original mode-dependent baseline. |
| 2 | `19` | All 0 | Zero control. |
| 3 | `1A` | All 31 | Maximum 5-bit value; compare directly with position 2. |
| 4 | `1B` | All 8 | Low fixed strength. |
| 5 | `1C` | All 16 | Middle fixed strength; not assumed identical to Normal. |
| 6 | `1D` | Indices 0..5 only | Low index band at 31; everything else 0. |
| 7 | `20` | Indices 6..11 only | Middle index band at 31; everything else 0. |
| 8 | `21` | Indices 12..16 only | High index band at 31; everything else 0. |

SHA-256: `37d9d1cb5bd07e25292d904ff672cdac09ca93d9c529d4d1533c544878fcb5f5`.

## filters-02-matrix

Strong component isolation, swaps and offsets; fixed identity is the control.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 1 | `00` | Normal | Original mode-dependent baseline. |
| 2 | `19` | Identity | Compare subsequent positions with this fixed matrix. |
| 3 | `1A` | Component 0 only | Only the first diagonal component passes. |
| 4 | `1B` | Component 1 only | Only the middle diagonal component passes. |
| 5 | `1C` | Component 2 only | Only the last diagonal component passes. |
| 6 | `1D` | Swap 0 and 2 | Swap the outer components; identify their visible colors. |
| 7 | `20` | Copy component 0 | Repeat one record row; tests matrix orientation and component meaning. |
| 8 | `21` | Identity + offsets 32 | Large offset change; compare with position 2. |

SHA-256: `d80b13e4eff330fb755fd2969aa1b3e508e8e164c5a5029bebb421460667540d`.

## filters-03-lut-color

Four-level LUT and large word-0/word-2 changes, with original 1E as the fixed-record control.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 1 | `00` | Normal | Original mode-dependent baseline. |
| 2 | `06` | Four-level posterization | Each channel maps to 0,85,170,255 instead of inversion. |
| 3 | `1E` | Original 1E control | Original words 0/2 = 255/200; other record fields remain original. |
| 4 | `19` | Word 2 = 0 | Only word 2 differs from position 3; brightness/EV-related. |
| 5 | `1A` | Word 2 = 255 | Only word 2 differs from position 3; brightness/EV-related. |
| 6 | `1B` | Word 0 = 0 | Only word 0 differs from position 3; contrast/gain hypothesis. |
| 7 | `1C` | Word 0 = 128 | Only word 0 differs from position 3; contrast/gain hypothesis. |
| 8 | `01` | Original grayscale | Original matrix at 0x8177E is retained. |

SHA-256: `2305795168b9c21d96cb48d9cafe5c6e236ac44c4e5e12ba9085261772b793b5`.

Build 03 repurposes inactive edge/parameter templates at `0x81614..0x81773`; its eight selected effects do not use the overwritten kernels/matrices/17-byte records. Original grayscale at `0x8177E` remains intact. Nothing is placed in unused flash tail space.

Technical details: [filters](../tests/FILTERS.md), [modding map and patch recipes](../tests/analysis/MODDING.md).

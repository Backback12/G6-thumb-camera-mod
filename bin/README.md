# Firmware test builds

Next round: **04 -> 05**. Each timestamp must be newer than the installed firmware (last reported: build 03, Unix **1795244473**). Rebuild before repeating an older test.

Source: original backup, SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`. New files are **1,048,575 bytes**: full little-endian Unix timestamp at `0x14..0x17`, then exactly one final `FF` removed. Asset bytes are original.

| Folder | Unix timestamp | UTC | Description |
| --- | ---: | --- | --- |
| [2A](2A/hx330x_sdk.bin) | 1778742570 | 2026-05-14T07:09:30.000Z | Existing custom audio/photo test; 1,048,575 bytes. |
| [2B](2B/hx330x_sdk.bin) | 1778742571 | 2026-05-14T07:09:31.000Z | Existing custom audio/photo test; 1,048,576 bytes. |
| [2C](2C/hx330x_sdk.bin) | 1778742572 | 2026-05-14T07:09:32.000Z | Existing custom audio/photo test; 1,048,576 bytes. |
| [filters-01-curve](filters-01-curve/hx330x_sdk.bin) | 1795244471 | 2026-11-21T07:01:11.000Z | 17-value curve; Normal + 7 test filters. |
| [filters-02-matrix](filters-02-matrix/hx330x_sdk.bin) | 1795244472 | 2026-11-21T07:01:12.000Z | Color matrix; Normal + 7 test filters. |
| [filters-03-lut-color](filters-03-lut-color/hx330x_sdk.bin) | 1795244473 | 2026-11-21T07:01:13.000Z | Posterization and 88-byte controls; Normal + 7 test filters. |
| [filters-04-matrix-fields](filters-04-matrix-fields/hx330x_sdk.bin) | 1795369668 | 2026-11-22T17:47:48.000Z | Matrix sign and offset fields; Normal + 7 test filters. |
| [filters-05-color-fields](filters-05-color-fields/hx330x_sdk.bin) | 1795369669 | 2026-11-22T17:47:49.000Z | Contrast and adjacent color fields; Normal + 7 test filters. |

Rebuild this round: `node tests/tools/patch_g6.js --tests --round 2 --force`. Use `--round 1` for 01..03. If needed, add `--min-timestamp NUMBER`. Timestamps exceed the minimum and all existing known filter builds; each output increases by one second. Earlier binaries are preserved unless their round is explicitly rebuilt.

Recipes 01..03 have owner feedback agreeing between live view and saved photos; 04..05 await hardware testing. See [observations and confidence](../tests/FILTERS_Plan.md#hardware-feedback-round-1). Button behavior is original apart from cycle length.

**Position 0 = startup Normal**, then seven short Down presses select 1..7; the eighth returns to 0. Up reverses. The previous catalog used 1..8 labels; these tables now use 0..7 to match the hardware log. The owner confirmed the extra 8 in the curve log was a numbering error.

Use a fixed scene with gray/white/black and red/green/blue objects. Rough visible differences are sufficient; no narrow band measurements are requested. For 04/05, compare each probe with position 1. Keep EV/WB fixed, allow exposure to settle, and report `folder / position / visible change` (including unchanged, black or clipped).

## filters-01-curve

Large strength changes and broad index bands; other stages restore baseline.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | All 0 | Zero control. |
| 2 | `1A` | All 31 | Maximum 5-bit value; compare directly with position 1. |
| 3 | `1B` | All 8 | Low fixed strength. |
| 4 | `1C` | All 16 | Middle fixed strength; not assumed identical to Normal. |
| 5 | `1D` | Indices 0..5 only | Low index band at 31; everything else 0. |
| 6 | `20` | Indices 6..11 only | Middle index band at 31; everything else 0. |
| 7 | `21` | Indices 12..16 only | High index band at 31; everything else 0. |

SHA-256: `37d9d1cb5bd07e25292d904ff672cdac09ca93d9c529d4d1533c544878fcb5f5`.

## filters-02-matrix

Strong component isolation, swaps and offsets; fixed identity is the control.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | Identity | Compare subsequent positions with this fixed matrix. |
| 2 | `1A` | Component 0 only | Only the first diagonal component passes. |
| 3 | `1B` | Component 1 only | Only the middle diagonal component passes. |
| 4 | `1C` | Component 2 only | Only the last diagonal component passes. |
| 5 | `1D` | Swap 0 and 2 | Swap the outer components; identify their visible colors. |
| 6 | `20` | Copy component 0 | Repeat one record row; tests matrix orientation and component meaning. |
| 7 | `21` | Identity + offsets 32 | Large offset change; compare with position 1. |

SHA-256: `d80b13e4eff330fb755fd2969aa1b3e508e8e164c5a5029bebb421460667540d`.

## filters-03-lut-color

Four-level LUT and large word-0/word-2 changes, with original 1E as the fixed-record control.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `06` | Four-level posterization | Each channel maps to 0,85,170,255 instead of inversion. |
| 2 | `1E` | Original 1E control | Original words 0/2 = 255/200; other record fields remain original. |
| 3 | `19` | Word 2 = 0 | Only word 2 differs from position 2; brightness/EV-related. |
| 4 | `1A` | Word 2 = 255 | Only word 2 differs from position 2; brightness/EV-related. |
| 5 | `1B` | Word 0 = 0 | Only word 0 differs from position 2; contrast/gain hypothesis. |
| 6 | `1C` | Word 0 = 128 | Only word 0 differs from position 2; contrast/gain hypothesis. |
| 7 | `01` | Original grayscale | Original matrix at 0x8177E is retained. |

SHA-256: `2305795168b9c21d96cb48d9cafe5c6e236ac44c4e5e12ba9085261772b793b5`.

## filters-04-matrix-fields

Identity control, red-coefficient sign boundary, then large equal-channel offset changes.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | Identity | Fixed RGB identity; compare every probe with position 1. |
| 2 | `1A` | Red coefficient 511 | Largest positive signed-10-bit value, if signed; expect stronger red. |
| 3 | `1B` | Red coefficient 512 | Sign boundary: red loss/clipping supports signed encoding; brighter red supports unsigned. |
| 4 | `1C` | Red coefficient 1023 | Encoded -1 in signed two's complement, nearly 4x if unsigned. Green/blue stay at 256. |
| 5 | `1D` | All offsets 63 | Largest positive signed-7-bit value, if signed; compare with identity. |
| 6 | `20` | All offsets 64 | Offset sign boundary, if signed; compare directly with position 5. |
| 7 | `21` | All offsets 127 | Encoded -1 in signed two's complement; compare with identity and position 5. |

SHA-256: `b5693e09ec3cc29459b3a1b36b9b1a4e4f78ea802a2c12a7d13cf5c15644e2bb`.

## filters-05-color-fields

Fixed word-2 brightness of 128; isolate words 0, 1 and 3 with large changes.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | Fixed control | Words 0..3 all 128; not assumed identical to Normal. |
| 2 | `1A` | Word 0 = 0 | Compare black/white separation with position 1; brightness word 2 stays 128. |
| 3 | `1B` | Word 0 = 255 | Compare directly with positions 1 and 2 for contrast/gain behavior. |
| 4 | `1C` | Word 1 = 0 | Unknown field at B15C[15:8]; report any tint, brightness or unchanged image. |
| 5 | `1D` | Word 1 = 255 | Opposite endpoint of word 1; all other words match position 1. |
| 6 | `20` | Word 3 = 0 | Unknown field at B15C[7:0]; compare with position 1. |
| 7 | `21` | Word 3 = 255 | Opposite endpoint of word 3; all other words match position 1. |

SHA-256: `98f34d7b698a7f5807c5a7b9de937b5dd54c6ce0987a22897efd5df7e9743d8d`.

Build 03 repurposes inactive templates at `0x81614..0x81773`. Build 05 uses the same area for four 88-byte records and `0x8DF20..0x8E027` for three more, replacing part of the unused ID-1F-only tone table. Neither build selects edge/1F effects; grayscale matrix `0x8177E`, baseline tone table `0x8DD20`, and media remain intact. No flash-tail allocation or convolution tests are included.

Technical details: [filter findings](../tests/FILTERS.md), [analysis and test plan](../tests/FILTERS_Plan.md), [patch recipes](../tests/analysis/MODDING.md).

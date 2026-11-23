# Firmware test builds

Next test: **07**, LUT/primary-color variations and bit masking (Normal + 20 probes). Each timestamp must be newer than the installed firmware; previously supplied build 06 is Unix **1795378051**. Rebuild before repeating an older test.

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
| [filters-06-calibration](filters-06-calibration/hx330x_sdk.bin) | 1795378051 | 2026-11-22T20:07:31.000Z | Combined offset and color calibration; Normal + 14 test filters. |
| [filters-07-poster-bits](filters-07-poster-bits/hx330x_sdk.bin) | 1795388951 | 2026-11-22T23:09:11.000Z | LUT/primary posterization and bit masking; Normal + 20 test filters. |

Rebuild 07: `node tests/tools/patch_g6.js --tests --round 4 --force`. Earlier rounds: 1 = 01..03, 2 = 04/05, 3 = 06. If needed, add `--min-timestamp NUMBER`. Timestamps exceed all existing known builds and the minimum. Rebuilding one round preserves the others.

01..06 have owner feedback; original 04/7 was unobserved but its all-127 offsets were repeated at 06/7. 07 awaits hardware testing. See [observations/bookmarks](../tests/FILTERS_Plan.md#hardware-feedback-build-06). Button behavior is original apart from cycle length.

**Position 0 = startup Normal**; short Down advances and Up reverses. 01..05 have 0..7; 06 has 0..14; 07 has 0..20 (the twenty-first Down returns to Normal).

Keep scene, lighting and EV/WB fixed. In 07, compare LUT-only probes with 1, color-only probes with 10, combined posterization at 3 with 2 and 11, and saturation 18/19 with each other. Position 20 should be grayscale. Report `folder / position / change`; small or absent changes at 127/129 do not by themselves disprove bit fields.

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

## filters-06-calibration

14 probes plus Normal: compare matrix offsets with position 1, color words with position 8.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | Identity control | Compare black/blue shadows with position 1; only listed offsets change. |
| 2 | `1A` | Offsets 64/0/0 | Compare black/blue shadows with position 1; only listed offsets change. |
| 3 | `1B` | Offsets 0/64/0 | Compare black/blue shadows with position 1; only listed offsets change. |
| 4 | `1C` | Offsets 0/0/64 | Compare black/blue shadows with position 1; only listed offsets change. |
| 5 | `1D` | Offsets 64/64/64 | Exact parameter reference for bookmarked 04/6 blue shadows. |
| 6 | `1E` | Offsets 63/63/63 | Compare black/blue shadows with position 1; only listed offsets change. |
| 7 | `20` | Offsets 127/127/127 | Retest the unreported 04/7. |
| 8 | `21` | Fixed color control | Words 0..3 all 128; compare color probes with this position 8. |
| 9 | `22` | Word 0 = 64 | Midrange contrast probe; word 2 stays 128. |
| 10 | `23` | Word 0 = 192 | Midrange contrast probe; word 2 stays 128. |
| 11 | `24` | Word 1 = 64 | Does this change whitepoint/brightness, primary bands, or both? |
| 12 | `25` | Word 1 = 192 | Does this change whitepoint/brightness, primary bands, or both? |
| 13 | `26` | Word 3 = 64 | Report the mapping of red/green/blue and any gray tint; intermediate remap value. |
| 14 | `27` | Word 3 = 192 | Report the mapping of red/green/blue and any gray tint; intermediate remap value. |

SHA-256: `1e71b411c1de140342d87d30a09eebce5929b413838cf59da5350e77057344a1`.

## filters-07-poster-bits

20 probes plus Normal. Separate LUT quantization from word-1 color effects, combine them, and check saturation high-bit masking.

| Position | Effect ID | Test | What to compare |
| ---: | --- | --- | --- |
| 0 | `00` | Normal | Original mode-dependent baseline. |
| 1 | `19` | Fixed control; no LUT | Words 0..3 all 128; same control as position 10. Reference for LUT probes. |
| 2 | `06` | RGB four levels | Same table values as 03/1, with fixed color control; compare with 1. |
| 3 | `07` | RGB four levels + word 1 = 64 | Only word 1 differs from position 2; only the LUT differs from position 11. |
| 4 | `08` | R/G four levels; B identity | Isolate quantization of red/green; blue remains continuous. |
| 5 | `0C` | B four levels; R/G identity | Isolate blue quantization. |
| 6 | `03` | R/G eight levels; B identity | Compare with position 4 for four versus eight levels on the same channels. |
| 7 | `09` | R/G four levels; B two levels | Blue becomes 0/255 at input 128. |
| 8 | `0A` | R/G four levels; B eight levels | Compare with positions 2 and 7 for blue quantization strength. |
| 9 | `0B` | B eight levels; R/G identity | Compare with position 5 for four versus eight levels on blue. |
| 10 | `1A` | Fixed color control | Words 0..3 all 128; reference for positions 11..17. |
| 11 | `1B` | Word 1 = 64 (bookmark) | Compare with position 10 and the word-1-only bookmark at 11; channel LUT stage restores baseline. |
| 12 | `1C` | Word 1 = 127 | Compare with 128 at position 10: a large discontinuity may indicate a sign/mode boundary; small changes are inconclusive. |
| 13 | `1D` | Word 1 = 129 | Compare with 128 at position 10: a large discontinuity may indicate a sign/mode boundary; small changes are inconclusive. |
| 14 | `1E` | Word 1 = 192 | Compare with position 10 and the word-1-only bookmark at 11; channel LUT stage restores baseline. |
| 15 | `20` | Word 1 = 64; brightness 96 | Compare with position 10 and the word-1-only bookmark at 11; channel LUT stage restores baseline. |
| 16 | `21` | Word 1 = 64; brightness 160 | Compare with position 10 and the word-1-only bookmark at 11; channel LUT stage restores baseline. |
| 17 | `22` | Word 1 = 64; contrast 192 | Compare with position 10 and the word-1-only bookmark at 11; channel LUT stage restores baseline. |
| 18 | `23` | Raw saturation 16 -> field 16 | All 17 low-five-bit fields are 16; compare with raw 48 at position 19. |
| 19 | `24` | Raw saturation 48 -> field 16 | Should match raw 16 at position 18: bit 5 is discarded by the writer. |
| 20 | `25` | Raw saturation 32 -> field 0 | Should produce grayscale: all low five bits are zero. |

SHA-256: `cb7ce05a85f7bbda2a8821fc16f5a5a9ca890eaecc9531cb66b0755edf0846e2`.

Build 03 repurposes inactive templates at `0x81614..0x81773`. Build 05 uses the same area for four 88-byte records and `0x8DF20..0x8E027` for three more, replacing part of the unused ID-1F-only tone table. Neither build selects edge/1F effects; grayscale matrix `0x8177E`, baseline tone table `0x8DD20`, and media remain intact. No flash-tail allocation or convolution tests are included.

Build 06 uses seven matrices at `0x81614..0x816BB`, two color records at `0x816BC..0x8176B`, and five at `0x8DF20..0x8E0D7`. These replace inactive edge/parameter and ID-1F tone data. All selected edge bytes are zero; ID 1F is absent. Baseline tone table, channel LUTs, grayscale matrix and media remain intact. The build is independent of earlier patches.

Build 07 uses four color records at `0x81614..0x81773`, five at `0x8DF20..0x8E0D7`, and three 17-byte curves at `0x8E0D8/8E0EC/8E100`. LUTs L0/L1/L3/L4 become 8/4/2/8-level tables; L2 identity and adaptive baseline tables are preserved. LUT probes and positions 1/10 share the same fixed color-control pointer; position 3 changes only word 1 versus 2. Selected LUT IDs have their grayscale matrix cleared. No 1F/edge effects, media changes or flash-tail allocation.

Technical details: [filter findings](../tests/FILTERS.md), [analysis and test plan](../tests/FILTERS_Plan.md), [patch recipes](../tests/analysis/MODDING.md).

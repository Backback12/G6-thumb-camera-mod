# Camera filters

**Camera:** 26 visible states, including normal, as observed by the owner. **Firmware:** reset ID `00` plus 26 IDs in the table at `0x7C504`. The code alone does not explain the count difference. The mapping below assumes the reported down-arrow sequence follows the table forward; early color effects and the final edge groups support it. Exact numbering near the end remains tentative. ID `2C` is present in firmware but has **no separately observed camera state**.

## Observed appearance and likely ID

| # | Appearance | ID |
| ---: | --- | --- |
| 1 | Normal | `00` |
| 2 | Black/red | `18` |
| 3 | Grayscale | `01` |
| 4 | Red sepia | `04` |
| 5 | Green tint | `02` |
| 6 | Blue tint | `05` |
| 7 | Near normal, warmer? | `19` |
| 8 | Red/blue, green suppressed | `1A` |
| 9 | Inverted | `06` |
| 10 | Normal or lower saturation | `1B` |
| 11 | Yellow, low saturation | `1C` |
| 12 | Aqua | `1D` |
| 13 | Bright, low saturation | `1E` |
| 14 | Nearly black/white | `1F` |
| 15 | Near normal, cooler? | `20` |
| 16 | Similar, less blue? | `21` |
| 17 | Similar, warmer? | `22` |
| 18 | Aqua | `23` |
| 19 | Near normal | `24` |
| 20 | Low saturation | `25` |
| 21 | More grayscale | `26` |
| 22 | Black/white edges | `27` |
| 23 | Black/white edges, less noise | `28` |
| 24 | Black/white edges, still less noise | `29` |
| 25 | Colored edges | `2A` |
| 26 | Colored edges, less noise | `2B` |

## Firmware parameters for every ID

All record addresses are **file offsets** in `original/backup1.bin`. `base` means the routine restores that stage's mode-dependent baseline; it does **not** mean identity or zero. `Lx/y/z` selects three separate 256-byte LUTs, one per channel, rather than three numeric parameters. `K` is the shared 5×5 edge kernel at `0x81630` plus a zero second kernel at `0x81614`.

| Camera # | ID | LUTs | Matrix (24 B) | 17-byte record | 88-byte record | Edge stage |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `00` | base | base | base | base | base |
| 2 | `18` | `L5/3/3` | `8177E` | base | base | base |
| 3 | `01` | base | `8177E` | base | base | base |
| 4 | `04` | `L0/2/2` | `8177E` | base | base | base |
| 5 | `02` | `L2/0/2` | `8177E` | base | base | base |
| 6 | `05` | `L2/2/0` | `8177E` | base | base | base |
| 7 | `19` | base | `81766` | base | base | base |
| 8 | `1A` | base | `8174E` | base | base | base |
| 9 | `06` | `L1/1/1` | base | base | base | base |
| 10 | `1B` | base | `81736` | `816C4` (all 6) | base | base |
| 11 | `1C` | base | `8171E` | `816B0` (all 9) | base | base |
| 12 | `1D` | base | `81706` | base | base | base |
| 13 | `1E` | base | base | base | `A3D8` | base |
| 14 | `1F` | base | base | `8169C` (all 0) | base | base |
| 15 | `20` | base | base | `81688` (22–27) | base | base |
| 16 | `21` | base | base | `81674` (all 11) | base | base |
| 17 | `22` | base | `816EE` | base | base | base |
| 18 | `23` | base | `816D6` | base | base | base |
| 19 | `24` | base | base | `81660` (22–27) | base | base |
| 20 | `25` | base | base | `8164C` (all 8) | base | base |
| 21 | `26` | base | `8177E` | base | base | base |
| 22 | `27` | base | `8177E` | base | base | `K + 0` |
| 23 | `28` | base | `8177E` | base | base | `K + 20` |
| 24 | `29` | base | `8177E` | base | base | `K + 40` |
| 25 | `2A` | base | base | base | base | `K + 0` |
| 26 | `2B` | base | base | base | base | `K + 20` |
| Unobserved | `2C` | base | base | base | base | `K + 40` |

**Interpretation:** The matrix packs nine 10-bit coefficients and three offsets; it mixes color components. `8177E` has three identical rows, fitting grayscale. `8174E` has diagonal values `256,77,256`, fitting the red/blue appearance if the middle channel is green; the channel order is unverified. A missing matrix pointer restores baseline settings, not necessarily the same result as an identity matrix.

The 17-byte records pack seventeen 5-bit values into ISP registers `0xB168`–`0xB170`. **Saturation-strength curve is a hypothesis:** all-zero matches near monochrome, all-8 matches low saturation, and 22–27 matches more normal-looking modes. What the 17 positions represent (hue, brightness, or something else) is unknown. The 88-byte record at `A3D8` contains 22 words: `255,128,200,128, 64×9, 10×2, 16×6, 6`. The writer loads part of it into `0xB15C`–`0xB164`; its image function is still unknown.

The edge writer packs 25 signed 6-bit values into ISP registers. Its first kernel has `+1` around the perimeter, zero inside, and `-17` at the center (`EF` at `0x8163C`). Stages write `0`, `20`, or `40` into `0xB100`; a weak-edge threshold is plausible from the observed noise progression, but unconfirmed. The black/white edge IDs also select matrix `8177E`; the colored edge IDs restore the baseline matrix.

**Possible replacements:** matrices can tune channel isolation, swaps and tints; LUTs may support inversion or posterization; the 5×5 kernel may support blur, sharpening, embossing or directional edges. ID `1A`'s middle coefficient is `77` at `0x81756` (`4D 00`); increasing it may retain more green. Kernel normalization and ISP limits are not decoded, so these are candidates for camera tests, not guaranteed effects. Raw maps and instruction evidence are in [`analysis/filter_map.tsv`](analysis/filter_map.tsv), [`analysis/ghidra_focus.txt`](analysis/ghidra_focus.txt), and [`analysis/key_routines.txt`](analysis/key_routines.txt).

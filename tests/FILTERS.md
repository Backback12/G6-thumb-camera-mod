# Camera filters

Offsets refer to `original/backup1.bin` (SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`). Flash pointers are `0x06000000 + offset`. These are ISP records, not a named database API. Hardware observations agree between live view and saved photos; video is untested.

**Confidence:** High = controlled hardware results and matching bytes; Medium = supported interpretation with unresolved details; Unknown = storage decoded, visible meaning unresolved. Exact storage widths below are verified from code even where the effect is unknown. Raw observations, assembly detail and experiments: [FILTERS_Plan.md](FILTERS_Plan.md).

## Parameter map

| Record / field | Encoding and destination | Effect / confidence |
| --- | --- | --- |
| 17-byte curve, `p[0..16]` | One byte per entry; low 5 bits packed into `B168/B16C/B170` | **High:** saturation strength. All 0 gives grayscale; 8 lower saturation, 16 slightly higher, 31 strong saturation relative to Normal. **Medium:** brightness-dependent indexing; low indices affect brighter regions, high indices darker regions. Exact axis, boundaries and interpolation unknown. |
| 24-byte matrix, words `0..8` | Nine LE `u16`, masked to 10 bits; coefficients packed by column into `B0E4/E8/EC` | **High:** RGB mixing, row order `[Rout; Gout; Bout]`, columns `[Rin,Gin,Bin]`; diagonal 256 behaves as identity. Red/blue swap and red-derived grayscale confirmed. **Medium:** signed coefficients with scale 256; negative encoding/clipping await isolation. |
| Matrix words `9..11` | Three LE `u16`, low 7 bits to `B0F0` at bits `0,10,20` | **Unknown:** offset-like fields. Setting all to 32 produced no clear difference. Sign, units and enable conditions unresolved. |
| 88-byte record, word `0` (`+0x00`) | Low byte of LE `u32` to `B15C[31:24]` | **Medium:** contrast/gain-like control. At fixed word 2 = 200, value 0 raised dark tones/washed out the image; 128 appeared near Normal, slightly brighter. Formula/pivot unknown. |
| Word `1` (`+0x04`) | Low byte to `B15C[15:8]` | **Unknown:** adjacent color-control field; not yet isolated. |
| Word `2` (`+0x08`) | Low byte to `B15C[23:16]` | **High:** digital brightness/EV bias. 0 darkened; 255 strongly brightened/clipped versus the 200 control. The EV code adjusts the same field by steps of 16 on one sensor path. Not a proven sensor-exposure-time control. |
| Word `3` (`+0x0C`) | Low byte to `B15C[7:0]` | **Unknown:** adjacent color-control field; not yet isolated. |
| Words `4..7` (`+0x10..1C`) | Low bytes to `B160`, byte order 0..3 | **Unknown:** four controls, original value 64 each. |
| Words `8..11` (`+0x20..2C`) | Low bytes to `B164`, byte order 0..3 | **Unknown:** four controls, original value 64 each. |
| Word `12` (`+0x30`) | Low byte to `B0FC[18:11]` | **Unknown:** original value 64. |
| Words `13..20`, `21` | Adaptive gains and bucket divisor | Not consumed by the fixed-effect writer; baseline adaptation uses them. No individual visual mapping established. |
| Channel LUT | 256 bytes per R/G/B channel, written to device memory `84600/84800/84A00` | **High:** channel value remapping. Four-level replacement gives posterization; source levels are exactly 0,85,170,255 per channel (up to 64 combinations at this stage, not RGB565). |
| ID `1F` tone table | 256 LE `u16` at `8DF20`, range 0..1023; device memory `84400` | **Medium:** tone/contrast curve. Separate from saturation, but not hardware-isolated. |
| Edge stage | Two 5x5 kernels, low 6 bits per coefficient; `B104..B128` | Convolution storage/path decoded. Signed interpretation, normalization and exact visual response remain unconfirmed. Stage values 1/2/3 change a separate 6-bit control to 0/20/40; its physical meaning is unknown. |

The blue-only matrix test showed noise/pixelation, but changed no spatial controls. This is an observed appearance, **not evidence of a pixel-size parameter**. Bright/middle/dark color retention in the saturation tests is likewise not spatial highpass/bandpass/lowpass filtering.

## Original records and selectors

| Stage | Pointer/selector table | Original records |
| --- | --- | --- |
| Edge | 44 bytes at `813D8` | Kernels `81614` (zero) and `81630` (perimeter +1, center `EF`, otherwise zero) |
| RGB matrix | 44 LE pointers at `81404` | Eight 24-byte records at `816D6 + 24*i`, `i=0..7`; last (`8177E`) is shared grayscale |
| Saturation | 44 LE pointers at `814B4` | 17-byte records at `8164C/81660/81674/81688/8169C/816B0/816C4` |
| 88-byte controls | 44 LE pointers at `81564` | ID `1E`: file `A3D8`, words `0..3 = 255,128,200,128`; words `4..12 = 64` |

Each pointer table uses index `effect ID - 1`. A zero pointer restores the sensor/mode-dependent baseline, which can differ from an identity/fixed control. Writers: matrix `4D874`, saturation `4EB74`, 88-byte controls `4E1D0`, channel LUT `4DDC8`, edge `4E6AC`; apply routine `59478`.

Original channel LUTs: `8E320 = round(sqrt(256*x))`, `8E520 = 255-x`, `8E420 = x`, `8E220 = 0`, `8E120 = 255`. Two generated threshold LUTs switch between 40 and 255 at input 100; their generator leaves entry 255 uninitialized. Full ID/record mapping is in the [analysis notes](FILTERS_Plan.md#firmware-parameters-for-every-id).

## Custom filter selection

The original cycle contains Normal plus 26 IDs at `7C504` (27 selectable positions, 25 distinct parameter combinations). The apply routine accepts IDs `01..2C`, including 18 omitted from the cycle. For Normal plus seven effects, both wrap immediates at `39940/39968` are 6 and the table contains seven IDs. Normal is implicit; it is not an eighth table entry.

Custom RGB swaps, red-derived grayscale, saturation changes and four-level posterization have hardware evidence. IDs `19..1D,20,21` avoid the hard-coded LUT and ID-1F paths and can hold seven independent presets. Do not extend the original ID table into the code-pointer table at `7C520`. Each custom preset needs a distinct ID/pointer because the driver caches selections.

[Analysis and test plan](FILTERS_Plan.md) contains observations, confidence limits and remaining work. [Binary catalog](../bin/README.md) lists exact filter order and Unix timestamps; [modding map](analysis/MODDING.md) covers export and patch recipes.

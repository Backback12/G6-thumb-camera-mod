# Camera filters

Offsets refer to `original/backup1.bin` (SHA-256 `278551ea79d1485115e52d2e4e2ad49ce8aa616bedd6babd15d194a41e286184`). Flash pointers are `0x06000000 + offset`. These are ISP records, not a named database API. Round-1 hardware observations agree between live view and saved photos; video is untested.

**Confidence:** High = verified code behavior or controlled hardware results (identified below); Medium = supported interpretation with unresolved details; Unknown = visible meaning unresolved. Exact packing does not prove the ASIC's image equation. Raw observations, assembly detail and experiments: [FILTERS_Plan.md](FILTERS_Plan.md).

## Parameter map

| Record / field | Encoding and destination | Effect / confidence |
| --- | --- | --- |
| 17-byte curve, `p[0..16]` | 17 stored bytes; each is masked with `0x1F` and packed into a **5-bit field** in `B168/B16C/B170`. Upper 3 bits are discarded | **High:** saturation strength. All 0 gives grayscale; 8 lower saturation, 16 slightly higher, 31 strong saturation. Build 07 confirms raw 16/48 look alike and raw 32 gives grayscale. **Medium:** brightness-dependent indexing, bright to dark; exact axis/boundaries/interpolation unknown. |
| 24-byte matrix, words `0..8` | Nine LE `u16`, masked to 10 bits; coefficients packed by column into `B0E4/E8/EC` | **High:** RGB mixing, row order `[Rout; Gout; Bout]`, columns `[Rin,Gin,Bin]`; diagonal 256 behaves as identity. **Strongly supported:** signed two's-complement Q8: factory negatives are sign-extended and row sums are 255/256, matching 511 boost versus 512/1023 suppression. Exact ASIC rounding/clipping unknown. |
| Matrix words `9..11` | Three LE `u16`, low 7 bits to `B0F0` at bits `0,10,20` | **Medium:** signed RGB-bias interpretation. Individual 64 values give aqua, purple, yellow/brown respectively (consistent with reducing R/G/B); all 63 brightens, all 127 looks normal. All 64 reproduces blue/black shadow noise. Exact scale, clipping/wrapping and apparent pixel size remain unresolved. |
| 88-byte record, word `0` (`+0x00`) | Low byte of LE `u32` to `B15C[31:24]` | **High:** contrast-related behavior; 255 gives strong black/white separation with brightness held at 128. Value 0 gives mushy/desaturated midtones and some blue; with brightness 200 it raises dark tones. **Medium:** gain/pivot equation. |
| Word `1` (`+0x04`) | Low byte to `B15C[15:8]` | **High observed behavior, unknown equation:** 0 retains sparse primary bands; 64 darkens/compresses the palette toward vivid RGB, 192/255 brighten. Build 07 finds no visible discontinuity at 127/128/129; that does not rule out internal bit fields. Interacts with words 0/2 and LUTs; not a proven unsigned gain or percentage. |
| Word `2` (`+0x08`) | Low byte to `B15C[23:16]` | **High:** digital brightness/EV bias. 0 darkened; 255 strongly brightened/clipped versus the 200 control. EV adjusts the baseline word by steps of 16 on one sensor path; its unsigned clamp turns underflow into 255. Adaptive mode defers the register write to its updater. Not a sensor-exposure-time control. |
| Word `3` (`+0x0C`) | Low byte to `B15C[7:0]` | **High:** changes color mapping. At 64: G->B, B->purple, R->orange; at 192: R->magenta, G->yellow, B->aqua. Endpoint 0/255 gives stronger remaps. **Medium:** hue/chroma rotation around 128; exact angle, domain and encoding unknown. |
| Words `4..12` (`+0x10..30`) | Low bytes to `B160` (4), `B164` (4), `B0FC[18:11]` (1) | **High hardware support:** nine brightness-band color-strength controls, ordered **dark to bright**. Isolated 0/255 removes/boosts color in successive bands; all 128 increases overall saturation versus the all-64 control. Shadow words 4/5 at 255 also provoke blue/black noise. Exact brightness domain, knots, interpolation, unity and clipping remain unresolved; zero changes at the extreme bands were hard to see. |
| Words `13..20`, `21` | Eight Q4 gains and brightness-bucket divisor; CPU only | **High code certainty:** `bucket=min(7,floor(M/word21))`, shared gain `word[13+bucket]/16` applies only to words 4..12. `M` is a weighted/smoothed histogram brightness mean, not ISO. Multiply wraps u32; register bytes wrap rather than saturate. Fixed effects ignore these nine words. |
| Channel LUT | 256 bytes per R/G/B channel, written to device memory `84600/84800/84A00` | **High:** channel value remapping; builds 03/07 support four/eight-level posterization and mixed-channel palettes. Four source levels are exactly 0,85,170,255 (up to 64 combinations at this stage, not RGB565). Practical custom-LUT use is established; further LUT-only tests are deprioritized. |
| ID `1F` tone table | 256 LE `u16` at `8DF20`; copied unmasked to device memory `84400`. Observed range 0..1023 | **Medium:** tone/contrast curve, coupled with grayscale in stock 1F. RGB versus luma domain and hardware treatment of high bits remain unknown; there is no software 10-bit mask. |
| Edge stage | Two 5x5 kernels, low 6 bits per coefficient; `B104..B128` | **High code certainty:** fixed filters copy centers; Normal replaces the first center with unsigned `clamp(31-strength,16,31)` and has an extra `B100[6:4]` control. Sixth Normal argument is unused by this writer. Signed convolution/normalization and two-bank image response remain unconfirmed. |

Blue noise occurs through several routes: blue-channel isolation, offsets 64, blue LUT quantization, and shadow strength words 4/5. Similar appearance does not prove one underlying mechanism; no pixel-size parameter is established. Brightness-band color retention/boost is not spatial highpass/bandpass/lowpass filtering. The separate 17-entry and nine-control stages run in opposite observed index directions; their interaction/order is unresolved.

These parameter fields are not RGB565 pixels. Saturation uses separate 5-bit strengths, matrices use 10-bit coefficients/7-bit biases, and channel LUTs copy full bytes. ASIC-internal subfields remain possible where undocumented. The baseline saturation updater also uses eight Q4 gains (all 16 in both decoded profiles).

## Saved looks

Bookmarked candidates: `02/2` strong red, `02/4` blue noise, `02/5` red/blue swap, `03/1` posterization, `03/4` bright clipping, **`04/6` / `06/5` blue shadows**, **`05/4` sparse primary bands**, **`06/11` primary palette**, `06/3` purple noise, `05/6,7` remaps, `07/5` blue posterized shadows, and **`07/8` warm cartoon palette** (replaces the withdrawn `07/7` bookmark). Build-08 noise/band observations are diagnostic notes, not new bookmarks. Exact recipes: [bookmark table](FILTERS_Plan.md#bookmarked-looks).

The RGB LUTs are 1D curves: input byte -> output byte. Identity is diagonal; four-level posterization is a staircase. JSON groups in the editor are descriptive labels, not recovered firmware struct names. Known register bit packing is exported separately from speculative preview equations.

Stock LUT residency is confirmed: **five loaded + two generated shared RAM tables**, then three selected channels uploaded into ISP memory. This is a software layout limit, not a proven chip limit. Extending the bank would overwrite tone tables; loading a selected RGB preset needs only 768 bytes. [RAM/expansion evidence](FILTERS_Plan.md#lut-ram-and-expansion-evidence-2026-11-26).

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

[Filter editor](filter-emulator/README.md) provides a lightweight approximate preview with editable raw values. [Analysis and test plan](FILTERS_Plan.md) contains observations, confidence limits and remaining work. [Binary catalog](binaries/README.md) lists exact filter order and Unix timestamps; [modding map](analysis/MODDING.md) covers export and patch recipes.

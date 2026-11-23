# Filter editor

From the repository root:

```powershell
node tests/filter-emulator/server.js
```

Open **http://127.0.0.1:8787**. No npm install, packages or build step. Pass another port as the final argument if needed. Ctrl+C stops the server.

- Three simultaneous before/after pairs: camera, built-in RGB bars/ramps, and an uploaded image. All six previews stay visible while parameters scroll. Image/chart changes leave the camera running; Stop or leaving the page releases it. Frames stay in the browser.
- Open parameter sections and selected table indices survive preset/import changes. Expand a stage and enable its checkbox; one configuration updates all three pairs. Italic labels mark unresolved meanings/models.
- The reference column shows value/delta against either editor-neutral defaults or original H63P/H63S static color/saturation defaults. `?` means a factory field is not decoded; references do not claim to capture adaptive runtime Normal or change the preview.
- Presets use records reconstructed by `patch_g6.js`; names are `build/position`. Stars mark [saved candidates](../FILTERS_Plan.md#bookmarked-looks). 01..06 have owner observations; 07 remains experimental.
- RGB LUTs and the tone table have draggable 1D curves, index/output sliders and bulk lists. X = input index; Y = output value. Dashed gray = reference where known. A LUT is a transfer curve: identity is diagonal and quantization produces stairs. Display lines connect discrete samples; the lookup remains discrete.
- All fields remain editable. Saturation retains raw bytes `0..255`, while the writer/preview uses `value & 31`. Raw 16/48 therefore match; raw 32 becomes 0. Matrix/kernel controls use canonical masked fields; first 13 color controls edit low bytes while preserving other imported raw bits. Exact image meanings are separate from storage widths.
- Save JSON includes raw values, `record_hex`, derived `register_bits` and separate preview assumptions. Register bits describe the entered records, **not** live hardware when a stage restores its adaptive baseline. Copy config beside Save creates a compact `g6-filter-delta-v1` object against `editor-neutral-v1` for chat; both JSON formats can be loaded. These group names are editor labels, not recovered firmware structs, and neither format is a directly flashable recipe. If clipboard access fails, the text is selected for manual Copy.

This is a filter sketchpad, not a firmware emulator. It processes already-rendered RGB input at up to 480 pixels / 15 fps. It does not simulate the sensor, auto exposure/WB, demosaic, ISP noise, precision, or JPEG. Large kernels can reduce frame rate.

| Preview stage | Assumption / limit |
| --- | --- |
| Matrix | Signed two's complement, divide by 256, clamp. The sign boundary has hardware evidence; exact arithmetic/rounding remains unknown. Offset fields default to ignored; optional signed/unsigned additive models do **not** reproduce blue-shadow noise. |
| Saturation | Low-five-bit values, reverse BT.601 luminance axis, linear interpolation, assumed unity 16. Only broad ordering and saturation behavior are established. |
| Color | Word 0 scales luminance around an adjustable pivot, word 2 adds bias around 128. Exact equation unmeasured. Words 1/3 default to raw-only; optional luma-gain/hue models remain speculative. Hue direction now follows intermediate build-06 observations; angular scale is unknown. The sparse-primary effect is not reproduced. Words 4..21 are stored only. |
| LUT / tone | Channel LUT values are exact; pipeline order is adjustable. Tone-table channel domain and scaling are assumed. |
| Kernels | Generic signed convolution, adjustable divisor/bias. Actual edge-control fields are stored only; ISP normalization/modes are unresolved. |

[FILTERS.md](../FILTERS.md) records confidence; [FILTERS_Plan.md](../FILTERS_Plan.md) holds hardware logs and calibration plans. Unknown effects remain unknown even when the UI offers an illustrative model.

Checks: `node --test tests/filter-emulator/model.test.js`.

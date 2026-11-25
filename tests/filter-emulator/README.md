# Filter editor

From the repository root:

```powershell
node tests/filter-emulator/server.js
```

Open **http://127.0.0.1:8787**. No npm install, packages or build step. Pass another port as the final argument if needed. Ctrl+C stops the server.

**Folder workflow:** Open folder (for example `custom/filters`), select a JSON filename to load/preview it, and use Find or the list's arrow keys to switch quickly. Refresh picks up external changes. The list includes JSON files directly inside that folder, not subfolders. Save updates the selected file; Save As uses New filename and creates a separate file, refusing existing names. A modified-file marker shows unsaved edits; switching away prompts before discarding. Save also checks for external edits before writing.

Direct folder saves use the browser's [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), available in supported desktop Chromium browsers such as Chrome/Edge on localhost. The browser asks for folder access. Without that API, folder loading is read only and Save JSON still downloads a file. Folder selection is session-only; reopen it after reloading. Restart an already-running Node server after updating these files so it serves `files.js`.

- Three simultaneous before/after pairs: camera, built-in RGB bars/ramps, and an uploaded image. All six previews stay visible while parameters scroll. Image/chart changes leave the camera running; Stop or leaving the page releases it. Frames stay in the browser.
- Bordered parameter sections and selected table indices survive preset/import/folder-file changes. Expand a stage and enable its checkbox; one configuration updates all three pairs. Italic labels mark unresolved meanings/models.
- The reference column shows raw value/delta against editor-neutral or original H63P/H63S static matrix/offset/color/saturation defaults. Factory matrices use canonical low-ten-bit coefficients. `?` means a field is not decoded; references do not capture adaptive runtime Normal or change the preview. Normal-edge arguments/center are shown as readonly reference metadata.
- Presets use records reconstructed by `patch_g6.js`; names are `build/position`. Stars mark [saved candidates](../FILTERS_Plan.md#bookmarked-looks). All eight builds have owner observations; 07/8 is the preferred cartoon bookmark, replacing 07/7. `stock/1F` contains the original combined tone/grayscale parameters.
- RGB LUTs and the tone table have draggable 1D curves, index/output sliders and bulk lists. X = input index; Y = output value. Dashed gray = reference where known. A LUT is a transfer curve: identity is diagonal and quantization produces stairs. Display lines connect discrete samples; the lookup remains discrete.
- All fields remain editable. Saturation retains raw bytes `0..255`, while the writer/preview uses `value & 31`. Raw 16/48 therefore match; raw 32 becomes 0. Matrix/kernel controls use canonical masked fields; first 13 color controls edit low bytes while preserving other imported raw bits. Exact image meanings are separate from storage widths.
- Show bits displays raw hex, effective binary, signed interpretation and register slice; hover for storage/source masks and full raw bits. It can be hidden for compact editing. These are individual parameter fields, not RGB565 pixels. Tone input preserves full u16 values; its curve starts at the observed 0..1023 range and expands for larger entries.
- The color section labels words 4..12 as nine color-strength bands ordered dark to bright, based on build 08. They remain raw-only in the pixel preview because exact knots/domain/scaling are unresolved. The separate baseline calculator shows exact histogram-bucket/Q4-gain/wrap math; fixed custom effects ignore those adaptive gains/divisor.
- Save JSON includes raw values, `record_hex`, derived `register_bits`, a separate `adaptive_color` calculation and preview assumptions. Register bits describe the entered records, **not** live hardware when a stage restores its adaptive baseline. Copy config creates a compact `g6-filter-delta-v1` object against `editor-neutral-v1` for chat; both formats and older exports can be loaded. Group names are editor labels, not recovered firmware structs; neither format is flashable. Clipboard failure selects the text for manual Copy.

This is a filter sketchpad, not a firmware emulator. It processes already-rendered RGB input at up to 480 pixels / 15 fps. It does not simulate the sensor, auto exposure/WB, demosaic, ISP noise, precision, or JPEG. Large kernels can reduce frame rate.

| Preview stage | Assumption / limit |
| --- | --- |
| Matrix | Signed Q8 is strongly supported by factory negatives/row sums and hardware. Exact clipping/rounding remains unknown. Offsets default to ignored; additive hypotheses do **not** reproduce blue-shadow noise. |
| Saturation | Low-five-bit values, reverse BT.601 luminance axis, linear interpolation, assumed unity 16. Only broad ordering and saturation behavior are established. |
| Color | Word 0 scales luminance around a pivot, word 2 adds bias around 128; equations unmeasured. Words 1/3 default to raw-only; optional luma-gain/hue models remain speculative. Direction fits build 06, angular scale unknown. Sparse-primary effects are not reproduced. Words 4..12 are not simulated; 13..21 only feed the separate calculator. |
| LUT / tone | Channel LUT values are exact; pipeline order adjustable. Tone domain (RGB or luma) and 1023 output scaling are hypotheses; the CPU copies all 16 bits, with no software 10-bit mask. |
| Kernels | Generic summed signed convolution, adjustable divisor/bias. Fixed-filter controls are stored only. Normal's center substitution is decoded separately; ASIC two-bank response/normalization remains unresolved. |

[FILTERS.md](../FILTERS.md) records confidence; [FILTERS_Plan.md](../FILTERS_Plan.md) holds hardware logs and calibration plans. Unknown effects remain unknown even when the UI offers an illustrative model.

Checks: `node --test tests/filter-emulator/model.test.js tests/filter-emulator/files.test.js`; original-instruction checks: `node tests/tools/verify_isp.js`. Browser folder checks use temporary browser-private fixtures; they do not edit the user's saved filters.

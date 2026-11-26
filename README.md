# G6-thumb-camera-mod

Create custom sounds/images on your G6 Thumb Camera

Processor is HX3302B, flash chip is P25Q80H.

# Usage

Ensure custom sizes are less than the original file sizes

Custom releases now use `custom/<unix>_<project_name>/`, with replacement WAV/JPG files directly inside and JSON presets in `filters/`. Build with `python replace_g6.py --project "custom/1795664901_connor_custom_v0.2"` (Python standard library + Node; no packages). The project receives `hx330x_sdk.bin` and a README with timestamp, filter positions and patch map. V0.2 uses checked temporary heap storage for all 18 channel LUTs; v0.1 is preserved as a failed experiment. Original backup/extracted assets are unchanged. Experimental builds are under [tests/binaries](tests/binaries/README.md).


# Custom .wav
* Sample Size
* Bit
* Mono
* Fill in rest options

# Custom Boot Images
## Exporting from GIMP
* Progressive: `OFF`
* Export as CMYK: `OFF`
* Use Arithmetic Coding: `OFF`
* Optimize: `ON`
* Subsampling: `4:2:0`
* DCT method: `Integer`

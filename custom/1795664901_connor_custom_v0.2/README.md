# connor_custom_v0.2

Built UTC: 2026-11-26T03:48:21+00:00. Unix timestamp: **1795664901**.

Source: original backup1.bin. Output: hx330x_sdk.bin (1,048,575 bytes); full LE32 timestamp at 0x14 and exactly one final FF removed.

Position 0 is startup Normal; short Down advances, Up reverses. These custom combinations await hardware testing. Preview assumptions in JSON are not firmware parameters.

| Position | Effect ID | Filter file |
| ---: | --- | --- |
| 0 | 00 | Normal |
| 1 | 20 | filters/inverted-reality-glitch.json |
| 2 | 21 | filters/jagged-lut.json |
| 3 | 22 | filters/lut-funky-darks.json |
| 4 | 23 | filters/neon-barf.json |
| 5 | 24 | filters/subtle-rainbow.json |
| 6 | 25 | filters/temp.json |
| 7 | 26 | filters/warm-lut.json |

Media replacements: 00001565.jpg, 00001580.jpg, 00000989.wav, 00001264.wav, 00001291.wav, 00001548.wav.

All 18 channel tables (six RGB presets) are copied into a checked 4,608-byte heap allocation during a custom LUT change. The selected three tables are uploaded to the ISP, then the allocation is freed. No persistent RAM pointer or bank extension; allocation failure uses the stock LUT fallback. The matrix-only preset allocates no LUT memory.

The existing LUT switch at 0x5962C..0x5973B is replaced in place; parameter slots at 0x81614 are reused. LUT source data fits after the shortened 00001291.wav RIFF/PCM end, within its original 70,104-byte resource slot. Its playable bytes and source WAV are unchanged. No new code/data in the final FF area. Original LUT/tone libraries and loader are preserved.

Boot/SD-update bytes 0x200..0xA5FF are unchanged, as are other application routines outside the documented filter/cycle edits. Header timestamp changes at 0x14; output removes one final FF. Filter code is gated by the active ISP and custom effect ID, not inserted into boot/update entry points. Hardware validation after a full power cycle and during recording is still required.

SHA-256: `bdb5921bb3792a93aa250439206beaae8418becc35d2318d4827e4a7c30062ce`.

Rebuild from repository root: `python replace_g6.py --project "custom/1795664901_connor_custom_v0.2"`. Rebuilds choose a newer timestamp; rename the folder to match that timestamp when keeping another release.

## Filter patch map

| Offset | Bytes | Change |
| --- | ---: | --- |
| 0x81614 | 28 | per-filter LUT offsets |
| 0x81630 | 24 | inverted-reality-glitch.json matrix |
| 0x81480 | 4 | matrix pointer |
| 0x81530 | 4 | saturation pointer |
| 0x815E0 | 4 | color pointer |
| 0x813F7 | 1 | baseline edge |
| 0x81484 | 4 | matrix pointer |
| 0x81534 | 4 | saturation pointer |
| 0x815E4 | 4 | color pointer |
| 0x813F8 | 1 | baseline edge |
| 0x81488 | 4 | matrix pointer |
| 0x81648 | 17 | lut-funky-darks.json saturation |
| 0x81538 | 4 | saturation pointer |
| 0x815E8 | 4 | color pointer |
| 0x813F9 | 1 | baseline edge |
| 0x8165C | 24 | neon-barf.json matrix |
| 0x8148C | 4 | matrix pointer |
| 0x8153C | 4 | saturation pointer |
| 0x815EC | 4 | color pointer |
| 0x813FA | 1 | baseline edge |
| 0x81674 | 24 | subtle-rainbow.json matrix |
| 0x81490 | 4 | matrix pointer |
| 0x8168C | 17 | subtle-rainbow.json saturation |
| 0x81540 | 4 | saturation pointer |
| 0x815F0 | 4 | color pointer |
| 0x813FB | 1 | baseline edge |
| 0x816A0 | 24 | temp.json matrix |
| 0x81494 | 4 | matrix pointer |
| 0x81544 | 4 | saturation pointer |
| 0x815F4 | 4 | color pointer |
| 0x813FC | 1 | baseline edge |
| 0x81498 | 4 | matrix pointer |
| 0x81548 | 4 | saturation pointer |
| 0x815F8 | 4 | color pointer |
| 0x813FD | 1 | baseline edge |
| 0xA83C0 | 4608 | LUT source bank after declared WAV end |
| 0x5962C | 272 | in-place checked allocation/LUT upload/free |
| 0x39940 | 4 | forward wrap |
| 0x39968 | 4 | reverse wrap |
| 0x7C504 | 26 | cycle IDs; inactive slots zeroed |

RAM ownership: original malloc 0x26760 / free 0x2695C. The allocator skips occupied blocks; returned spans must fit 0x02000000..0x02200000. No guessed fixed RAM address is used. The stock fixed bank 0x02008E40..0x0200953F and adjacent tone buffers are not expanded.

## Verification and hardware check

30 automated tests and 44 original-instruction checks pass. Full allocator/free and ISP-writer execution covers repeated selections, live-allocation canaries, fragmented-memory failure and cache bypass. v0.1, source media/JSON, original backups and all eight filter-test binaries remain unchanged. The WAV audio bytes, stock LUT/tone initialization, boot/update prefix and final FF region are preserved.

Hardware check pending: start from a full power-off, cycle positions 0..7 both ways, return to Normal, change modes, restart again, and check audio playback plus recording with/without changing filters. Allocation is temporary on selection, so no LUT heap block remains reserved during ordinary recording. A failed allocation restores only the LUT stage to baseline. No physical programmer or live analyser was used.

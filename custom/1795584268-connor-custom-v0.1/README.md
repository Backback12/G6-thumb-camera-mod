# connor-custom-v0.1

Built UTC: 2026-11-25T05:24:28+00:00. Unix timestamp: **1795584268**.

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

Each filter has its own enabled records/channel LUTs. Disabled stages restore the factory baseline. A small LUT dispatch hook and records use original FF padding at 0xF1200; original assets/parameter libraries stay in place. Tone/edge JSON compilation is rejected until supported.

SHA-256: `016109f811ca602ec4313cb984ba31531667f2a983d988f696e64e82cf971606`.

Rebuild from repository root: `python replace_g6.py --project "custom/1795584268-connor-custom-v0.1"`. Rebuilds choose a newer timestamp; rename the folder to match that timestamp when keeping another release.

Validation: 24 automated tests, including seven custom LUT dispatches, Normal fallback and 24 cycle transitions; 44 original-instruction ISP checks. All ten media slots and the changed-byte allowlist passed. Original backup copies and all eight relocated filter test binaries are unchanged. Audacity sources and IMG_7639_preview.jpeg remain outside this project.

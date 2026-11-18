# Open board library

FixMyCircuit ships no manufacturer boardviews. This folder lists real boards whose
authors published them under open licences that allow anyone, including a paid
product like FixMyCircuit, to redistribute them. Each one is pinned to an exact
upstream commit and keeps its licence and attribution.

- `catalog.json` is the source of truth: brand, series, model, repo, commit, files, licence.
- `library-index.hosted.json` is generated from it. Every file is a raw GitHub URL at
  the pinned commit with its sha256, so the app's hosted library setting can download
  a board straight from its authors with no server of our own.
- `npm run library` (`scripts/build-open-library.mjs`) builds the offline pack:
  `Brand/Series/Model/` folders with the unchanged files, a `model.json`, the
  `LICENSE.txt`, and a root `library-index.json` and `NOTICE.md`. Add `--zip` for a zip.
  Every board is opened with the app's own parser during the build, and the build fails if one has no parts.
- `test/library.test.mjs` fails if an entry has no pinned commit, no attribution, or a
  licence outside the allowed list (anything non-commercial is refused).

## Adding a board

1. Check the licence allows redistribution and commercial use. No NC licences, no
   "for reference only" files, no leaked files.
2. Add an entry to `catalog.json` with the full commit SHA.
3. Run `npm run library -- out/open-library` and `npm test`, then copy the regenerated
   `library-index.hosted.json` into this folder.

## Boards (21)

| Brand | Series | Model | Device | Licence | Source |
|---|---|---|---|---|---|
| SPIRIT | Open smartphone | SPIRIT CM5 carrier (prototype) | smartphone | CERN-OHL-S-2.0 | [source](https://github.com/V3lectronics/SPIRIT) |
| Antmicro | Snapdragon baseboards | Snapdragon 625 (Quectel SC606T) baseboard | phone SoC board | Apache-2.0 | [source](https://github.com/antmicro/snapdragon-625-baseboard) |
| Antmicro | Snapdragon baseboards | Snapdragon 845 (SA800U) baseboard | phone SoC board | Apache-2.0 | [source](https://github.com/antmicro/snapdragon-845-baseboard) |
| Olimex | TERES-I laptop | TERES-I mainboard (A64) Rev C | laptop | Apache-2.0 | [source](https://github.com/OLIMEX/DIY-LAPTOP) |
| Olimex | TERES-I laptop | TERES-I IO board Rev B | laptop | Apache-2.0 | [source](https://github.com/OLIMEX/DIY-LAPTOP) |
| Olimex | TERES-I laptop | TERES-I keyboard board Rev A | laptop | Apache-2.0 | [source](https://github.com/OLIMEX/DIY-LAPTOP) |
| Olimex | OLinuXino | A64-OLinuXino Rev H | single-board computer | CC-BY-SA-3.0-US | [source](https://github.com/OLIMEX/OLINUXINO) |
| Olimex | ESP32 boards | ESP32-EVB Rev L | IoT board | Apache-2.0 | [source](https://github.com/OLIMEX/ESP32-EVB) |
| Olimex | ESP32 boards | ESP32-PoE Rev M2 | IoT board | Apache-2.0 | [source](https://github.com/OLIMEX/ESP32-POE) |
| Great Scott Gadgets | HackRF | HackRF One | software-defined radio | CERN-OHL-P-2.0 | [source](https://github.com/greatscottgadgets/hackrf) |
| ZSWatch | Smartwatch | ZSWatch Watch DevKit | smartwatch | GPL-3.0-only | [source](https://github.com/zswatch/watch-devkit-hw) |
| ZEReader | E-reader | ZEReader Pico | e-reader | CERN-OHL-S-2.0 | [source](https://github.com/Allegra42/ZEReader-KiCad) |
| Framework | Laptop expansion cards | Expansion Card (microcontroller reference) | laptop accessory | CC-BY-4.0 | [source](https://github.com/FrameworkComputer/ExpansionCards) |
| Community | Laptop expansion cards | USB LTE modem card | cellular modem | CERN-OHL-W-2.0 | [source](https://github.com/Zokhoi/framework-cellular-card) |
| EnAccess | Cicada cellular | Cicada 2G (SIM800C) v1.1 | cellular modem | MIT | [source](https://github.com/okrasolar/Cicada-HW) |
| EnAccess | Cicada cellular | Cicada 4G (SIM7600) v1.1 | cellular modem | MIT | [source](https://github.com/okrasolar/Cicada-HW) |
| Antmicro | Jetson baseboards | Jetson Nano baseboard | embedded computer | Apache-2.0 | [source](https://github.com/antmicro/jetson-nano-baseboard) |
| Antmicro | Jetson baseboards | Jetson AGX Thor baseboard | embedded computer | Apache-2.0 | [source](https://github.com/KiCad/kicad-source-mirror) |
| Community | Raspberry Pi CM5 carriers | CM5 Minima | embedded computer | CERN-OHL-S-2.0 | [source](https://github.com/KiCad/kicad-source-mirror) |
| Lord's Boards | Feather boards | RoyalBlue54L Feather | wireless board | CERN-OHL-P-2.0 | [source](https://github.com/KiCad/kicad-source-mirror) |
| OpenAir | Air-quality monitors | One Air Max | sensor board | CC-BY-SA-4.0 | [source](https://github.com/KiCad/kicad-source-mirror) |

## Looked at and left out

- **M17 LinHT handheld radio**: CC BY-NC-SA 4.0: non-commercial only, and FixMyCircuit is sold with licence keys.
- **M17_3310 (Nokia 3310 replacement mainboard)**: CC BY-NC-SA 4.0: non-commercial only. Techs can still download it themselves and open it in the app.
- **StickHub (KiCad demo)**: CC BY-NC-SA 4.0: non-commercial only.
- **PinePhone / PinePhone Pro**: PINE64 publishes schematic PDFs for reference but no layout or boardview under an open licence. Link only.
- **Librem 5 phone and devkit**: Devkit KiCad files are GPL-3.0 on source.puri.sm, which the build server could not reach. Add later by running the build script from a machine that can reach it.
- **MNT Reform / Pocket Reform**: CERN-OHL-S-2.0 KiCad files on source.mnt.re, which the build server could not reach. Add later the same way.
- **Fairphone**: Fairphone publishes repair guides and spare parts, not open board layouts.
- **Apple, Samsung, Xiaomi, Tecno, Infinix, Itel boardviews**: The files that circulate online are leaked manufacturer data. They are not redistributable.

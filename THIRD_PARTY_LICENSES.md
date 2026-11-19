# Third-party licenses

## OpenBoardView (boardview file readers)

The parsers in `src/parsers/` (BRD, BRD2, BDV, ASC, BVR, BVR3, CST, FZ, CAE,
XZZ PCB, GenCAD, Altium ASCII and the "Panel" CAD export, plus the Allegro
format check) are JavaScript ports of the file format readers in OpenBoardView,
and the part outline method in `src/parsers/geometry.js` follows OpenBoardView's
BoardView::DrawParts,
https://github.com/OpenBoardView/OpenBoardView. The DES routine in
`src/parsers/des.js` is a port of the one OpenBoardView uses, written by
Daniel Huertas Gonzalez (https://github.com/dhuertas/DES, MIT).

```
OpenBoardView is MIT Licensed

Copyright (c) 2016 Chloridite and OpenBoardView contributors


The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## pdf.js

Schematic viewing uses Mozilla pdf.js (`pdfjs-dist`), Apache License 2.0,
https://github.com/mozilla/pdf.js.

## Other runtime dependencies

React (MIT), better-sqlite3 (MIT), pako (MIT and Zlib), Electron (MIT).

## scrcpy (Windows build only)

The Windows installer bundles the unmodified official scrcpy release
(https://github.com/Genymobile/scrcpy), which includes adb from the Android SDK
platform tools. scrcpy is Copyright (C) 2018 Genymobile and Copyright (C)
2018-2024 Romain Vimont, licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0). adb is part of the Android Open
Source Project, also under the Apache License, Version 2.0.

## Photographs

Real photographs bundled in `src/renderer/src/assets/photos/` (shown on the
Home screen and workbench tool cards). Each is used under its stated licence;
the list in the app's About box mirrors this one.

- *Microscope close-up of blown step-down regulator on laptop PCB* by Profpcde,
  CC0 1.0. https://commons.wikimedia.org/wiki/File:Microscope_close-up_of_blown_step-down_regulator_on_laptop_PCB.jpg
  (resized)

## Anthropic TypeScript SDK

The optional AI assistant uses `@anthropic-ai/sdk` (MIT License,
https://github.com/anthropics/anthropic-sdk-typescript).

## UxPlay (not included)

FixMyCircuit can start UxPlay (https://github.com/FDH2/UxPlay, GPL-3.0) for iPhone AirPlay mirroring when the user has installed it. UxPlay is a separate program; it is not bundled or linked.

## Ollama, OpenAI-compatible servers (not included)

The AI assistant can talk to a server the user chooses over HTTP. No code from those projects is included.

## ERA Technologiz logo

The ERA Technologiz mark (src/renderer/src/brand/eraLogo.ts) is a trademark of ERA Technologiz and Engineering Services, used by its owner. It is not covered by the app's open-source licence.

## Open board library (library/)

`library/catalog.json` and `library/library-index.hosted.json` list open-hardware
boards by their authors, each under its own licence (Apache-2.0, MIT, CC BY 4.0,
CC BY-SA 3.0 US / 4.0, CERN-OHL-P/W/S 2.0, GPL-3.0, GPL-3.0-or-later). The board files themselves are
not in this repository or in the installer. They are downloaded from the authors'
repositories at a pinned commit, or come in the separate library pack, where every
model folder carries its LICENSE.txt and the pack root carries NOTICE.md.
See library/README.md for the full list and attributions.

## Open board shipped in the installer (openboards/)

One open-hardware board is included so a first launch shows a real, full-size
board: the Olimex TERES-I mainboard (A64) Rev C (KiCad board and schematic PDF).
TERES-I by Olimex Ltd., https://github.com/OLIMEX/DIY-LAPTOP, commit
36193de48e5ff86c6fa309eb75bd450a9f88c4c7. Licensed under the Apache License 2.0;
the full licence text is in its folder's LICENSE.txt. The files are unmodified.

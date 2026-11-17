# FixMyCircuit

A free, offline desktop workbench for phone repair technicians. Open schematic
PDFs and boardview files side by side, click a part to light up its nets, and
keep your shop's own diode readings, jumper wires and fault fixes in a local
database. Built for iPhone, Samsung, Tecno, Infinix, Itel and Xiaomi repairs,
and works with any brand.

No account, no licence server, no internet needed.

## Features

- **Brand → Model → Category library.** The sidebar groups everything per
  phone model under Fault Solutions, Diode Readings, Schematics/PDF, BoardView
  and Board Photos. Files you import are copied into the app's data folder so
  they open offline. Ctrl+K searches models, files, fault fixes and readings.
- **Schematic viewer (pdf.js).** Fast text search for part and net names
  (Ctrl+F, Enter for next match), zoom, drag to pan, page jump. "Find on board"
  sends the selected text to the boardview.
- **Boardview viewer.** Reads `.brd` (Test_Link, plain and encoded), BRD2,
  `.bdv`, `.asc`, `.bv`/`.bvr` (BVR1 and BVR3), `.cst`, `.fz` and XZZ `.pcb`.
  Click a part to list its pins and nets, click a pin to highlight the whole
  net (with a count of pins on the other side), search parts and nets, flip
  top/bottom (Space), rotate (R), fit (F). "Schematic" jumps to the part or net
  in the PDF.
- **Repair panel (split pane).** Next to any open schematic, boardview or
  photo, shows the model's readings and fault solutions, filtered to the part
  or net you selected. Add a reading or a fix right there.
- **Shop Contributor Mode.** Add a microscope photo of the motherboard, drop
  colour-coded pins (diode, voltage, resistance, note) on components, type the
  reading (for example `0.452`), and draw jumper wires with labels. Everything
  is saved to SQLite with the technician's name.
- **Fault solutions and diode readings** stored in SQLite (`better-sqlite3`),
  editable in the app.
- **Offline storage tools.** Open the data folder, back up the database, or
  export all guides, readings and jumpers as JSON (Settings).

Encrypted `.fz` and XZZ `.pcb` boardviews need a decryption key, which
FixMyCircuit (like OpenBoardView) does not ship. Paste the key you already use
in Settings.

## Download and install (Windows)

Every push builds a Windows installer and a portable `.exe` in GitHub
Actions (workflow **Build**, artifact **FixMyCircuit-windows**). Download the
artifact, run `FixMyCircuit Setup x.y.z.exe`, or run the portable `.exe`
straight from a USB stick.

## Develop

Requires Node.js 20 or 22.

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # start the app with hot reload
npm test             # parser tests
npm run typecheck
npm run build && npm run test:e2e   # full app test (Linux: xvfb-run -a npm run test:e2e)
npm run dist:win     # build the Windows installer into release/
```

`npm run sample` regenerates the synthetic sample files in `samples/`
(a made-up "demo phone" board, schematic and photo) used by the tests.

### Layout

```
src/main/       Electron main process, SQLite schema and IPC (db.ts, index.ts)
src/preload/    Safe bridge exposed to the UI as window.fmc
src/parsers/    Boardview readers (ports of OpenBoardView) and the board model
src/renderer/   React + TypeScript + Tailwind UI
src/shared/     Types shared by main and renderer
test/           Parser tests, synthetic fixtures and the Electron e2e test
```

Data lives in the Electron user-data folder (`%APPDATA%\FixMyCircuit\data`
on Windows): `fixmycircuit.db` plus a `library/` folder of imported files. Set
`FMC_DATA_DIR` to use another folder, for example a shared drive.

## Files and copyright

FixMyCircuit opens files that you load yourself. The repository contains only
synthetic sample files; please do not commit OEM schematics or boardview files
to it.

## Credits

Boardview readers are ported from [OpenBoardView](https://github.com/OpenBoardView/OpenBoardView)
(MIT). PDF rendering by [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0).
See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

MIT licensed.

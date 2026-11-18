# FixMyCircuit

*A product of **ERA Technologiz and Engineering Services**. Find the fault. Fix with confidence.*

A free, offline desktop workbench for phone repair technicians. Open schematic
PDFs and boardview files side by side, click a part to light up its nets, and
keep your shop's own diode readings, jumper wires and fault fixes in a local
database. Built for iPhone, Samsung, Tecno, Infinix, Itel and Xiaomi repairs,
and works with any brand.

No account, no licence server, no internet needed (the optional AI assistant
is the only feature that goes online, and only with your own API key).

## Features

### New in 0.6: the repair-tool layout, model library

- **Big screen when you want it.** Every panel (model library, tabs,
  toolbar, NET/Component panel, part card, repair panel, trial notice and
  status bar) can be hidden from the **View** button at the right of the tab
  bar. **Full board** (F11 or Ctrl+Shift+F) hides them all; *Show panels* in
  the bottom-left corner brings them back. Shortcuts: Ctrl+B library, Ctrl+J
  NET/Component, Ctrl+E repair panel. The layout is kept for next time.
- **Model library tree.** Brand, then series, then model, with a "Find a model"
  box and a Recently opened list. Pick a model and its board opens straight
  away.
- **Add a folder of boards.** One button (or drop folders anywhere on the
  window) scans a folder and its sub-folders. It sorts every boardview,
  schematic and photo into Brand / Series / Model using a `model.json`, a root
  `library-index.json`, the folder names (`Brand/Series/Model/`) or the file
  name. You can check and fix every row before importing, and files already in
  the library are skipped.
- **Online library.** Load a hosted `library-index.json`. By default this is
  FixMyCircuit's open library of open-hardware boards that may be shared, each
  with its licence. Downloads are checked against their SHA-256. FixMyCircuit
  does not include or host phone makers' boards.
- **Black & red look.** A black background with red pads, teal shields and
  connectors, a pink board edge and the picked part in yellow.
- **Side by side.** Both halves of the board next to each other, with the
  bottom mirrored on the right.
- **Pins panel.** A NET tab (No, Code, PAD, Side) lists every pad on the
  picked net. A Component tab has a part lookup and the part's pins and nets.
  Click any row to jump to that pad.
- **Diode map.** Your shop's diode values are written beside the board, with
  a leader line to a pad of each rail. Click a label to select the rail.
- **Measurement sheet.** Each signal shows what it is, its volts and its diode
  value, plus the model's common faults. Everything comes from your own
  readings and fault solutions. A voltage read from a net's name is marked,
  and demo values are labelled as synthetic.

### New in 0.4: real copper, licence keys, your own AI

- **Real copper traces, not just computed lines.** Boardview files only hold pins and nets, so the lines between pins are computed. Now you can see the real routing:
  - open a **KiCad layout** (`.kicad_pcb`) or an **ODB++ job** (`.tgz`, `.tar`, `.zip`, including `.Z`-compressed layers) as a board, with every track, arc and via and its net;
  - add **Gerber copper layers** (`.gtl`, `.gbl`, `.g1`…) to any boardview from the new **Copper** panel. Gerber X2 files line up on the part pads automatically; older Gerbers are fitted to the board outline and say so;
  - **trace copper yourself** on a board photo in Contributor mode (Trace tool, `T`), give it a net, and align the photo with two reading pins. It shows on the boardview in green as shop-verified copper.
  - Real copper is drawn solid; computed connections are dashed, and the net panel says which you are looking at. All parsers are built in (no extra software).
- **Licence keys locked to one PC.** Each PC shows its machine ID with a Copy button and a **Request key on WhatsApp** button (to +234 810 251 4461). Keys are signed offline (Ed25519) with an expiry date; there is a 7-day trial, a warning in the last 7 days and a 3-day grace period. Turning the PC clock back does not extend a key.
- **Bring your own AI.** Besides Claude, the assistant can use OpenAI, Google Gemini, OpenRouter, any OpenAI-compatible server, or **Ollama running offline on the PC**. Pick it in Settings.
- **Tool manager.** Settings, Tools and components shows scrcpy, adb, UxPlay and Ollama. Missing scrcpy/adb install with one click from the official GitHub release into `%APPDATA%\FixMyCircuit\tools`, only after the download matches GitHub's published SHA-256.
- **iPhone AirPlay.** The mirror tab can start an AirPlay receiver (UxPlay, if installed) and says plainly what iOS allows: view only, same Wi-Fi, a working screen to start mirroring.
- **IC list verification.** Mark an IC entry as verified after checking it on a real board (your name and the date are saved), and filter verified / to verify.
- **Microscope.** Clear messages when the camera is busy, blocked by Windows privacy settings or unplugged, automatic fallback, actual resolution shown, and a self-check.
- **Faster start.** Heavy views load on first use and the splash is shorter. A 25,000-pin board parses and indexes in about 0.15 s.
- The official **ERA Technologiz** logo throughout.

### New in 0.3: every node known, AI assistant, new look

- **Full netlist index.** Every part, pin and net in the boardview is indexed.
  The Netlist panel lists all nets (rails, signals, ground) and all parts with
  their type, shows board health (NC pins, single-pin nets, ground nets), and
  a selected net shows its decoupling caps, the ICs on it and the series
  parts it continues through (for example VBUS_IN → F3000 → VBUS_IN_F).
- **Path tracer.** Pick two parts or nets and FixMyCircuit finds the DC path
  between them through resistors, coils, fuses, ferrites, jumpers and diodes
  (never through ground), draws it on the board and lists each hop. Only
  connections in the file are used; nothing is guessed.
- **Schematic cross-links.** The model's schematic PDFs are text-indexed, so a
  selected part or net shows which schematic pages name it.
- **Optional AI troubleshooting assistant.** Describe a fault in plain words.
  The assistant looks up the real nets, parts, paths, your shop readings, saved
  fixes, the knowledge base and the IC list before answering, then suggests
  what to measure. Part and net names in its answer are clickable. It uses the
  Claude API (Claude Opus 5.5 by default, Sonnet 5.5 optional) with your own
  key from Settings, and every answer is labelled as an AI suggestion to verify
  with measurements.
- **Repair command centre.** A new Home with a real microscope photo, “Continue
  your work”, live stats with 14-day activity bars, colour quick actions, a
  searchable device library with completeness rings (grid or list), workshop
  tools and recent activity. All numbers come from your own library.
- **Light and dark mode** (or follow Windows), including the boardview canvas.
- **Animations:** splash screen, page transitions, hover lifts, counters, and
  a marching trace pulse along the selected net on the boardview.
- **Branding:** new FixMyCircuit app icon and an original ERA Technologiz logo
  in the sidebar, splash, About and status bar.

### New in 0.2: workbench tools and a demo workshop

- **Demo workshop on first launch.** Four sample models (Tecno Camon 20 Pro,
  Infinix Note 30, Samsung Galaxy A32, iPhone 12 Pro, all marked "(demo)") open
  ready to try: schematic, boardview, board photo, fault solutions, diode and
  voltage readings and colour-coded jumpers. They all share one invented board
  made for this app: it is not the layout of any real phone and the readings are
  synthetic. Remove or reload them from Home or Settings.
- **Colour-coded trace layers.** Charging / VBUS, Display / Backlight,
  Touch / I2C, Audio / Mic, Network / RF and GND, with checkboxes. On a
  boardview each layer colours its pins and draws its nets as lines; on a board
  photo it shows or hides that layer's jumper wires (and, for photos aligned to
  the boardview, the board's net lines).
- **Hover reference card.** Hover any pin on a boardview or photo to see the pin,
  net, layer, the shop's diode and voltage readings for that net, and the ICs on it.
- **Split-screen sync.** Show two documents side by side (for example board photo
  and schematic). A jump bar finds a component or net in both panes, picking a
  part in one pane finds it in the other, and zoom follows between panes (pan as
  well between a boardview and an aligned photo).
- **USB microscope tab.** Live view from any USB microscope or webcam, zoom,
  rotate, mirror, crosshair, freeze frame, and capture straight into a model's
  board photos or onto a fault solution.
- **Calculators.** SMD resistor codes (3-digit, 4-digit, R notation, EIA-96),
  capacitor codes, voltage divider (both ways), Ohm's law and power,
  series/parallel.
- **IC cross-reference.** Searchable table of charging, power and audio ICs with
  platforms, phones and known alternatives. Starter entries are marked to verify;
  the shop adds its own.
- **Repair knowledge.** 15 step-by-step fault guides with tick-off steps,
  reference tables (diode mode, rails, bench supply current patterns, solder
  temperatures) and brand notes. Copy any guide into a model as a fault solution.
- **Phone mirror & backup.** Mirror and control an Android phone with a broken
  screen (scrcpy, bundled in the Windows build) and copy photos and files off it
  with adb before board work.

### Core

- **Brand → Model → Category library.** The sidebar groups everything per
  phone model under Fault Solutions, Diode Readings, Schematics/PDF, BoardView
  and Board Photos. Files you import are copied into the app's data folder so
  they open offline. Ctrl+K searches models, files, fault fixes and readings.
- **Schematic viewer (pdf.js).** Fast text search for part and net names
  (Ctrl+F, Enter for next match), zoom, drag to pan, page jump. "Find on board"
  sends the selected text to the boardview.
- **Boardview viewer.** Reads `.brd` (Test_Link, plain and encoded), BRD2,
  `.bdv`, `.asc`, `.bv`/`.bvr` (BVR1 and BVR3), `.cst`, `.fz`, `.cae`, XZZ
  `.pcb`, GenCAD `.cad`/`.gcd`, Altium ASCII `.pcbdoc`, "Panel" `.cad`
  exports, KiCad `.kicad_pcb` and ODB++ jobs (all ported from or modelled on
  OpenBoardView's readers). Cadence Allegro binaries get a clear message.
  - **Real board view:** the board is filled inside its real outline in a
    solder-mask colour, parts are drawn at their real angle with real-looking
    bodies (MLCCs, resistors, ICs, BGAs, connectors, shields) and gold pads with
    their real size and direction. When the file stores pad sizes and part
    outlines (KiCad, ODB++, GenCAD, Altium) they are used exactly; when it only
    stores pin centres (most phone boardviews) the shapes are worked out from
    the pins (OpenBoardView's method, extended to classify chip, SOT, QFN/QFP,
    SOIC/connector rows, BGA and irregular parts). A Classic (wireframe) look,
    five board colours, x-ray of the other side (X) and pin numbers/net names
    written on pads when zoomed in are in the view menu.
  - **Net tracing:** click a pin or search a net and the rest of the board dims
    while every pad, every part and the ratsnest of that net light up; pins on
    the other side show as rings through the board. Step through the net's
    pins with N / Shift+N (it flips sides for you), and "Whole rail" also lights
    every net the rail feeds through coils, fuses, ferrites and 0 Ω links.
  - Click a part to list its pins and nets, search parts and nets, flip
    top/bottom (Space), rotate (R), fit (F). "Schematic" jumps to the part or
    net in the PDF. The app only shows boards from files you open; it does not
    include any phone maker's boardviews.
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

Encrypted `.fz`, `.cae` and XZZ `.pcb` boardviews need a decryption key, which
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

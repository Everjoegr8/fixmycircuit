// Generates the synthetic demo workshop in samples/: an invented "FMC demo board"
// boardview (.brd and .bvr), a matching schematic PDF, a top-side board photo
// and demo.json with four demo models (fault solutions, readings, layered jumpers).
// Nothing here comes from a real device.
//
// Usage: node scripts/make-samples.mjs   (needs Playwright for the photo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeBRD, writeBVR3 } from '../test/fixtures/demoBoard.js';
import { buildDemoBoard, W, H } from './demo/board.mjs';
import { buildSchematic } from './demo/schematic.mjs';
import { photoSvg, toPhoto } from './demo/photo.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

const board = buildDemoBoard();
fs.writeFileSync(path.join(out, 'fmc-demo-x1.brd'), writeBRD(board));
fs.writeFileSync(path.join(out, 'fmc-demo-x1.bvr'), writeBVR3(board));
fs.writeFileSync(path.join(out, 'fmc-demo-x1-schematic.pdf'), buildSchematic(board));

// --- photo -------------------------------------------------------------------
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const { svg, iw, ih } = photoSvg(board);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: iw, height: ih } });
await page.setContent(`<body style="margin:0;background:#000">${svg}</body>`);
await page.screenshot({ path: path.join(out, 'fmc-demo-x1-top.jpg'), type: 'jpeg', quality: 82, fullPage: true });
await browser.close();

// --- demo shop data ------------------------------------------------------------
// One synthetic board is shared by four demo models so the workbench is alive on
// first launch. Every value is invented; notes say so.
const SYN = 'Synthetic demo value, not measured on a real phone.';
const partIdx = (name) => board.parts.findIndex((p) => p.name === name);
const pinOf = (part, net) => {
  const idx = partIdx(part);
  const pin = board.pins.find((p) => p.part === idx && (!net || p.net === net));
  if (!pin) throw new Error(`No pin on ${part} for ${net}`);
  return pin;
};
/** Two top-side parts on a net, preferring the named ones. */
const topPinsOnNet = (net, prefer = []) => {
  const pins = board.pins.filter((p) => p.net === net && board.parts[p.part]?.side === 'top');
  const byPart = new Map();
  for (const p of pins) if (!byPart.has(p.part)) byPart.set(p.part, p);
  const list = [...byPart.values()].sort((a, b) => {
    const ia = prefer.indexOf(board.parts[a.part].name), ib = prefer.indexOf(board.parts[b.part].name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return list.slice(0, 2);
};
const at = (p) => (board.parts[p.part].side === 'top' ? toPhoto(p.x, p.y) : { x: null, y: null });

function readingsFor(seed) {
  // Small per-model variation so the four demo models do not look copied.
  const jitter = (v, i) => (v * (1 + (((seed * 7919 + i * 104729) % 61) - 30) / 1000)).toFixed(3);
  const diode = [
    ['J3000', 'VBUS_IN', 0.548, 'Red probe on GND, black on the pin.'],
    ['F3000', 'VBUS_IN_F', 0.548, ''],
    ['U3000', 'VBUS', 0.512, ''],
    ['U3000', 'PP_VDD_MAIN', 0.362, ''],
    ['J2000', 'VBAT', 0.381, 'Battery connector, any VBAT pin.'],
    ['J2000', 'BATT_NTC', 0.611, ''],
    ['L2001', 'PP_VDD_CPU', 0.108, 'Low reading is normal on a CPU core rail.'],
    ['L2004', 'PP1V8', 0.415, ''],
    ['J1000', 'BL_LED_A', 0.664, ''],
    ['J1000', 'PP2V8_LCM', 0.472, ''],
    ['J1000', 'LCM_BIAS_P', 0.488, ''],
    ['J1000', 'I2C1_SCL', 0.562, ''],
    ['J1000', 'PP3V0_TOUCH', 0.455, ''],
    ['J1000', 'TOUCH_INT_L', 0.590, ''],
    ['J6000', 'PP_SIM', 0.533, ''],
    ['J6000', 'SIM_DET', 0.601, ''],
    ['U5000', 'SPK_P', 0.512, ''],
    ['U5000', 'MIC_BIAS', 0.498, ''],
    ['U6000', 'RF_ANT_MAIN', 0.0, 'Antenna feed reads near 0 to GND through the matching coil. Normal.'],
    ['J3000', 'PWR_KEY', 0.598, ''],
  ];
  const volts = [
    ['J2000', 'VBAT', '3.85', 'With battery connected.'],
    ['U3000', 'PP_VDD_MAIN', '3.90', 'Phone on, charger off.'],
    ['J3000', 'VBUS_IN', '5.00', 'Charger connected.'],
    ['L2004', 'PP1V8', '1.80', 'Phone on.'],
    ['L2001', 'PP_VDD_CPU', '0.80', 'Phone on, idle. Moves with load.'],
    ['J1000', 'PP2V8_LCM', '2.80', 'Screen on.'],
    ['J1000', 'PP3V0_TOUCH', '3.00', 'Screen on.'],
    ['J6000', 'PP_SIM', '1.80', 'SIM inserted, phone on.'],
  ];
  const mk = (part, net, value, type, note) => {
    const p = pinOf(part, net);
    const pos = at(p);
    return { part, pin: p.snum, net, value, type, note: [note, SYN].filter(Boolean).join(' '), x: pos.x, y: pos.y };
  };
  const all = [
    ...diode.map(([part, net, v, note], i) => mk(part, net, v === 0 ? '0.000' : jitter(v, i), 'diode', note)),
    ...volts.map(([part, net, v, note]) => mk(part, net, v, 'voltage', note)),
    mk('F3000', 'VBUS_IN_F', '0.0', 'resistance', 'Ohms across the fuse. A good fuse reads near 0.'),
  ];
  // One pin marker per pad on the photo; extra readings on the same pad stay in the table
  // (the hover card on that pin still shows them, because it groups by net).
  const seen = new Set();
  for (const r of all) {
    const k = `${r.part}.${r.pin}`;
    if (seen.has(k)) { r.x = null; r.y = null; } else seen.add(k);
  }
  return all;
}

const LAYER_JUMPERS = [
  ['charging', '#ef4444', 'VBUS_IN', ['F3000', 'U3100'], 'Charging: bypass F3000 to the OVP input', 'Only as a test when the fuse is open; fit a new fuse for the final repair.'],
  ['display', '#facc15', 'BL_LED_A', ['J1000', 'D4000'], 'Backlight: BL_LED_A from J1000 to D4000', 'Use when the BL_LED_A trace is cut near the connector.'],
  ['touch', '#22d3ee', 'I2C1_SCL', ['J1000', 'U1000'], 'Touch: I2C1_SCL from J1000 toward the SoC', 'Thin enamelled wire; keep it short and away from the coil.'],
  ['audio', '#e879f9', 'SPK_P', ['U5000'], 'Audio: SPK_P from the codec to the speaker pad', 'Speaker lines carry current, use thicker wire.'],
  ['rf', '#22c55e', 'RF_ANT_MAIN', ['U6000'], 'RF: main antenna feed', 'Keep RF jumpers as short as possible.'],
  ['gnd', '#94a3b8', 'GND', ['J2000', 'J3000'], 'GND: battery connector to dock ground', 'Reference ground for meter readings.'],
];
const jumpers = [];
for (const [layer, color, net, prefer, label, note] of LAYER_JUMPERS) {
  const pins = topPinsOnNet(net, prefer);
  if (pins.length < 2) { console.warn('skip jumper', net); continue; }
  const [a, b] = pins.map((p) => toPhoto(p.x, p.y));
  const mid = { x: (a.x + b.x) / 2 + 0.03, y: (a.y + b.y) / 2 };
  jumpers.push({ layer, color, label: `Demo ${label}`, note: `${note} ${SYN}`, points: [a, mid, b] });
}

const commonGuides = [
  {
    title: 'Not charging, VBUS missing after the port',
    symptom: 'No charging icon. USB ammeter shows 0.00 A. Charge port flex tested good.',
    steps: '1. Open the boardview and search VBUS_IN: it runs J3000 > F3000 / D3000 > U3100 (OVP).\n2. Diode-measure VBUS_IN at J3000 and compare with the readings table.\n3. Check F3000 for continuity. Open fuse = replace it (the red charging jumper on the photo is only a test).\n4. If VBUS_IN reads near 0: suspect D3000 (TVS) shorted. Lift it and measure again.\n5. With 5 V present on VBUS, check U3000 (charger) input and its I2C lines (I2C0_SCL / SDA pulled up to PP1V8).',
    parts: 'J3000, F3000, D3000, U3100, U3000',
    nets: 'VBUS_IN, VBUS, I2C0_SCL',
  },
  {
    title: 'No backlight, image faint with a torch',
    symptom: 'Picture visible with a torch, screen dark.',
    steps: '1. Test a known-good screen first.\n2. In the boardview click BL_LED_A: J1000 pins, D4000 and the output caps light up.\n3. Diode-measure BL_LED_A at J1000. Near 0 = shorted output cap on BL_LED_A.\n4. Check L4000 continuity and D4000 in diode mode.\n5. Check BL_EN from the SoC goes high with the screen on.',
    parts: 'U4000, L4000, D4000, J1000',
    nets: 'BL_LED_A, BL_LX, BL_EN',
  },
  {
    title: 'Dead, power supply hits current limit',
    symptom: 'On the DC supply the current jumps to the limit as soon as the battery connector is powered.',
    steps: '1. Diode-measure VBAT and PP_VDD_MAIN at J2000 / U3000. Near 0.000 = short.\n2. Click PP_VDD_MAIN in the boardview: every decoupling cap on it is a candidate.\n3. Inject 1 V at 2 A limit into PP_VDD_MAIN and find the hot part with a thermal camera or rosin.\n4. Remove the hot cap and re-measure against the readings table.',
    parts: 'J2000, U2000, U3000',
    nets: 'PP_VDD_MAIN, VBAT',
  },
];

const MODELS = [
  {
    brand: 'Tecno', model: 'Camon 20 Pro (demo)',
    guides: [{
      title: 'Stuck on logo or restarting after a drop',
      symptom: 'Logo shows, then restarts. Ammeter climbs to about 300 mA, drops to 0 and repeats.',
      steps: '1. Charge or replace the battery first; a weak battery causes the same loop.\n2. Measure the PMIC rails with the phone trying to boot: PP1V8, PP_VDD_CPU, PP1V2 and PP3V0_NAND.\n3. A missing PP3V0_NAND or PP1V2 points at the storage area (U7000, bottom side).\n4. Check SYS_RST_L stays high once the logo shows.\n5. If rails are good, re-flash the firmware before any board work.',
      parts: 'U2000, U7000, U1000', nets: 'PP1V8, PP3V0_NAND, PP1V2, SYS_RST_L',
    }],
  },
  {
    brand: 'Infinix', model: 'Note 30 (demo)',
    guides: [{
      title: 'No touch, display works',
      symptom: 'Image is fine but touch does not respond, even with a new screen.',
      steps: '1. Fit a known-good screen and test again.\n2. Check PP3V0_TOUCH at J1000 with the screen on (3.0 V on the demo board).\n3. Diode-measure I2C1_SCL, I2C1_SDA, TOUCH_INT_L and TOUCH_RST_L at J1000 and compare with the readings table.\n4. An open line reads OL: follow it in the boardview and use the cyan touch jumper as a reference route.\n5. Inspect J1000 for bent pins or corrosion.',
      parts: 'J1000, U1000', nets: 'PP3V0_TOUCH, I2C1_SCL, I2C1_SDA, TOUCH_INT_L, TOUCH_RST_L',
    }],
  },
  {
    brand: 'Samsung', model: 'Galaxy A32 (demo)',
    guides: [{
      title: 'No sound from the loudspeaker, earpiece works',
      symptom: 'Ringtone silent, calls are fine on the earpiece. Speaker tested good.',
      steps: '1. Test with a known-good speaker and clean the contacts.\n2. Diode-measure SPK_P and SPK_N at the codec (U5000) and at the speaker pads.\n3. Check the filter parts on SPK_FILT_P / SPK_FILT_N for cracks or liquid residue.\n4. Check the I2S lines and AUDIO_RST_L to U5000.\n5. The purple audio jumper on the photo shows the route used on this demo board.',
      parts: 'U5000', nets: 'SPK_P, SPK_N, SPK_FILT_P, SPK_FILT_N, AUDIO_RST_L',
    }],
  },
  {
    brand: 'iPhone', model: '12 Pro (demo)',
    guides: [{
      title: 'No service or no SIM detected',
      symptom: 'Searching or No SIM, IMEI shows. SIM works in another phone.',
      steps: '1. Clean the SIM tray and check J6000 pins.\n2. Check PP_SIM at J6000 with a SIM inserted (1.8 V on the demo board) and diode-measure SIM_CLK, SIM_IO, SIM_RST, SIM_DET.\n3. For no service with SIM detected: check the RF_ANT_MAIN feed and the antenna flex.\n4. Check PA_EN and the PA (U6100) supply.\n5. Compare every reading with the readings table before replacing ICs.',
      parts: 'J6000, U6000, U6100', nets: 'PP_SIM, SIM_DET, SIM_CLK, RF_ANT_MAIN, PA_EN',
    }],
  },
];

fs.writeFileSync(
  path.join(out, 'demo.json'),
  JSON.stringify({
    note: 'Synthetic demo data for FixMyCircuit. One invented board is shared by all demo models; it is not the layout of any real phone.',
    files: { schematic: 'fmc-demo-x1-schematic.pdf', boardview: 'fmc-demo-x1.brd', photo: 'fmc-demo-x1-top.jpg' },
    photoTitle: 'Top side (demo photo)',
    photoAlign: { x0: 0, y0: 0, x1: W, y1: H },
    models: MODELS.map((m, i) => ({ ...m, guides: [...m.guides, ...commonGuides], readings: readingsFor(i + 1), jumpers })),
  }, null, 2),
);

for (const old of ['demo-phone.brd', 'demo-phone.bvr', 'demo-phone.fz', 'demo-phone-schematic.pdf', 'demo-board-photo.png']) fs.rmSync(path.join(out, old), { force: true });
console.log('Wrote', fs.readdirSync(out).map((f) => `${f} (${fs.statSync(path.join(out, f)).size} B)`).join(', '));

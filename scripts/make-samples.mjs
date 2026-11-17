// Generates the synthetic sample files in samples/. They describe a made-up
// "demo phone" board so the app can be tried and tested without any OEM files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoBoard, writeBRD, writeBVR3, writeFZPlain } from '../test/fixtures/demoBoard.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

const board = demoBoard();
fs.writeFileSync(path.join(out, 'demo-phone.brd'), writeBRD(board));
fs.writeFileSync(path.join(out, 'demo-phone.bvr'), writeBVR3(board));
fs.writeFileSync(path.join(out, 'demo-phone.fz'), writeFZPlain(board));

// --- A tiny hand-built schematic PDF for the same board ---------------------
function pdf(pages) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pagesId = objs.length + 1 + pages.length * 2;
  const kids = [];
  for (const content of pages) {
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

const text = (x, y, s, size = 9, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
const box = (x, y, w, h) => `${x} ${y} ${w} ${h} re S`;
const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S`;

function chip(x, y, name, label, left, right) {
  const h = Math.max(left.length, right.length) * 16 + 20;
  const ops = [box(x, y, 120, h), text(x + 30, y + h + 6, name, 10, true), text(x + 30, y - 12, label, 8)];
  left.forEach((n, i) => { const py = y + h - 18 - i * 16; ops.push(line(x - 60, py, x, py), text(x - 58, py + 3, n, 8), text(x + 4, py - 3, String(i + 1), 7)); });
  right.forEach((n, i) => { const py = y + h - 18 - i * 16; ops.push(line(x + 120, py, x + 180, py), text(x + 125, py + 3, n, 8), text(x + 108, py - 3, String(left.length + i + 1), 7)); });
  return ops.join('\n');
}

const page1 = [
  '0.6 w 0.1 0.1 0.1 RG',
  text(30, 560, 'DEMO PHONE - POWER AND CHARGING (synthetic sample, not a real device)', 12, true),
  chip(90, 330, 'J1', 'USB-C RECEPTACLE', ['VBUS', 'USB_DP', 'USB_DM', 'CC1', 'GND'], ['VBUS', 'USB_DP', 'USB_DM', 'CC2', 'GND']),
  chip(420, 360, 'U2', 'CHARGER IC', ['VBUS', 'VBAT', 'GND'], ['CHG_EN', 'I2C_SCL', 'I2C_SDA']),
  text(330, 470, 'F1  1.5A', 8), box(320, 455, 50, 10), text(300, 445, 'VBUS', 7), text(372, 445, 'VBUS_PROT', 7),
  chip(420, 120, 'U1', 'PMIC', ['VBAT', 'GND', 'PP1V8'], ['PP3V3', 'I2C_SCL', 'I2C_SDA']),
  text(650, 260, 'R1 4.7K  I2C_SCL to PP1V8', 8), text(650, 245, 'R2 4.7K  I2C_SDA to PP1V8', 8),
  text(650, 220, 'L1 1uH  VBAT to PP1V8', 8),
  text(30, 60, 'C1 C5: 10uF on VBAT    C2: 1uF on VBUS    C3: PP1V8    C4: PP3V3', 8),
].join('\n');
const page2 = [
  '0.6 w',
  text(30, 560, 'DEMO PHONE - SENSOR (bottom side)', 12, true),
  chip(300, 300, 'U3', 'SENSOR', ['PP1V8', 'GND'], ['I2C_SCL', 'I2C_SDA']),
  text(300, 250, 'C20 100nF on PP1V8', 8),
].join('\n');
fs.writeFileSync(path.join(out, 'demo-phone-schematic.pdf'), pdf([page1, page2]));

console.log('Wrote samples to', out, fs.readdirSync(out));

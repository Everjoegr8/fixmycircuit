// Builds a multi-page schematic-style PDF for the synthetic demo board, so part
// and net search in the PDF viewer matches the boardview.

function pdf(pages, pw, ph) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const fontM = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pagesId = objs.length + 1 + pages.length * 2;
  const kids = [];
  for (const content of pages) {
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R /F3 ${fontM} 0 R >> >> /Contents ${stream} 0 R >>`));
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

const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c);
const T = (x, y, s, size = 8, f = 'F1') => `BT /${f} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`;
const R = (x, y, w, h) => `${x} ${y} ${w} ${h} re S`;
const L = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S`;

const PW = 1191, PH = 842;

/** One IC symbol: pins listed by net (GND grouped), net labels on stubs. */
function icSymbol(x, yTop, name, m, pinsByNet) {
  const nets = [...pinsByNet.keys()].filter((n) => n !== 'GND').sort();
  const half = Math.ceil(nets.length / 2);
  const left = nets.slice(0, half), right = nets.slice(half);
  const rowH = 13;
  const h = Math.max(left.length, right.length) * rowH + 30;
  const w = 150;
  const y = yTop - h;
  const ops = ['0.9 w', R(x, y, w, h), '0.6 w'];
  ops.push(T(x + 4, yTop + 6, name, 11, 'F2'), T(x + 4, y - 11, `${m.desc}`, 7));
  const label = (net) => {
    const balls = pinsByNet.get(net);
    return balls.length > 4 ? `${balls.slice(0, 4).join(',')}+${balls.length - 4}` : balls.join(',');
  };
  left.forEach((net, i) => {
    const py = yTop - 20 - i * rowH;
    ops.push(L(x - 90, py, x, py), T(x - 88, py + 2, net, 7), T(x + 3, py - 3, label(net), 5.5, 'F3'));
  });
  right.forEach((net, i) => {
    const py = yTop - 20 - i * rowH;
    ops.push(L(x + w, py, x + w + 90, py), T(x + w + 3, py + 2, net, 7));
    const lb = label(net);
    ops.push(T(x + w - 3 - lb.length * 3.3, py - 3, lb, 5.5, 'F3'));
  });
  if (pinsByNet.has('GND')) {
    const g = pinsByNet.get('GND');
    ops.push(T(x + 4, y + 6, `GND: ${g.length} pins`, 6));
  }
  return { ops: ops.join('\n'), h: h + 40 };
}

export function buildSchematic(board) {
  const { parts, pins, meta } = board;
  const blocks = ['Power', 'Charging', 'Display', 'SoC', 'Storage', 'Audio', 'RF', 'Camera', 'Sensors'];
  const titles = {
    Power: 'POWER: PMIC, BUCK REGULATORS, BATTERY CONNECTOR',
    Charging: 'CHARGING: USB PORT, OVP, FUSE, CHARGER IC',
    Display: 'DISPLAY: LCD CONNECTOR, BACKLIGHT AND BIAS',
    SoC: 'APPLICATION PROCESSOR',
    Storage: 'STORAGE (UFS) - BOTTOM SIDE',
    Audio: 'AUDIO CODEC AND SPEAKER AMP',
    RF: 'RF, MODEM AND SIM',
    Camera: 'REAR CAMERA CONNECTOR - BOTTOM SIDE',
    Sensors: 'SENSORS - BOTTOM SIDE',
  };
  const pages = [];
  blocks.forEach((block, pi) => {
    const ops = ['0.1 0.1 0.1 RG 0 0 0 rg', '0.6 w'];
    ops.push(R(20, 20, PW - 40, PH - 40));
    ops.push(T(36, PH - 50, `FMC DEMO BOARD - ${titles[block]}`, 14, 'F2'));
    ops.push(T(36, PH - 66, 'Synthetic sample schematic for FixMyCircuit demo models. Not the schematic of any real phone.', 8));
    ops.push(T(PW - 160, 34, `PAGE ${pi + 1} / ${blocks.length}`, 9, 'F2'));
    // ICs and connectors of this block
    const icNames = parts.map((p) => p.name).filter((n) => meta.get(n)?.block === block && ['bga', 'qfn', 'conn'].includes(meta.get(n).kind));
    let x = 140, yTop = PH - 110, colMaxH = 0;
    for (const name of icNames) {
      const idx = parts.findIndex((p) => p.name === name);
      const byNet = new Map();
      for (const p of pins) if (p.part === idx) { if (!byNet.has(p.net)) byNet.set(p.net, []); byNet.get(p.net).push(p.snum); }
      const s = icSymbol(x, yTop, name, meta.get(name), byNet);
      if (yTop - s.h < 200 && yTop !== PH - 110) { x += 400; yTop = PH - 110; }
      const s2 = icSymbol(x, yTop, name, meta.get(name), byNet);
      ops.push(s2.ops);
      yTop -= s2.h;
      colMaxH = Math.max(colMaxH, s2.h);
    }
    // Passives table
    const passives = parts.map((p, i) => ({ p, i, m: meta.get(p.name) })).filter((x) => x.m?.block === block && !['bga', 'qfn', 'conn'].includes(x.m.kind));
    let tx = Math.max(x + 400, 860), ty = PH - 110;
    if (passives.length) ops.push(T(tx, ty + 14, 'PASSIVES', 9, 'F2'));
    for (const { p, i, m } of passives) {
      const ps = pins.filter((q) => q.part === i);
      ops.push(T(tx, ty, `${p.name}`, 7, 'F2'), T(tx + 40, ty, `${m.value}`, 7), T(tx + 90, ty, `${ps.map((q) => q.net).join(' - ')}`, 6.5));
      ty -= 11;
      if (ty < 60) { ty = PH - 110; tx += 160; }
    }
    pages.push(ops.join('\n'));
  });
  return pdf(pages, PW, PH);
}

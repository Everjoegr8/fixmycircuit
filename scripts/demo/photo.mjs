// Renders a synthetic "photo" of the demo board's top side with Playwright, so
// pins dropped in Contributor mode line up with the real part positions.
import { W, H } from './board.mjs';

export const PX_PER_MIL = 1;

export const toPhoto = (x, y) => ({ x: x / W, y: 1 - y / H });

export function photoSvg(board) {
  const { parts, meta, outline } = board;
  const s = PX_PER_MIL;
  const iw = Math.round(W * s), ih = Math.round(H * s);
  const X = (x) => (x * s).toFixed(1);
  const Y = (y) => ((H - y) * s).toFixed(1);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}">`;
  out += `<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#1f5a3a"/><stop offset="1" stop-color="#0f3322"/></radialGradient>
  <linearGradient id="ic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#121417"/></linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9ccd1"/><stop offset="1" stop-color="#8e9399"/></linearGradient></defs>`;
  out += `<rect width="${iw}" height="${ih}" fill="#060708"/>`;
  out += `<path d="M${outline.map((p) => `${X(p.x)} ${Y(p.y)}`).join(' L')} Z" fill="url(#g)" stroke="#c8a94a" stroke-width="3"/>`;
  // faint traces
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  out += '<g stroke="#2f7a4f" stroke-width="2" fill="none" opacity="0.55">';
  for (let i = 0; i < 160; i++) {
    const x = 150 + rnd() * (W - 300), y = 150 + rnd() * (H - 300);
    const dx = (rnd() - 0.5) * 600, dy = (rnd() - 0.5) * 600;
    out += `<path d="M${X(x)} ${Y(y)} L${X(x + dx)} ${Y(y)} L${X(x + dx)} ${Y(y + dy)}"/>`;
  }
  out += '</g>';
  // mounting holes
  for (const [x, y] of [[100, 100], [W - 100, 100], [100, H - 100], [W - 100, H - 100]])
    out += `<circle cx="${X(x)}" cy="${Y(y)}" r="${22 * s}" fill="#060708" stroke="#d6b65a" stroke-width="${12 * s}"/>`;
  for (const p of parts) {
    if (p.side !== 'top') continue;
    const m = meta.get(p.name);
    const x = +X(m.x0), y = +Y(m.y1), w = (m.x1 - m.x0) * s, h = (m.y1 - m.y0) * s;
    const cx = x + w / 2, cy = y + h / 2;
    const label = (t, dy = 0, size = 9, color = '#e8e8e8') => `<text x="${cx}" y="${cy + dy}" font-family="Arial" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${t}</text>`;
    switch (m.kind) {
      case 'shield':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="url(#sh)" stroke-width="${10 * s}" opacity="0.9"/>`;
        break;
      case 'small':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#2a2c30" stroke="#55585d" stroke-width="0.6"/>`;
        break;
      case 'bga':
      case 'qfn':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#ic)" stroke="#555" stroke-width="1"/>`;
        out += `<circle cx="${x + 6}" cy="${y + 6}" r="2" fill="#777"/>`;
        out += label(m.value, -6, Math.min(14, w / 6), '#9aa0a6') + label(p.name, 9, Math.min(11, w / 7), '#7d838a');
        break;
      case 'conn':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#d9cfb8" stroke="#a89f88"/>`;
        out += `<rect x="${x + 4}" y="${cy - 2}" width="${w - 8}" height="4" fill="#c9a43a"/>`;
        out += `<text x="${x}" y="${y - 6}" font-family="Arial" font-size="11" fill="#f2f2f2">${p.name}</text>`;
        break;
      case 'coil':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#3b3f44" stroke="#22252a"/>` + label(m.value, 0, 8, '#bbb');
        break;
      case 'cap':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b98b55"/><rect x="${x}" y="${y}" width="${Math.min(w, h) * 0.35}" height="${h}" fill="#d7d9dc"/><rect x="${x + w - Math.min(w, h) * 0.35}" y="${y}" width="${Math.min(w, h) * 0.35}" height="${h}" fill="#d7d9dc"/>`;
        break;
      case 'res':
      case 'fuse':
      case 'diode':
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#141516"/><rect x="${x}" y="${y}" width="${Math.min(w, h) * 0.35}" height="${h}" fill="#d7d9dc"/><rect x="${x + w - Math.min(w, h) * 0.35}" y="${y}" width="${Math.min(w, h) * 0.35}" height="${h}" fill="#d7d9dc"/>`;
        if (m.kind !== 'res') out += `<text x="${x}" y="${y - 4}" font-family="Arial" font-size="9" fill="#f2f2f2">${p.name}</text>`;
        break;
      default:
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#444"/>`;
    }
  }
  out += `<text x="${X(200)}" y="${Y(120)}" font-family="Arial" font-size="18" fill="#f0f0f0" opacity="0.8">FMC DEMO BOARD - TOP - SYNTHETIC SAMPLE, NOT A REAL PHONE LAYOUT</text>`;
  out += '</svg>';
  return { svg: out, iw, ih };
}

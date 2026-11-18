// Sorting board files into Brand > Series > Model, for the model library.
//
// Order of trust: a model.json next to the file (or the root
// library-index.json), then the folder layout <Root>/<Brand>/<Series>/<Model>/
// (or <Root>/<Brand>/<Model>/), then the file name. The user can fix any row
// before importing.

export interface Placement {
  brand: string;
  series: string;
  model: string;
  how: 'model.json' | 'index' | 'folders' | 'name' | 'unknown';
}

const BRANDS: [RegExp, string][] = [
  [/\biphone\b|\bapple\b|\bip\d{1,2}\b|820-\d{4}|\ba\d{4}\b/i, 'iPhone'],
  [/samsung|galaxy|\bsm[-_ ]?[agmnsfjetx]\d{2,4}/i, 'Samsung'],
  [/tecno|camon|\bspark\b|\bpova\b|phantom|\bk[a-z]\d{1,2}[a-z]?\b/i, 'Tecno'],
  [/infinix|\bhot\s?\d{1,2}\b|\bzero\s?\d|\bx6\d{2}\b/i, 'Infinix'],
  [/\bitel\b|itel[_ -]/i, 'Itel'],
  [/xiaomi|redmi|\bpoco\b|\bmi\s?\d{1,2}\b/i, 'Xiaomi'],
  [/\boppo\b|\breno\s?\d|\bcph\d{4}/i, 'Oppo'],
  [/\bvivo\b/i, 'Vivo'],
  [/huawei|\bmate\s?\d{2}\b/i, 'Huawei'],
  [/\bhonor\b/i, 'Honor'],
  [/\bmotorola\b|\bmoto\s?[gez]\d*/i, 'Motorola'],
  [/\bnokia\b/i, 'Nokia'],
  [/\boneplus\b/i, 'OnePlus'],
  [/\brealme\b/i, 'Realme'],
  [/\bgoogle\b|\bpixel\b/i, 'Google'],
  [/\blenovo\b/i, 'Lenovo'],
  [/\bipad\b/i, 'iPad'],
];

/** Series words per brand: the first match names the series. */
const SERIES: Record<string, [RegExp, (m: RegExpMatchArray) => string][]> = {
  iPhone: [[/\biphone\s?(\d{1,2}|se|x[rs]?)\b/i, (m) => `iPhone ${m[1].toUpperCase()}`]],
  Samsung: [
    [/\bgalaxy\s?(s|a|m|note|z\s?(?:fold|flip)|f|j)\s?\d/i, (m) => `Galaxy ${m[1].replace(/\s+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}`],
    [/\bsm[-_ ]?([agmnsfj])\d/i, (m) => `Galaxy ${m[1].toUpperCase()}`],
    [/\b([amsf])\d{2}[a-z]?\b/i, (m) => `Galaxy ${m[1].toUpperCase()}`],
  ],
  Tecno: [[/\b(camon|spark|pova|phantom|pop)\b/i, (m) => cap(m[1])]],
  Infinix: [[/\b(hot|note|zero|smart|gt)\b/i, (m) => cap(m[1])]],
  Itel: [[/\b(a|p|s|vision)\s?\d/i, (m) => (m[1].length > 1 ? cap(m[1]) : `${m[1].toUpperCase()} series`)]],
  Xiaomi: [
    [/\bredmi\s?note\b/i, () => 'Redmi Note'],
    [/\bredmi\s?k\d/i, () => 'Redmi K'],
    [/\bredmi\b/i, () => 'Redmi'],
    [/\bpoco\b/i, () => 'Poco'],
    [/\bmi\s?mix\b/i, () => 'Mi Mix'],
    [/\bmi\s?\d/i, () => 'Mi'],
  ],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** "Tecno_Camon-20_Pro_CK7n BOARDVIEW.pcb" -> "Tecno Camon 20 Pro CK7n". */
export function cleanName(fileName: string) {
  return fileName
    .replace(/\.[a-z0-9_]{1,10}$/i, '')
    .replace(/(^|[\s_-])v\d+(?:\.\d+)*(?=$|[\s_-])/gi, ' ')
    .replace(/[_\-.+]+/g, ' ')
    .replace(/\b(boardview|board ?view|board|mainboard|motherboard|bitmap|schematics?|diagram|pcb|brd|full|layout|bv|v\d+(?:\.\d+)?)\b/gi, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function guessBrandName(text: string): string | null {
  for (const [re, b] of BRANDS) if (re.test(text)) return b;
  return null;
}

export function guessSeries(brand: string, text: string): string {
  for (const [re, f] of SERIES[brand] || []) {
    const m = text.match(re);
    if (m) return f(m);
  }
  return '';
}

/** Model name from a cleaned file name: drop the brand word, keep the rest. */
function modelFromText(brand: string, text: string) {
  let t = text;
  if (brand !== 'iPhone' && brand !== 'iPad') t = t.replace(new RegExp(`\\b${brand}\\b`, 'i'), ' ');
  if (brand === 'Samsung') t = t.replace(/\bsamsung\b/i, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (brand === 'iPhone') t = t.replace(/^iphone/i, 'iPhone');
  return t;
}

/**
 * Where a file goes. dirs are the folders between the library root and the
 * file (empty for a single dropped file).
 */
export function placeFile(fileName: string, dirs: string[]): Placement {
  const d = dirs.filter(Boolean);
  if (d.length >= 2) {
    const brand = d[0];
    const b = guessBrandName(brand) || brand;
    if (d.length >= 3) return { brand: b, series: d[1], model: d.slice(2).join(' '), how: 'folders' };
    return { brand: b, series: guessSeries(b, d[1]) || '', model: d[1], how: 'folders' };
  }
  // One folder: it may be the brand ("Tecno/Camon_20_Pro.pcb"), the model
  // ("Camon 20 Pro/board.pcb") or just a bin ("Downloads/Redmi_Note_10.pcb").
  const file = cleanName(fileName);
  const folder = d[0] ? cleanName(d[0]) : '';
  const folderBrand = folder ? guessBrandName(folder) : null;
  const fileBrand = guessBrandName(file);
  if (folderBrand && folder.toLowerCase() === folderBrand.toLowerCase()) {
    return { brand: folderBrand, series: guessSeries(folderBrand, file), model: modelFromText(folderBrand, file) || file, how: 'folders' };
  }
  if (fileBrand) return { brand: fileBrand, series: guessSeries(fileBrand, file), model: modelFromText(fileBrand, file) || file, how: 'name' };
  if (folderBrand) return { brand: folderBrand, series: guessSeries(folderBrand, folder), model: modelFromText(folderBrand, folder) || folder, how: 'name' };
  return { brand: '', series: '', model: '', how: 'unknown' };
}

/** A model.json (the agreed library format). */
export interface ModelMeta {
  brand?: string;
  series?: string;
  model?: string;
  files?: { path: string; kind?: string; sha256?: string }[];
  source?: { url?: string; commit?: string };
  license?: { spdx?: string; attribution?: string };
  notes?: string;
}

export function placementFromMeta(m: ModelMeta): Placement | null {
  if (!m || !m.model) return null;
  return { brand: m.brand || '', series: m.series || '', model: m.model, how: 'model.json' };
}

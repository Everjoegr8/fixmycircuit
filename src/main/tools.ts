// Tool manager: finds the helper programs FixMyCircuit can drive (scrcpy + adb
// for Android mirroring, UxPlay for iPhone AirPlay, Ollama for offline AI) and
// installs missing ones from their official GitHub releases into
// <userData>/tools (on Windows: %APPDATA%\FixMyCircuit\tools). Every download is
// checked against the SHA-256 that GitHub publishes for the release file.
import { app } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readZip } from '../parsers/odb.js';

export type ToolId = 'scrcpy' | 'adb' | 'uxplay' | 'ollama';

export interface ToolInfo {
  id: ToolId;
  label: string;
  purpose: string;
  license: string;
  found: string | null;
  source: 'bundled' | 'downloaded' | 'system' | 'running' | 'missing';
  /** One-click install from the official release is possible on this computer. */
  canInstall: boolean;
  /** Where to get it by hand when one-click install is not possible. */
  howTo: string;
  url: string;
}

export const toolsDir = () => path.join(app.getPath('userData'), 'tools');
const exe = (n: string) => (process.platform === 'win32' ? `${n}.exe` : n);

function bundledDir(id: ToolId) {
  if (id !== 'scrcpy' && id !== 'adb') return null;
  return app.isPackaged ? path.join(process.resourcesPath, 'scrcpy') : path.join(app.getAppPath(), 'vendor', 'scrcpy');
}

/** Locate a tool: bundled with the app, installed by the tool manager, or on PATH. */
export function findTool(id: ToolId): { path: string; source: ToolInfo['source'] } | null {
  const name = exe(id);
  const own = path.join(toolsDir(), id === 'adb' ? 'scrcpy' : id);
  const bd = bundledDir(id);
  const tries: [string, ToolInfo['source']][] = [];
  if (bd) tries.push([bd, 'bundled']);
  tries.push([own, 'downloaded']);
  for (const d of (process.env.PATH || '').split(path.delimiter)) if (d) tries.push([d, 'system']);
  if (process.platform === 'win32' && id === 'ollama') tries.push([path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama'), 'system']);
  for (const [d, source] of tries) {
    const p = path.join(d, name);
    try { if (fs.statSync(p).isFile()) return { path: p, source }; } catch { /* next */ }
  }
  return null;
}

async function ollamaRunning() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
}

const RELEASES: Partial<Record<ToolId, { repo: string; asset: RegExp }>> = {
  // scrcpy's Windows zip also carries adb.exe (Android platform-tools) as the scrcpy project ships it.
  scrcpy: { repo: 'Genymobile/scrcpy', asset: /^scrcpy-win64-v[\d.]+\.zip$/ },
};

const testApi = () => (!app.isPackaged && process.env.FMC_GITHUB_API) || '';

export async function listTools(): Promise<ToolInfo[]> {
  const win = process.platform === 'win32' || !!testApi();
  const sc = findTool('scrcpy'), adb = findTool('adb'), ux = findTool('uxplay'), ol = findTool('ollama');
  const olRun = !ol && (await ollamaRunning());
  return [
    {
      id: 'scrcpy', label: 'scrcpy', purpose: 'Android screen mirroring and control', license: 'Apache-2.0',
      found: sc?.path || null, source: sc?.source || 'missing', canInstall: win,
      howTo: win ? 'Click Install to download it from the official scrcpy release.' : 'Install scrcpy with your package manager (apt install scrcpy, brew install scrcpy).',
      url: 'https://github.com/Genymobile/scrcpy',
    },
    {
      id: 'adb', label: 'adb (Android platform-tools)', purpose: 'Phone detection and file backup', license: 'Android SDK licence (shipped inside the scrcpy package)',
      found: adb?.path || null, source: adb?.source || 'missing', canInstall: win,
      howTo: win ? 'Comes with scrcpy: installing scrcpy installs adb too.' : 'Install android-platform-tools (apt install adb, brew install android-platform-tools).',
      url: 'https://developer.android.com/tools/releases/platform-tools',
    },
    {
      id: 'uxplay', label: 'UxPlay', purpose: 'iPhone and iPad screen mirroring over AirPlay (same Wi-Fi)', license: 'GPL-3.0 (separate program, not bundled)',
      found: ux?.path || null, source: ux?.source || 'missing', canInstall: false,
      howTo: win
        ? 'UxPlay has no official Windows download. Install Bonjour (from Apple) and build UxPlay with MSYS2 as its README explains, then put uxplay.exe in the FixMyCircuit tools folder or on PATH.'
        : 'Install UxPlay with your package manager (apt install uxplay, brew install uxplay).',
      url: 'https://github.com/FDH2/UxPlay',
    },
    {
      id: 'ollama', label: 'Ollama', purpose: 'Run an AI model offline on this PC (optional)', license: 'MIT',
      found: ol?.path || (olRun ? 'http://127.0.0.1:11434' : null), source: ol?.source || (olRun ? 'running' : 'missing'), canInstall: false,
      howTo: 'Download the Ollama installer from ollama.com, then run "ollama pull" with a model that supports tool calling, and pick Ollama in Settings, AI assistant.',
      url: 'https://ollama.com/download',
    },
  ];
}

/** Download, verify and unpack a tool from its official GitHub release. */
export async function installTool(id: ToolId, onProgress?: (msg: string) => void): Promise<{ path: string; version: string; sha256: string }> {
  const target = id === 'adb' ? 'scrcpy' : id;
  const rel = RELEASES[target as ToolId];
  if (!rel) throw new Error('This tool cannot be installed automatically. See the instructions next to it.');
  const api = testApi() || 'https://api.github.com';
  onProgress?.('Finding the latest official release…');
  const r = await fetch(`${api}/repos/${rel.repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'FixMyCircuit' } });
  if (!r.ok) throw new Error(`Could not reach GitHub (${r.status}). Check the internet connection.`);
  const release: any = await r.json();
  const asset = (release.assets || []).find((a: any) => rel.asset.test(a.name));
  if (!asset) throw new Error(`The latest ${target} release has no Windows package.`);
  // GitHub publishes "digest": "sha256:<hex>" for release files; older releases list it in the notes.
  let want = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '')?.[1];
  if (!want) {
    const body = String(release.body || '');
    const i = body.indexOf(asset.name);
    want = i >= 0 ? /\b([0-9a-f]{64})\b/i.exec(body.slice(Math.max(0, i - 120), i + asset.name.length + 120))?.[1] : undefined;
  }
  if (!want) throw new Error('GitHub did not publish a checksum for this file, so it was not installed.');
  onProgress?.(`Downloading ${asset.name}…`);
  const d = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'FixMyCircuit' } });
  if (!d.ok) throw new Error(`Download failed (${d.status}).`);
  const bytes = new Uint8Array(await d.arrayBuffer());
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got.toLowerCase() !== want.toLowerCase()) throw new Error('The download does not match the official checksum. It was deleted and not installed.');
  onProgress?.('Checksum OK. Unpacking…');
  const files = readZip(bytes);
  const dest = path.join(toolsDir(), target);
  const tmp = dest + '.new';
  fs.rmSync(tmp, { recursive: true, force: true });
  // Drop the single top folder most release zips have ("scrcpy-win64-v3.3/...").
  const names = [...files.keys()];
  const top = names.every((n) => n.split('/')[0] === names[0].split('/')[0]) ? names[0].split('/')[0] + '/' : '';
  for (const [name, data] of files) {
    const rel2 = name.slice(top.length);
    if (!rel2 || rel2.includes('..')) continue;
    const out = path.join(tmp, rel2);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    if (process.platform !== 'win32' && !/\.(dll|txt|md)$/i.test(out)) fs.chmodSync(out, 0o755);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
  fs.writeFileSync(path.join(dest, 'fixmycircuit-install.json'), JSON.stringify({ version: release.tag_name, file: asset.name, sha256: got, installed: new Date().toISOString() }, null, 2));
  const found = findTool(id);
  if (!found) throw new Error(`Installed, but ${exe(id)} was not in the package.`);
  return { path: found.path, version: release.tag_name, sha256: got };
}

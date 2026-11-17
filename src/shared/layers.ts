// Colour-coded circuit layers used on boardviews and board photos. A net is put
// on a layer by its name, so this works on any board, not only the demo.

export type LayerId = 'charging' | 'display' | 'touch' | 'audio' | 'rf' | 'gnd';

export interface Layer {
  id: LayerId;
  label: string;
  color: string;
  match: RegExp;
}

export const LAYERS: Layer[] = [
  { id: 'charging', label: 'Charging / VBUS', color: '#ef4444', match: /VBUS|VCHG|CHG|CHARG|OVP|USB|PMID|VBAT|BATT|VSYS|VDD_MAIN|VPH_PWR|CC[12]\b|TYPEC/i },
  { id: 'display', label: 'Display / Backlight', color: '#facc15', match: /^BL_|_BL_|BACKLIGHT|LED_A|LED_K|LCM|LCD|DISP|DSI|MIPI_D|AVDD|AVEE|ELVDD|ELVSS|BIAS|\bTE\b|ID_LCM/i },
  { id: 'touch', label: 'Touch / I2C', color: '#22d3ee', match: /TOUCH|\bTP_|_TP_|I2C|SCL|SDA|CTP/i },
  { id: 'audio', label: 'Audio / Mic', color: '#e879f9', match: /AUD|MIC|SPK|RCV|EAR|HP_|HPH|I2S|CODEC|SPEAKER/i },
  { id: 'rf', label: 'Network / RF', color: '#22c55e', match: /\bRF|_RF|ANT|SIM|\bPA_|_PA_|LTE|WCDMA|GSM|WIFI|WLAN|\bBT_|GPS|GNSS|NFC|XO_|26M/i },
  { id: 'gnd', label: 'GND', color: '#94a3b8', match: /^(A|D|P|S)?GND|^VSS|_GND$/i },
];

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<LayerId, Layer>;

/** Which layer a net belongs to, or null. GND is checked first so "GND_SPK" is ground. */
export function layerOfNet(net: string | null | undefined): LayerId | null {
  if (!net) return null;
  if (LAYER_BY_ID.gnd.match.test(net)) return 'gnd';
  for (const l of LAYERS) if (l.id !== 'gnd' && l.match.test(net)) return l.id;
  return null;
}

/** Layer for a jumper: its own layer if set, else guessed from its label. */
export function layerOfText(text: string): LayerId | null {
  const t = text.toUpperCase();
  if (/\bGND\b|GROUND/.test(t)) return 'gnd';
  if (/CHARG|VBUS|USB|BATT|VBAT|FUSE|OVP/.test(t)) return 'charging';
  if (/DISPLAY|BACKLIGHT|LCD|LCM|\bBL\b/.test(t)) return 'display';
  if (/TOUCH|I2C|SCL|SDA/.test(t)) return 'touch';
  if (/AUDIO|MIC|SPEAKER|SPK|EARPIECE/.test(t)) return 'audio';
  if (/\bRF\b|ANTENNA|SIM|SIGNAL|NETWORK|WIFI/.test(t)) return 'rf';
  return null;
}

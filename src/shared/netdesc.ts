// Plain-language meaning and expected voltage of a net, worked out from its
// name alone (the usual phone naming: PP1V8_IO, VDD_CPU, VBUS, LDO5, ...).
// This is a hint for the measurement sheet, never a measured value.

export interface NetHint {
  /** What the net is, e.g. "1.8 V I/O rail". Empty when unknown. */
  what: string;
  /** Voltage read from the name, in volts, or null. */
  volts: number | null;
}

const RULES: [RegExp, string][] = [
  [/VBUS|USB_?5V|VCHG|CHG_IN|VIN_CHG/, 'USB charger input'],
  [/VBAT|BATT?_|^BAT|PP_BATT/, 'Battery'],
  [/VPH_PWR|VSYS|SYS_PWR|PP_VDD_MAIN|VDD_MAIN|VMAIN/, 'Main system rail (from battery)'],
  [/BOOST/, 'Boost converter output'],
  [/GPU/, 'GPU supply'],
  [/CPU.*SRAM|SRAM.*CPU/, 'CPU cache (SRAM) supply'],
  [/SRAM/, 'SRAM supply'],
  [/CPU|CORE|VDD_APC|VDD_BIG|VDD_LIT/, 'CPU core supply'],
  [/DDR|VDDQ|LPDDR|VDD2/, 'RAM (DDR) supply'],
  [/NAND|UFS|EMMC|VCCQ/, 'Storage (NAND/UFS) supply'],
  [/CAM|CAMERA|AVDD|DVDD/, 'Camera supply'],
  [/LCD|DISP|OLED|ELVDD|ELVSS|AVEE|VSN|VSP/, 'Display supply'],
  [/BL_|BACKLIGHT|LED_A|LEDK|LED_K/, 'Backlight'],
  [/ANT/, 'Antenna feed'],
  [/RF|PA_|VCC_PA|APT/, 'RF / power amplifier supply'],
  [/WIFI|WLAN|BT_|BLUETOOTH/, 'Wi-Fi / Bluetooth'],
  [/SIM/, 'SIM card'],
  [/AUDIO|SPK|SPEAKER|MIC|CODEC|HPH|EAR/, 'Audio'],
  [/I2C.*SCL|SCL/, 'I2C clock line'],
  [/I2C.*SDA|SDA/, 'I2C data line'],
  [/USB.*D[PM+-]|USB_D|DP$|DM$/, 'USB data line'],
  [/MIPI|CSI|DSI/, 'MIPI data lane'],
  [/CLK|XTAL|XO|32K/, 'Clock'],
  [/RESET|RST/, 'Reset line'],
  [/PWR_?KEY|POWER_?KEY|KPD_PWR|ON_OFF|BUTTON/, 'Power button line'],
  [/VOL_?(UP|DN|DOWN)/, 'Volume button line'],
  [/LDO(\d+)/, 'LDO $1 output'],
  [/BUCK(\d+)|SMPS(\d+)|(?:^|_)S(\d+)[A-Z]?(?:_|$)/, 'Buck (SMPS) $1 output'],
  [/^GND|^VSS|_GND$/, 'Ground'],
];

/** Volts from names like PP1V8, 3V3, VDD_1P2, VREG_L5_2P95, PP0V6. */
export function voltsFromName(net: string): number | null {
  const n = net.toUpperCase();
  let m = n.match(/(\d{1,2})V(\d{1,3})(?![0-9])/);
  if (m) return parseFloat(`${m[1]}.${m[2]}`);
  m = n.match(/(?:^|_)(\d)P(\d{1,3})(?:_|$)/);
  if (m) return parseFloat(`${m[1]}.${m[2]}`);
  m = n.match(/(?:^|_|PP)(\d{1,2})V(?:_|$)/);
  if (m) return parseFloat(m[1]);
  if (/VBUS|USB_?5V/.test(n)) return 5;
  return null;
}

export function netHint(net: string): NetHint {
  const n = (net || '').toUpperCase();
  const volts = voltsFromName(n);
  for (const [re, label] of RULES) {
    const m = n.match(re);
    if (m) {
      const num = m.slice(1).find((x) => x);
      return { what: label.replace('$1', num || '').replace(/\s+/g, ' ').trim(), volts };
    }
  }
  if (volts != null && /^(PP|VDD|VREG|VCC|V\d)/.test(n)) return { what: `${volts} V rail`, volts };
  return { what: '', volts };
}

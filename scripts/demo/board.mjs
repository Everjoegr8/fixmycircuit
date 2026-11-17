// Procedural, entirely synthetic "FMC Demo Phone X1" logic board. Nothing here
// comes from a real device: the layout, part names and nets are invented so the
// app has a realistic-looking board to explore out of the box.

let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export const W = 2400;
export const H = 5200;

export function buildDemoBoard() {
  seed = 1234567;
  const parts = [];
  const pins = [];
  const meta = new Map(); // part name -> { kind, value, desc, block, w, h, cx, cy, side }
  const boxes = { top: [], bottom: [] };

  const free = (side, x0, y0, x1, y1) =>
    x0 > 60 && y0 > 60 && x1 < W - 60 && y1 < H - 60 && !boxes[side].some((b) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
  const claim = (side, x0, y0, x1, y1) => boxes[side].push([x0, y0, x1, y1]);

  const addPart = (name, side, pinList, m) => {
    const part = parts.length;
    parts.push({ name, side });
    for (const [snum, x, y, net] of pinList) pins.push({ part, snum, x: Math.round(x), y: Math.round(y), net, side });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [, x, y] of pinList) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = m.pad ?? 12;
    claim(side, x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    meta.set(name, { ...m, side, x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad });
  };

  const ROWS = 'ABCDEFGHJKLMNPRTUVWY';
  const bga = (name, side, cx, cy, n, pitch, netFor, m) => {
    const list = [];
    const off = ((n - 1) * pitch) / 2;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const ball = `${ROWS[r]}${c + 1}`;
        list.push([ball, cx - off + c * pitch, cy + off - r * pitch, netFor(r, c, ball)]);
      }
    addPart(name, side, list, { ...m, kind: 'bga', pad: pitch });
  };
  const qfn = (name, side, cx, cy, perSide, pitch, nets, m) => {
    const list = [];
    const half = ((perSide + 1) * pitch) / 2;
    let k = 0;
    const push = (x, y) => { list.push([String(k + 1), x, y, nets[k % nets.length]]); k++; };
    for (let i = 0; i < perSide; i++) push(cx - half, cy + half - pitch * (i + 1));
    for (let i = 0; i < perSide; i++) push(cx - half + pitch * (i + 1), cy - half);
    for (let i = 0; i < perSide; i++) push(cx + half, cy - half + pitch * (i + 1));
    for (let i = 0; i < perSide; i++) push(cx + half - pitch * (i + 1), cy + half);
    list.push([String(k + 1), cx, cy, 'GND']); // thermal pad
    addPart(name, side, list, { ...m, kind: 'qfn', pad: pitch });
  };
  const conn = (name, side, cx, cy, nets, pitch, m) => {
    const n = Math.ceil(nets.length / 2);
    const list = nets.map((net, i) => {
      const col = i % n, row = Math.floor(i / n);
      return [String(i + 1), cx - ((n - 1) * pitch) / 2 + col * pitch, cy + (row ? -30 : 30), net];
    });
    addPart(name, side, list, { ...m, kind: 'conn', pad: 24 });
  };
  const two = (name, side, x, y, netA, netB, vertical, m) => {
    const d = m.size === 'big' ? 40 : 20;
    const p2 = vertical ? [x, y - d] : [x + d, y];
    addPart(name, side, [['1', x, y, netA], ['2', p2[0], p2[1], netB]], { ...m, kind: m.kind || 'passive', pad: 8 });
  };

  /** Place a passive near (cx, cy) in the first free slot on a growing ring. */
  const counters = {};
  const placeNear = (prefix, block, side, cx, cy, ring, netA, netB, m) => {
    const base = block;
    counters[prefix + base] = (counters[prefix + base] || 0) + 1;
    const name = `${prefix}${base + counters[prefix + base]}`;
    const d = m.size === 'big' ? 40 : 20;
    for (let tries = 0; tries < 400; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = ring + (tries / 400) * 260;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const vertical = rnd() < 0.5;
      const x1 = vertical ? x + 12 : x + d + 12, y1 = vertical ? y + 12 : y + 12;
      const x0 = x - 12, y0 = vertical ? y - d - 12 : y - 12;
      if (free(side, x0, y0, x1, y1)) { two(name, side, x, y, netA, netB, vertical, m); return name; }
    }
    return null;
  };

  // ---------------------------------------------------------------- top side
  // SoC
  const socSignals = ['PP_VDD_CPU', 'PP_VDD_GPU', 'PP_VDD_SOC', 'PP1V8', 'PP1V1_DDR', 'PP0V6_DDR', 'I2C0_SCL', 'I2C0_SDA', 'I2C1_SCL', 'I2C1_SDA', 'SPMI_CLK', 'SPMI_DATA', 'DSI_CLK_P', 'DSI_CLK_N', 'DSI_D0_P', 'DSI_D0_N', 'DSI_D1_P', 'DSI_D1_N', 'CSI_CLK_P', 'CSI_CLK_N', 'CSI_D0_P', 'CSI_D0_N', 'UFS_TX_P', 'UFS_TX_N', 'UFS_RX_P', 'UFS_RX_N', 'UFS_REF_CLK', 'UART_DBG_TX', 'UART_DBG_RX', 'TOUCH_INT_L', 'TOUCH_RST_L', 'LCM_RST_L', 'BL_EN', 'CHG_INT_L', 'PMIC_INT_L', 'SYS_RST_L', 'XTAL_24M', 'USB_DP', 'USB_DM', 'AUDIO_I2S_BCLK', 'AUDIO_I2S_LRCK', 'AUDIO_I2S_DOUT', 'AUDIO_I2S_DIN', 'RF_SPI_CLK', 'RF_SPI_DATA', 'SIM_DET'];
  bga('U1000', 'top', 1200, 2700, 16, 22, (r, c) => {
    if ((r + c) % 3 === 0 || r === 0 || c === 0 || r === 15 || c === 15) return 'GND';
    if (r > 5 && r < 10 && c > 5 && c < 10) return (r + c) % 2 ? 'PP_VDD_CPU' : 'PP_VDD_GPU';
    return socSignals[(r * 16 + c) % socSignals.length];
  }, { desc: 'Application processor (SoC)', block: 'SoC', value: 'SoC' });

  // PMIC
  const pmicNets = ['VBAT', 'PP_VDD_MAIN', 'PP_VDD_CPU', 'PP_VDD_GPU', 'PP_VDD_SOC', 'PP1V8', 'PP1V1_DDR', 'PP0V6_DDR', 'PP1V2', 'PP2V8_CAM', 'PP2V8_LCM', 'PP3V0_NAND', 'PP1V8_ALWAYS', 'PMIC_LX_CPU', 'PMIC_LX_GPU', 'PMIC_LX_SOC', 'PMIC_LX_1V8', 'PWR_KEY', 'SYS_RST_L', 'PMIC_INT_L', 'SPMI_CLK', 'SPMI_DATA', 'XTAL_32K', 'VOL_UP_L', 'VOL_DN_L', 'BATT_NTC'];
  bga('U2000', 'top', 650, 3800, 10, 22, (r, c) => ((r + c) % 3 === 0 ? 'GND' : pmicNets[(r * 10 + c) % pmicNets.length]), { desc: 'Power management IC (PMIC)', block: 'Power', value: 'PMIC' });
  // Charger
  qfn('U3000', 'top', 1750, 4250, 6, 22, ['VBUS', 'VBUS', 'PMID', 'PMID', 'CHG_LX', 'CHG_LX', 'PP_VDD_MAIN', 'PP_VDD_MAIN', 'VBAT', 'VBAT', 'GND', 'GND', 'I2C0_SCL', 'I2C0_SDA', 'CHG_INT_L', 'CHG_EN_L', 'BATT_NTC', 'USB_DP', 'USB_DM', 'CHG_REGN', 'CHG_BTST', 'CHG_ILIM', 'GND', 'GND'], { desc: 'Battery charger IC', block: 'Charging', value: 'Charger' });
  // OVP
  qfn('U3100', 'top', 1500, 4700, 2, 24, ['VBUS_IN', 'VBUS_IN', 'VBUS', 'VBUS', 'OVP_EN', 'GND', 'GND', 'GND'], { desc: 'USB over-voltage protection switch', block: 'Charging', value: 'OVP' });
  // Backlight / display bias
  qfn('U4000', 'top', 1800, 1200, 4, 22, ['PP_VDD_MAIN', 'BL_LX', 'BL_LED_A', 'BL_LED_K1', 'BL_LED_K2', 'BL_EN', 'I2C1_SCL', 'I2C1_SDA', 'LCM_BIAS_P', 'LCM_BIAS_N', 'GND', 'GND', 'PP1V8', 'BL_FB', 'GND', 'GND'], { desc: 'Backlight driver and LCD bias', block: 'Display', value: 'BL driver' });
  // Audio codec
  qfn('U5000', 'top', 600, 1700, 8, 18, ['PP1V8', 'PP_VDD_MAIN', 'AUDIO_I2S_BCLK', 'AUDIO_I2S_LRCK', 'AUDIO_I2S_DOUT', 'AUDIO_I2S_DIN', 'I2C1_SCL', 'I2C1_SDA', 'SPK_P', 'SPK_N', 'RCV_P', 'RCV_N', 'MIC1_P', 'MIC1_N', 'MIC2_P', 'MIC_BIAS', 'GND', 'GND', 'HP_DET', 'AUDIO_RST_L'], { desc: 'Audio codec and speaker amplifier', block: 'Audio', value: 'Codec' });
  // RF
  bga('U6000', 'top', 1800, 2100, 8, 22, (r, c) => ((r + c) % 2 === 0 ? 'GND' : ['PP_VDD_MAIN', 'PP1V8', 'RF_SPI_CLK', 'RF_SPI_DATA', 'XTAL_26M', 'RF_ANT_MAIN', 'RF_ANT_DIV', 'SIM_CLK', 'SIM_IO', 'SIM_RST', 'PP_SIM'][(r * 8 + c) % 11]), { desc: 'RF transceiver / modem', block: 'RF', value: 'Transceiver' });
  qfn('U6100', 'top', 2000, 1650, 3, 22, ['PP_VDD_MAIN', 'PP_VDD_MAIN', 'RF_ANT_MAIN', 'PA_IN', 'PA_EN', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND'], { desc: 'RF power amplifier', block: 'RF', value: 'PA' });

  // Connectors
  conn('J1000', 'top', 1200, 650, ['GND', 'PP2V8_LCM', 'PP1V8', 'LCM_BIAS_P', 'LCM_BIAS_N', 'LCM_RST_L', 'DSI_CLK_P', 'DSI_CLK_N', 'GND', 'DSI_D0_P', 'DSI_D0_N', 'DSI_D1_P', 'DSI_D1_N', 'GND', 'BL_LED_A', 'BL_LED_K1', 'BL_LED_K2', 'TOUCH_INT_L', 'TOUCH_RST_L', 'I2C1_SCL', 'I2C1_SDA', 'PP3V0_TOUCH', 'GND', 'GND', 'PP1V8', 'GND', 'TE', 'ID_LCM', 'GND', 'GND', 'GND', 'GND', 'BL_LED_A', 'GND', 'PP2V8_LCM', 'GND', 'GND', 'GND', 'GND', 'GND'], 16, { desc: 'Display + touch connector (40 pin)', block: 'Display', value: 'LCD FPC' });
  conn('J2000', 'top', 1950, 3300, ['VBAT', 'VBAT', 'VBAT', 'BATT_NTC', 'BATT_ID', 'GND', 'GND', 'GND'], 28, { desc: 'Battery connector', block: 'Power', value: 'Battery' });
  conn('J3000', 'top', 1200, 4950, ['GND', 'VBUS_IN', 'VBUS_IN', 'USB_DP', 'USB_DM', 'CC1', 'CC2', 'VBUS_IN', 'VBUS_IN', 'GND', 'MIC1_P', 'MIC1_N', 'SPK_P', 'SPK_N', 'GND', 'PWR_KEY', 'VOL_UP_L', 'VOL_DN_L', 'GND', 'GND', 'PP1V8_ALWAYS', 'HP_DET', 'GND', 'GND'], 18, { desc: 'Charge port flex connector (24 pin)', block: 'Charging', value: 'Dock FPC' });
  conn('J6000', 'top', 2150, 900, ['SIM_CLK', 'SIM_IO', 'SIM_RST', 'PP_SIM', 'SIM_DET', 'GND'], 30, { desc: 'SIM card reader', block: 'RF', value: 'SIM' });

  // Discretes on key paths (fixed positions)
  two('F3000', 'top', 1300, 4600, 'VBUS_IN', 'VBUS_IN_F', false, { desc: 'VBUS fuse 2A', block: 'Charging', value: '2A', kind: 'fuse', size: 'big' });
  two('D3000', 'top', 1100, 4650, 'VBUS_IN', 'GND', false, { desc: 'TVS diode on VBUS', block: 'Charging', value: 'TVS', kind: 'diode', size: 'big' });
  two('L3000', 'top', 1950, 4500, 'CHG_LX', 'PP_VDD_MAIN', false, { desc: 'Charger buck inductor 1uH', block: 'Charging', value: '1uH', kind: 'coil', size: 'big' });
  two('L4000', 'top', 1650, 1450, 'PP_VDD_MAIN', 'BL_LX', false, { desc: 'Backlight boost inductor 10uH', block: 'Display', value: '10uH', kind: 'coil', size: 'big' });
  two('D4000', 'top', 1950, 1450, 'BL_LX', 'BL_LED_A', false, { desc: 'Backlight boost diode', block: 'Display', value: 'Schottky', kind: 'diode', size: 'big' });
  const lx = [['L2001', 'PMIC_LX_CPU', 'PP_VDD_CPU'], ['L2002', 'PMIC_LX_GPU', 'PP_VDD_GPU'], ['L2003', 'PMIC_LX_SOC', 'PP_VDD_SOC'], ['L2004', 'PMIC_LX_1V8', 'PP1V8']];
  lx.forEach(([n, a, b], i) => two(n, 'top', 300 + i * 120, 4300, a, b, true, { desc: `Buck inductor ${b}`, block: 'Power', value: '0.47uH', kind: 'coil', size: 'big' }));
  // F3000 output to OVP input
  two('R3050', 'top', 1350, 4700, 'VBUS_IN_F', 'VBUS_IN', false, { desc: '0 ohm link', block: 'Charging', value: '0R', kind: 'res' });

  // Decoupling / passives around ICs
  const decouple = (ic, prefix, block, side, netsCaps, nRes = 0, resNets = []) => {
    const m = meta.get(ic);
    const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
    const ring = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 30;
    for (const [net, count, value] of netsCaps)
      for (let i = 0; i < count; i++) placeNear('C', block, side, cx, cy, ring, net, 'GND', { desc: `${value} decoupling on ${net}`, block: meta.get(ic).block, value, kind: 'cap' });
    for (let i = 0; i < nRes; i++) {
      const [a, b, value, desc] = resNets[i % resNets.length];
      placeNear('R', block, side, cx, cy, ring, a, b, { desc, block: meta.get(ic).block, value, kind: 'res' });
    }
  };
  decouple('U1000', 'C', 1000, 'top', [['PP_VDD_CPU', 10, '22uF'], ['PP_VDD_GPU', 8, '22uF'], ['PP_VDD_SOC', 6, '10uF'], ['PP1V8', 6, '1uF'], ['PP1V1_DDR', 6, '2.2uF'], ['PP0V6_DDR', 3, '1uF']], 4, [['I2C0_SCL', 'PP1V8', '2.2k', 'I2C0 SCL pull-up'], ['I2C0_SDA', 'PP1V8', '2.2k', 'I2C0 SDA pull-up'], ['XTAL_24M', 'GND', '1M', 'Crystal bias'], ['SYS_RST_L', 'PP1V8', '10k', 'Reset pull-up']]);
  decouple('U2000', 'C', 2000, 'top', [['VBAT', 4, '10uF'], ['PP_VDD_MAIN', 6, '22uF'], ['PP1V8_ALWAYS', 2, '1uF'], ['PP1V2', 2, '2.2uF'], ['PP2V8_CAM', 2, '1uF'], ['PP2V8_LCM', 2, '1uF'], ['PP3V0_NAND', 2, '2.2uF']], 3, [['PWR_KEY', 'PP1V8_ALWAYS', '100k', 'Power key pull-up'], ['VOL_UP_L', 'PP1V8_ALWAYS', '100k', 'Volume up pull-up'], ['VOL_DN_L', 'PP1V8_ALWAYS', '100k', 'Volume down pull-up']]);
  decouple('U3000', 'C', 3000, 'top', [['VBUS', 3, '1uF'], ['PMID', 2, '10uF'], ['PP_VDD_MAIN', 3, '22uF'], ['VBAT', 2, '10uF'], ['CHG_REGN', 1, '4.7uF']], 3, [['I2C0_SCL', 'PP1V8', '2.2k', 'Charger I2C pull-up'], ['CHG_ILIM', 'GND', '200', 'Input current limit set'], ['BATT_NTC', 'PP1V8_ALWAYS', '10k', 'NTC bias']]);
  decouple('U4000', 'C', 4000, 'top', [['PP_VDD_MAIN', 2, '10uF'], ['BL_LED_A', 2, '1uF 50V'], ['LCM_BIAS_P', 1, '4.7uF'], ['LCM_BIAS_N', 1, '4.7uF']], 1, [['BL_FB', 'GND', '10', 'Backlight current sense']]);
  decouple('U5000', 'C', 5000, 'top', [['PP1V8', 3, '1uF'], ['PP_VDD_MAIN', 2, '10uF'], ['MIC_BIAS', 1, '1uF']], 2, [['SPK_P', 'SPK_FILT_P', '0', 'Speaker filter'], ['SPK_N', 'SPK_FILT_N', '0', 'Speaker filter']]);
  decouple('U6000', 'C', 6000, 'top', [['PP_VDD_MAIN', 4, '10uF'], ['PP1V8', 2, '1uF'], ['PP_SIM', 1, '1uF']], 2, [['SIM_CLK', 'SIM_CLK_R', '22', 'SIM clock series'], ['SIM_IO', 'PP_SIM', '10k', 'SIM IO pull-up']]);

  // ------------------------------------------------------------- bottom side
  bga('U7000', 'bottom', 1200, 2600, 12, 22, (r, c) => ((r + c) % 3 === 0 ? 'GND' : ['PP3V0_NAND', 'PP1V2', 'PP1V8', 'UFS_TX_P', 'UFS_TX_N', 'UFS_RX_P', 'UFS_RX_N', 'UFS_REF_CLK', 'UFS_RST_L'][(r * 12 + c) % 9]), { desc: 'UFS storage (NAND)', block: 'Storage', value: 'UFS 128GB' });
  qfn('U8000', 'bottom', 700, 1400, 4, 20, ['PP1V8', 'GND', 'I2C0_SCL', 'I2C0_SDA', 'SENSOR_INT_L', 'PP1V8', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND'], { desc: 'Accelerometer / gyro', block: 'Sensors', value: 'IMU' });
  conn('J7000', 'bottom', 1700, 900, ['GND', 'PP2V8_CAM', 'PP1V2', 'PP1V8', 'CSI_CLK_P', 'CSI_CLK_N', 'GND', 'CSI_D0_P', 'CSI_D0_N', 'GND', 'I2C1_SCL', 'I2C1_SDA', 'CAM_RST_L', 'CAM_MCLK', 'GND', 'GND', 'PP2V8_CAM', 'GND', 'GND', 'GND'], 16, { desc: 'Rear camera connector', block: 'Camera', value: 'Camera FPC' });
  decouple('U7000', 'C', 7000, 'bottom', [['PP3V0_NAND', 6, '4.7uF'], ['PP1V2', 4, '2.2uF'], ['PP1V8', 3, '1uF']]);
  decouple('U8000', 'C', 8000, 'bottom', [['PP1V8', 2, '100nF']]);
  decouple('J7000', 'C', 7100, 'bottom', [['PP2V8_CAM', 2, '1uF'], ['PP1V2', 1, '1uF']], 1, [['CAM_MCLK', 'CAM_MCLK_R', '33', 'Camera clock series']]);

  // Rounded outline
  const outline = [];
  const r = 260;
  const corner = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); outline.push({ x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) }); } };
  corner(W - r, r, -Math.PI / 2);
  corner(W - r, H - r, 0);
  corner(r, H - r, Math.PI / 2);
  corner(r, r, Math.PI);
  outline.push({ ...outline[0] });

  // Test points (nails)
  const tp = [['VBAT', 2150, 3600, 'top'], ['PP_VDD_MAIN', 2150, 3700, 'top'], ['VBUS', 1500, 4450, 'top'], ['PP1V8', 300, 2300, 'top'], ['GND', 2250, 4800, 'top'], ['UART_DBG_TX', 300, 3100, 'bottom'], ['UART_DBG_RX', 380, 3100, 'bottom'], ['PP3V0_NAND', 1800, 2600, 'bottom']];
  const nails = tp.map(([net, x, y, side], i) => ({ probe: i + 1, x, y, side, net }));

  return { parts, pins, outline, nails, meta };
}

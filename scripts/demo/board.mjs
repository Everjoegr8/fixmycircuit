// Procedural, entirely synthetic "FMC Demo Phone X1" logic board. Nothing here
// comes from a real device: the layout, part names and nets are invented so the
// app has a realistic-looking board to explore out of the box.

let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Layout positions below are written on a 2400 x 5200 grid and scaled by K, so
// the board comes out at a real logic-board size (about 37 x 79 mm) while the
// parts keep their real size. That is what makes it dense like a phone board.
const K = 0.6;
export const W = 2400 * K;
export const H = 5200 * K;

export function buildDemoBoard() {
  seed = 1234567;
  const parts = [];
  const pins = [];
  const meta = new Map(); // part name -> { kind, value, desc, block, w, h, cx, cy, side }
  const boxes = { top: [], bottom: [] };

  const outline = phoneOutline();
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const M = 45; // keep-out from the board edge
  const free = (side, x0, y0, x1, y1) =>
    x0 > 60 && y0 > 60 && x1 < W - 60 && y1 < H - 60 &&
    inside(x0 - M, y0 - M) && inside(x1 + M, y0 - M) && inside(x0 - M, y1 + M) && inside(x1 + M, y1 + M) && inside((x0 + x1) / 2, y0 - M) && inside((x0 + x1) / 2, y1 + M) &&
    !boxes[side].some((b) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
  const claim = (side, x0, y0, x1, y1) => boxes[side].push([x0, y0, x1, y1]);

  const addPart = (name, side, pinList, m) => {
    // Two parts must not overlap: nudge to the nearest free spot (spiral search).
    {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [, x, y] of pinList) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const pd = m.pad ?? 12;
      if (!free(side, x0 - pd, y0 - pd, x1 + pd, y1 + pd)) {
        let found = null;
        for (let rr = 8; rr < 500 && !found; rr += 8)
          for (let k = 0; k < 24 && !found; k++) {
            const a = (k / 24) * Math.PI * 2, dx = Math.cos(a) * rr, dy = Math.sin(a) * rr;
            if (free(side, x0 - pd + dx, y0 - pd + dy, x1 + pd + dx, y1 + pd + dy)) found = [dx, dy];
          }
        if (found) pinList = pinList.map(([sn, x, y, net]) => [sn, x + found[0], y + found[1], net]);
      }
    }
    const part = parts.length;
    parts.push({ name, side });
    for (const [snum, x, y, net] of pinList) pins.push({ part, snum, x: Math.round(x), y: Math.round(y), net, side });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [, x, y] of pinList) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = m.pad ?? 12;
    claim(side, x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    meta.set(name, { ...m, side, x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad });
  };

  const ROWS = 'ABCDEFGHJKLMNPRTUVWY'.split('').concat('AA AB AC AD AE AF AG AH AJ AK AL AM'.split(' '));
  const bga = (name, side, cx, cy, n, pitch, netFor, m) => {
    cx *= K; cy *= K;
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
    cx *= K; cy *= K;
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
    cx *= K; cy *= K;
    const n = Math.ceil(nets.length / 2);
    const list = nets.map((net, i) => {
      const col = i % n, row = Math.floor(i / n);
      return [String(i + 1), cx - ((n - 1) * pitch) / 2 + col * pitch, cy + (row ? -30 : 30), net];
    });
    addPart(name, side, list, { ...m, kind: 'conn', pad: 24 });
  };
  const two = (name, side, x, y, netA, netB, vertical, m) => {
    if (!m.placed) { x *= K; y *= K; }
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
      if (free(side, x0, y0, x1, y1)) { two(name, side, x, y, netA, netB, vertical, { ...m, placed: true }); return name; }
    }
    return null;
  };

  // ---------------------------------------------------------------- top side
  // SoC
  const socSignals = ['PP_VDD_CPU', 'PP_VDD_GPU', 'PP_VDD_SOC', 'PP1V8', 'PP1V1_DDR', 'PP0V6_DDR', 'I2C0_SCL', 'I2C0_SDA', 'I2C1_SCL', 'I2C1_SDA', 'SPMI_CLK', 'SPMI_DATA', 'DSI_CLK_P', 'DSI_CLK_N', 'DSI_D0_P', 'DSI_D0_N', 'DSI_D1_P', 'DSI_D1_N', 'CSI_CLK_P', 'CSI_CLK_N', 'CSI_D0_P', 'CSI_D0_N', 'UFS_TX_P', 'UFS_TX_N', 'UFS_RX_P', 'UFS_RX_N', 'UFS_REF_CLK', 'UART_DBG_TX', 'UART_DBG_RX', 'TOUCH_INT_L', 'TOUCH_RST_L', 'LCM_RST_L', 'BL_EN', 'CHG_INT_L', 'PMIC_INT_L', 'SYS_RST_L', 'XTAL_24M', 'USB_DP', 'USB_DM', 'AUDIO_I2S_BCLK', 'AUDIO_I2S_LRCK', 'AUDIO_I2S_DOUT', 'AUDIO_I2S_DIN', 'RF_SPI_CLK', 'RF_SPI_DATA', 'SIM_DET'];
  bga('U1000', 'top', 1200, 2700, 26, 16, (r, c) => {
    if ((r + c) % 3 === 0 || r === 0 || c === 0 || r === 25 || c === 25) return 'GND';
    if (r > 8 && r < 17 && c > 8 && c < 17) return (r + c) % 2 ? 'PP_VDD_CPU' : 'PP_VDD_GPU';
    return socSignals[(r * 16 + c) % socSignals.length];
  }, { desc: 'Application processor (SoC)', block: 'SoC', value: 'SoC' });

  // PMIC
  const pmicNets = ['VBAT', 'PP_VDD_MAIN', 'PP_VDD_CPU', 'PP_VDD_GPU', 'PP_VDD_SOC', 'PP1V8', 'PP1V1_DDR', 'PP0V6_DDR', 'PP1V2', 'PP2V8_CAM', 'PP2V8_LCM', 'PP3V0_NAND', 'PP1V8_ALWAYS', 'PMIC_LX_CPU', 'PMIC_LX_GPU', 'PMIC_LX_SOC', 'PMIC_LX_1V8', 'PWR_KEY', 'SYS_RST_L', 'PMIC_INT_L', 'SPMI_CLK', 'SPMI_DATA', 'XTAL_32K', 'VOL_UP_L', 'VOL_DN_L', 'BATT_NTC'];
  bga('U2000', 'top', 650, 3800, 13, 16, (r, c) => ((r + c) % 3 === 0 ? 'GND' : pmicNets[(r * 10 + c) % pmicNets.length]), { desc: 'Power management IC (PMIC)', block: 'Power', value: 'PMIC' });
  // Charger
  qfn('U3000', 'top', 1750, 4250, 6, 22, ['VBUS', 'VBUS', 'PMID', 'PMID', 'CHG_LX', 'CHG_LX', 'PP_VDD_MAIN', 'PP_VDD_MAIN', 'VBAT', 'VBAT', 'GND', 'GND', 'I2C0_SCL', 'I2C0_SDA', 'CHG_INT_L', 'CHG_EN_L', 'BATT_NTC', 'USB_DP', 'USB_DM', 'CHG_REGN', 'CHG_BTST', 'CHG_ILIM', 'GND', 'GND'], { desc: 'Battery charger IC', block: 'Charging', value: 'Charger' });
  // OVP
  qfn('U3100', 'top', 1500, 4700, 3, 18, ['VBUS_IN', 'VBUS_IN', 'VBUS', 'VBUS', 'OVP_EN', 'GND', 'GND', 'GND'], { desc: 'USB over-voltage protection switch', block: 'Charging', value: 'OVP' });
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

  densify();

  // Test points (nails)
  const tp = [['VBAT', 2150, 3600, 'top'], ['PP_VDD_MAIN', 2150, 3700, 'top'], ['VBUS', 1500, 4450, 'top'], ['PP1V8', 300, 2300, 'top'], ['GND', 2250, 4800, 'top'], ['UART_DBG_TX', 300, 3100, 'bottom'], ['UART_DBG_RX', 380, 3100, 'bottom'], ['PP3V0_NAND', 1800, 2600, 'bottom']];
  for (let i = 0; i < 60; i++) {
    // Extra test pads spread over both sides, on the main rails and signals.
    const side = i % 2 ? 'bottom' : 'top';
    const net = TP_NETS[i % TP_NETS.length];
    for (let t = 0; t < 60; t++) {
      const x = 120 + rnd() * (W - 240), y = 120 + rnd() * (H - 240);
      if (free(side, x - 14, y - 14, x + 14, y + 14)) { claim(side, x - 14, y - 14, x + 14, y + 14); tp.push([net, Math.round(x), Math.round(y), side]); break; }
    }
  }
  for (const t of tp.slice(0, 8)) { t[1] = Math.round(t[1] * K); t[2] = Math.round(t[2] * K); }
  const nails = tp.map(([net, x, y, side], i) => ({ probe: i + 1, x, y, side, net }));


  // ----------------------------------------------------- dense phone layout
  // Real phone boards carry well over a thousand parts: shields around the SoC,
  // power and RF areas, rows of 0201 capacitors packed against every IC, small
  // filters and crystals. This fills the board the same way so it reads like a
  // real logic board in the repair tools. Still invented, part for part.
  function densify() {
    const used = new Set(parts.map((p) => p.name));
    const nameFor = (prefix, base) => {
      for (let i = 1; ; i++) { const n = `${prefix}${base + i}`; if (!used.has(n)) { used.add(n); return n; } }
    };
    const ic = (kind, name, side, cx, cy, n, pitch, nets, desc, block) => {
      used.add(name);
      if (kind === 'bga') bga(name, side, cx, cy, n, pitch, (r, c) => ((r + c) % 3 === 0 || r === 0 || c === n - 1 ? 'GND' : nets[(r * n + c) % nets.length]), { desc, block, value: desc, sch: false });
      else qfn(name, side, cx, cy, n, pitch, nets, { desc, block, value: desc, sch: false });
    };
    const small = (name, side, x, y, list, desc, block, kind = 'small') => {
      used.add(name);
      x *= K; y *= K;
      addPart(name, side, list.map(([sn, dx, dy, net]) => [sn, x + dx, y + dy, net]), { desc, block, value: desc, kind, pad: 10, sch: false });
    };
    const xtal = (name, side, x, y, net, desc, block) => small(name, side, x, y, [['1', -22, -16, net], ['2', 22, -16, 'GND'], ['3', 22, 16, net + '_O'], ['4', -22, 16, 'GND']], desc, block);
    const saw = (name, side, x, y, a, b, desc) => small(name, side, x, y, [['1', -16, 10, a], ['2', 0, 10, 'GND'], ['3', 16, 10, b], ['4', 16, -10, 'GND'], ['5', -16, -10, 'GND']], desc, 'RF');
    const coax = (name, side, x, y, net) => small(name, side, x, y, [['1', 0, 0, net], ['2', -26, 0, 'GND'], ['3', 26, 0, 'GND']], 'RF test connector', 'RF');
    const sot = (name, side, x, y, a, b, c, desc, block) => small(name, side, x, y, [['1', -18, -14, a], ['2', 18, -14, b], ['3', 0, 14, c]], desc, block);
    const btb = (name, side, cx, cy, n, pitch, nets, desc, block) => {
      used.add(name);
      cx *= K; cy *= K;
      const list = [];
      for (let i = 0; i < n * 2; i++) {
        const col = i % n, row = Math.floor(i / n);
        list.push([String(i + 1), cx - ((n - 1) * pitch) / 2 + col * pitch, cy + (row ? -22 : 22), nets[i % nets.length]]);
      }
      list.push([String(n * 2 + 1), cx - ((n + 1) * pitch) / 2 - 10, cy, 'GND'], [String(n * 2 + 2), cx + ((n + 1) * pitch) / 2 + 10, cy, 'GND']);
      addPart(name, side, list, { desc, block, value: desc, kind: 'conn', pad: 14, sch: false });
    };

    // --- top side ICs (all invented)
    ic('bga', 'U1100', 'top', 590, 2700, 14, 16, ['PP1V1_DDR', 'PP0V6_DDR', 'PP1V8', 'DDR_CK_P', 'DDR_CK_N', 'DDR_CA0', 'DDR_CA1', 'DDR_CA2', 'DDR_CA3', 'DDR_CA4', 'DDR_CA5', 'DDR_DQ0', 'DDR_DQ1', 'DDR_DQ2', 'DDR_DQ3', 'DDR_DQ4', 'DDR_DQ5', 'DDR_DQ6', 'DDR_DQ7', 'DDR_DQS0_P', 'DDR_DQS0_N', 'DDR_CS0', 'DDR_CKE', 'DDR_RST_L', 'DDR_ZQ'], 'LPDDR4X RAM', 'SoC');
    xtal('Y1000', 'top', 1530, 3060, 'XTAL_24M', 'Crystal 24 MHz', 'SoC');
    ic('qfn', 'U2100', 'top', 1560, 3620, 6, 16, ['VBAT', 'PP_VDD_MAIN', 'PP2V8_CAM', 'PP1V2_CAM', 'PP1V8_CAM', 'PP3V3_AF', 'SUB_LX1', 'SUB_LX2', 'I2C0_SCL', 'I2C0_SDA', 'PMIC_INT_L', 'GND'], 'Sub PMIC (camera rails)', 'Power');
    ic('qfn', 'U2200', 'top', 330, 3330, 3, 18, ['PP_VDD_MAIN', 'BUCK_LX_CAM', 'PP1V2_CAM', 'BUCK_EN', 'GND', 'BUCK_FB'], 'Camera buck regulator', 'Power');
    ic('bga', 'U2300', 'top', 1110, 3470, 5, 18, ['PP_VDD_MAIN', 'PP2V8_LCM', 'PP3V0_TOUCH', 'PP1V8', 'LDO_EN1', 'LDO_EN2'], 'LDO array', 'Power');
    ic('qfn', 'U2400', 'top', 1720, 3120, 3, 16, ['VBAT', 'BATT_SNS_P', 'BATT_SNS_N', 'I2C0_SCL', 'I2C0_SDA', 'GND'], 'Fuel gauge', 'Power');
    small('Y2000', 'top', 880, 4120, [['1', -18, 0, 'XTAL_32K'], ['2', 18, 0, 'XTAL_32K_O']], 'Crystal 32.768 kHz', 'Power');
    ic('qfn', 'U3200', 'top', 840, 4690, 4, 16, ['VBUS_IN', 'CC1', 'CC2', 'USB_DP', 'USB_DM', 'I2C0_SCL', 'I2C0_SDA', 'PD_INT_L', 'PP1V8', 'GND'], 'USB-C PD controller', 'Charging');
    ic('qfn', 'U3300', 'top', 1700, 4820, 3, 16, ['VBUS', 'OTG_5V', 'OTG_EN', 'GND'], 'OTG load switch', 'Charging');
    ic('qfn', 'U4100', 'top', 420, 1180, 3, 18, ['PP_VDD_MAIN', 'HAPTIC_P', 'HAPTIC_N', 'I2C1_SCL', 'I2C1_SDA', 'GND'], 'Haptic driver', 'Audio');
    ic('qfn', 'U5100', 'top', 350, 2020, 4, 16, ['PP_VDD_MAIN', 'SPK_P', 'SPK_N', 'SPK2_P', 'SPK2_N', 'AUDIO_I2S_BCLK', 'AUDIO_I2S_LRCK', 'AUDIO_I2S_DOUT', 'GND'], 'Smart speaker amplifier', 'Audio');
    ic('bga', 'U6200', 'top', 1900, 3860, 9, 18, ['PP_VDD_MAIN', 'PP1V8', 'WLAN_ANT', 'BT_ANT', 'SDIO_CLK', 'SDIO_CMD', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3', 'BT_UART_TX', 'BT_UART_RX', 'WLAN_EN', 'BT_EN', 'XTAL_26M'], 'Wi-Fi / Bluetooth', 'RF');
    ic('qfn', 'U6300', 'top', 2120, 4640, 3, 16, ['PP1V8', 'GPS_ANT', 'GPS_EN', 'GPS_UART_TX', 'GPS_UART_RX', 'GND'], 'GNSS receiver', 'RF');
    ic('qfn', 'U6400', 'top', 430, 4820, 4, 16, ['PP_VDD_MAIN', 'PP1V8', 'NFC_ANT_P', 'NFC_ANT_N', 'NFC_IRQ', 'I2C1_SCL', 'I2C1_SDA', 'NFC_EN', 'GND'], 'NFC controller', 'RF');
    ic('qfn', 'U6500', 'top', 2150, 2140, 5, 14, ['PP_VDD_MAIN', 'RF_ANT_DIV', 'FEM_LB', 'FEM_MB', 'FEM_HB', 'MIPI_RFFE_CLK', 'MIPI_RFFE_DATA', 'GND'], 'RF front-end module', 'RF');
    ic('qfn', 'U6600', 'top', 1480, 1880, 4, 14, ['PP_VDD_MAIN', 'PA_IN', 'FEM_LB', 'MIPI_RFFE_CLK', 'MIPI_RFFE_DATA', 'GND'], 'RF switch', 'RF');
    xtal('Y6000', 'top', 1560, 2200, 'XTAL_26M', 'Crystal 26 MHz', 'RF');
    ['FL6000', 'FL6001', 'FL6002', 'FL6003', 'FL6004', 'FL6005'].forEach((n, i) => saw(n, 'top', 1500 + (i % 3) * 90, 1640 - Math.floor(i / 3) * 70, ['FEM_LB', 'FEM_MB', 'FEM_HB'][i % 3], ['RF_ANT_MAIN', 'RF_ANT_DIV', 'PA_IN'][i % 3], 'SAW filter'));
    coax('J6100', 'top', 2200, 1350, 'RF_ANT_MAIN');
    coax('J6101', 'top', 2200, 4300, 'WLAN_ANT');
    coax('J6102', 'top', 250, 4500, 'GPS_ANT');
    sot('Q3000', 'top', 1050, 4450, 'VBUS', 'OTG_EN', 'OTG_5V', 'OTG FET', 'Charging');
    sot('Q4000', 'top', 1560, 1150, 'BL_EN', 'GND', 'BL_FB', 'Backlight FET', 'Display');
    btb('J4000', 'top', 560, 600, 12, 14, ['GND', 'PP2V8_CAM', 'PP1V2_CAM', 'PP1V8_CAM', 'CSI2_CLK_P', 'CSI2_CLK_N', 'CSI2_D0_P', 'CSI2_D0_N', 'I2C2_SCL', 'I2C2_SDA', 'CAM2_RST_L', 'CAM2_MCLK'], 'Front camera connector', 'Camera');
    btb('J5000', 'top', 1820, 620, 8, 16, ['GND', 'SPK_P', 'SPK_N', 'RCV_P', 'RCV_N', 'MIC2_P', 'MIC_BIAS', 'HAPTIC_P'], 'Sub-board connector', 'Audio');

    // --- bottom side ICs
    ic('bga', 'U1200', 'bottom', 600, 2700, 11, 16, ['PP_VDD_SOC', 'PP1V8', 'PP0V8_AON', 'SPMI_CLK', 'SPMI_DATA', 'SENSOR_I3C_SCL', 'SENSOR_I3C_SDA'], 'Always-on sensor hub', 'Sensors');
    ic('qfn', 'U3400', 'bottom', 1200, 3700, 6, 16, ['VBAT', 'WLC_AC1', 'WLC_AC2', 'WLC_RECT', 'WLC_LDO', 'I2C0_SCL', 'I2C0_SDA', 'WLC_INT_L', 'GND'], 'Wireless charging receiver', 'Charging');
    ic('qfn', 'U5200', 'bottom', 1800, 4200, 4, 16, ['PP_VDD_MAIN', 'RCV_P', 'RCV_N', 'AUDIO_I2S_BCLK', 'AUDIO_I2S_LRCK', 'GND'], 'Earpiece amplifier', 'Audio');
    ic('qfn', 'U8100', 'bottom', 400, 1900, 3, 14, ['PP1V8', 'SENSOR_I3C_SCL', 'SENSOR_I3C_SDA', 'MAG_INT', 'GND', 'GND'], 'Magnetometer', 'Sensors');
    ic('qfn', 'U8200', 'bottom', 1800, 1700, 3, 14, ['PP1V8', 'SENSOR_I3C_SCL', 'SENSOR_I3C_SDA', 'GND'], 'Barometer', 'Sensors');
    ic('qfn', 'U8300', 'bottom', 1150, 1500, 3, 14, ['PP2V8_CAM', 'PP1V8', 'ALS_INT', 'SENSOR_I3C_SCL', 'SENSOR_I3C_SDA', 'GND'], 'Light / proximity sensor', 'Sensors');
    ic('qfn', 'U1300', 'bottom', 1780, 2950, 5, 14, ['PP_VDD_MAIN', 'PP1V8', 'UFS_RST_L', 'PP3V0_NAND', 'GND'], 'Storage power switch', 'Storage');
    btb('J7200', 'bottom', 1200, 4620, 20, 14, ['GND', 'VBUS_IN', 'USB_DP', 'USB_DM', 'CC1', 'CC2', 'MIC1_P', 'MIC1_N', 'SPK_P', 'SPK_N', 'PWR_KEY', 'VOL_UP_L', 'VOL_DN_L', 'HP_DET', 'PP1V8_ALWAYS', 'GND'], 'Main board-to-board connector', 'Charging');
    btb('J7300', 'bottom', 560, 3700, 10, 14, ['GND', 'PP3V3_FP', 'PP1V8', 'FP_SPI_CLK', 'FP_SPI_MOSI', 'FP_SPI_MISO', 'FP_SPI_CS', 'FP_INT', 'FP_RST_L', 'GND'], 'Fingerprint connector', 'Sensors');
    btb('J7400', 'bottom', 1750, 3500, 6, 14, ['GND', 'WLC_AC1', 'WLC_AC2', 'NFC_ANT_P', 'NFC_ANT_N', 'GND'], 'Coil (NFC / wireless charging) contacts', 'Charging');
    coax('J7500', 'bottom', 2200, 1100, 'RF_ANT_DIV');
    coax('J7501', 'bottom', 300, 4300, 'BT_ANT');

    // --- shields: a ring of GND clips around each area (drawn as the can outline)
    const shield = (name, side, x0, y0, x1, y1, step = 26) => {
      used.add(name);
      x0 *= K; y0 *= K; x1 *= K; y1 *= K;
      const list = [];
      let k = 1;
      const tryPin = (x, y) => {
        if (!free(side, x - 9, y - 9, x + 9, y + 9)) return;
        claim(side, x - 9, y - 9, x + 9, y + 9);
        list.push([String(k++), x, y, 'GND']);
      };
      for (let x = x0; x < x1; x += step) { tryPin(x, y0); tryPin(x + step / 2, y1); }
      for (let y = y0 + step; y < y1; y += step) { tryPin(x0, y); tryPin(x1, y - step / 2); }
      if (list.length < 12) return;
      parts.push({ name, side });
      const part = parts.length - 1;
      for (const [snum, x, y, net] of list) pins.push({ part, snum, x: Math.round(x), y: Math.round(y), net, side });
      meta.set(name, { desc: 'Shield can frame', block: 'Shield', value: 'Shield', kind: 'shield', side, x0, y0, x1, y1, sch: false });
    };
    shield('SH1000', 'top', 400, 2380, 1470, 3020);
    shield('SH2000', 'top', 170, 3230, 1440, 4180);
    shield('SH6000', 'top', 1400, 1540, 2290, 2290);
    shield('SH6200', 'top', 1620, 3560, 2260, 4140);
    shield('SH4000', 'top', 1300, 980, 2050, 1380);
    shield('SH7000', 'bottom', 980, 2330, 1440, 2900);
    shield('SH1200', 'bottom', 360, 2420, 840, 2980);
    shield('SH8000', 'bottom', 250, 1180, 1300, 1980);

    // --- passives: rows of 0201/0402 parts packed against every IC
    const blockOf = (name) => meta.get(name)?.block || 'Power';
    const icList = parts.map((p, i) => ({ p, i, m: meta.get(p.name) })).filter((x) => x.m && ['bga', 'qfn', 'conn'].includes(x.m.kind));
    const netsOf = (i) => [...new Set(pins.filter((q) => q.part === i).map((q) => q.net))].filter((n) => n !== 'GND');
    const isPower = (n) => /^(PP|VBAT|VBUS|VDD|PMID|CHG_REGN|WLC_RECT|WLC_LDO|OTG_5V)/.test(n);
    const putChip = (side, x, y, vertical, len, netA, netB, prefix, base, m) => {
      const h = len / 2 + 7, w = 8;
      const x0 = vertical ? x - w : x - h, x1 = vertical ? x + w : x + h, y0 = vertical ? y - h : y - w, y1 = vertical ? y + h : y + w;
      if (!free(side, x0 - 3, y0 - 3, x1 + 3, y1 + 3)) return false;
      const name = nameFor(prefix, base);
      const d = len / 2;
      const p1 = vertical ? [x, y - d] : [x - d, y], p2 = vertical ? [x, y + d] : [x + d, y];
      addPart(name, side, [['1', p1[0], p1[1], netA], ['2', p2[0], p2[1], netB]], { ...m, kind: m.kind, pad: 7, sch: false });
      return true;
    };
    const CAPV = ['100nF', '1uF', '2.2uF', '4.7uF', '10uF', '22uF', '10nF', '47pF'];
    const RESV = ['0R', '10k', '100k', '2.2k', '4.7k', '33R', '1M', '49.9R'];
    const passiveFor = (i, name) => {
      const nets = netsOf(i);
      const power = nets.filter(isPower);
      const sig = nets.filter((n) => !isPower(n));
      const u = rnd();
      const base = Math.floor(parseInt(name.replace(/\D/g, ''), 10) / 100) * 100 || 1000;
      if ((u < 0.62 && power.length) || !sig.length) {
        const net = power.length ? power[Math.floor(rnd() * power.length)] : nets[Math.floor(rnd() * nets.length)] || 'PP1V8';
        const value = CAPV[Math.floor(rnd() * CAPV.length)];
        return { prefix: 'C', base, a: net, b: 'GND', len: value === '22uF' || value === '10uF' ? 30 : 20, m: { desc: `${value} capacitor on ${net}`, block: blockOf(name), value, kind: 'cap' } };
      }
      const net = sig[Math.floor(rnd() * sig.length)];
      if (u < 0.8) {
        const value = RESV[Math.floor(rnd() * RESV.length)];
        const other = rnd() < 0.5 ? (power[0] || 'PP1V8') : `${net}_R`;
        return { prefix: 'R', base, a: net, b: other, len: 20, m: { desc: `${value} resistor on ${net}`, block: blockOf(name), value, kind: 'res' } };
      }
      if (u < 0.9) return { prefix: 'C', base, a: net, b: 'GND', len: 20, m: { desc: `Filter capacitor on ${net}`, block: blockOf(name), value: '33pF', kind: 'cap' } };
      return { prefix: 'FB', base, a: net, b: `${net}_F`, len: 20, m: { desc: `Ferrite bead on ${net}`, block: blockOf(name), value: 'FB', kind: 'res' } };
    };
    // Rings around each IC: parts stand perpendicular to the IC edge, like decoupling does.
    for (const { p, i, m } of icList) {
      const big = m.kind === 'bga' ? 6 : m.kind === 'qfn' ? 4 : 2;
      for (let ring = 0; ring < big; ring++) {
        const g = 24 + ring * 30;
        const x0 = m.x0 - g, x1 = m.x1 + g, y0 = m.y0 - g, y1 = m.y1 + g;
        const fill = ring < 3 ? 0.92 : 0.7;
        for (let x = x0; x <= x1; x += 22) {
          for (const y of [y0, y1]) if (rnd() < fill) { const q = passiveFor(i, p.name); putChip(p.side, x, y, true, q.len, q.a, q.b, q.prefix, q.base, q.m); }
        }
        for (let y = y0 + 22; y < y1; y += 22) {
          for (const x of [x0, x1]) if (rnd() < fill) { const q = passiveFor(i, p.name); putChip(p.side, x, y, false, q.len, q.a, q.b, q.prefix, q.base, q.m); }
        }
      }
    }
    // Fill the rest of the board in aligned rows, nets taken from the nearest IC.
    const nearest = (side, x, y) => {
      let best = null, bd = Infinity;
      for (const c of icList) {
        if (c.m.side !== side) continue;
        const cx = (c.m.x0 + c.m.x1) / 2, cy = (c.m.y0 + c.m.y1) / 2;
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    };
    for (const side of ['top', 'bottom']) {
      for (let y = 100; y < H - 100; y += 30) {
        const vertical = Math.floor(y / 180) % 2 === 0;
        for (let x = 100; x < W - 100; x += vertical ? 24 : 36) {
          const c = nearest(side, x, y);
          if (!c) continue;
          // Packed near ICs, thinning out towards open board.
          const dx = Math.max(c.m.x0 - x, 0, x - c.m.x1), dy = Math.max(c.m.y0 - y, 0, y - c.m.y1);
          const near = Math.hypot(dx, dy) < 420;
          if (rnd() > (near ? (side === 'top' ? 0.16 : 0.12) : 0.025)) continue;
          const q = passiveFor(c.i, c.p.name);
          putChip(side, x, y, vertical, q.len, q.a, q.b, q.prefix, q.base, q.m);
        }
      }
    }
  }

  return { parts, pins, outline, nails, meta };
}

const TP_NETS = ['VBAT', 'PP_VDD_MAIN', 'PP1V8', 'PP1V2', 'PP3V0_NAND', 'PP_VDD_CPU', 'PP_VDD_GPU', 'PP2V8_LCM', 'VBUS', 'I2C0_SCL', 'I2C0_SDA', 'I2C1_SCL', 'SYS_RST_L', 'PWR_KEY', 'GND'];

/** A phone logic board: rounded corners, a notch for the rear camera and one for the side keys. */
function phoneOutline() {
  const pts = [];
  const arc = (cx, cy, r, a0, a1, n = 8) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push({ x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) }); } };
  const P = Math.PI;
  const r = 120, q = 40, N = (v) => v * K;
  // Counter-clockwise from the bottom edge.
  arc(r, r, r, P, 1.5 * P);
  arc(W - r, r, r, 1.5 * P, 2 * P);
  // Right edge with the camera notch (x 1960..W, y 2380..3020).
  arc(W - q, N(2380) - q, q, 0, 0.5 * P, 4);
  arc(N(1960) + q, N(2380) + q, q, 1.5 * P, P, 4);
  arc(N(1960) + q, N(3020) - q, q, P, 0.5 * P, 4);
  arc(W - q, N(3020) + q, q, 1.5 * P, 2 * P, 4);
  arc(W - r, H - r, r, 0, 0.5 * P);
  arc(r, H - r, r, 0.5 * P, P);
  // Left edge with the side-key notch (x 0..140, y 1980..2420).
  pts.push({ x: 0, y: N(2420) }, { x: N(140), y: N(2380) }, { x: N(140), y: N(2020) }, { x: 0, y: N(1980) });
  pts.push({ ...pts[0] });
  return pts;
}

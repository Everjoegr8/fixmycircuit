// Built-in repair knowledge base. General board-level phone repair practice,
// not copied from any OEM or paid service. Values are typical ranges: always
// compare with a known-good board of the same model when you can.

export interface KbGuide {
  id: string;
  title: string;
  category: 'Power' | 'Charging' | 'Display' | 'Audio' | 'Network' | 'Boot' | 'Camera' | 'Sensors' | 'Liquid damage';
  brands?: string[]; // empty = all brands
  symptoms: string;
  tools: string[];
  steps: { title: string; detail: string }[];
  culprits: string[];
  tips?: string[];
  parts?: string;
  nets?: string;
}

export const KB_GUIDES: KbGuide[] = [
  {
    id: 'dead-no-power',
    title: 'Dead phone: no power, no vibration, no charging icon',
    category: 'Power',
    symptoms: 'Nothing happens on the power button. No vibration, no logo, often no reaction to the charger either.',
    tools: ['DC power supply with ammeter', 'Multimeter (diode mode)', 'Thermal camera or rosin / freeze spray', 'Battery connector test leads'],
    steps: [
      { title: 'Rule out the battery', detail: 'Measure the battery: a phone Li-ion cell should read about 3.6–4.4 V. Below about 3.0 V the protection circuit may have cut it off; try a known-good battery before going further.' },
      { title: 'Power from the DC supply', detail: 'Connect the supply to the battery connector at 3.8–4.2 V (current limit 2–3 A). Watch the ammeter while the board is idle, then press power.' },
      { title: 'Read the idle current', detail: 'Current with the phone off should be near 0 mA. A large current immediately (hundreds of mA up to the limit) means a short on VBAT or the main supply line. 0 mA that never rises when pressing power points at the power-on path (button line, PMIC, or no supply reaching the PMIC).' },
      { title: 'Short on VBAT / main line', detail: 'Diode-measure VBAT (black probe on the line, red on GND or as your meter convention needs). A reading near 0.000–0.050 confirms a short. Inject 1–2 V at limited current and find the hot component with a thermal camera, rosin smoke or freeze spray. Usually a shorted decoupling capacitor or a failed IC on that line.' },
      { title: 'No current on power press', detail: 'Check the power-key line voltage at the button flex (usually pulled up to about 1.8 V and pulled to 0 V when pressed). Check the PMIC gets VBAT on its input balls. Check for broken flex, corroded button contacts and the PMIC itself.' },
      { title: 'Current rises then drops or loops', detail: 'Boot starts but fails: see the boot-loop guide. Compare the current pattern with a good board of the same model.' },
    ],
    culprits: ['Shorted capacitor on VBAT / main rail', 'Power button flex', 'PMIC', 'Battery connector', 'Previous liquid damage'],
    tips: ['Always note the idle current and pattern on power press. It tells you more than any other single test.', 'Diode readings vary by meter: build your own table from good boards with the same meter.'],
    nets: 'VBAT, PP_VDD_MAIN, PWR_KEY',
  },
  {
    id: 'not-charging',
    title: 'Not charging or charges very slowly',
    category: 'Charging',
    symptoms: 'No charging icon, charges only when off, very slow charging, or the percentage does not rise.',
    tools: ['USB ammeter (inline tester)', 'Multimeter', 'Known-good cable and charger', 'Microscope'],
    steps: [
      { title: 'Check cable, charger and port', detail: 'Use a known-good cable and charger. Clean the port with a non-metal pick and IPA; lint and corrosion are the most common cause.' },
      { title: 'Measure the USB current', detail: 'With a USB ammeter: 0.0 A = no VBUS path or no detection; under about 0.1–0.2 A = fault in charging control or battery; normal phones draw 0.5–2 A when charging a low battery.' },
      { title: 'Check VBUS at the board', detail: 'With the charger plugged in, VBUS on the charge port flex or connector should be about 5 V. Missing: check the flex / port, the fuse or filter on VBUS and the over-voltage protection (OVP) chip.' },
      { title: 'Diode-measure VBUS and the charge path', detail: 'Compare VBUS, VBAT and the charger IC input with a good board. A very low reading on VBUS suggests a shorted TVS diode, capacitor or a failed OVP / charger IC.' },
      { title: 'Check the charger IC', detail: 'Look for heat, corrosion or lifted balls around the charger IC. Check its supply and I2C lines (pulled up, usually to 1.8 V).' },
      { title: 'Battery and battery connector', detail: 'Test with a known-good battery. Check the battery connector for damaged pins and the battery ID / NTC line.' },
    ],
    culprits: ['Dirty or damaged charge port', 'Charge port flex', 'VBUS fuse / filter', 'TVS diode on VBUS', 'OVP chip', 'Charger IC (on older iPhones often called Tristar / Hydra)', 'Battery'],
    tips: ['Fake charging (icon shows but % does not rise): check the battery health and the charger IC before replacing the port.'],
    nets: 'VBUS, VBAT, PP_VDD_MAIN',
  },
  {
    id: 'no-display',
    title: 'No display but phone works (sound, vibration, rings)',
    category: 'Display',
    symptoms: 'Screen stays black, but the phone vibrates, rings or connects to a computer.',
    tools: ['Known-good screen', 'Multimeter', 'Microscope', 'Torch to check for faint image'],
    steps: [
      { title: 'Separate image from backlight', detail: 'Shine a torch at the screen at an angle. If you see a faint image, the display works and the backlight is the fault: use the no-backlight guide.' },
      { title: 'Test a known-good screen', detail: 'Rules out the panel. Reseat the display connector and inspect it under the microscope for bent or burnt pins.' },
      { title: 'Check display supplies', detail: 'On the display connector, check the display power lines (often a 1.8 V logic rail, an analog rail around 2.8–3.0 V, and higher positive / negative bias rails for LCDs or OLEDs). Missing rails: trace back to the regulator or PMIC output and its filter coils / capacitors.' },
      { title: 'Diode-measure the connector', detail: 'Compare every pin with a good board or your readings table. Shorted or open data lines (MIPI) point to filters near the connector or damage under the SoC.' },
      { title: 'Check filters and the connector', detail: 'Damaged EMI filters next to the display connector are common after screen swaps or liquid damage.' },
    ],
    culprits: ['Display panel', 'Display connector pins', 'EMI filters near the connector', 'Display power regulator / PMIC output', 'Coils on bias supplies'],
    nets: 'PP1V8, PP2V8_LCM, DSI',
  },
  {
    id: 'no-backlight',
    title: 'No backlight (faint image visible)',
    category: 'Display',
    symptoms: 'Image is visible with a torch but the screen is dark.',
    tools: ['Multimeter', 'Known-good LCD', 'Microscope'],
    steps: [
      { title: 'Confirm with a known-good LCD', detail: 'Backlight LEDs in the panel can fail; test before working on the board. (OLED screens have no separate backlight.)' },
      { title: 'Check the backlight boost circuit', detail: 'The backlight driver boosts the battery voltage to drive the LED strings. Check its input supply, enable line and the boost coil, diode and output capacitor.' },
      { title: 'Diode-measure the backlight lines', detail: 'Backlight anode / cathode lines on the connector: compare with a good board. A short is often the output capacitor or filter; an open line is often the boost coil or diode.' },
      { title: 'Check for heat', detail: 'With the backlight on, a hot boost diode, coil or capacitor shows the faulty part.' },
    ],
    culprits: ['Backlight boost coil', 'Backlight diode', 'Output filter / capacitor', 'Backlight driver IC', 'LCD panel'],
    nets: 'BL_LED_A, BL_LED_K, BL_EN',
  },
  {
    id: 'no-touch',
    title: 'Touch not working or ghost touch',
    category: 'Display',
    symptoms: 'Touch does not respond, responds in some areas only, or registers touches by itself.',
    tools: ['Known-good screen', 'Multimeter'],
    steps: [
      { title: 'Rule out the screen', detail: 'Ghost touch is usually the screen, a bad aftermarket part, a damaged protector or a faulty charger. Test with a known-good screen and without the charger.' },
      { title: 'Check touch supplies and lines', detail: 'On the connector, check the touch IC supplies and the I2C / SPI and interrupt / reset lines. Compare diode readings with a good board.' },
      { title: 'Check the touch IC', detail: 'On boards with the touch controller on the logic board, inspect it for cracks or corrosion and check its supplies.' },
    ],
    culprits: ['Screen / digitizer', 'Connector', 'Filters on touch lines', 'Touch IC (on some models on the logic board)'],
  },
  {
    id: 'boot-loop',
    title: 'Boot loop, stuck on logo or random restarts',
    category: 'Boot',
    symptoms: 'Restarts at the logo, restarts every few minutes, or never finishes booting.',
    tools: ['DC power supply with ammeter', 'Flashing software / tool for the brand', 'Microscope'],
    steps: [
      { title: 'Software first', detail: 'Try recovery mode and a firmware reflash with the brand\'s official or authorised tools. Many loops are software or storage related.' },
      { title: 'Watch the boot current', detail: 'On the DC supply, note where the current pattern stops or repeats. Compare with a good board: a stop at a fixed point often points at a specific stage (storage, baseband, sensors).' },
      { title: 'Disconnect peripherals', detail: 'Unplug flex cables one at a time (sensors, camera, charging flex, battery temperature line). A faulty peripheral or flex often causes restarts after a fixed time.' },
      { title: 'Check the battery and temperature line', detail: 'A weak battery or a bad battery temperature / ID line causes restarts under load.' },
      { title: 'Check storage and SoC', detail: 'If the flash memory or SoC solder joints are failing (common after drops or heat), the board needs BGA work or data recovery.' },
    ],
    culprits: ['Firmware / storage corruption', 'Faulty flex or sensor', 'Battery', 'Flash memory (NAND / eMMC / UFS)', 'Cracked BGA joints'],
    tips: ['On iPhones, panic logs in Settings > Privacy > Analytics often name the failing sensor or bus.'],
  },
  {
    id: 'short-finding',
    title: 'Finding a short circuit on a line',
    category: 'Power',
    symptoms: 'A line measures near 0 in diode mode or the power supply hits its current limit immediately.',
    tools: ['DC power supply', 'Thermal camera, rosin or freeze spray', 'Multimeter', 'Microscope'],
    steps: [
      { title: 'Confirm the short', detail: 'Diode or resistance mode between the line and GND. Very low (near 0.000–0.050 in diode mode, or a few ohms) confirms it. Some rails are naturally low; compare with a good board.' },
      { title: 'Find every part on the line', detail: 'Open the boardview and click the line: every capacitor, coil and IC on the net lights up. This is your candidate list.' },
      { title: 'Inject voltage', detail: 'Set the supply to the line\'s normal voltage or lower (1–2 V for low-voltage rails, never above the rail voltage) with a current limit of about 1–2 A. Connect positive to the line and negative to GND.' },
      { title: 'Find the heat', detail: 'Use a thermal camera, rosin smoke (the shorted part melts the rosin first) or freeze spray (frost melts first on the hot part).' },
      { title: 'Remove and re-test', detail: 'Remove the hot part and measure again. A shorted capacitor can often be left off temporarily to test; replace it before returning the phone.' },
    ],
    culprits: ['Decoupling capacitor', 'TVS / protection diode', 'IC on the line'],
  },
  {
    id: 'no-service',
    title: 'No service, searching, or no network',
    category: 'Network',
    symptoms: 'No signal, stuck on searching, no IMEI, or baseband missing.',
    tools: ['Known-good SIM', 'Multimeter', 'Microscope'],
    steps: [
      { title: 'Check SIM and software', detail: 'Try a known-good SIM, reset network settings, and check the IMEI with *#06#. A missing IMEI or baseband points at the board, not the antenna.' },
      { title: 'Check antennas and coax', detail: 'Inspect antenna flexes, contacts and the coaxial cables for damage or loose connections. Weak signal only is usually antenna side.' },
      { title: 'Check SIM reader', detail: 'Diode-measure the SIM lines (supply, clock, data, reset) on the SIM reader. Damaged readers and filters are common.' },
      { title: 'Check the RF section', detail: 'With IMEI present but no service, inspect the power amplifier and RF transceiver area for heat, cracks or liquid damage.' },
    ],
    culprits: ['SIM reader / tray', 'Antenna flex or coax', 'RF power amplifier', 'Transceiver / baseband'],
  },
  {
    id: 'no-wifi-bt',
    title: 'No Wi-Fi or Bluetooth (greyed out)',
    category: 'Network',
    symptoms: 'Wi-Fi switch greyed out, Wi-Fi or Bluetooth will not turn on, or very weak Wi-Fi.',
    tools: ['Multimeter', 'Microscope', 'Hot air station'],
    steps: [
      { title: 'Software reset', detail: 'Update the firmware and reset network settings. Weak signal is usually the antenna.' },
      { title: 'Check the Wi-Fi module supplies', detail: 'Check the supplies and the clock / enable lines of the Wi-Fi / BT module. Compare diode readings.' },
      { title: 'Reflow or replace the module', detail: 'Greyed-out Wi-Fi after a drop or heat is often failed solder joints under the module.' },
    ],
    culprits: ['Wi-Fi / BT module', 'Module supply regulator', 'Antenna'],
  },
  {
    id: 'no-sound',
    title: 'No sound, no microphone, or calls silent',
    category: 'Audio',
    symptoms: 'No sound from speaker or earpiece, others cannot hear you, or voice memos record silence.',
    tools: ['Known-good speaker / mic flex', 'Multimeter'],
    steps: [
      { title: 'Test the parts', detail: 'Try known-good speaker, earpiece and microphone flexes. Clean speaker meshes.' },
      { title: 'Check the connector and filters', detail: 'Diode-measure the speaker and microphone lines; filters near the connectors are often damaged by liquid.' },
      { title: 'Check the audio IC / amplifier', detail: 'Check supplies of the audio codec and speaker amplifier. Faults here can also cause slow boot or boot loops on some models.' },
    ],
    culprits: ['Speaker / mic flex', 'Filters and coils on audio lines', 'Speaker amplifier', 'Audio codec'],
  },
  {
    id: 'camera',
    title: 'Camera not working or black',
    category: 'Camera',
    symptoms: 'Black camera, camera app crashes, or flash not working.',
    tools: ['Known-good camera module', 'Multimeter'],
    steps: [
      { title: 'Swap the module', detail: 'Test with a known-good camera. Check the connector for bent pins.' },
      { title: 'Check camera supplies', detail: 'Cameras use several rails (often an analog rail around 2.8 V, a digital core rail around 1.0–1.2 V and a 1.8 V I/O rail). Check each at the connector with the camera app open.' },
      { title: 'Check data lines', detail: 'Diode-measure the MIPI data and I2C lines and compare with a good board.' },
    ],
    culprits: ['Camera module', 'Connector', 'Camera power regulator', 'Filters on data lines'],
  },
  {
    id: 'overheating',
    title: 'Overheating or fast battery drain',
    category: 'Power',
    symptoms: 'Phone gets hot when idle or charging, or battery drains overnight.',
    tools: ['DC power supply with ammeter', 'Thermal camera'],
    steps: [
      { title: 'Check software and battery', detail: 'Check for rogue apps and battery health first.' },
      { title: 'Measure the off-current', detail: 'With the phone off on the DC supply, current should be near 0 mA. A steady drain with the phone off points at a leaking part.' },
      { title: 'Find the warm part', detail: 'Use a thermal camera while the phone is off but connected, or on and idle. A partially shorted capacitor or an IC getting warm is the usual cause.' },
    ],
    culprits: ['Leaky capacitor', 'Charger IC', 'PMIC', 'Battery'],
  },
  {
    id: 'liquid-damage',
    title: 'Liquid damage: first steps',
    category: 'Liquid damage',
    symptoms: 'Phone was exposed to water or other liquids. Any fault can follow, sometimes days later.',
    tools: ['Isopropyl alcohol (99%)', 'Ultrasonic cleaner (optional)', 'Soft brush', 'Microscope'],
    steps: [
      { title: 'Disconnect the battery immediately', detail: 'Corrosion is driven by voltage. Disconnect the battery before anything else.' },
      { title: 'Open and inspect', detail: 'Remove shields where possible and inspect under the microscope for green / white corrosion, especially around connectors and filters.' },
      { title: 'Clean', detail: 'Clean with 99% isopropyl alcohol and a soft brush, or an ultrasonic cleaner (remove parts that can be damaged such as speakers, microphones and cameras). Dry fully.' },
      { title: 'Measure before powering', detail: 'Diode-measure the main lines (VBAT, main supply, VBUS) for shorts before connecting the battery.' },
      { title: 'Repair damaged parts', detail: 'Replace corroded filters, resistors and capacitors. Use jumper wires where traces are eaten away.' },
    ],
    culprits: ['Corroded filters and connectors', 'Shorted capacitors', 'Eaten traces (need jumpers)'],
  },
  {
    id: 'fingerprint-faceid',
    title: 'Fingerprint or face unlock not working',
    category: 'Sensors',
    symptoms: 'Fingerprint sensor not responding or face unlock unavailable.',
    tools: ['Multimeter', 'Microscope'],
    steps: [
      { title: 'Check the flex and connector', detail: 'Inspect the sensor flex and connector for damage. Some brands pair the sensor to the board, so a replacement sensor may need the brand\'s calibration tool.' },
      { title: 'Check supplies and lines', detail: 'Diode-measure the sensor connector and compare with a good board.' },
    ],
    culprits: ['Sensor flex', 'Connector', 'Filters', 'Pairing (needs authorised tool)'],
  },
  {
    id: 'sim-not-detected',
    title: 'SIM card not detected',
    category: 'Network',
    symptoms: '"No SIM" or "Invalid SIM" with a known-good SIM.',
    tools: ['Known-good SIM', 'Multimeter', 'Microscope'],
    steps: [
      { title: 'Check tray and reader', detail: 'Check the SIM tray, reader pins and the SIM detect switch.' },
      { title: 'Measure SIM lines', detail: 'Diode-measure SIM VCC, CLK, RST and I/O at the reader. Damaged ESD filters near the reader are common.' },
      { title: 'Check the SIM supply', detail: 'The SIM supply is switched on when the phone polls the card (1.8 V or 3 V). Check the regulator or PMIC output that feeds it.' },
    ],
    culprits: ['SIM reader', 'ESD filters on SIM lines', 'SIM supply regulator'],
  },
];

export interface RefTable {
  id: string;
  title: string;
  intro: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export const REF_TABLES: RefTable[] = [
  {
    id: 'diode-mode',
    title: 'Reading diode mode on a phone board',
    intro: 'Diode mode sends a small current through the line and shows the voltage drop. Put one probe on GND and the other on the line. Use the same meter and the same probe convention every time, and compare with a good board.',
    columns: ['Reading', 'What it usually means', 'Next step'],
    rows: [
      ['0.000 – 0.050', 'Short to GND (or the line is GND)', 'Inject voltage and find the hot part'],
      ['0.050 – 0.200', 'Very low: some rails (like CPU core) are naturally low, otherwise a partial short', 'Compare with a good board before acting'],
      ['0.300 – 0.800', 'Typical range for many signal and supply lines', 'Compare with your readings table'],
      ['OL / 1 (open)', 'Open line: broken trace, missing part, or the line is isolated by a switch', 'Check continuity to the IC; check for missing parts or eaten traces'],
      ['Different from good board by more than about 0.05', 'Possible damage on that line or on an IC connected to it', 'Measure the same line at both ends'],
    ],
    note: 'Readings depend on the meter. Build your own table from good boards (Board Photos → drop pins) so your whole shop uses the same reference.',
  },
  {
    id: 'rails',
    title: 'Typical phone supply voltages',
    intro: 'Typical values for common supply lines. Exact rails and names differ by brand and model: confirm on the schematic.',
    columns: ['Line', 'Typical voltage', 'Notes'],
    rows: [
      ['VBUS (USB)', '5 V (9–12 V with fast charging)', 'Only with charger connected'],
      ['VBAT (battery)', '3.6 – 4.4 V', 'Present whenever the battery is connected'],
      ['Main system supply (PP_VDD_MAIN, VSYS, VPH_PWR)', 'Close to VBAT', 'Feeds the PMIC and most regulators'],
      ['Always-on / RTC', '1.8 – 3.0 V', 'Present with the phone off'],
      ['I/O rail', '1.8 V', 'I2C pull-ups, display logic, sensors'],
      ['Memory (LPDDR)', '0.6 – 1.2 V', 'Several rails'],
      ['CPU / GPU core', '0.5 – 1.1 V (varies with load)', 'Low diode readings are normal on these'],
      ['Camera analog', '2.8 V', 'Only with camera on'],
      ['LCD / OLED bias', '+5 to +7 V and −5 to −7 V (OLED up to about 10 V or more)', 'Only with display on'],
      ['Backlight boost', '15 – 30 V', 'Only with backlight on; dangerous to short'],
    ],
  },
  {
    id: 'ammeter',
    title: 'DC power supply current patterns (phone on the bench supply)',
    intro: 'Power the board from a DC supply at about 3.8–4.2 V on the battery connector and watch the current when you press power.',
    columns: ['What you see', 'Likely meaning'],
    rows: [
      ['High current as soon as you connect, before pressing power', 'Short on VBAT or the main supply line'],
      ['0 mA, nothing on power press', 'Power-on path: button, PMIC, or no supply reaching the PMIC'],
      ['Jumps to about 20–80 mA and stays there', 'PMIC starts but the CPU does not boot: check clocks, CPU supplies, storage'],
      ['Rises during boot then drops to 0 and repeats', 'Boot loop: software, storage, or a faulty peripheral'],
      ['Normal boot pattern, settles low', 'Board boots: the fault is in a peripheral (display, touch, etc.)'],
      ['Small steady current with phone off (more than a few mA)', 'Leakage: battery drain or overheating fault'],
    ],
    note: 'Exact currents vary by model. Record the pattern of a good board in a fault solution so the shop can compare.',
  },
  {
    id: 'solder',
    title: 'Solder and rework temperatures',
    intro: 'Start low and increase slowly. Use a board holder, shields and heat-protection tape around plastic parts and sensitive chips.',
    columns: ['Item', 'Value', 'Notes'],
    rows: [
      ['Leaded solder Sn63Pb37', 'Melts at 183 °C', 'Easier rework'],
      ['Lead-free SAC305', 'Melts at about 217–220 °C', 'Used on most factory boards'],
      ['Low-temperature Sn42Bi58', 'Melts at 138 °C', 'Useful for stacked boards and heat-sensitive areas'],
      ['Hot air, small passives', 'About 300–350 °C, low airflow', 'Watch nearby small parts'],
      ['Hot air, ICs and BGA', 'About 330–380 °C with preheater', 'Use flux; preheat the board to reduce warping'],
      ['Preheater for sandwich boards', 'About 150–180 °C', 'Separate stacked boards with care'],
    ],
  },
];

export const BRAND_NOTES: Record<string, string[]> = {
  iPhone: [
    'Newer models pair parts (screen, battery, Face ID, cameras) to the board. Replacements can show warnings or lose features.',
    'Charging problems on older models are often the USB charging IC (Tristar / Hydra) after using poor chargers.',
    'Many models use stacked (sandwich) logic boards: separate and re-join them with a preheater and the right solder.',
  ],
  Samsung: [
    'Many models have the charging port on a sub-board: test with a known-good sub-board first.',
    'OLED screens fail easily from pressure and liquid; check the screen before the board on display faults.',
  ],
  Tecno: [
    'Most models use MediaTek or Unisoc chipsets: firmware problems are common, so try a reflash with an authorised tool before board work.',
    'Charging ports are often on a sub-board connected by a flex.',
  ],
  Infinix: ['Shares many designs and chipsets with Tecno and Itel (same group): repair methods often carry over between them.'],
  Itel: ['Budget boards with fewer layers: liquid damage and corroded traces are common, so be ready to add jumper wires.'],
  Xiaomi: ['Redmi and Poco models are similar to Xiaomi equivalents. Check for an anti-rollback version before flashing older firmware.'],
};

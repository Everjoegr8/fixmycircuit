// Starter IC cross-reference list. These are typical platform pairings to help a
// technician know where to look; they can be wrong for a given board revision,
// so the app labels them "starter, verify" and lets the shop add its own.

export interface IcXrefSeed {
  ic: string;
  function: string;
  platform?: string;
  used_in?: string;
  alternatives?: string;
  notes?: string;
}

const VERIFY = 'Starter entry: confirm on the schematic or boardview of the exact model before ordering.';

export const IC_XREF_STARTER: IcXrefSeed[] = [
  { ic: 'MT6357', function: 'PMIC', platform: 'MediaTek Helio A22 / P22 / P35 class', used_in: 'Many budget Tecno, Infinix, Itel and Samsung A-series phones on these chips', notes: VERIFY },
  { ic: 'MT6358', function: 'PMIC', platform: 'MediaTek Helio P60 / P70 / G80 / G85 class', used_in: 'Mid-range Tecno, Infinix, Xiaomi Redmi and Samsung A-series phones on these chips', notes: VERIFY },
  { ic: 'MT6360', function: 'Charger + PMU (USB Type-C)', platform: 'MediaTek Helio G and Dimensity phones', used_in: 'Common on MediaTek mid-range boards next to the main PMIC', notes: VERIFY },
  { ic: 'PMI632', function: 'Charger / power management', platform: 'Snapdragon 450 / 439 / 632 class', used_in: 'Budget Snapdragon phones of that generation', notes: VERIFY },
  { ic: 'PM6125', function: 'PMIC', platform: 'Snapdragon 665 / 662 / 460 class', used_in: 'Budget and mid-range Snapdragon phones', notes: VERIFY },
  { ic: 'PM6150', function: 'PMIC', platform: 'Snapdragon 720G / 730G class', used_in: 'Mid-range Snapdragon phones', notes: VERIFY },
  { ic: 'SGM41511', function: 'Single-cell charger (I2C)', platform: 'Any', used_in: 'Many budget Android phones', alternatives: 'BQ25601 family is often listed as an equivalent', notes: 'Check package and pinout match before swapping. ' + VERIFY },
  { ic: 'BQ25601', function: 'Single-cell charger (I2C)', platform: 'Any', used_in: 'Budget Android phones and tablets', alternatives: 'SGM41511', notes: 'Check package and pinout match before swapping. ' + VERIFY },
  { ic: 'BQ25890', function: 'Single-cell fast charger (I2C)', platform: 'Any', used_in: 'Some Xiaomi and other Android phones', alternatives: 'SY6970 is often listed as an equivalent', notes: VERIFY },
  { ic: 'AW87xxx', function: 'Speaker amplifier family', platform: 'Any', used_in: 'Many Transsion and Xiaomi phones; exact part number varies by model', notes: 'Read the marking on the chip and match the full number. ' + VERIFY },
  { ic: '1610A3', function: 'USB / Tristar (U2)', platform: 'Apple', used_in: 'iPhone 6s / 6s Plus', alternatives: 'iPhone 7 / 7 Plus use 1610A3B', notes: VERIFY },
  { ic: '1612A1', function: 'USB / Tristar (U2)', platform: 'Apple', used_in: 'iPhone 8 / 8 Plus / X', notes: VERIFY },
  { ic: 'SN2400', function: 'Charging IC', platform: 'Apple', used_in: 'iPhone 8 / 8 Plus / X', notes: VERIFY },
  { ic: 'SN2501', function: 'Charging IC', platform: 'Apple', used_in: 'iPhone XS / XS Max / XR generation', notes: VERIFY },
  { ic: 'SN2611A0', function: 'Charging IC', platform: 'Apple', used_in: 'iPhone 12 family', notes: VERIFY },
];

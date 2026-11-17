// End-to-end run of the real Electron app with the synthetic samples.
// Run with: npm run build && npm run test:e2e   (on Linux CI, wrap in xvfb-run)
const { _electron } = require('playwright-core');
const assert = require('assert/strict');
const path = require('path'); const fs = require('fs');
const os = require('os');
const APP = path.resolve(__dirname, '../..'); const SM = path.join(APP, 'samples') + path.sep;
const S = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'fmc-e2e-'));
const shot = (page, n) => page.screenshot({ path: `${S}/${n}.png` });
(async () => {
  const data = path.join(S, 'data'); fs.rmSync(data, { recursive: true, force: true });
  const app = await _electron.launch({ args: ['--no-sandbox', APP], env: { ...process.env, FMC_DATA_DIR: data } });
  const page = await app.firstWindow();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => m.type() === 'error' && console.log('[console]', m.text()));
  page.on('dialog', d => d.accept());
  await page.waitForSelector('text=Welcome to the bench');
  // Add model through UI
  await page.hover('text=Tecno'); 
  await page.locator('button[title="Add Tecno model"]').click();
  await page.fill('input[placeholder^="Model name"]', 'Spark 10 (KI5)');
  await page.keyboard.press('Enter');
  await page.waitForSelector('h1:has-text("Spark 10 (KI5)")');
  const modelId = await page.evaluate(async () => (await window.fmc.tree()).models[0].id);
  await page.evaluate(async ([paths, id]) => window.fmc.importFiles({ paths, model_id: id }), [[SM + 'demo-phone-schematic.pdf', SM + 'demo-phone.brd', SM + 'demo-board-photo.png'], modelId]);
  await page.evaluate(() => window.fmc.setSettings({ author: 'Tunde' }));
  // Fault solution via UI
  await page.click('button[data-testid="new-guide"]');
  await page.fill('[data-testid="guide-editor"] input >> nth=0', 'Not charging');
  await page.fill('[data-testid="guide-editor"] textarea >> nth=0', 'Phone shows charging icon but battery % does not rise.');
  await page.fill('[data-testid="guide-editor"] textarea >> nth=1', '1. Measure VBUS at F1 with charger\n2. Diode reading VBUS to GND should be about 0.45\n3. If F1 open, replace or jumper F1');
  await page.fill('[data-testid="guide-editor"] input >> nth=1', 'U2, F1');
  await page.fill('[data-testid="guide-editor"] input >> nth=2', 'VBUS');
  await page.click('text=Save fault solution');
  await page.waitForSelector('text=Not charging');
  await shot(page, '02-faults');
  // Readings tab
  await page.click('button:has-text("Diode Readings") >> nth=-1');
  await page.click('[data-testid="add-reading"]');
  const row = page.locator('[data-testid="readings-table"] tbody tr').last();
  await row.locator('input').nth(0).fill('U2'); await row.locator('input').nth(1).fill('1'); await row.locator('input').nth(2).fill('VBUS'); await row.locator('input').nth(3).fill('0.452'); await row.locator('input').nth(4).fill('red probe GND');
  await row.locator('button:has-text("Save")').click();
  await page.waitForTimeout(300);
  await shot(page, '03-readings');
  // Open schematic
  await page.click('button:has-text("Schematics/PDF") >> nth=-1');
  await page.click('button:has-text("Open")');
  await page.waitForSelector('.pdfViewer .page canvas, .pdfViewer .page .canvasWrapper', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.fill('[data-testid="pdf-search"]', 'VBUS'); await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const m1 = await page.textContent('[data-testid="pdf-matches"]'); console.log('pdf matches:', m1); assert.match(m1, /of [1-9]/);
  await shot(page, '04-pdf');
  // Open board from library tab
  await page.click('button:has-text("Spark 10 (KI5) ·")');
  await page.click('button:has-text("BoardView") >> nth=-1');
  await page.click('button:has-text("Open")');
  await page.waitForSelector('[data-testid="board-canvas"]');
  await page.waitForTimeout(800);
  await shot(page, '05-board');
  await page.fill('input[placeholder^="Find part or net"] >> visible=true', 'U2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot(page, '06-board-part');
  // click pin row VBUS
  await page.locator('[data-testid="board-info"] tr:has-text("VBUS")').first().click();
  await page.waitForTimeout(500);
  const info = await page.textContent('[data-testid="board-info"]'); assert.match(info, /VBUS5 pins on 4 parts/);
  console.log('panel:', (await page.textContent('[data-testid="repair-panel"] >> visible=true')).slice(0, 300));
  await shot(page, '07-board-net');
  // Find in schematic
  await page.click('[data-testid="board-info"] button[title="Find in schematic"]');
  await page.waitForTimeout(1200);
  console.log('pdf matches after jump:', await page.locator('[data-testid="pdf-matches"]').first().textContent());
  await shot(page, '08-jump-pdf');
  // Photos
  await page.click('button:has-text("Spark 10 (KI5) ·")');
  await page.click('button:has-text("Board Photos") >> nth=-1');
  await page.waitForTimeout(400);
  await shot(page, '09-photos');
  await page.locator('img[alt="demo-board-photo"]').click();
  await page.waitForTimeout(800);
  const host = page.locator('[data-testid="photo-host"] >> visible=true');
  const bb = await host.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.45, bb.y + bb.height * 0.35);
  await page.waitForSelector('[data-testid="pin-editor"]');
  const ed = page.locator('[data-testid="pin-editor"]');
  await ed.locator('input').nth(0).fill('U2'); await ed.locator('input').nth(1).fill('1'); await ed.locator('input').nth(2).fill('VBUS'); await ed.locator('input').nth(3).fill('0.452'); await ed.locator('input').nth(3).press('Enter');
  await page.keyboard.press('Escape');
  await page.click('button[title^="Draw jumper"]');
  await page.mouse.click(bb.x + bb.width * 0.55, bb.y + bb.height * 0.5);
  await page.mouse.click(bb.x + bb.width * 0.65, bb.y + bb.height * 0.45);
  await page.mouse.click(bb.x + bb.width * 0.7, bb.y + bb.height * 0.6);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="pin-editor"]');
  await page.locator('[data-testid="pin-editor"] input').first().fill('VBUS jumper F1 to U2');
  await page.locator('[data-testid="pin-editor"] input').first().blur();
  await page.waitForTimeout(400);
  await shot(page, '10-contributor');
  const db = await page.evaluate(async () => ({ r: await window.fmc.listReadings({}), g: await window.fmc.listGuides() }));
  console.log('readings:', db.r.map(r => `${r.part}.${r.pin} ${r.net} ${r.value} photo=${r.photo_id} by=${r.author}`));
  console.log('guides:', db.g.map(g => g.title + ' by ' + g.author));
  assert.equal(db.r.length, 2, 'two readings saved');
  assert.ok(db.r.some((r) => r.photo_id), 'one reading came from the photo pin');
  assert.equal(db.g.length, 1, 'fault solution saved');
  const jumpers = await page.evaluate(async (id) => window.fmc.listJumpers(id), db.r.find((r) => r.photo_id).photo_id);
  assert.equal(jumpers.length, 1, 'jumper saved');
  assert.equal(jumpers[0].points.length, 3);
  console.log('E2E OK, screenshots in', S);
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });

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
  if (process.env.E2E_ONLY) { await ({ license: licenseRun, tools: toolsRun, formats: formatsRun, demo: demoRun })[process.env.E2E_ONLY](); console.log('E2E OK (' + process.env.E2E_ONLY + ')'); return; }
  const data = path.join(S, 'data'); fs.rmSync(data, { recursive: true, force: true });
  const app = await _electron.launch({ args: ['--no-sandbox', APP], env: { ...process.env, FMC_DATA_DIR: data, FMC_NO_DEMO: '1' } });
  const page = await app.firstWindow();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => m.type() === 'error' && console.log('[console]', m.text()));
  page.on('dialog', d => d.accept());
  await page.waitForSelector('[data-testid="home"]');
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 });
  // Add model through UI
  await page.hover('text=Tecno'); 
  await page.locator('button[title="Add Tecno model"]').click();
  await page.fill('input[placeholder^="Model name"]', 'Spark 10 (KI5)');
  await page.keyboard.press('Enter');
  await page.waitForSelector('h1:has-text("Spark 10 (KI5)")');
  const modelId = await page.evaluate(async () => (await window.fmc.tree()).models[0].id);
  await page.evaluate(async ([paths, id]) => window.fmc.importFiles({ paths, model_id: id }), [[SM + 'fmc-demo-x1-schematic.pdf', SM + 'fmc-demo-x1.brd', SM + 'fmc-demo-x1-top.jpg'], modelId]);
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
  await page.fill('input[placeholder^="Find part or net"] >> visible=true', 'U3000');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot(page, '06-board-part');
  // click pin row VBUS
  await page.locator('[data-testid="board-info"] tr:has-text("VBUS")').first().click();
  await page.waitForTimeout(500);
  const info = await page.textContent('[data-testid="board-info"]'); assert.match(info, /VBUS\S*\d+ pins on \d+ parts/);
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
  await page.locator('img[alt="fmc-demo-x1-top"]').click();
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
  await app.close();
  await demoRun();
  await formatsRun();
  await licenseRun();
  await toolsRun();
  console.log('E2E OK, screenshots in', S);
})().catch(e => { console.error(e); process.exit(1); });

// Second launch: first-run demo workshop and the v0.2 workbench features.
async function demoRun() {
  const data = path.join(S, 'data-demo'); fs.rmSync(data, { recursive: true, force: true });
  const app = await _electron.launch({ args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', APP], env: { ...process.env, FMC_DATA_DIR: data } });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 940); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => m.type() === 'error' && console.log('[console]', m.text()));
  await page.waitForSelector('[data-testid="demo-banner"]');
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 });
  const tree = await page.evaluate(() => window.fmc.tree());
  const demo = tree.models.filter((m) => m.demo);
  console.log('demo models:', demo.map((m) => `${tree.brands.find((b) => b.id === m.brand_id).name} ${m.name} g${m.guides} r${m.readings} p${m.photos} f${m.files}`));
  assert.equal(demo.length, 4);
  for (const m of demo) { assert.ok(m.guides >= 4 && m.readings >= 20 && m.photos === 1 && m.files === 2); }
  await page.waitForTimeout(300);
  await shot(page, '20-home-dashboard');

  // Board photo with trace layers, net lines and hover card
  assert.equal(await page.locator('[data-testid="device-card"]').count(), 4, 'four demo device cards');
  await openDemo(page, 'photo');
  await page.waitForSelector('[data-testid="netlines-toggle"]', { timeout: 15000 });
  assert.equal(await page.locator('[data-netlines]').count(), 0, 'net lines off by default on photos');
  await page.check('[data-testid="netlines-toggle"]');
  await page.waitForSelector('[data-netlines]');
  await shot(page, '21a-photo-netlines');
  await page.uncheck('[data-testid="netlines-toggle"]');
  const jumpersShown = () => page.locator('[data-jumper] >> visible=true').count();
  const before = await jumpersShown();
  assert.equal(before, 5, 'five non-GND demo jumpers visible by default');
  await page.locator('[data-testid="layer-toggles"] >> visible=true').locator('input[data-layer="gnd"]').check();
  assert.equal(await jumpersShown(), 6, 'GND jumper appears when its layer is on');
  await page.locator('[data-testid="layer-toggles"] >> visible=true').locator('input[data-layer="charging"]').uncheck();
  assert.equal(await jumpersShown(), 5, 'charging jumper hidden');
  await page.locator('[data-testid="layer-toggles"] >> visible=true').locator('input[data-layer="charging"]').check();
  await page.locator('[data-testid="layer-toggles"] >> visible=true').locator('input[data-layer="gnd"]').uncheck();
  const pin = page.locator('[data-pin] >> visible=true').first();
  await pin.hover({ force: true });
  await page.waitForSelector('[data-testid="hover-card"]');
  const card = await page.textContent('[data-testid="hover-card"]');
  console.log('photo hover card:', card);
  assert.match(card, /Diode/); assert.match(card, /Net/);
  await shot(page, '21-photo-layers');

  // Split view: photo + schematic, jump to a component, synced selection
  await page.click('[data-testid="split-btn"]');
  await page.waitForSelector('[data-testid="split-bar"]');
  await page.waitForSelector('.pdfViewer .page canvas, .pdfViewer .page .canvasWrapper', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.fill('[data-testid="jump-input"]', 'U3000');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const pm = await page.locator('[data-testid="pdf-matches"] >> visible=true').first().textContent();
  console.log('split jump pdf matches:', pm);
  assert.match(pm, /of [1-9]/);
  assert.ok(await page.locator('[data-focused] >> visible=true').count() > 0, 'photo pins on U3000 glow');
  // synced zoom: wheel on the photo moves the pdf scale
  const pdfScale = () => page.locator('text=/^\\d+%$/ >> visible=true').first().textContent();
  const s0 = await pdfScale();
  const host = await page.locator('[data-testid="photo-host"] >> visible=true').boundingBox();
  await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  const s1 = await pdfScale();
  console.log('pdf zoom follows photo:', s0, '->', s1);
  assert.notEqual(s0, s1);
  await page.locator('[data-testid="photo-host"] >> visible=true').hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(800);
  await shot(page, '22-split-photo-schematic');

  // Boardview with layers + hover card, split with the photo (zoom/pan sync)
  await page.click('button[title="Close split view"]');
  await openDemo(page, 'board');
  await page.waitForSelector('[data-testid="board-canvas"] >> visible=true');
  await page.waitForTimeout(800);
  const cv = await page.locator('[data-testid="board-canvas"] >> visible=true').boundingBox();
  let found = '';
  for (let gy = 0.3; gy < 0.9 && !found; gy += 0.02) for (let gx = 0.3; gx < 0.7 && !found; gx += 0.01) {
    await page.mouse.move(cv.x + cv.width * gx, cv.y + cv.height * gy);
    if (await page.locator('[data-testid="hover-card"]').count()) found = await page.textContent('[data-testid="hover-card"]');
  }
  console.log('board hover card:', found);
  assert.ok(found, 'hover card on a board pin');
  await shot(page, '23-board-layers-hover');
  // Net facts and schematic cross-links for a selected net
  await page.locator('input[placeholder="Find part or net (Ctrl+F)"] >> visible=true').fill('VBUS_IN');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="net-facts"] >> visible=true');
  await page.waitForSelector('[data-testid="sch-links"]:has-text("Schematic page") >> visible=true', { timeout: 20000 });
  console.log('net facts:', await page.locator('[data-testid="net-facts"] >> visible=true').textContent());
  await page.locator('[data-testid="netlist-btn"] >> visible=true').click();
  const health = await page.locator('[data-testid="board-health"] >> visible=true').textContent();
  console.log('board health:', health);
  assert.match(health, /Parts/);
  assert.ok(await page.locator('[data-testid="net-row"]').count() > 50, 'every net listed');
  await page.locator('[data-testid="netlist-tab-parts"]').click();
  assert.ok(await page.locator('[data-testid="part-row"]').count() > 50, 'every part listed');
  await page.waitForTimeout(400);
  await shot(page, '23b-board-netlist-net');
  await page.locator('[data-testid="netlist-btn"] >> visible=true').click();

  // Workbench tools
  await page.click('[data-testid="brand-home"]');
  await page.click('[data-tool="calculators"]');
  await page.fill('[data-testid="res-code"]', '4702');
  assert.match(await page.textContent('[data-testid="res-result"]'), /47 kΩ/);
  await page.fill('[data-testid="res-code"]', '01C');
  assert.match(await page.textContent('[data-testid="res-result"]'), /10 kΩ/);
  assert.match(await page.textContent('[data-testid="dv-result"]'), /2\.5 V/);
  await shot(page, '24-calculators');
  await page.click('[data-tool="knowledge"]');
  await page.waitForSelector('[data-testid="kb-guide"]');
  await page.fill('[data-testid="kb-search"]', 'backlight');
  await page.waitForTimeout(200);
  await shot(page, '25-knowledge');
  await page.click('[data-tool="ics"]');
  await page.fill('[data-testid="ic-search"]', 'MT6358');
  await page.waitForSelector('td:has-text("MT6358")');
  await page.locator('[data-testid="ic-verify"]').first().click();
  await page.locator('[data-testid="ic-verified"]').first().waitFor();
  await page.click('[data-ic-filter="verified"]');
  assert.ok(await page.locator('[data-testid="ic-row"]').count() >= 1, 'verified filter shows the verified entry');
  await page.click('[data-ic-filter="unverified"]');
  assert.equal(await page.locator('[data-testid="ic-verified"]').count(), 0, 'to-verify filter hides verified entries');
  await page.click('[data-ic-filter="all"]');
  await shot(page, '26-ic-xref');
  await page.click('[data-tool="mirror"]');
  await page.waitForSelector('text=scrcpy');
  await shot(page, '27-mirror');
  await page.click('[data-tool="microscope"]');
  await page.click('[data-testid="cam-start"]');
  await page.waitForSelector('button:has-text("Capture"):not([disabled])', { timeout: 10000 });
  await page.waitForTimeout(800);
  await page.click('[data-testid="cam-check"]');
  await page.waitForSelector('[data-testid="cam-check-result"]');
  const chk = await page.textContent('[data-testid="cam-check-result"]');
  console.log('microscope self-check:', chk);
  assert.match(chk, /Self-check passed.*Frames: arriving.*Capture: OK/);
  assert.match(await page.textContent('[data-testid="cam-actual"]'), /\d+×\d+/);
  await page.click('[data-testid="cam-check-result"] button');
  await page.click('button:has-text("Freeze")');
  await shot(page, '28-microscope');
  await page.click('button:has-text("Capture")');
  await page.waitForSelector('[data-testid="capture-dialog"]');
  await page.locator('[data-testid="capture-dialog"] select').first().selectOption({ index: 1 });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="capture-dialog"] select').nth(1).selectOption({ index: 1 });
  await page.click('[data-testid="capture-dialog"] button:has-text("Save and add readings")');
  await page.waitForSelector('[data-testid="photo-host"] >> visible=true');
  const photos = await page.evaluate(() => window.fmc.listPhotos());
  assert.equal(photos.length, 5, 'microscope capture saved as a photo');
  const withPhoto = (await page.evaluate(() => window.fmc.listGuides())).filter((g) => g.photo_ids.includes(','));
  assert.equal(withPhoto.length, 1, 'capture attached to a fault solution');

  // Remove and reload the demo
  const removed = await page.evaluate(() => window.fmc.removeDemo());
  assert.equal(removed.removed, 4);
  const again = await page.evaluate(() => window.fmc.loadDemo());
  assert.equal(again.added, 4);
  await app.close();
}

async function openDemo(page, what) {
  await page.evaluate(async (what) => {
    const t = await window.fmc.tree();
    const m = t.models.find((x) => x.demo);
    window.__open = what === 'photo' ? (await window.fmc.listPhotos(m.id))[0] : (await window.fmc.listFiles(m.id, 'boardview'))[0];
  }, what);
  await page.click('[data-testid="brand-home"]');
  // Use the Home quick action for boards; photos open from the model's Board Photos page.
  if (what === 'board') { await page.locator('button:has-text("Open boardview")').click(); return; }
  await page.locator('[data-testid="device-card"]').first().click();
  await page.locator('button:has-text("Board Photos") >> nth=-1').click();
  await page.locator('[data-testid="photo-open"], button:has-text("Open")').first().click();
}

// Third launch: import every supported format, themes, AI assistant (test mode), About.
async function formatsRun() {
  const dir = path.join(S, 'formats'); fs.rmSync(dir, { recursive: true, force: true });
  const info = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'write-formats.mjs'), dir]).toString());
  const data = path.join(S, 'data-formats'); fs.rmSync(data, { recursive: true, force: true });
  const app = await _electron.launch({ args: ['--no-sandbox', APP], env: { ...process.env, FMC_DATA_DIR: data, FMC_NO_DEMO: '1', FMC_AI_MOCK: '1' } });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1600, 940); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => m.type() === 'error' && console.log('[console]', m.text()));
  page.on('dialog', d => d.accept());
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 });
  await page.evaluate((k) => window.fmc.setSettings({ xzzKey: k }), info.xzzKey);
  const modelId = await page.evaluate(async () => { const t = await window.fmc.tree(); const b = t.brands.find((x) => x.name === 'Samsung'); return (await window.fmc.addModel(b.id, 'Format Lab')).id; });
  const paths = [...info.files.map((f) => path.join(dir, f)), path.join(dir, 'asc', 'pins.asc'), path.join(dir, 'demo-photo.png'), SM + 'fmc-demo-x1-schematic.pdf', SM + 'fmc-demo-x1-top.jpg'];
  const imported = await page.evaluate(([paths, id]) => window.fmc.importFiles({ paths, model_id: id }), [paths, modelId]);
  console.log('imported:', imported.map((f) => `${f.name}:${f.kind}`).join(', '));
  assert.equal(imported.filter((f) => f.kind === 'boardview').length, 15, 'fifteen boardview files (incl. KiCad, ODB++, GenCAD, Altium and CAD)');
  assert.equal(imported.filter((f) => f.kind === 'photo').length, 2, 'jpg and png photos');
  assert.equal(imported.filter((f) => f.kind === 'schematic').length, 1, 'pdf schematic');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.click('[data-testid="brand-home"]');
  await page.reload();
  await page.waitForSelector('[data-testid="device-card"]');
  await page.locator('[data-testid="device-card"]').first().click();
  await page.locator('button:has-text("BoardView") >> nth=-1').click();
  const results = [];
  for (const f of imported.filter((x) => x.kind === 'boardview')) {
    await page.locator(`button[title="Open"]:has-text("${f.name}")`).click();
    const stats = page.locator('text=/\\d+ parts · \\d+ pins · \\d+ nets/ >> visible=true');
    await stats.waitFor({ timeout: 15000 });
    const t = await stats.textContent();
    results.push(`${f.name} -> ${t}`);
    const m = /(\d+) parts · (\d+) pins · (\d+) nets/.exec(t);
    assert.ok(+m[1] >= 15 && +m[3] >= 10, `${f.name} parsed: ${t}`);
    if (f.name === 'demo-brd.brd') {
      await page.locator('[data-testid="netlist-btn"] >> visible=true').click();
      await page.locator('[data-testid="netlist-tab-path"] >> visible=true').click();
      await page.fill('[data-testid="path-from"]', 'VBAT');
      await page.fill('[data-testid="path-to"]', 'I2C_SCL');
      await page.click('[data-testid="path-go"]');
      const pr = await page.locator('[data-testid="path-result"]').textContent();
      console.log('path VBAT -> I2C_SCL:', pr);
      assert.match(pr, /VBAT.*L1.*PP1V8.*R1.*I2C_SCL/);
      await page.waitForTimeout(500);
      await shot(page, '30-path-tracer');
      // Light theme on the board too
      await page.click('[data-testid="theme-toggle"]');
      await page.waitForTimeout(500);
      await shot(page, '31-path-tracer-light');
      await page.click('[data-testid="theme-toggle"]');
      await page.locator('[data-testid="netlist-btn"] >> visible=true').click();
      // Boardview: computed lines only, until a Gerber copper layer is added.
      assert.equal(await page.locator('[data-testid="copper-state"] >> visible=true').textContent(), 'COMPUTED');
      await page.locator('[data-testid="copper-btn"] >> visible=true').click();
      await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, path.join(dir, 'demo-top.gtl'));
      await page.locator('[data-testid="copper-add"] >> visible=true').click();
      const cm = await page.locator('[data-testid="copper-msg"] >> visible=true').textContent();
      console.log('gerber:', cm);
      assert.match(cm, /lined up on \d+ pads/);
      await page.locator('[data-testid="copper-state"]:has-text("REAL") >> visible=true').waitFor();
      await page.fill('input[placeholder^="Find part or net"] >> visible=true', 'VBUS');
      await page.keyboard.press('Enter');
      await page.locator('[data-testid="net-copper"]:has-text("Real copper") >> visible=true').waitFor();
      await page.waitForTimeout(500);
      await shot(page, '35-gerber-copper');
      // Net tracing: step through the pins of the net, light up the whole rail.
      await page.locator('[data-testid="net-next"] >> visible=true').click();
      await page.locator('[data-testid="net-next"] >> visible=true').click();
      await page.locator('[data-testid="rail-btn"] >> visible=true').click();
      await page.locator('[data-testid="rail-btn"]:has-text("Whole rail on") >> visible=true').waitFor();
      await shot(page, '37-net-rail');
      await page.locator('[data-testid="rail-btn"] >> visible=true').click();
      // Classic look and x-ray from the view menu.
      await page.locator('[data-testid="view-btn"] >> visible=true').click();
      await page.locator('[data-testid="look-classic"] >> visible=true').click();
      await page.locator('[data-testid="xray-toggle"] >> visible=true').check();
      assert.match(await page.locator('[data-testid="view-btn"] >> visible=true').textContent(), /Classic/);
      await shot(page, '38-classic-xray');
      await page.locator('[data-testid="look-real"] >> visible=true').click();
      await page.locator('[data-testid="xray-toggle"] >> visible=true').uncheck();
      await page.keyboard.press('Escape');
    }
    if (f.name === 'demo-gencad.cad' || f.name === 'demo-altium.pcbdoc') {
      assert.match(await page.locator('text=/shapes from file/ >> visible=true').textContent(), /shapes from file/);
    }
    if (f.name === 'demo-kicad.kicad_pcb') {
      assert.equal(await page.locator('[data-testid="copper-state"] >> visible=true').textContent(), 'REAL');
      await page.locator('[data-testid="copper-btn"] >> visible=true').click();
      assert.match(await page.locator('[data-testid="copper-sources"] >> visible=true').textContent(), /This file\s*\d+ real tracks/);
      await page.locator('[data-testid="copper-btn"] >> visible=true').click();
      await page.click('[data-testid="theme-toggle"]');
      await page.waitForTimeout(400);
      await shot(page, '36-kicad-copper-light');
      await page.click('[data-testid="theme-toggle"]');
    }
    await page.locator('[aria-label="Close tab"]').first().click();
  }
  console.log('formats:\n  ' + results.join('\n  '));
  // PDF and PNG open
  await page.locator('button:has-text("Schematics/PDF") >> nth=-1').click();
  await page.locator('button[title="Open"]').first().click();
  await page.waitForSelector('.pdfViewer .page canvas, .pdfViewer .page .canvasWrapper', { timeout: 15000 });
  await page.locator('[aria-label="Close tab"]').first().click();
  const photos = await page.evaluate(() => window.fmc.listPhotos());
  assert.equal(photos.length, 2);

  // Trace real copper on a photo, align the photo with two reading pins, see it on the boardview.
  await page.locator('button:has-text("Board Photos") >> nth=-1').click();
  await page.locator('img[alt="fmc-demo-x1-top"]').click();
  const host = page.locator('[data-testid="photo-host"] >> visible=true');
  await host.waitFor();
  await page.waitForTimeout(600);
  const bb = await page.locator('[data-testid="photo-host"] img >> visible=true').boundingBox();
  const dropPin = async (fx, fy, part, pin) => {
    await page.locator('button[data-tool="pin"] >> visible=true').click();
    await page.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
    const ed = page.locator('[data-testid="pin-editor"] >> visible=true');
    await ed.waitFor();
    await ed.locator('input').nth(0).fill(part); await ed.locator('input').nth(1).fill(pin); await ed.locator('input').nth(1).blur();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
  };
  await dropPin(0.3, 0.3, 'U2', '1');
  await dropPin(0.7, 0.7, 'J1', '1');
  await page.locator('[data-testid="align-btn"] >> visible=true').click();
  assert.match(await page.locator('[data-testid="align-msg"] >> visible=true').textContent(), /Photo aligned/);
  await page.locator('button[data-tool="trace"] >> visible=true').click();
  await page.mouse.click(bb.x + bb.width * 0.35, bb.y + bb.height * 0.5);
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.62);
  await page.keyboard.press('Enter');
  await page.locator('[data-testid="trace-net"] >> visible=true').fill('VBUS');
  await page.locator('[data-testid="trace-net"] >> visible=true').blur();
  await page.waitForTimeout(300);
  await shot(page, '37-photo-trace');
  const jt = await page.evaluate(async () => { const ph = (await window.fmc.listPhotos()).find((x) => x.align); return ph ? (await window.fmc.listJumpers(ph.id)) : []; });
  assert.ok(jt.some((j) => j.kind === 'trace' && j.net === 'VBUS' && j.points.length === 3), 'shop trace saved with its net');
  await page.locator('[aria-label="Close tab"]').first().click();
  await page.locator('button:has-text("BoardView") >> nth=-1').click();
  await page.locator('button[title="Open"]:has-text("demo-brd.brd")').click();
  await page.locator('[data-testid="copper-btn"] >> visible=true').click();
  await page.locator('[data-testid="copper-sources"]:has-text("1 from 1 aligned photo") >> visible=true').waitFor();
  await page.locator('[aria-label="Close tab"]').first().click();

  // Themes: light persists across a reload, dark comes back
  await page.click('[data-testid="brand-home"]');
  await page.click('[data-testid="theme-toggle"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.reload();
  await page.waitForSelector('[data-testid="home"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme persists');
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 });
  await page.waitForTimeout(900);
  await shot(page, '32-home-light');
  assert.ok((await page.textContent('[data-testid="continue-card"]')).includes('demo-brd.brd'), 'continue card shows the last document');
  await page.locator('[data-testid="continue-card"] button').first().click();
  await page.waitForSelector('[data-testid="board-canvas"] >> visible=true', { timeout: 15000 });
  await page.locator('[aria-label="Close tab"]').first().click();
  await page.click('[data-testid="view-list"]');
  assert.equal(await page.locator('[data-testid="device-row"]').count(), 1);
  await page.click('[data-testid="view-grid"]');
  await page.fill('[data-testid="device-search"]', 'zzz');
  assert.equal(await page.locator('[data-testid="device-card"]').count(), 0);
  await page.fill('[data-testid="device-search"]', '');
  await page.click('button[title="Settings and offline storage"]');
  await page.click('[data-theme-option="dark"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.keyboard.press('Escape');

  // AI assistant in test mode: runs the tool loop against the real board
  await page.click('[data-tool="ai"]');
  await page.waitForSelector('[data-testid="ai-tool"]');
  await page.fill('[data-testid="ai-input"]', 'Phone not charging, where do I start?');
  await page.click('[data-testid="ai-send"]');
  await page.waitForSelector('[data-testid="ai-answer"]', { timeout: 20000 });
  const ans = await page.textContent('[data-testid="ai-answer"]');
  console.log('AI (test mode):', ans);
  assert.match(ans, /AI suggestion/);
  assert.match(ans, /Board has \d+ nets and \d+ parts/);
  await page.waitForTimeout(500);
  await shot(page, '33-ai-assistant');

  // About / branding
  await page.click('[data-testid="about-btn"]');
  assert.match(await page.textContent('[data-testid="about"] >> xpath=..'), /ERA Technologiz and Engineering Services/);
  await shot(page, '34-about');
  await page.keyboard.press('Escape');
  assert.match(await page.textContent('[data-testid="statusbar"]'), /Ready.*FixMyCircuit v0\.4/);
  await app.close();
}

// Fourth part: offline licence keys. Uses a throwaway signing key, a fixed
// machine ID and a moved clock (all honoured only when running from source).
async function licenseRun() {
  const crypto = require('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const mkKey = (m, e, n = 'Test Shop') => {
    const pl = b64u(JSON.stringify({ v: 1, m, n, p: '30 days', i: '2026-01-01', e }));
    return `FMC1-${pl}.${b64u(crypto.sign(null, Buffer.from(pl), privateKey))}`;
  };
  const data = path.join(S, 'data-lic'); fs.rmSync(data, { recursive: true, force: true });
  const open = async (now) => {
    const app = await _electron.launch({ args: ['--no-sandbox', APP], env: { ...process.env, FMC_DATA_DIR: data, FMC_NO_DEMO: '1', FMC_LICENSE_PUBKEY: pub, FMC_MACHINE_ID: 'e2e-pc', FMC_NOW: now } });
    const page = await app.firstWindow();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.waitForSelector('[data-testid="home"], [data-testid="activation"]');
    return { app, page };
  };
  // Day 1 of the trial.
  let { app, page } = await open('2026-01-01T09:00:00Z');
  await page.waitForSelector('[data-testid="license-banner"]');
  assert.match(await page.textContent('[data-testid="license-banner"]'), /Free trial: 7 days left/);
  assert.match(await page.textContent('[data-testid="status-license"]'), /Trial · 7d left/);
  await app.close();
  // Trial over: the app locks and shows the activation screen.
  ({ app, page } = await open('2026-01-20T09:00:00Z'));
  await page.waitForSelector('[data-testid="activation"]');
  const mid = (await page.textContent('[data-testid="machine-id"]')).trim();
  assert.match(mid, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  const blocked = await page.evaluate(async () => { try { await window.fmc.tree(); return 'open'; } catch (e) { return String(e.message || e); } });
  assert.notEqual(blocked, 'open', 'data is locked while unlicensed');
  await shot(page, '40-activation');
  const tryKey = async (k) => { await page.fill('[data-testid="license-key"]', k); await page.click('[data-testid="license-activate"]'); await page.waitForSelector('[data-testid="license-msg"], [data-testid="home"]'); return page.locator('[data-testid="license-msg"]').count().then((n) => n ? page.textContent('[data-testid="license-msg"]') : 'home'); };
  assert.match(await tryKey(mkKey('AAAA-BBBB-CCCC-DDDD', '2026-03-01')), /another computer/);
  assert.match(await tryKey(mkKey(mid, '2026-01-10')), /already expired/);
  assert.match(await tryKey(mkKey(mid, '2026-03-01').slice(0, -6) + 'AAAAAA'), /not valid/);
  assert.match(await tryKey('hello'), /start with FMC1-/);
  await tryKey(mkKey(mid, '2026-03-01'));
  await page.waitForSelector('[data-testid="home"]');
  assert.equal(await page.locator('[data-testid="license-banner"]').count(), 0, 'no banner when licensed');
  assert.match(await page.textContent('[data-testid="status-license"]'), /Licensed · 40d left/);
  const st = await page.evaluate(() => window.fmc.getSettings());
  assert.equal(st.licenseKey, undefined, 'key is not readable through settings');
  await app.close();
  // Last week: warning banner. Then grace, then locked.
  ({ app, page } = await open('2026-02-25T09:00:00Z'));
  await page.waitForSelector('[data-testid="license-banner"]');
  assert.match(await page.textContent('[data-testid="license-banner"]'), /expires on 2026-03-01 \(4 days left\)/);
  await shot(page, '41-license-warning');
  await page.click('[data-testid="license-banner"] button');
  await page.waitForSelector('[data-testid="license-settings"]');
  assert.match(await page.textContent('[data-testid="license-settings"]'), /Licensed · 4 days left/);
  await shot(page, '42-license-settings');
  await app.close();
  ({ app, page } = await open('2026-03-03T09:00:00Z'));
  await page.waitForSelector('[data-testid="license-banner"]');
  assert.match(await page.textContent('[data-testid="license-banner"]'), /keeps working until 2026-03-04/);
  await app.close();
  ({ app, page } = await open('2026-03-10T09:00:00Z'));
  await page.waitForSelector('[data-testid="activation"]');
  assert.match(await page.textContent('[data-testid="activation"]'), /expired on 2026-03-01/);
  await app.close();
  // Turning the clock back does not unlock it.
  ({ app, page } = await open('2026-02-01T09:00:00Z'));
  await page.waitForSelector('[data-testid="activation"]');
  assert.match(await page.textContent('[data-testid="activation"]'), /date looks wrong/);
  // A renewal key unlocks it again.
  await tryKey(mkKey(mid, '2026-06-30'));
  await page.waitForSelector('[data-testid="home"]');
  await app.close();
  console.log('licence flow OK, machine', mid);
}

// Tool manager: a missing scrcpy is installed from a (local, mocked) GitHub
// release, and only when the download matches the published SHA-256.
async function toolsRun() {
  const http = require('http'); const crypto = require('crypto');
  const zip = (files) => { // stored (uncompressed) zip
    const parts = [], central = []; let off = 0;
    const crc32 = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
    for (const [name, text] of Object.entries(files)) {
      const data = Buffer.from(text), nb = Buffer.from(name), crc = crc32(data);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
      parts.push(lh, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
    }
    const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat([...parts, cd, end]);
  };
  const pkg = zip({ 'scrcpy-win64-v9.9/scrcpy': '#!/bin/sh\necho scrcpy 9.9\n', 'scrcpy-win64-v9.9/adb': '#!/bin/sh\necho "List of devices attached"\n', 'scrcpy-win64-v9.9/README.txt': 'synthetic test package' });
  let digest = 'sha256:' + '0'.repeat(64); // wrong at first
  const srv = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (req.url === '/repos/Genymobile/scrcpy/releases/latest') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ tag_name: 'v9.9', body: '', assets: [{ name: 'scrcpy-win64-v9.9.zip', digest, browser_download_url: base + '/dl/scrcpy-win64-v9.9.zip' }] })); return; }
    if (req.url === '/dl/scrcpy-win64-v9.9.zip') { res.end(pkg); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const data = path.join(S, 'data-tools'); fs.rmSync(data, { recursive: true, force: true });
  const app = await _electron.launch({ args: ['--no-sandbox', APP], env: { ...process.env, PATH: '/usr/bin:/bin', FMC_DATA_DIR: data, FMC_NO_DEMO: '1', FMC_GITHUB_API: `http://127.0.0.1:${srv.address().port}` } });
  const page = await app.firstWindow();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.waitForSelector('[data-testid="home"]');
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 });
  await page.click('[data-tool="mirror"]');
  await page.waitForSelector('[data-testid="tools-missing"]');
  await page.click('[data-testid="tools-install-missing"]');
  await page.locator('[data-testid="tool-scrcpy"] [data-testid="tool-msg"]:has-text("checksum")').waitFor();
  assert.match(await page.textContent('[data-testid="tool-scrcpy"] [data-testid="tool-msg"]'), /does not match the official checksum/);
  assert.match(await page.textContent('[data-testid="tool-scrcpy"] [data-testid="tool-state"]'), /Missing/);
  digest = 'sha256:' + crypto.createHash('sha256').update(pkg).digest('hex');
  await page.click('[data-testid="tools-install-missing"]');
  await page.locator('[data-testid="tool-scrcpy"] [data-testid="tool-state"]:has-text("Installed by FixMyCircuit")').waitFor();
  assert.match(await page.textContent('[data-testid="tool-adb"] [data-testid="tool-state"]'), /Installed by FixMyCircuit/);
  assert.ok(fs.existsSync(path.join(data, 'profile', 'tools', 'scrcpy', 'scrcpy')), 'unpacked into the tools folder');
  assert.match(await page.textContent('[data-testid="ios-limits"]'), /View only/);
  await shot(page, '43-tools-mirror');
  await page.click('button[title="Settings and offline storage"]');
  await page.waitForSelector('[data-testid="tools-settings"]');
  assert.match(await page.textContent('[data-testid="tools-settings"]'), /Gerber, ODB\+\+ and KiCad import are built in/);
  await app.close();
  srv.close();
  console.log('tool manager OK');
}

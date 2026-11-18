import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharePack, readSharePack, checkSharePack, DECLARATION } from '../src/shared/sharepack.mjs';
import { zipStore, unzip } from '../src/shared/zipstore.mjs';
import { deflateRawSync } from 'node:zlib';

const photo = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const base = {
  brand: 'Tecno', series: 'Spark', model: 'Spark 20 (KJ5)', contributor: 'Tunde', contact: '0800', declaration: true,
  files: [{ name: 'top.jpg', kind: 'photo', data: photo }],
  notes: {
    photos: [{ file: 'top.jpg', title: 'Top', side: 'top', align: '' }],
    guides: [{ title: 'Not charging', photos: ['top.jpg'] }],
    readings: [{ type: 'diode', part: 'U2', pin: '1', net: 'VBUS', value: '0.452', photo: 'top.jpg', x: 0.4, y: 0.5 }, { type: 'voltage', net: 'VBAT', value: '3.8', photo: null }],
    jumpers: [{ photo: 'top.jpg', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
  },
};

test('zip round trip, stored and deflated', () => {
  const z = zipStore([{ name: 'a/b.txt', data: 'hello' }, { name: 'c.bin', data: photo }]);
  const back = unzip(z);
  assert.equal(new TextDecoder().decode(back[0].data), 'hello');
  assert.deepEqual([...back[1].data], [...photo]);
  // Hand-made deflate entry (what Windows "Send to zip" produces).
  const data = Buffer.from('compressed text '.repeat(20));
  const comp = deflateRawSync(data);
  const name = Buffer.from('d.txt');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  const cd = Buffer.concat([ch, name]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(30 + name.length + comp.length, 16);
  const d = unzip(new Uint8Array(Buffer.concat([lh, name, comp, cd, end])));
  assert.equal(Buffer.from(d[0].data).toString(), data.toString());
});

test('a share pack carries the declaration, CC BY-SA licence and notes linked to photos', () => {
  const { zip } = buildSharePack(base);
  const pack = readSharePack(zip);
  assert.equal(pack.dir, 'Tecno/Spark/Spark 20 (KJ5)');
  assert.equal(pack.meta.license.spdx, 'CC-BY-SA-4.0');
  assert.equal(pack.meta.contribution.declaration, DECLARATION);
  assert.equal(pack.meta.source.contributor, 'Tunde');
  assert.equal(pack.notes.readings[0].photo, 'top.jpg');
  assert.deepEqual(pack.files.map((f) => f.name), ['top.jpg']);
  assert.deepEqual(checkSharePack(pack), { ok: true, errors: [], warnings: [] });
});

test('no pack without the declaration or a name', () => {
  assert.throws(() => buildSharePack({ ...base, declaration: false }), /confirm/);
  assert.throws(() => buildSharePack({ ...base, contributor: ' ' }), /name/);
});

test('reviewer refuses manufacturer-style board files unless checked, and tampered declarations', () => {
  const withBoard = readSharePack(buildSharePack({ ...base, files: [...base.files, { name: 'KJ5.pcb', kind: 'board', data: photo }] }).zip);
  assert.equal(checkSharePack(withBoard).ok, false);
  assert.match(checkSharePack(withBoard).errors.join(), /KJ5\.pcb/);
  assert.equal(checkSharePack(withBoard, { allowBoards: true }).ok, true);
  const tampered = readSharePack(buildSharePack(base).zip);
  tampered.meta.contribution.declaration = 'whatever';
  assert.equal(checkSharePack(tampered).ok, false);
});

test('duplicate file names are made unique and notes follow the rename', () => {
  const p = buildSharePack({ ...base, files: [base.files[0], { name: 'TOP.jpg', kind: 'photo', data: photo }] });
  assert.deepEqual(p.meta.files.map((f) => f.path), ['top.jpg', 'TOP-2.jpg', 'shop-notes.json']);
});

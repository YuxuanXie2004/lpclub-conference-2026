'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), sharp = require('sharp');
const { mysqlFixture, insertRegistration } = require('./helpers/mysql');
const { createMaterialService } = require('../server/materials');
const integration = (name, fn) => test(name, { skip: process.env.RUN_MYSQL_TESTS !== '1' }, fn);
async function fixture(t) {
  const { db, env: mysqlEnv } = await mysqlFixture(t), root = await fs.mkdtemp(path.join(os.tmpdir(), 'lp-showcase-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...mysqlEnv, MATERIALS_ENABLED: 'true', PUBLIC_BASE_URL: 'https://example.com/conference/', MATERIALS_SIGNING_KEY: 'a'.repeat(40), MATERIALS_STORAGE_DIR: path.join(root, 'originals'), MATERIALS_CACHE_DIR: path.join(root, 'cache') };
  const materials = createMaterialService({ db, env });
  const file = { buffer: await sharp({ create: { width: 40, height: 20, channels: 3, background: '#345678' } }).png().toBuffer(), filename: 'image.png', mimeType: 'image/png' };
  async function registration(status = 'Approved') {
    const row = await insertRegistration(db, { status }); row.option_id = 'speaking';
    await db.query("UPDATE registrations SET option_id='speaking',company='Fund',job_title='Partner' WHERE id=?", [row.id]);
    await db.transaction(tx => materials.initialize(tx, { materialPreferences: { portraitConsent: true, logoConsent: true } }, row));
    return row;
  }
  async function approve(row, kind = 'portrait') {
    const state = await materials.upload(row.ref, kind, file);
    return materials.review(row.ref, { kind, version: state.assets[kind].version, rowVersion: state.assets[kind].rowVersion, decision: 'approve' });
  }
  return { db, env, materials, file, registration, approve, showcase: () => require('../server/showcase').createShowcaseService({ db, env, materials }) };
}
for (const kind of ['portrait', 'logo']) integration('MySQL manual '+kind+' uploads publish only on save and share ordering with registrations', async t => {
  const f=await fixture(t),s=f.showcase(),before=await s.board(kind);
  const {item}=await s.upload(kind,f.file);
  assert.equal(item.source,'manual');assert.equal(item.ref,'');assert.equal(item.eligible,true);
  assert.equal((await s.candidates(kind)).total,0,'Manual uploads never enter the candidate library');
  assert.equal((await f.db.query('SELECT id FROM registrations')).length,0);
  assert.equal((await s.board(kind)).revision,before.revision);assert.equal((await s.board(kind)).items.length,0);
  const section=kind==='portrait'?'speakers':'organisations';assert.equal((await f.materials.showcase())[section].length,0);
  await assert.rejects(f.materials.publicMedia(item.entryId,1),e=>e.statusCode===404);
  const preview=await s.preview(kind,item.entryId);assert.equal(preview.mimeType,'image/webp');
  assert.equal((await sharp(preview.buffer).metadata()).width,40);
  await assert.rejects(s.preview(kind==='portrait'?'logo':'portrait',item.entryId),e=>e.statusCode===404);
  await assert.rejects(s.save(kind,{revision:before.revision,items:[item]}),e=>e.statusCode===400);
  const row=await f.registration();await f.approve(row,kind);
  const registered=(await s.candidates(kind,{q:row.ref})).rows[0];
  const input={...item,name:'Manual Guest',company:'Manual Fund',title:'Partner',crop:{x:.3,y:.6,zoom:1.5}};
  let board=await s.save(kind,{revision:before.revision,items:[input,registered]});
  assert.deepEqual(board.items.map(x=>x.entryId),[item.entryId,registered.entryId]);
  assert.deepEqual((await f.materials.showcase())[section].map(x=>x.id),[item.entryId,registered.entryId]);
  const media=await f.materials.publicMedia(item.entryId,1),dimensions=await sharp(media.buffer).metadata();
  assert.equal(dimensions.width,kind==='portrait'?500:840);assert.equal(dimensions.height,kind==='portrait'?600:504);
  await assert.rejects(s.save(kind,{revision:before.revision,items:[input]}),e=>e.statusCode===409);
  await assert.rejects(s.save(kind,{revision:board.revision,items:[{...input,materialRevision:999}]}),e=>e.statusCode===409);
  assert.equal((await s.board(kind)).items.length,2);
  board=await s.save(kind,{revision:board.revision,items:[...board.items].reverse()});
  assert.deepEqual((await f.materials.showcase())[section].map(x=>x.id),[registered.entryId,item.entryId]);
  assert.equal((await s.candidates(kind,{q:'Manual Fund'})).total,0);
  const pages=await Promise.all([1,2].map(page=>s.candidates(kind,{page,pageSize:1})));
  assert.equal(pages[0].total,1);assert.deepEqual(pages.flatMap(p=>p.rows.map(x=>x.entryId)),[registered.entryId]);
  await s.save(kind,{revision:board.revision,items:board.items.filter(x=>x.entryId!==item.entryId)});
  await assert.rejects(f.materials.publicMedia(item.entryId,1),e=>e.statusCode===404);
  assert.equal((await s.candidates(kind,{q:'Manual Fund'})).total,0);
});
integration('MySQL manual uploads reject invalid images and a failed mixed save rolls back both sources',async t=>{
 const f=await fixture(t),s=f.showcase();
 for(const file of [{...f.file,buffer:Buffer.from('bad')},{...f.file,mimeType:'image/svg+xml'},{...f.file,buffer:Buffer.alloc(5*1024*1024+1)}])await assert.rejects(s.upload('portrait',file),e=>[400,413].includes(e.statusCode));
 assert.equal((await f.db.query('SELECT id FROM material_files')).length,0);
 const {item}=await s.upload('portrait',f.file),row=await f.registration();await f.approve(row);
 const candidate=(await s.candidates('portrait',{q:row.ref})).rows[0];
 const brokenDb={query:f.db.query,transaction:work=>f.db.transaction(tx=>work({query:async(sql,args)=>{if(sql.startsWith('UPDATE showcase_entries SET enabled=1'))throw Error('Injected failure');return tx.query(sql,args);}}))};
 const broken=require('../server/showcase').createShowcaseService({db:brokenDb,env:f.env,materials:f.materials});
 await assert.rejects(broken.save('portrait',{revision:1,items:[{...item,name:'Manual',company:'',title:''},candidate]}),/Injected failure/);
 assert.equal((await s.board('portrait')).revision,1);assert.equal((await s.board('portrait')).items.length,0);
 assert.equal((await f.materials.showcase()).speakers.length,0);
});
integration('MySQL manual saves have one concurrent winner and public images recheck removal after reading',async t=>{
 const f=await fixture(t),s=f.showcase(),{item}=await s.upload('portrait',f.file);
 const items=[{...item,name:'Manual',title:'',company:''}];
 const outcomes=await Promise.allSettled([s.save('portrait',{revision:1,items}),s.save('portrait',{revision:1,items})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.statusCode,409);
 await f.materials.publicMedia(item.entryId,1);
 let reads=0;const board=await s.board('portrait');
 const concurrentDb={transaction:f.db.transaction,query:async(sql,args)=>{const result=await f.db.query(sql,args);if(sql.includes('AND s.id=?')&&++reads===1)await s.save('portrait',{revision:board.revision,items:[]});return result;}};
 const concurrent=createMaterialService({db:concurrentDb,env:f.env});
 await assert.rejects(concurrent.publicMedia(item.entryId,1),e=>e.statusCode===404);assert.equal(reads,2);
});
integration('MySQL quality approval never publishes and admission or consent do not block review', async t => {
  const f = await fixture(t), row = await f.registration('Received');
  await f.materials.setConsents(row.ref, { portrait: false });
  const reviewed = await f.approve(row);
  assert.equal(reviewed.assets.portrait.status, 'approved');
  assert.ok(reviewed.assets.portrait.approvedVersionId);
  assert.equal((await f.materials.showcase()).speakers.length, 0);
  const candidates = await f.showcase().candidates('portrait');
  assert.equal(candidates.total, 1); assert.equal(candidates.rows[0].eligible, false);
  assert.deepEqual(candidates.rows[0].blockedReasons, ['ADMISSION_PENDING', 'CONSENT_REQUIRED']);
});
integration('MySQL board saves ordered snapshots atomically and config edits stay draft until publication', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration();
  await f.approve(a); await f.approve(b);
  const s = f.showcase(), candidates = (await s.candidates('portrait')).rows;
  let board = await s.save('portrait', { revision: (await s.board('portrait')).revision, items: candidates.map(x => ({ ...x, name: 'Published ' + x.ref, crop: { x: .2, y: .8 } })) });
  assert.equal(board.items.length, 2);
  const before = await f.materials.adminList(a.ref);
  await f.materials.configure(a.ref, { rowVersion: before[0].rowVersion, name: 'Draft only' });
  assert.equal((await f.materials.showcase()).speakers.find(x => x.id === candidates.find(x => x.ref === a.ref).entryId).name, 'Published ' + a.ref);
  await assert.rejects(s.save('portrait', { revision: board.revision, items: board.items }), e => e.statusCode === 409);
  board = await s.board('portrait');
  const fresh = (await s.candidates('portrait')).rows;
  const published = await s.save('portrait', { revision: board.revision, items: [fresh.find(x => x.ref === b.ref), fresh.find(x => x.ref === a.ref)] });
  assert.deepEqual(published.items.map(x => x.ref), [b.ref, a.ref]);
  await assert.rejects(s.save('portrait', { revision: published.revision, items: [published.items[0], published.items[0]] }), e => e.statusCode === 400);
  assert.equal((await s.board('portrait')).items.length, 2);
});
integration('MySQL pending replacements retain approved candidate and old publication; consent withdrawal invalidates saved boards', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row);
  const s = f.showcase(); let candidate = (await s.candidates('portrait')).rows[0];
  let board = await s.save('portrait', { revision: 1, items: [candidate] });
  await f.materials.upload(row.ref, 'portrait', f.file);
  candidate = (await s.candidates('portrait')).rows[0]; assert.equal(candidate.version, 1); assert.equal(candidate.hasNewVersion, false);
  const state = await f.materials.me(row.ref);
  await f.materials.review(row.ref, { kind: 'portrait', version: 2, rowVersion: state.assets.portrait.rowVersion, decision: 'approve' });
  board = await s.board('portrait'); assert.equal(board.items[0].version, 1); assert.equal(board.items[0].hasNewVersion, true);
  const preview = await f.materials.preview(row.ref, 'portrait', { versionId: candidate.versionId, fit: 'contain' });
  assert.equal((await sharp(preview.buffer).metadata()).width, 40); assert.equal((await sharp(preview.buffer).metadata()).height, 20);
  await f.materials.setConsents(row.ref, { portrait: false }); await f.materials.setConsents(row.ref, { portrait: true });
  assert.ok((await s.board('portrait')).revision > board.revision);
  await assert.rejects(s.save('portrait', { revision: board.revision, items: board.items }), e => e.statusCode === 409);
  assert.equal((await f.materials.showcase()).speakers.length, 0);
});
integration('MySQL owner notes require fresh registration revisions and removal clears approved pointer', async t => {
  const f = await fixture(t), row = await f.registration(); const approved = await f.approve(row);
  const updated = await f.materials.setOwner(row.ref, { owner: 'Review team', note: 'Call tomorrow', rowVersion: approved.rowVersion });
  assert.equal(updated.followUpNote, 'Call tomorrow'); assert.equal(typeof updated.mobile, 'string');
  await assert.rejects(f.materials.setOwner(row.ref, { owner: 'Stale', note: '', rowVersion: approved.rowVersion }), e => e.statusCode === 409);
  await f.materials.remove(row.ref, 'portrait');
  assert.equal((await f.materials.me(row.ref)).assets.portrait.approvedVersionId, null);
});
integration('MySQL rejecting a displayed historical version removes it and latest approval falls back correctly', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row);
  const s = f.showcase(), first = (await s.candidates('portrait')).rows[0];
  await s.save('portrait', { revision: 1, items: [first] }); await f.approve(row);
  let state = await f.materials.me(row.ref);
  await f.materials.review(row.ref, { kind: 'portrait', version: 1, rowVersion: state.assets.portrait.rowVersion, decision: 'reject', reason: 'Incorrect image' });
  assert.equal((await s.board('portrait')).items.length, 0); assert.equal((await s.candidates('portrait')).rows[0].version, 2);
  await f.approve(row);
  state = await f.materials.me(row.ref);
  await f.materials.review(row.ref, { kind: 'portrait', version: 3, rowVersion: state.assets.portrait.rowVersion, decision: 'reject', reason: 'Blurry' });
  assert.equal((await s.candidates('portrait')).rows[0].version, 2);
});
integration('MySQL logo grouping uses registration references and replaces representatives without transient unique failure', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration(); await f.approve(a, 'logo'); await f.approve(b, 'logo');
  const s = f.showcase(), candidates = (await s.candidates('logo')).rows, ca = candidates.find(x => x.ref === a.ref), cb = candidates.find(x => x.ref === b.ref);
  let board = await s.save('logo', { revision: 1, items: [ca] });
  board = await s.save('logo', { revision: board.revision, items: [{ ...cb, organisationRef: a.ref }] });
  assert.equal(board.items[0].ref, b.ref); assert.equal(board.items[0].organisationRef, a.ref);
  const fresh = (await s.candidates('logo')).rows;
  await assert.rejects(s.save('logo', { revision: board.revision, items: fresh }), e => e.statusCode === 409);
  assert.equal((await s.board('logo')).items[0].ref, b.ref);
});

integration('MySQL portrait and logo crops retain zoom, keep draft edits private and render the saved rectangle', async t => {
 const f=await fixture(t),row=await f.registration(),s=f.showcase();
 f.file.buffer=await sharp({create:{width:420,height:180,channels:3,background:'#ff0000'}}).composite([{input:await sharp({create:{width:210,height:180,channels:3,background:'#0000ff'}}).png().toBuffer(),left:210,top:0}]).png().toBuffer();
 for(const kind of ['portrait','logo']){
  await f.approve(row,kind);
  let candidate=(await s.candidates(kind)).rows.find(x=>x.ref===row.ref);
  let board=await s.save(kind,{revision:(await s.board(kind)).revision,items:[candidate]});
  const original=await f.materials.publicMedia(candidate.entryId,1);
  const edit={x:1,y:.5,zoom:3},state=(await f.materials.adminList(row.ref))[0];
  await f.materials.configure(row.ref,{rowVersion:state.rowVersion,crop:{[kind]:edit}});
  assert.deepEqual((await f.materials.publicMedia(candidate.entryId,1)).buffer,original.buffer,'Draft crop must not update public bytes');
  candidate=(await s.candidates(kind)).rows.find(x=>x.ref===row.ref);
  board=await s.save(kind,{revision:(await s.board(kind)).revision,items:[{...candidate,crop:edit}]});
  assert.deepEqual(board.items[0].crop,edit);
  assert.deepEqual((await f.showcase().board(kind)).items[0].crop,edit,'A fresh service reads the saved crop');
  const rendered=await f.materials.publicMedia(candidate.entryId,1),raw=await sharp(rendered.buffer).raw().toBuffer({resolveWithObject:true});
  assert.equal(raw.info.width,kind==='portrait'?500:840);assert.equal(raw.info.height,kind==='portrait'?600:504);
  for(let i=0;i<raw.data.length;i+=raw.info.channels)assert(raw.data[i+2]>raw.data[i]+100);
  await assert.rejects(s.save(kind,{revision:board.revision,items:[{...board.items[0],crop:{...edit,zoom:9}}]}),error=>error.statusCode===400);
 }
});
integration('MySQL lifecycle invalidates board revision and concurrent saves produce a single winner', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row);
  const s = f.showcase(), candidate = (await s.candidates('portrait')).rows[0];
  const outcomes = await Promise.allSettled([s.save('portrait', { revision: 1, items: [candidate] }), s.save('portrait', { revision: 1, items: [candidate] })]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1); assert.equal(outcomes.find(x => x.status === 'rejected').reason.statusCode, 409);
  const before = await s.board('portrait');
  const registrations = require('../server/registration-service').createRegistrationService({ db: f.db });
  await registrations.lifecycle('status', { ref: row.ref, status: 'Cancelled', rowVersion: (await f.materials.me(row.ref)).rowVersion });
  assert.equal((await s.board('portrait')).items.length, 0); assert.ok((await s.board('portrait')).revision > before.revision);
  await assert.rejects(s.save('portrait', { revision: before.revision, items: before.items }), e => e.statusCode === 409);
  assert.equal((await s.candidates('portrait')).total, 0);
});
integration('MySQL candidates paginate and search in SQL; version preview cannot cross registrations or show deleted bytes', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration(); await f.approve(a); await f.approve(b);
  const s = f.showcase(), first = await s.candidates('portrait', { page: 1, pageSize: 1 }), second = await s.candidates('portrait', { page: 2, pageSize: 1 });
  assert.equal(first.total, 2); assert.equal(second.rows.length, 1); assert.notEqual(first.rows[0].entryId, second.rows[0].entryId);
  assert.equal((await s.candidates('portrait', { q: a.ref })).total, 1);
  const candidate = (await s.candidates('portrait', { q: a.ref })).rows[0];
  await assert.rejects(f.materials.preview(b.ref, 'portrait', { versionId: candidate.versionId, fit: 'contain' }), e => e.statusCode === 404);
  await f.materials.remove(a.ref, 'portrait');
  await assert.rejects(f.materials.preview(a.ref, 'portrait', { versionId: candidate.versionId, fit: 'contain' }), e => e.statusCode === 404);
});
integration('MySQL legacy bilingual drafts and publication normalize using registration language', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row);
  await f.db.query("UPDATE registrations SET language='zh' WHERE id=?", [row.id]);
  const config = { draft: { name: { en: 'Jane', zh: '小张' }, title: { en: 'Partner', zh: '' }, company: {} }, published: null };
  await f.db.query('UPDATE showcase_entries s JOIN material_items m ON m.id=s.item_id SET config_json=? WHERE m.registration_id=?', [JSON.stringify(config), row.id]);
  const candidate = (await f.showcase().candidates('portrait')).rows[0];
  assert.equal(candidate.name, '小张'); assert.equal(candidate.title, 'Partner'); assert.equal(candidate.company, 'Fund');
  await f.showcase().save('portrait', { revision: 1, items: [candidate] });
  assert.equal((await f.materials.showcase()).speakers[0].name, '小张');
  const view = (await f.materials.adminList(row.ref))[0]; assert.equal(view.config.name, '小张'); assert.equal(typeof view.publications.portrait.name, 'string');
});
integration('MySQL board mutation errors roll back the entire replacement and allow empty publication', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration(); await f.approve(a); await f.approve(b);
  const s = f.showcase(), candidates = (await s.candidates('portrait')).rows;
  const before = await s.save('portrait', { revision: 1, items: candidates });
  const brokenDb = { query: f.db.query, transaction: work => f.db.transaction(tx => work({ query: async (sql, args) => { if (sql.startsWith('UPDATE showcase_entries SET enabled=1')) throw Error('Injected write failure'); return tx.query(sql, args); } })) };
  const broken = require('../server/showcase').createShowcaseService({ db: brokenDb, env: f.env, materials: f.materials });
  await assert.rejects(broken.save('portrait', { revision: before.revision, items: before.items.slice().reverse() }), /Injected write failure/);
  assert.deepEqual(await s.board('portrait'), before);
  const empty = await s.save('portrait', { revision: before.revision, items: [] }); assert.equal(empty.items.length, 0); assert.equal((await f.materials.showcase()).speakers.length, 0);
});
integration('MySQL published cards offer explicit newer draft text and board save adopts the selected draft', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row); await f.approve(row, 'logo');
  const s = f.showcase(); await s.save('portrait', { revision: 1, items: (await s.candidates('portrait')).rows });
  await f.materials.configure(row.ref, { rowVersion: (await f.materials.me(row.ref)).rowVersion, name: 'Updated name', company: 'New fund' });
  let board = await s.board('portrait');
  assert.equal(board.items[0].hasTextChanges, true); assert.equal(board.items[0].draftText.name, 'Updated name'); assert.notEqual(board.items[0].name, 'Updated name');
  board = await s.save('portrait', { revision: board.revision, items: board.items.map(item => ({ ...item, ...item.draftText })) });
  assert.equal(board.items[0].hasTextChanges, false); assert.equal(board.items[0].name, 'Updated name');
  assert.equal((await s.candidates('logo')).rows[0].name, 'Updated name');
  assert.equal((await s.candidates('logo')).rows[0].company, 'New fund');
});
integration('MySQL reordering preserves unadopted draft text and saving one kind leaves the other kind revision unchanged', async t => {
  const f = await fixture(t), row = await f.registration(); await f.approve(row); await f.approve(row, 'logo');
  const s = f.showcase(); let board = await s.save('portrait', { revision: 1, items: (await s.candidates('portrait')).rows });
  await f.materials.configure(row.ref, { rowVersion: (await f.materials.me(row.ref)).rowVersion, name: 'Waiting for explicit adoption' });
  const logoBefore = (await s.candidates('logo')).rows[0]; board = await s.board('portrait');
  board = await s.save('portrait', { revision: board.revision, items: board.items });
  assert.equal(board.items[0].hasTextChanges, true); assert.equal(board.items[0].draftText.name, 'Waiting for explicit adoption');
  const logoAfter = (await s.candidates('logo')).rows[0]; assert.equal(logoAfter.materialRevision, logoBefore.materialRevision);
  assert.equal(logoAfter.name, logoBefore.name);
});
for (const state of ['Cancelled', 'Rejected', 'deleted']) integration('MySQL existing logo grouping survives anchor ' + state + ' while new assignments are rejected', async t => {
  const f = await fixture(t), a = await f.registration(), b = await f.registration(), c = await f.registration();
  for (const row of [a, b, c]) await f.approve(row, 'logo');
  const s = f.showcase(), candidates = (await s.candidates('logo')).rows;
  await s.save('logo', { revision: 1, items: [
    { ...candidates.find(item => item.ref === b.ref), organisationRef: a.ref },
    candidates.find(item => item.ref === c.ref)
  ] });
  const registrations = require('../server/registration-service').createRegistrationService({ db: f.db });
  const rowVersion = (await f.materials.me(a.ref)).rowVersion;
  if (state === 'deleted') await registrations.lifecycle('delete', { ref: a.ref, rowVersion });
  else await registrations.lifecycle('status', { ref: a.ref, rowVersion, status: state });
  let board = await s.board('logo');
  assert.equal(board.items.find(item => item.ref === b.ref).organisationRef, a.ref);
  board = await s.save('logo', { revision: board.revision, items: board.items.slice().reverse().map(item => item.ref === b.ref ? { ...item, company: 'Updated active representative' } : item) });
  assert.deepEqual(board.items.map(item => item.ref), [c.ref, b.ref]);
  assert.equal(board.items[1].company, 'Updated active representative');
  assert.equal(board.items[1].organisationRef, a.ref);
  assert.equal((await f.materials.showcase()).organisations.find(item => item.id === board.items[1].entryId).name, 'Updated active representative');
  await assert.rejects(s.save('logo', { revision: board.revision, items: board.items.map(item => item.ref === c.ref ? { ...item, organisationRef: a.ref } : item) }), error => error.statusCode === 400);
  assert.deepEqual(await s.board('logo'), board);
});

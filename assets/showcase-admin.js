(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LPClubShowcaseAdmin = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : .5));
  function createDrafts() { return Object.fromEntries(['portrait', 'logo'].map(kind => [kind, { revision: 0, items: [], saved: [], loaded: false, dirty: false, conflict: false }])); }
  function acceptBoard(state, kind, board, force = false) {
    const draft = state[kind]; if (draft.dirty && !force) return false;
    Object.assign(draft, { revision: board.revision, items: copy(board.items || []), saved: copy(board.items || []), loaded: true, dirty: false, conflict: false }); return true;
  }
  function changed(draft) { draft.dirty = JSON.stringify(draft.items) !== JSON.stringify(draft.saved); }
  function editCard(state, kind, id, patch) {
    const draft = state[kind], card = draft.items.find(item => item.entryId === id); if (!card) return false;
    for (const key of ['name', 'title', 'company', 'organisationRef']) if (Object.hasOwn(patch, key)) card[key] = String(patch[key]);
    if (patch.crop) { const zoom=patch.crop.zoom??card.crop?.zoom;card.crop = { x: clamp(patch.crop.x), y: clamp(patch.crop.y), ...(zoom===undefined?{}:{zoom:Math.max(1,Math.min(8,Number(zoom)||1))}) }; }
    changed(draft); return true;
  }
  function adoptText(state, kind, id) {
    const card = state[kind].items.find(item => item.entryId === id); if (!card?.draftText) return false;
    editCard(state,kind,id,card.draftText); card.hasTextChanges=false; changed(state[kind]); return true;
  }
  function replaceVersion(state,kind,id,latest) {
    const card=state[kind].items.find(item=>item.entryId===id); if(!card||!latest.eligible)return false;
    Object.assign(card,{versionId:latest.versionId,materialRevision:latest.materialRevision,previewUrl:latest.previewUrl,hasNewVersion:false,crop:{x:.5,y:.5}}); changed(state[kind]);return true;
  }
  function addCard(state, kind, card, index = state[kind].items.length) {
    const draft = state[kind]; if (!card.eligible || draft.items.some(item => item.entryId === card.entryId || card.ref && item.ref === card.ref)) return false;
    draft.items.splice(Math.max(0, Math.min(index, draft.items.length)), 0, copy({ ...card, crop: card.crop || { x: .5, y: .5 } })); changed(draft); return true;
  }
  function moveCard(state, kind, id, index) { const draft = state[kind], from = draft.items.findIndex(item => item.entryId === id); if (from < 0) return; const [item] = draft.items.splice(from, 1); draft.items.splice(Math.max(0, Math.min(index, draft.items.length)), 0, item); changed(draft); }
  function removeCard(state, kind, id) { const draft = state[kind]; draft.items = draft.items.filter(item => item.entryId !== id); changed(draft); }
  function discard(state, kind) { const draft = state[kind]; draft.items = copy(draft.saved); draft.dirty = false; draft.conflict = false; }
  function payload(state, kind) { return { revision: state[kind].revision, items: state[kind].items.map(item => { const out = {}; for (const key of ['entryId', 'versionId', 'materialRevision', 'name', 'title', 'company', 'crop', 'organisationRef']) if (item[key] !== undefined) out[key] = copy(item[key]); return out; }) }; }
  function saveFailed(state, kind, status) { if (status === 409) state[kind].conflict = true; }
  function isDirty(state) { return Object.values(state).some(draft => draft.dirty); }
  function safePreviewUrl(raw, prefix = '/') {
    if (typeof raw !== 'string' || ![prefix + 'api/admin/materials/',prefix + 'api/admin/showcase/'].some(path=>raw.startsWith(path)) || raw.includes('..') || /%2e|%2f|%5c/i.test(raw) || raw.includes('#') || raw.includes('\\') || /[\x00-\x20]/.test(raw)) throw Error('Invalid preview URL');
    const parsed = new URL(raw, 'https://preview.invalid');
    const manual = raw.startsWith(prefix + 'api/admin/showcase/');
    if (parsed.origin !== 'https://preview.invalid' || (manual ? !/\/api\/admin\/showcase\/(portrait|logo)\/uploads\/[0-9a-f-]{36}\/preview$/i.test(parsed.pathname) || !!parsed.search : !/\/preview\/(portrait|logo)$/.test(parsed.pathname) || [...parsed.searchParams.keys()].some(key => !['versionId', 'fit'].includes(key)))) throw Error('Invalid preview URL');
    return raw;
  }
  function createPreviewCache({ prefix = '/', token, fetch, createObjectURL, revokeObjectURL, maxEntries = 96 }) {
    const entries = new Map();
    let active = new Set();
    const limit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 96;
    function remove(path, entry) {
      entries.delete(path);
      if (entry.url) revokeObjectURL(entry.url);
    }
    function trim(except) {
      // Visible images stay valid; the limit applies when an image leaves the view.
      for (const [path, entry] of entries) {
        if (entries.size <= limit) break;
        if (path !== except && !active.has(path)) remove(path, entry);
      }
    }
    function touch(path, entry) { entries.delete(path); entries.set(path, entry); }
    function get(raw) {
      const path = safePreviewUrl(raw, prefix), existing = entries.get(path);
      if (existing) { touch(path, existing); return existing.promise; }
      const entry = { url: null, promise: null };
      entries.set(path, entry);
      let response;
      try { response = fetch(path, { headers: { 'X-Admin-Token': token } }); }
      catch (error) { response = Promise.reject(error); }
      entry.promise = Promise.resolve(response).then(async result => {
        if (!result.ok) throw Error('Preview unavailable');
        const blob = await result.blob();
        if (entries.get(path) !== entry) throw Error('Preview released');
        entry.url = createObjectURL(blob);
        trim(path);
        return entry.url;
      }).catch(error => { if (entries.get(path) === entry) remove(path, entry); throw error; });
      return entry.promise;
    }
    function peek(raw) {
      const path = safePreviewUrl(raw, prefix), entry = entries.get(path);
      if (entry) touch(path, entry);
      return entry?.url || null;
    }
    function setActive(paths) { active = new Set(paths.map(path => safePreviewUrl(path, prefix))); trim(); }
    function clear() { for (const [path, entry] of entries) remove(path, entry); active.clear(); }
    return { get, peek, setActive, clear };
  }
  function setPageInfo(element,i18n,page,total,pageSize=12){const key='Page {page} / {pages} · Total {total}',params={page,pages:Math.max(1,Math.ceil(total/pageSize)),total};if(i18n)i18n.setText(element,key,params);else element.textContent=key.replace(/\{(\w+)\}/g,(_,name)=>params[name]);}
  function init({ element, request, token, message, document: doc = document, window: win = window }) {
    if (!element) return null;
    const state = createDrafts(), e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const l = key => win.LPClubAdminI18n?.label(key) || e(key), t = key => win.LPClubAdminI18n?.text(key) || key;
    let kind = 'portrait', page = 1, q = '', candidates = [], total = 0, querySequence = 0, boardSequence = { portrait: 0, logo: 0 }, previewSequence = 0, saving = false, uploading = false, dragged = null;
    const prefix = win.location.pathname.slice(0, win.location.pathname.lastIndexOf('/') + 1);
    const find = selector => element.querySelector(selector), all = selector => [...element.querySelectorAll(selector)];
    const previewCache = createPreviewCache({prefix,token,fetch:(...args)=>win.fetch(...args),createObjectURL:blob=>win.URL.createObjectURL(blob),revokeObjectURL:url=>win.URL.revokeObjectURL(url)});
    const release = () => { previewSequence++; previewCache.clear(); };
    async function json(path, options) { const response = await request(path, options); return response.json(); }
    function status(card) { if (!card.eligible) return l('暂不可展示') + ' · ' + (card.blockedReasons || []).map(code => l(({ ADMISSION_PENDING: '报名待通过', CONSENT_REQUIRED: '缺少展示授权', MATERIAL_NOT_APPROVED: '资料待审核', MATERIAL_MISSING: '尚未上传', PACKAGE_INELIGIBLE: '套餐不支持肖像', PORTRAIT_INELIGIBLE: '套餐不支持肖像', REGISTRATION_DELETED: '报名已删除', DELETED: '报名已删除' })[code] || '请检查审核与授权')).join(' · '); return l(card.published ? '官网已展示' : '可加入展示柜'); }
    async function previews() {
      const sequence = ++previewSequence, images = all('[data-private-preview]').filter(image => {try {safePreviewUrl(image.getAttribute('data-private-preview'),prefix);return true;}catch(_){image.alt=t('预览暂不可用');return false;}});
      previewCache.setActive(images.map(image=>image.getAttribute('data-private-preview')));
      await Promise.all(images.map(async image => {
        try { const url=await previewCache.get(image.getAttribute('data-private-preview'));if(sequence===previewSequence&&image.src!==url)image.src=url; }
        catch (_) { if (sequence === previewSequence) image.alt = t('预览暂不可用'); }
      }));
    }
    function image(card, extra = '') {let cached;try{cached=card.previewUrl&&previewCache.peek(card.previewUrl);}catch(_){}return card.previewUrl ? '<img '+extra+(cached?' src="'+e(cached)+'"':'')+' data-private-preview="'+e(card.previewUrl)+'" alt="'+e(card.name || card.company)+'">' : '<span class="muted">'+l('预览暂不可用')+'</span>'; }
    function cropStyle(crop={x:.5,y:.5}) { const x=clamp(crop.x)*100,y=clamp(crop.y)*100,zoom=Math.max(1,Math.min(8,Number(crop.zoom)||1));return 'object-position:'+x+'% '+y+'%;transform:scale('+zoom+');transform-origin:'+x+'% '+y+'%'; }
    function renderCandidates() {
      const host = find('[data-candidates]'); if (!host) return;
      host.innerHTML = candidates.length ? candidates.map((card, index) => '<article class="cabinet-candidate" data-candidate="'+index+'" draggable="'+!!(card.eligible&&!saving&&!uploading)+'">'+image(card)+'<div><strong>'+e((kind === 'logo' ? card.company : card.name) || t('未填写展示信息'))+'</strong><p>'+(card.source==='manual'?l('管理员手动上传'):e(card.ref))+'</p><small>'+status(card)+'</small><button data-add="'+index+'" '+(!state[kind].loaded || saving || uploading || !card.eligible || state[kind].items.some(item=>item.entryId===card.entryId || card.ref && item.ref===card.ref) ? 'disabled' : '')+'>'+l('加入展示柜')+'</button></div></article>').join('') : '<p class="muted">'+l('没有符合条件的资料')+'</p>';
      all('[data-add]').forEach(button => button.onclick = () => { if (addCard(state, kind, candidates[Number(button.dataset.add)])) render(); });
      all('[data-candidate]').forEach(node => node.ondragstart = event => { dragged = { source:'candidate', card:candidates[Number(node.dataset.candidate)] }; event.dataTransfer?.setData('text/plain','material'); });
      setPageInfo(find('[data-candidate-page]'),win.LPClubAdminI18n,page,total);
      find('[data-previous]').disabled = page <= 1; find('[data-next]').disabled = page*12 >= total;
    }
    async function loadCandidates() { const sequence = ++querySequence, currentKind = kind; const host=find('[data-candidates]');if(host)host.innerHTML='<p>'+l('正在加载…')+'</p>';try { const data = await json('/api/admin/showcase/'+currentKind+'/candidates?'+new URLSearchParams({q,page:String(page),pageSize:'12'})); if(sequence!==querySequence||currentKind!==kind)return; candidates=data.rows||[];total=data.total||0;renderCandidates();previews(); } catch(err) { if(sequence===querySequence)message(err.message,true); } }
    async function loadBoard(target = kind) { const sequence=++boardSequence[target];try { const data = await json('/api/admin/showcase/'+target); if(sequence!==boardSequence[target])return;acceptBoard(state,target,data);if(target===kind)render(); } catch(err) { message(err.message,true); } }
    function render() {
      const draft=state[kind];
      element.innerHTML='<div class="cabinet-toolbar"><div class="actions"><button data-kind="portrait" aria-pressed="'+(kind==='portrait')+'">'+l('嘉宾肖像')+'</button><button data-kind="logo" aria-pressed="'+(kind==='logo')+'">'+l('机构标识')+'</button></div><div class="actions"><button type="button" data-upload '+(!draft.loaded||saving||uploading?'disabled':'')+'>'+l(uploading?'正在上传…':kind==='portrait'?'手动上传嘉宾肖像':'手动上传机构标识')+'</button><input type="file" data-upload-file accept="image/jpeg,image/png,image/webp" hidden></div><div class="actions"><span class="muted" data-draft-status>'+l(draft.dirty?'有未保存的调整':'已与官网同步')+'</span><button data-discard '+(!draft.dirty||saving?'disabled':'')+'>'+l('放弃本次调整')+'</button><button class="primary" data-save '+(!draft.loaded||!draft.dirty||saving?'disabled':'')+'>'+l('保存并更新官网')+'</button></div></div>'+(draft.conflict?'<p class="notice error">'+l('官网展示柜已被其他人更新。本地调整已保留，请查看最新官网后手动合并，或放弃本次调整并重新加载。')+'</p>':'')+'<p class="muted">'+l('可从左侧选择已审核资料，或手动上传图片加入右侧展示草稿。填写展示信息并调整顺序后，保存才更新官网。')+'</p><div class="cabinet-layout"><aside class="cabinet-library"><h3>'+l('资料候选区')+'</h3><div class="actions"><input data-search value="'+e(q)+'" placeholder="'+e(t('搜索姓名、机构或报名编号'))+'" data-admin-placeholder="搜索姓名、机构或报名编号"><button data-search-go>'+l('搜索')+'</button></div><div data-candidates></div><div class="actions"><button data-previous>'+l('上一页')+'</button><small data-candidate-page></small><button data-next>'+l('下一页')+'</button></div></aside><section class="cabinet-stage"><h3>'+l('官网展示顺序')+'</h3><div class="cabinet-grid '+(kind==='logo'?'cabinet-logos':'')+'" data-board>'+draft.items.map((card,index)=>'<article class="cabinet-card" data-entry="'+e(card.entryId)+'" data-index="'+index+'"><button class="cabinet-drag" draggable="true" data-drag="'+e(card.entryId)+'" aria-label="'+e(t('拖动调整顺序'))+'">'+l('拖动调整顺序')+'</button><div class="cabinet-image '+(kind==='portrait'?'cabinet-portrait':'cabinet-logo')+'">'+image(card,'style="'+cropStyle(card.crop)+'"')+'</div><div class="cabinet-caption"><button type="button" data-adjust-image="'+e(card.entryId)+'">'+l('调整图片')+'</button>'+(kind==='portrait'?'<label>'+l('公开姓名')+'<input data-edit="name" data-id="'+e(card.entryId)+'" value="'+e(card.name)+'" maxlength="200"></label><label>'+l('公开职位')+'<input data-edit="title" data-id="'+e(card.entryId)+'" value="'+e(card.title)+'" maxlength="200"></label>':'')+'<label>'+l('公开机构名称')+'<input data-edit="company" data-id="'+e(card.entryId)+'" value="'+e(card.company)+'" maxlength="200"></label><small>'+status(card)+'</small>'+(card.hasTextChanges?'<p><button data-adopt-text="'+e(card.entryId)+'">'+l('采用最新文字')+'</button></p>':'')+(card.hasNewVersion?'<p><button data-replace="'+e(card.entryId)+'">'+l('改用最新已审核图片')+'</button></p>':'')+(kind==='portrait'?'<small>'+l('裁剪比例固定，可调整位置和大小')+'</small>':'')+'<div class="actions"><button data-move="'+e(card.entryId)+'" data-direction="-1" '+(!index?'disabled':'')+'>'+l('前移')+'</button><button data-move="'+e(card.entryId)+'" data-direction="1" '+(index===draft.items.length-1?'disabled':'')+'>'+l('后移')+'</button><button class="danger" data-remove="'+e(card.entryId)+'">'+l('移出展示柜')+'</button></div></div></article>').join('')+'</div>'+(draft.items.length?'':'<div class="cabinet-empty" data-empty>'+l('点击左侧加入，或将资料拖到这里')+'</div>')+'</section></div>';
      all('[data-kind]').forEach(button=>button.onclick=()=>{kind=button.dataset.kind;page=1;candidates=[];render();if(!state[kind].loaded)loadBoard();loadCandidates();});
      find('[data-upload]').onclick=()=>{if(!saving&&!uploading&&state[kind].loaded)find('[data-upload-file]').click();};
      find('[data-upload-file]').onchange=async()=>{
        const input=find('[data-upload-file]'),file=input.files?.[0],target=kind;input.value='';
        if(!file||saving||uploading||!state[target].loaded)return;
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)){message('Only JPG, PNG and WebP images are accepted',true);return;}
        if(file.size>5*1024*1024){message('Image exceeds 5 MiB',true);return;}
        uploading=true;render();
        try{
          const form=new win.FormData();form.append('file',file);
          const data=await json('/api/admin/showcase/'+target+'/uploads',{method:'POST',body:form});
          if(!addCard(state,target,data.item))throw Error(t('图片未能加入展示草稿，请重试上传'));
          message('图片已加入展示草稿，请填写展示信息并保存后更新官网。');
        }catch(error){message(error.message,true);}
        finally{uploading=false;render();loadCandidates();}
      };
      find('[data-search-go]').onclick=()=>{q=find('[data-search]').value.trim();page=1;loadCandidates();};find('[data-search]').onkeydown=event=>{if(event.key==='Enter')find('[data-search-go]').click();};
      find('[data-previous]').onclick=()=>{if(page>1){page--;loadCandidates();}};find('[data-next]').onclick=()=>{if(page*12<total){page++;loadCandidates();}};
      find('[data-discard]').onclick=()=>{const conflict=draft.conflict;discard(state,kind);render();if(conflict)loadBoard();};
      find('[data-save]').onclick=async()=>{if(saving||uploading)return;const target=kind, sent=payload(state,target);saving=true;render();try { const data=await json('/api/admin/showcase/'+target,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(sent)});acceptBoard(state,target,data,true);message('官网展示柜已更新'); }catch(err){saveFailed(state,target,err.status);message(err.status===409?'官网展示柜已被其他人更新。本地调整已保留，请查看最新官网后手动合并，或放弃本次调整并重新加载。':err.message,true);}finally{saving=false;render();loadCandidates();}};
      all('[data-edit]').forEach(input=>input.oninput=()=>{editCard(state,kind,input.dataset.id,{[input.dataset.edit]:input.value});find('[data-save]').disabled=false;find('[data-discard]').disabled=false;find('[data-draft-status]').innerHTML=l('有未保存的调整');});
      all('[data-move]').forEach(button=>button.onclick=()=>{const from=draft.items.findIndex(card=>card.entryId===button.dataset.move);moveCard(state,kind,button.dataset.move,from+Number(button.dataset.direction));render();});
      all('[data-remove]').forEach(button=>button.onclick=()=>{removeCard(state,kind,button.dataset.remove);render();});
      all('[data-drag]').forEach(button=>button.ondragstart=event=>{dragged={source:'board',id:button.dataset.drag};event.dataTransfer?.setData('text/plain','material');});
      function drop(event,index){event.preventDefault();if(saving||uploading||!dragged)return;if(dragged.source==='candidate')addCard(state,kind,dragged.card,index);else moveCard(state,kind,dragged.id,index);dragged=null;render();}
      all('[data-entry]').forEach(node=>{node.ondragover=event=>event.preventDefault();node.ondrop=event=>{event.stopPropagation();drop(event,Number(node.dataset.index));};});find('[data-board]').ondragover=event=>event.preventDefault();find('[data-board]').ondrop=event=>drop(event,draft.items.length);if(find('[data-empty]')){find('[data-empty]').ondragover=event=>event.preventDefault();find('[data-empty]').ondrop=event=>drop(event,0);}
      all('[data-adjust-image]').forEach(button=>button.onclick=async()=>{const id=button.dataset.adjustImage,target=kind,card=state[target].items.find(item=>item.entryId===id),version=card.versionId;try{const src=await previewCache.get(card.previewUrl);if(kind!==target||!state[target].items.some(item=>item.entryId===id&&item.versionId===version))return;win.LPClubCropEditor.open({src,kind:target,crop:card.crop,parent:element,document:doc,label:t,onApply:crop=>{editCard(state,target,id,{crop});if(kind===target)render();}});}catch(error){message(t('预览暂不可用'),true);}});
      all('[data-replace]').forEach(button=>button.onclick=async()=>{const id=button.dataset.replace,target=kind,original=state[target].items.find(item=>item.entryId===id);try{const data=await json('/api/admin/showcase/'+target+'/candidates?'+new URLSearchParams({q:original.ref,page:'1',pageSize:'50'}));const latest=(data.rows||[]).find(item=>item.ref===original.ref&&item.eligible);if(!latest)throw Error(t('没有可用的已审核图片'));if(!win.confirm(t('使用最新已审核图片替换？保存后才更新官网。')))return;replaceVersion(state,target,id,latest);render();}catch(err){message(err.message,true);}});
      all('[data-adopt-text]').forEach(button=>button.onclick=()=>{adoptText(state,kind,button.dataset.adoptText);render();});
      if(saving||uploading){all('button,input,textarea').forEach(node=>node.disabled=true);const layout=find('.cabinet-layout');if(layout)layout.inert=true;}renderCandidates();previews();
    }
    win.addEventListener('beforeunload',event=>{if(isDirty(state)||uploading){event.preventDefault();event.returnValue='';}});win.addEventListener('pagehide',release);
    render();
    return { activate(){if(!state[kind].loaded)loadBoard();loadCandidates();}, refresh(){loadBoard();loadCandidates();}, state };
  }
  return { createPreviewCache, setPageInfo, createDrafts, acceptBoard, editCard, adoptText, replaceVersion, addCard, moveCard, removeCard, discard, payload, saveFailed, isDirty, safePreviewUrl, init };
});

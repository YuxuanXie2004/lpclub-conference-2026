(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LPClubMaterialsPage = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = lang => /^zh/.test(lang);
  const text = (lang, en, cn) => zh(lang) ? cn : en;
  const copy = {
    eyebrow:['CONFERENCE 2026 · ATTENDEE SERVICES','2026 国际私募股权大会 · 参会者服务'],
    title:['Your conference materials','完善参会资料'],
    intro:['Add your materials here. If anything needs updating, we’ll let you know on this page.','在这里提交参会资料。如需重交，我们会在对应资料下说明原因。'],
    loading:['Loading your registration…','正在加载报名信息…'],
    materialsTitle:['Your materials','资料清单'],
    formats:['JPG, PNG or WebP · Up to 5 MB per image','支持 JPG、PNG、WebP，每张不超过 5 MB'],
    uploadNote:['Confirm to save your images and permissions together.','图片与展示授权将一并保存，请检查后确认。'],
    saveMaterials:['Confirm and save','确认保存'],
    materialsSaved:['Your materials and permissions are saved.','资料与展示授权已保存。'],
    consentsTitle:['Website permissions','官网展示授权'],
    consentIntro:['Choose what we may display on the conference website.','由你决定哪些资料可以用于大会官网展示。'],
    consentNote:['Optional. Display requires approval and selection by the organiser. Withdrawing permission removes the image from the website.','授权为自愿选择。资料审核通过后，由主办方安排展示；撤回授权会立即撤下对应图片。'],
    helpTitle:['Need a hand?','需要帮助？'],
    helpText:['For corrections to your registration or help with your materials, contact our team.','如需更正报名信息，或在上传时遇到问题，请联系会务团队。'],
    contact:['Contact the organiser','联系主办方'],
    retry:['Try again','重新加载'],
    footer:['Private materials · For conference use only','资料仅用于本次大会 · 名片不公开展示'],
    uploaded:['Image uploaded.','图片已上传。'],
    deleted:['Image deleted.','图片已删除。'],
    saved:['Permissions saved.','展示授权已保存。']
  };
  const labels = {
    card:['Business card','名片'], portrait:['Speaker portrait','嘉宾照片'], logo:['Organisation logo','机构 Logo']
  };
  const descriptions = {
    card:['For internal verification only. Never displayed publicly.','仅用于内部身份核验，不公开展示。'],
    portrait:['A clear, professional portrait.','请提供清晰的正面商务照片。'],
    logo:['A transparent PNG or a white-background image is recommended. Keep the logo clear and complete.','建议提供透明背景 PNG 或白底图片，确保 Logo 清晰、完整。']
  };
  const uploadIcon = '<svg class="upload-plus" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 6v20M6 16h20"/></svg>';
  function assetState(kind, asset, lang) {
    const status = asset.status;
    if (status === 'rejected') return {label:text(lang,'Please resubmit','需要重交'),tone:'warning',action:text(lang,'Re-upload','重新上传')};
    if (status === 'missing' || status === 'not_applicable' || !status) return {label:text(lang,'To upload','待上传'),tone:'',action:text(lang,'Upload','上传')};
    const state = status === 'approved' ? ['Approved','已通过','success'] : kind !== 'card' && status === 'pending' ? ['In review','审核中','review'] : ['Submitted','已提交','success'];
    return {label:text(lang,state[0],state[1]),tone:state[2],action:text(lang,'Replace','更换')};
  }
  function assetMarkup(kind, asset, lang, selected, consents={}) {
    const state = selected?{label:text(lang,'Ready to save','待保存'),tone:'review',action:text(lang,'Replace','重新选择')}:assetState(kind, asset, lang), name = text(lang, ...labels[kind]);
    return '<article class="material-row'+(asset.status==='rejected'?' needs-action':'')+'" data-kind="'+kind+'">'+
      '<div class="material-content"><h3 class="material-name">'+esc(name)+'</h3><p class="material-description">'+esc(text(lang,...descriptions[kind]))+'</p><span class="material-state '+state.tone+'">'+esc(state.label)+'</span>'+
      (selected?'<p class="selected-filename">'+esc(selected.name)+'</p>':asset.status==='rejected'&&asset.reason?'<p class="material-reason">'+esc(asset.reason)+'</p>':'')+'</div>'+
      '<div class="material-controls"><label class="button upload-picker"><span class="upload-visual">'+uploadIcon+(asset.preview||selected?'<img data-preview="'+kind+'" alt="'+esc(name)+'" hidden>':'')+'</span><span data-picker-label="'+kind+'">'+esc(state.action)+'</span><input type="file" data-file="'+kind+'" accept="image/jpeg,image/png,image/webp" aria-label="'+esc(state.action+' · '+name)+'"></label>'+
      (selected?'<button type="button" class="delete-button" data-cancel="'+kind+'">'+text(lang,'Cancel selection','取消选择')+'</button>':asset.preview?'<button type="button" class="delete-button" data-remove="'+kind+'" aria-label="'+esc(text(lang,'Delete ','删除')+name)+'">'+text(lang,'Delete','删除')+'</button>':'')+'</div>'+
      '<div class="material-thumbnail" data-thumbnail="'+kind+'"><div class="material-example"><img src="images/material-examples/'+kind+'.png" alt="'+esc(text(lang,'Fictional example: ','虚构示例：')+name)+'" width="448" height="'+(kind==='portrait'?'672':'448')+'"><span>'+text(lang,'Example','示例')+'</span></div></div>'+
      (kind!=='card'?'<div class="material-consent">'+consentMarkup({portraitEligible:kind==='portrait',consents},lang,kind)+'</div>':'')+
      '<p class="material-error" data-error="'+kind+'" role="alert" hidden></p></article>';
  }
  function consentMarkup(data, lang, kind) {
    const row = (kind,en,cn,enDetail,cnDetail) => '<label class="consent-option"><input type="checkbox" id="'+kind+'Consent" data-consent="'+kind+'" '+(data.consents[kind]?'checked':'')+'><span>'+text(lang,en,cn)+'<small>'+text(lang,enDetail,cnDetail)+'</small></span></label>';
    return (data.portraitEligible&&(!kind||kind==='portrait')?row('portrait','Allow my portrait and profile on the conference website','我同意在大会官网展示我的照片、姓名、职位及机构','Optional. You can change this later using your email link.','自愿选择，之后可通过邮件专属链接调整。'):'')+
      (!kind||kind==='logo'?row('logo','I am authorised to allow my organisation’s logo and name on the conference website','我有权授权在大会官网展示机构 Logo 和名称','Optional. Withdrawal immediately stops the display.','自愿选择，撤回授权后将立即停止展示。'):'');
  }
  function packageLabel(id, lang) {
    const identities = {lp:['Limited Partner','有限合伙人（LP）'],lpclub_member:['LP CLUB Member','LP CLUB 会员'],gp:['General Partner','普通合伙人（GP）'],investment_company:['Asset Management','资产管理'],standard:['Standard','标准参会']};
    const options = {ticket:['Delegate Pass','普通参会'],speaking:['Speaking Package','演讲套餐'],panel:['Panel / Roundtable','圆桌套餐'],matchmaking:['1-on-1 Matchmaking','一对一配对']};
    const match = /^(lp|lpclub_member|gp|investment_company|standard)_(ticket|speaking|panel|matchmaking)$/.exec(id || '');
    return match?text(lang,...identities[match[1]])+' · '+text(lang,...options[match[2]]):text(lang,'Conference registration','大会报名');
  }
  function validateImage(file, lang) {
    if (!file || !file.size) return text(lang,'Choose an image that is not empty.','请选择一张有效的图片。');
    if (file.size > 5*1024*1024) return text(lang,'This image is too large. Choose one under 5 MB.','图片过大，请选择不超过 5 MB 的图片。');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return text(lang,'Choose a JPG, PNG or WebP image.','请选择 JPG、PNG 或 WebP 图片。');
    return '';
  }
  function errorText(error, lang) {
    if (error.status === 401 || error.status === 403) return text(lang,'This link has expired or is no longer available. Contact the organiser for a new link.','链接已失效，请联系主办方重新发送资料补交链接。');
    if (error.status === 404) return text(lang,'We could not find this registration. Contact the organiser to check your registration.','暂未找到这份报名，请联系主办方核对报名信息。');
    if (['MATERIALS_STORAGE_PERMISSION_REQUIRED','MATERIALS_STORAGE_UNAVAILABLE'].includes(error.code)) return text(lang,'Image storage is temporarily unavailable. Please contact the organiser or try again later.','图片服务暂不可用，请联系主办方或稍后重试。');
    if (error.status === 413) return text(lang,'This image is too large. Choose one under 5 MB.','图片过大，请选择不超过 5 MB 的图片。');
    if (error.status === 400 || error.status === 415) return text(lang,'This image could not be accepted. Try a static JPG, PNG or WebP under 5 MB and 25 megapixels.','图片未能通过校验，请使用不超过 5 MB、2500 万像素的静态 JPG、PNG 或 WebP 图片。');
    if (error.status === 409) return text(lang,'Your materials changed. Reload this page and try again.','资料已发生变化，请重新加载后再试。');
    if (error.status === 429) return text(lang,'Too many attempts. Please wait a moment and try again.','操作较频繁，请稍后再试。');
    if (error.status >= 500) return text(lang,'The materials service is temporarily unavailable. Try again later or contact the organiser.','资料服务暂不可用，请稍后重试或联系主办方。');
    return text(lang,'We couldn’t complete this request. Check your connection and try again.','操作暂未完成，请检查网络后重试。');
  }
  async function submitFiles(files, upload) {
    const results=[];
    for(const [kind,file] of Object.entries(files)) {
      try{results.push({kind,data:await upload(kind,file)});}
      catch(error){results.push({kind,error});if([401,403,404].includes(error.status))break;}
    }
    return results;
  }
  async function submitChanges({files,consents},upload,saveConsents) {
    const results=await submitFiles(files,upload);
    let consent=null;
    if(consents&&!results.some(result=>[401,403,404].includes(result.error?.status))){
      try{consent={data:await saveConsents(consents)};}catch(error){consent={error};}
    }
    return {files:results,consent};
  }
  function init({ref,token}) {
    const $ = id => document.getElementById(id);
    let language = 'en', savedLanguage = false, languageChanged = false;
    try { const saved = localStorage.getItem('lpclub-language'); if (['en','zh','zh-CN'].includes(saved)) {language=zh(saved)?'zh':'en';savedLanguage=true;} } catch (_) {}
    let current = null, draft = null, mutating = false, activeKind = '', notice = null, lastError = null, consentError = null, renderSequence = 0;
    const previews = new Map(), fieldErrors = new Map(), selected = {};
    const t = key => text(language,...copy[key]);
    const dirty = () => current && draft && (draft.portrait !== (current.portraitEligible && current.consents.portrait) || draft.logo !== current.consents.logo);
    function cancelSelection(kind){if(selected[kind])URL.revokeObjectURL(selected[kind].url);delete selected[kind];fieldErrors.delete(kind);}
    function clearPreviews() { renderSequence++; previews.forEach(url=>URL.revokeObjectURL(url)); previews.clear(); }
    async function request(path,options={}) {
      const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),45000);
      try {
        const response = await fetch(path.replace(/^\//,''),{...options,signal:controller.signal,headers:{Authorization:'Bearer '+token,'X-Registration-Ref':ref,...options.headers}});
        if (!response.ok) {let data;try{data=await response.json();}catch(_){}throw Object.assign(new Error('Materials request failed'),{status:response.status,code:data?.code});}
        return response;
      } finally {clearTimeout(timer);}
    }
    function translate() {
      document.documentElement.lang=zh(language)?'zh-CN':'en';
      document.title='LP CLUB · '+t('title');
      document.querySelectorAll('[data-copy]').forEach(el=>{el.textContent=t(el.dataset.copy);});
      document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
    }
    function feedback(key,error) { notice = key?{key,error}:null;renderFeedback(); }
    function renderFeedback() {
      $('message').hidden=!notice;
      $('message').className='feedback'+(notice?.error||notice?.partial?' error':'');
      $('message').textContent=notice?(notice.partial?text(language,'Some changes could not be saved. Check the messages and confirm again to retry. Saved images do not need to be selected again.','部分更改未保存，请查看提示后再次确认保存。已保存的图片无需重复选择。'):notice.error?errorText(notice.error,language):t(notice.key)):'';
    }
    function updateControls() {
      document.querySelectorAll('[data-file],[data-remove],[data-cancel],[data-consent]').forEach(el=>{el.disabled=mutating;});
      document.querySelectorAll('.upload-picker').forEach(el=>el.classList.toggle('is-busy',mutating));
      if(activeKind){const label=document.querySelector('[data-picker-label="'+activeKind+'"]');if(label)label.textContent=text(language,'Uploading…','正在上传…');}
      const selectedCount=Object.keys(selected).length;
      $('saveMaterials').disabled=mutating||(!selectedCount&&!dirty());
      $('saveMaterials').textContent=activeKind?text(language,'Saving…','正在保存…'):t('saveMaterials');
      $('materialSaveStatus').textContent=activeKind?text(language,'Saving your selected images…','正在保存所选图片…'):selectedCount?text(language,selectedCount+' image(s) selected. Confirm to save.','已选择 '+selectedCount+' 项图片，确认后保存。'):t('uploadNote');
      $('consentStatus').textContent=consentError?errorText(consentError,language):dirty()?text(language,'Saved when you confirm below','将在下方确认时一并保存'):text(language,'Your preferences are saved','授权设置已保存');
      $('consentStatus').classList.toggle('error',!!consentError);
      $('workspace').setAttribute('aria-busy',String(mutating));
    }
    function renderErrors() {
      document.querySelectorAll('[data-error]').forEach(el=>{const value=fieldErrors.get(el.dataset.error);el.hidden=!value;el.textContent=value?(value.file?validateImage(value.file,language):errorText(value.error,language)):'';});
    }
    async function renderPreviews(sequence) {
      await Promise.all([...document.querySelectorAll('[data-preview]')].map(async image=>{
        const kind=image.dataset.preview, key=kind+':'+current.assets[kind].version;
        try {
          let url=previews.get(key);
          if(selected[kind])url=selected[kind].url;
          else if(!url){url=URL.createObjectURL(await(await request('/api/materials/preview/'+kind)).blob());if(sequence!==renderSequence){URL.revokeObjectURL(url);return;}previews.set(key,url);}
          if(sequence!==renderSequence)return;
          image.onload=()=>{image.hidden=false;image.parentElement.classList.add('has-image');};
          image.onerror=()=>{image.hidden=true;image.parentElement.classList.remove('has-image');fieldErrors.set(kind,{error:{status:400}});renderErrors();};
          image.src=url;
        } catch(error){if(sequence===renderSequence){fieldErrors.set(kind,{error});renderErrors();}}
      }));
    }
    function render() {
      translate();renderFeedback();
      if(lastError){renderError();return;}
      if(!current)return;
      const data=current, identity=data.identity, kinds=['card','portrait','logo'].filter(kind=>kind!=='portrait'||data.portraitEligible);
      $('identity').hidden=false;$('identity').setAttribute('aria-busy','false');
      $('identity').innerHTML='<div><p class="attendee-name">'+esc(identity.name)+'</p><p class="attendee-company">'+esc([identity.title,identity.company].filter(Boolean).join(' · '))+'</p></div><div class="identity-meta"><span class="package-name">'+esc(packageLabel(identity.package,language))+'</span><span class="registration-ref">'+text(language,'Registration ','报名编号 ')+esc(data.ref)+'</span></div>';
      $('errorPanel').hidden=true;$('workspace').hidden=false;$('helpPanel').hidden=false;
      const submitted=kinds.filter(kind=>data.assets[kind]?.preview).length;
      $('completion').textContent=text(language,submitted+' of '+kinds.length+' submitted','已提交 '+submitted+' / '+kinds.length);
      $('assets').innerHTML=kinds.map(kind=>assetMarkup(kind,data.assets[kind]||{status:'missing'},language,selected[kind]?.file,draft)).join('');
      document.querySelectorAll('[data-consent]').forEach(input=>input.onchange=()=>{draft[input.dataset.consent]=input.checked;consentError=null;updateControls();});
      document.querySelectorAll('[data-file]').forEach(input=>input.onchange=()=>{
        const file=input.files[0],kind=input.dataset.file;if(!file||mutating)return;
        const error=validateImage(file,language);
        if(error){fieldErrors.set(kind,{file});renderErrors();input.value='';return;}
        cancelSelection(kind);selected[kind]={file,url:URL.createObjectURL(file)};feedback(null);render();
      });
      document.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(!mutating){cancelSelection(button.dataset.cancel);render();}});
      document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{
        if(mutating)return;
        if(confirm(text(language,'Delete this image? It will also be removed from the conference website.','删除这张图片？如果图片已在大会官网展示，也将同步撤下。')))mutate('/api/materials/'+button.dataset.remove,{method:'DELETE'},'deleted',button.dataset.remove);
      });
      updateControls();renderErrors();renderPreviews(++renderSequence);
    }
    function renderError() {
      $('identity').hidden=true;$('workspace').hidden=true;$('message').hidden=true;$('helpPanel').hidden=true;$('errorPanel').hidden=false;
      $('errorTitle').textContent=lastError.missing?text(language,'Use your private email link','请使用邮件中的专属链接'):lastError.status===401||lastError.status===403?text(language,'You need a new link','需要新的补交链接'):text(language,'We couldn’t load your materials','暂时无法加载资料');
      $('errorText').textContent=lastError.missing?text(language,'Open the complete materials link from your confirmation email. If you can’t find it, our team can send it again.','请打开报名确认邮件中的完整补交链接。如果找不到邮件，请联系会务团队重新发送。'):errorText(lastError,language);
      $('retry').hidden=lastError.missing||[401,403,404].includes(lastError.status);
    }
    function apply(data,resetDraft=false) {
      current=data;lastError=null;
      if(!draft||resetDraft)draft={portrait:data.portraitEligible&&data.consents.portrait,logo:data.consents.logo};
      if(!data.portraitEligible)draft.portrait=false;
      clearPreviews();render();
    }
    async function load() {
      if(!ref||!token){lastError={missing:true};render();return;}
      $('retry').disabled=true;
      try {const data=await(await request('/api/materials/me')).json();if(!savedLanguage&&!languageChanged)language=zh(data.language)?'zh':'en';apply(data);}
      catch(error){lastError=error;render();}
      finally{$('retry').disabled=false;}
    }
    async function mutate(path,options,key,kind='') {
      if(mutating)return;
      mutating=true;activeKind=key==='uploaded'?kind:'';fieldErrors.delete(kind);feedback(null);updateControls();renderErrors();
      try {const data=await(await request(path,options)).json();apply(data,key==='saved');feedback(key);}
      catch(error){if([401,403,404].includes(error.status)){lastError=error;render();}else if(kind){fieldErrors.set(kind,{error});renderErrors();}else feedback('error',error);}
      finally{mutating=false;activeKind='';if(current&&!lastError)render();}
    }
    $('saveMaterials').onclick=async()=>{
      if(mutating||(!Object.keys(selected).length&&!dirty()))return;
      const consents=dirty()?{portrait:current.portraitEligible&&draft.portrait,logo:draft.logo}:null;
      mutating=true;activeKind='materials';consentError=null;feedback(null);updateControls();
      Object.keys(selected).forEach(kind=>fieldErrors.delete(kind));renderErrors();
      try {
        const result=await submitChanges({files:Object.fromEntries(Object.entries(selected).map(([kind,item])=>[kind,item.file])),consents},async(kind,file)=>{
          const form=new FormData();form.append('file',file);
          const selectedFile=selected[kind];
          if(!selectedFile.requestKey)selectedFile.requestKey=globalThis.crypto?.randomUUID?.()||('upload_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
          return (await request('/api/materials/upload/'+kind,{method:'POST',headers:{'Idempotency-Key':selectedFile.requestKey},body:form})).json();
        },async values=>(await request('/api/materials/consents',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)})).json());
        let updated=current, failed=0;
        for(const item of result.files){if(item.error){failed++;fieldErrors.set(item.kind,{error:item.error});if([401,403,404].includes(item.error.status))lastError=item.error;}else{updated=item.data;cancelSelection(item.kind);}}
        if(result.consent?.error){failed++;consentError=result.consent.error;if([401,403,404].includes(consentError.status))lastError=consentError;}
        else if(result.consent?.data)updated=result.consent.data;
        if(!lastError)apply(updated,!!result.consent?.data);
        if(!failed)feedback('materialsSaved');
        else if(!lastError){notice={partial:true};renderFeedback();}
      } finally {mutating=false;activeKind='';render();}
    };
    $('retry').onclick=load;
    document.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{
      language=button.dataset.language;languageChanged=true;
      try{localStorage.setItem('lpclub-language',language==='zh'?'zh-CN':'en');}catch(_){}
      render();
    });
    window.addEventListener('beforeunload',event=>{if(dirty()||mutating||Object.keys(selected).length){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',()=>{clearPreviews();Object.keys(selected).forEach(cancelSelection);});
    render();load();
  }
  return {init,assetMarkup,assetState,consentMarkup,packageLabel,validateImage,errorText,submitFiles,submitChanges};
});

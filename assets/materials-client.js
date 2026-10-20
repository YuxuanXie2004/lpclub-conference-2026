(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LPClubMaterials = api; api.init(); }
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  var language = 'en', enabled = false, optionId = '', data = null, objectUrls = {};
  var selected = { card: null, portrait: null, logo: null };
  var status = { phase: '', failed: 0 };
  function zh() { return language === 'zh-CN' || language === 'zh'; }
  function text(en, cn) { return zh() ? cn : en; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function localised(value, lang) { if (typeof value === 'string') return value; return value && (value[/^zh/.test(lang) ? 'zh' : 'en'] || value.en || value.zh) || ''; }
  function safeImage(url) { return typeof url === 'string' && /^\/(?:[A-Za-z0-9_-]+\/)*api\/public\/(?:media|materials)\/[A-Za-z0-9_/?=&.%+-]+$/.test(url); }
  function speakerCard(item, lang) {
    if (!safeImage(item.imageUrl)) return '';
    return '<article class="speaker-card"><img src="' + esc(item.imageUrl) + '" alt="' + esc(localised(item.name, lang)) + '" loading="lazy" width="500" height="600"><div class="speaker-caption"><span class="speaker-kind">' + (/^zh/.test(lang) ? (item.kind === 'panel' ? '圆桌嘉宾' : '演讲嘉宾') : (item.kind === 'panel' ? 'Panel / Roundtable' : 'Speaker')) + '</span><h3>' + esc(localised(item.name, lang)) + '</h3><p>' + esc(localised(item.title, lang)) + '</p><b>' + esc(localised(item.company, lang)) + '</b></div></article>';
  }
  function organisationCard(item, lang, duplicate) {
    if (!safeImage(item.imageUrl)) return '';
    return '<article class="organisation-card" role="listitem"' + (duplicate ? ' aria-hidden="true"' : '') + '><div class="organisation-mark"><img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" width="420" height="210"></div><p>' + esc(localised(item.name, lang)) + '</p></article>';
  }
  function organisationWall(items, lang) {
    var valid = items.filter(function (item) { return safeImage(item.imageUrl); });
    if (!valid.length) return '';
    var count = valid.length <= 3 ? 1 : valid.length <= 8 ? 2 : 3;
    var rows = Array.from({ length: count }, function () { return []; });
    valid.forEach(function (item, index) { rows[index % count].push(item); });
    return rows.map(function (row, index) {
      var repeats = Math.ceil(6 / row.length), copies = ['', ''];
      for (var group = 0; group < 2; group++) {
        for (var repeat = 0; repeat < repeats; repeat++) {
          copies[group] += row.map(function (item) { return organisationCard(item, lang, group > 0 || repeat > 0); }).join('');
        }
      }
      var label = /^zh/.test(lang) ? '参会机构，第 ' + (index + 1) + ' 行' : 'Participating organisations, row ' + (index + 1);
      return '<div class="organisation-row" data-organisation-row role="group" aria-label="' + label + '" tabindex="0"><div class="organisation-track" style="--organisation-duration:' + (row.length * repeats * 9) + 's"><div class="organisation-set" role="list">' + copies[0] + '</div><div class="organisation-set" role="list" aria-hidden="true">' + copies[1] + '</div></div></div>';
    }).join('');
  }
  function validateFile(file) {
    if (!file || !file.size || file.size > 5 * 1024 * 1024) return 'Choose an image up to 5 MiB.';
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) < 0) return 'Choose a JPG, PNG or WebP image.';
    return '';
  }
  function apiUrl(route) { var p = location.pathname.replace(/\/[^/]*\.html$/, '').replace(/\/+$/, ''); return p + route; }
  function update(opts) {
    if (opts) { if (opts.language) language = opts.language; if (opts.optionId !== undefined) optionId = opts.optionId; }
    var section = document.getElementById('registrationMaterials');
    if (section) section.hidden = !enabled;
    var portrait = document.getElementById('portraitMaterial');
    if (portrait) portrait.hidden = ['speaking', 'panel'].indexOf(optionId) < 0;
    var portraitConsent = document.getElementById('portraitConsentField');
    if (portraitConsent) portraitConsent.hidden = ['speaking', 'panel'].indexOf(optionId) < 0;
    document.querySelectorAll('[data-material-filename]').forEach(function (label) {
      var file = selected[label.dataset.materialFilename];
      label.textContent = file ? file.name : text('No image selected', '尚未选择图片');
    });
    document.querySelectorAll('[data-material-input]').forEach(function (input) {
      var file = selected[input.dataset.materialInput];
      input.title = file ? file.name : text('Choose file', '选择文件');
    });
    document.querySelectorAll('[data-material-clear]').forEach(function (button) { button.textContent = text('Remove', '移除'); });
    document.querySelectorAll('[data-material-clear]').forEach(function (button) { button.hidden = !selected[button.dataset.materialClear]; });
    document.querySelectorAll('[data-material-choose]').forEach(function (label) { label.textContent = selected[label.dataset.materialChoose] ? text('Change image', '更换图片') : text('Choose image', '选择图片'); });
    renderShowcase(); renderStatus();
  }
  function payload(lang) {
    var photo = document.getElementById('portraitConsent'), logo = document.getElementById('logoConsent');
    return { language: /^zh/.test(lang || language) ? 'zh' : 'en', portraitConsent: enabled && ['speaking', 'panel'].indexOf(optionId) >= 0 && Boolean(photo && photo.checked), logoConsent: enabled && Boolean(logo && logo.checked) };
  }
  function renderStatus() {
    var el = document.getElementById('materialSubmissionStatus'); if (!el) return;
    el.hidden = !status.phase;
    if (status.permissionRequired) {
      el.textContent = text('Your registration is saved. File storage permissions are not enabled yet. Please contact the organiser, then use your email link to submit the images once this is resolved.', '报名已成功。文件存储权限尚未开通，请联系主办方处理后，再通过确认邮件中的专属链接补交图片。');
      return;
    }
    el.textContent = status.failed ? text('Your registration is saved. Some images could not be uploaded. Please use the private link in your confirmation email to submit them later.', '报名已成功，部分资料上传失败。请稍后通过确认邮件中的专属链接补交。') : text('You can submit or update your materials using the private link in your confirmation email.', '您可以通过确认邮件中的专属链接补交或更新资料。');
  }
  async function uploadRegistered(result) {
    status = { phase: enabled ? 'saved' : '', failed: 0 };
    var kinds = Object.keys(selected).filter(function (kind) { return selected[kind] && (kind !== 'portrait' || ['speaking', 'panel'].indexOf(optionId) >= 0); });
    if (!enabled) return;
    for (var i = 0; i < kinds.length; i++) {
      var kind = kinds[i];
      try {
        if (!result.materials || !result.materials.uploadToken) throw Error('Upload unavailable');
        var form = new FormData(); form.set('file', selected[kind]);
        var response = await fetch(apiUrl('/api/materials/upload/' + kind), { method: 'POST', headers: { Authorization: 'Bearer ' + result.materials.uploadToken, 'X-Registration-Ref': result.ref }, body: form });
        var body = await response.json();
        if (body.code === 'MATERIALS_STORAGE_PERMISSION_REQUIRED') status.permissionRequired = true;
        if (!response.ok || !body.ok) throw Error('Upload failed');
      } catch (_) { status.failed++; }
    }
    renderStatus();
  }
  function reset() {
    Object.keys(selected).forEach(function (kind) { selected[kind] = null; if (objectUrls[kind]) URL.revokeObjectURL(objectUrls[kind]); delete objectUrls[kind]; });
    document.querySelectorAll('[data-material-preview]').forEach(function (el) { el.replaceChildren(); });
    document.querySelectorAll('[data-material-error]').forEach(function (el) { el.hidden = true; el.textContent = ''; });
    status = { phase: '', failed: 0 }; optionId = ''; update();
  }
  function renderShowcase() {
    if (!data) return;
    ['speakers', 'organisations'].forEach(function (kind) {
      var section = document.getElementById(kind === 'speakers' ? 'speakers' : 'organisations'); if (!section) return;
      if (kind === 'organisations') {
        var wall = organisationWall(data.organisations || [], language), grid = section.querySelector('[data-showcase-grid]');
        section.hidden = !wall;
        grid.innerHTML = wall;
        grid.querySelectorAll('img').forEach(function (img) { img.onerror = function () {
          var mark = this.parentElement;
          mark.textContent = this.closest('article').querySelector('p').textContent;
          mark.classList.add('organisation-fallback');
        }; });
        return;
      }
      var cards = (data.speakers || []).map(function (item) { return speakerCard(item, language); }).filter(Boolean);
      section.hidden = !cards.length;
      section.querySelector('[data-showcase-grid]').innerHTML = cards.join('');
      section.querySelectorAll('img').forEach(function (img) { img.onerror = function () { this.closest('article').remove(); if (!section.querySelector('article')) section.hidden = true; }; });
    });
  }
  function init() {
    language = document.documentElement.lang;
    document.querySelectorAll('[data-material-input]').forEach(function (input) {
      var kind = input.dataset.materialInput, preview = document.querySelector('[data-material-preview="' + kind + '"]');
      input.addEventListener('change', function () {
        var file = input.files[0]; if (!file) return;
        var errorNode = document.querySelector('[data-material-error="' + kind + '"]');
        var error = validateFile(file);
        if (error) { if (errorNode) { errorNode.hidden = false; errorNode.textContent = text(error, '请选择不超过 5 MiB 的 JPG、PNG 或 WebP 图片。'); } input.value = ''; return; }
        if (errorNode) { errorNode.hidden = true; errorNode.textContent = ''; }
        if (objectUrls[kind]) URL.revokeObjectURL(objectUrls[kind]);
        selected[kind] = file; input.title = file.name; preview.replaceChildren();
        var img = document.createElement('img'); objectUrls[kind] = URL.createObjectURL(file); img.src = objectUrls[kind]; img.alt = file.name;
        preview.append(img); update();
      });
    });
    document.querySelectorAll('[data-material-clear]').forEach(function (button) {
      button.onclick = function () {
        var kind = button.dataset.materialClear, input = document.querySelector('[data-material-input="' + kind + '"]'), preview = document.querySelector('[data-material-preview="' + kind + '"]'), error = document.querySelector('[data-material-error="' + kind + '"]');
        selected[kind] = null; if (input) input.value = '';
        if (objectUrls[kind]) URL.revokeObjectURL(objectUrls[kind]); delete objectUrls[kind];
        if (preview) preview.replaceChildren(); if (error) { error.hidden = true; error.textContent = ''; } update();
      };
    });
    fetch(apiUrl('/api/materials/config')).then(function (r) { if (!r.ok) throw Error(); return r.json(); }).then(function (value) { enabled = value.enabled === true; update(); }).catch(function () { enabled = false; update(); });
    fetch(apiUrl('/api/public/showcase')).then(function (r) { if (!r.ok) throw Error(); return r.json(); }).then(function (value) { data = value; renderShowcase(); }).catch(function () {});
  }
  return { init: init, update: update, payload: payload, uploadRegistered: uploadRegistered, reset: reset, speakerCard: speakerCard, organisationCard: organisationCard, organisationWall: organisationWall, validateFile: validateFile };
});

'use strict';

function renderMaterialsPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>LP CLUB · Conference materials</title>
<link rel="icon" href="images/lpclub-icon.png">
<link rel="stylesheet" href="assets/materials-page.css">
<script>
const fragment=new URLSearchParams(location.hash.slice(1));
const REF=fragment.get('ref')||'';
const TOKEN=fragment.get('token')||'';
history.replaceState(null,'',location.pathname);
</script>
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="./" aria-label="LP CLUB"><img src="images/lpclub-logo.png" width="2021" height="698" alt="LP CLUB"></a>
    <span class="event-name">Private Equity Conference <span>2026</span></span>
    <div class="language-switch" role="group" aria-label="Language / 语言">
      <button type="button" data-language="en" lang="en" aria-pressed="true">EN</button>
      <button type="button" data-language="zh" lang="zh-CN" aria-pressed="false">中文</button>
    </div>
  </div>
</header>
<main>
  <section class="page-intro">
    <p class="eyebrow" data-copy="eyebrow">CONFERENCE 2026 · ATTENDEE SERVICES</p>
    <h1 data-copy="title">Your conference materials</h1>
    <p class="intro-copy" data-copy="intro">Add your materials here. If anything needs updating, we’ll let you know on this page.</p>
  </section>
  <div id="message" class="feedback" role="status" aria-live="polite" hidden></div>
  <section id="identity" class="identity-strip" aria-busy="true"><p data-copy="loading">Loading your registration…</p></section>
  <div id="workspace" class="workspace" hidden>
    <section class="materials-section" aria-labelledby="materialsTitle">
      <div class="section-heading"><h2 id="materialsTitle" data-copy="materialsTitle">Your materials</h2><span id="completion" class="completion"></span></div>
      <p class="section-note" data-copy="formats">JPG, PNG or WebP · Up to 5 MB per image</p>
      <div id="assets" class="material-list"></div>
    </section>
    <div class="materials-save"><div><p id="materialSaveStatus" class="upload-note" role="status" data-copy="uploadNote">Confirm to save your images and permissions together.</p><p id="consentStatus" class="consent-status" role="status"></p></div><button type="button" id="saveMaterials" class="button button-primary" disabled data-copy="saveMaterials">Confirm and save</button></div>
  </div>
  <section class="help-section" id="helpPanel" hidden><div><h3 data-copy="helpTitle">Need a hand?</h3><p data-copy="helpText">For corrections to your registration or help with your materials, contact our team.</p></div><a href="mailto:LPCLUBGROUP@LP-club.cn" class="contact-link">LPCLUBGROUP@LP-club.cn <span aria-hidden="true">↗</span></a></section>
  <section id="errorPanel" class="error-panel" hidden aria-labelledby="errorTitle">
    <span class="error-symbol" aria-hidden="true">!</span>
    <h2 id="errorTitle"></h2><p id="errorText"></p>
    <div class="error-actions"><a class="button button-primary" href="mailto:LPCLUBGROUP@LP-club.cn" data-copy="contact">Contact the organiser</a><button type="button" id="retry" class="button" data-copy="retry">Try again</button></div>
  </section>
</main>
<footer class="site-footer"><div><span>LP CLUB GROUP</span><span data-copy="footer">Private materials · For conference use only</span></div></footer>
<script src="assets/materials-page.js"></script>
<script>LPClubMaterialsPage.init({ref:REF,token:TOKEN});</script>
</body>
</html>`;
}

module.exports = { renderMaterialsPage };

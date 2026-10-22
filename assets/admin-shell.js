'use strict';
(function () {
  const titles = { active: 'Active Registrations', deleted: 'Deleted / 回收站', vip: 'VIP Codes', materials: 'Materials / 资料审核', feishu: 'Feishu notifications', mail: 'Email notifications', pricing: 'Pricing / 价格设置' };
  const byId = id => document.getElementById(id);
  const toggle = byId('adminSidebarToggle'), backdrop = byId('adminSidebarBackdrop');
  const mobile = window.matchMedia('(max-width: 767px)');
  let collapsed = false, open = false;
  let active = Object.keys(titles).find(name => byId(name + 'Tab')?.getAttribute('aria-selected') === 'true') || 'active';
  try { collapsed = localStorage.getItem('lpclub-admin-sidebar') === 'collapsed'; } catch (_) {}
  function draw() {
    document.body.classList.toggle('sidebar-collapsed', !mobile.matches && collapsed);
    document.body.classList.toggle('sidebar-open', mobile.matches && open);
    toggle.setAttribute('aria-expanded', String(mobile.matches ? open : !collapsed));
    backdrop.hidden = !mobile.matches || !open;
    if (mobile.matches && !open) byId('adminSidebar').setAttribute('aria-hidden', 'true');
    else byId('adminSidebar').setAttribute('aria-hidden', 'false');
    // The inert property also restores interaction when leaving the mobile layout.
    byId('adminSidebar').inert = mobile.matches && !open;
  }
  function refresh() {
    const key = titles[active], i18n = window.LPClubAdminI18n;
    for (const id of ['adminPageTitle', 'adminBreadcrumb']) {
      if (i18n) i18n.setText(byId(id), key);
      else byId(id).textContent = key;
    }
    document.title = 'LP CLUB · ' + (i18n ? i18n.text(key) : key);
  }
  function activate(name) {
    if (!Object.hasOwn(titles, name)) return;
    active = name;
    open = false;
    draw();
    refresh();
  }
  toggle.addEventListener('click', () => {
    if (mobile.matches) open = !open;
    else { collapsed = !collapsed; try { localStorage.setItem('lpclub-admin-sidebar', collapsed ? 'collapsed' : 'expanded'); } catch (_) {} }
    draw();
    if (mobile.matches && open) byId(active + 'Tab').focus();
  });
  backdrop.addEventListener('click', () => { open = false; draw(); toggle.focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { open = false; draw(); toggle.focus(); }
    if (event.key === 'Tab' && mobile.matches && open) {
      const first = byId('activeTab'), last = byId('pricingTab');
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener('change', () => { open = false; draw(); });
  byId('adminLogout').addEventListener('click', () => window.LPClubAdmin?.logout());
  window.LPClubAdminShell = { activate, refresh };
  draw();
  refresh();
})();

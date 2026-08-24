// Shared top-nav header for the admin console pages (admin, characters,
// jobs). Injected as-is at the top of <body>; the current page is highlighted
// via data-page on the script tag or body attribute.
(function () {
  const page = document.body.dataset.page || '';
  const tabs = [
    ['admin.html', 'Dashboard', 'monitor the world'],
    ['characters.html', 'Characters', 'sim & test toons'],
    ['sims.html', 'Sims', 'runs, grades & tracking'],
    ['jobs.html', 'Sim logs', 'run output'],
    ['gm.html', 'GM Console', 'inspector & streams'],
    ['/', 'Play', null],
    ['/ROADMAP.html', 'Roadmap', null],
  ];
  const here = location.pathname.split('/').pop() || 'admin.html';
  const pageKey = document.body.dataset.page || '';
  const links = tabs.map(([href, label]) => {
    const target = href === '/' ? '/' : href;
    const active = pageKey && (target.startsWith('/' + pageKey) || target === '/' + pageKey) ||
      (here === target.replace(/^\//, ''));
    return `<a href="${target}" ${active ? 'class="drnav-active" aria-current="page"' : ''}>${label}</a>`;
  }).join('');
  const css = `
    .drnav { background: var(--panel); border-bottom: 1px solid var(--line-strong);
      position: sticky; top: 0; z-index: 40; }
    .drnav-in { max-width: 1080px; margin: 0 auto; padding: 0 20px;
      display: flex; align-items: center; gap: 18px; height: 46px; }
    .drnav-logo { font-size: 15px; color: var(--amber); text-decoration: none;
      font-weight: bold; letter-spacing: .02em; white-space: nowrap; }
    .drnav-links { display: flex; gap: 4px; flex: 1; overflow-x: auto; }
    .drnav-links a { color: var(--muted); text-decoration: none; font-size: 12.5px;
      padding: 6px 11px; border-radius: 6px; white-space: nowrap; }
    .drnav-links a:hover { color: var(--text); background: var(--panel-inset); }
    .drnav-links a.drnav-active { color: var(--amber); background: var(--panel-inset);
      font-weight: bold; }
    @media (max-width: 640px) {
      .drnav-links a { padding: 6px 8px; font-size: 11.5px; }
      .drnav-in { gap: 10px; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const header = document.createElement('header');
  header.className = 'drnav';
  header.innerHTML = `
    <div class="drnav-in">
      <a class="drnav-logo" href="/admin.html">&#128009; Dragon Realms</a>
      <nav class="drnav-links" aria-label="Admin">${links}</nav>
    </div>`;
  // Insert before the first element in body (the page's own main/header).
  document.body.insertBefore(header, document.body.firstChild);
})();

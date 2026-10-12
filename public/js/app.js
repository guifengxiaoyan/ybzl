/* 医保专栏前台逻辑（纯原生 JS，无框架） */
const SECTIONS = {
  policy: { label: '医保政策文件', tag: 'policy', tagText: '政策' },
  catalog: { label: '三大目录', tag: 'catalog', tagText: '目录' },
  data: { label: '院内数据分享', tag: 'data', tagText: '数据' }
};
const CATALOG_TYPES = ['药品', '诊疗项目', '耗材'];

let state = { view: 'home', catalogType: CATALOG_TYPES[0], search: '', cache: { notices: null, resources: null, tools: null } };

const main = document.getElementById('main');

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('请求失败');
  return r.json();
}

/* ---------- 渲染：首页（分区展示） ---------- */
function renderHome() {
  main.innerHTML = `
    <section class="hero">
      <div class="hero-grid"></div>
      <div class="hero-inner">
        <div class="hero-badge">🏥 医院医疗保险管理服务平台</div>
        <h1 id="heroTitle">医保专栏</h1>
        <p>权威发布医保政策文件、通知公告与三大目录，安全共享院内医保数据</p>
        <div class="hero-search">
          <input id="search" placeholder="搜索通知、政策、目录、数据…" />
          <button class="btn" id="heroSearchBtn">🔍 搜索</button>
        </div>
        <div class="hero-stats">
          <div class="hs"><div class="hs-num" data-c="notices">0</div><div class="hs-lbl">通知公告</div></div>
          <div class="hs"><div class="hs-num" data-c="policy">0</div><div class="hs-lbl">政策文件</div></div>
          <div class="hs"><div class="hs-num" data-c="catalog">0</div><div class="hs-lbl">三大目录</div></div>
          <div class="hs"><div class="hs-num" data-c="data">0</div><div class="hs-lbl">院内数据</div></div>
          <div class="hs"><div class="hs-num" data-c="tools">0</div><div class="hs-lbl">医保工具</div></div>
        </div>
      </div>
    </section>

    <div class="section-label"><span class="dot"></span><h2>快捷入口</h2></div>
    <section class="quick" id="quickCards">
      <div class="quick-card" data-go="notices"><div class="qc-icon">📢</div><div class="qc-title">通知公告</div><div class="qc-sub">最新医保通知与提醒</div><span class="qc-arrow">→</span></div>
      <div class="quick-card" data-go="policy"><div class="qc-icon">📑</div><div class="qc-title">政策文件</div><div class="qc-sub">下载政策原文与解读</div><span class="qc-arrow">→</span></div>
      <div class="quick-card" data-go="catalog"><div class="qc-icon">📚</div><div class="qc-title">三大目录</div><div class="qc-sub">药品 / 诊疗 / 耗材目录</div><span class="qc-arrow">→</span></div>
      <div class="quick-card" data-go="tools"><div class="qc-icon">🧰</div><div class="qc-title">医保工具</div><div class="qc-sub">常用小工具合集</div><span class="qc-arrow">→</span></div>
      <div class="quick-card" data-audit="1"><div class="qc-icon">🤖</div><div class="qc-title">智能审核数据反馈</div><div class="qc-sub">点击前往反馈平台</div><span class="qc-arrow">↗</span></div>
    </section>

    <section class="region notice">
      <div class="region-head"><span class="r-icon">📢</span><h2>通知公告</h2><a class="more" href="#" data-go="notices">查看全部 →</a></div>
      <div class="region-divider"></div>
      <div class="notice-list" id="homeNotices"><div class="empty">加载中…</div></div>
    </section>

    <section class="region policy">
      <div class="region-head"><span class="r-icon">📑</span><h2>医保政策文件</h2><a class="more" href="#" data-go="policy">查看全部 →</a></div>
      <div class="region-divider"></div>
      <div class="grid" id="homePolicy"><div class="empty">加载中…</div></div>
    </section>

    <section class="region catalog">
      <div class="region-head"><span class="r-icon">📚</span><h2>三大目录</h2><a class="more" href="#" data-go="catalog">查看全部 →</a></div>
      <div class="region-divider"></div>
      <div class="catalog-cards" id="homeCatalog"><div class="empty">加载中…</div></div>
    </section>

    <section class="region tools">
      <div class="region-head"><span class="r-icon">🧰</span><h2>医保工具</h2><a class="more" href="#" data-go="tools">查看全部 →</a></div>
      <div class="region-divider"></div>
      <div class="grid" id="homeTools"><div class="empty">加载中…</div></div>
    </section>

    <section class="region data">
      <div class="region-head"><span class="r-icon">📊</span><h2>院内数据分享</h2><a class="more" href="#" data-go="data">查看全部 →</a></div>
      <div class="region-divider"></div>
      <div class="grid" id="homeData"><div class="empty">加载中…</div></div>
    </section>
  `;
  bindHomeEvents();

  api('/api/public').then(d => {
    const ht = document.getElementById('heroTitle');
    if (d.siteName && ht) ht.textContent = d.siteName;
    bindAuditCard(d.intelligentAuditUrl || '');
  }).catch(() => {});

  api('/api/notices').then(list => {
    const el = document.getElementById('homeNotices');
    el.innerHTML = list.length ? list.slice(0, 4).map(noticeItem).join('') : '<div class="empty">暂无通知</div>';
    setStat('notices', list.length);
  }).catch(() => document.getElementById('homeNotices').innerHTML = '<div class="empty">加载失败</div>');

  api('/api/resources?section=policy').then(list => {
    const el = document.getElementById('homePolicy');
    el.innerHTML = list.length ? list.slice(0, 4).map(resourceCard).join('') : '<div class="empty">暂无政策文件</div>';
    setStat('policy', list.length);
  }).catch(() => document.getElementById('homePolicy').innerHTML = '<div class="empty">加载失败</div>');

  const catIcons = { '药品': '💊', '诊疗项目': '🩺', '耗材': '📦' };
  api('/api/resources?section=catalog').then(list => {
    const el = document.getElementById('homeCatalog');
    el.innerHTML = CATALOG_TYPES.map(t => {
      const n = list.filter(r => r.catalogType === t).length;
      return `<div class="cat-card" data-cat="${t}"><div class="cat-icon">${catIcons[t] || '📁'}</div><div class="cat-title">${t}目录</div><div class="cat-count">${n} 个文件</div><span class="cat-arrow">查看 →</span></div>`;
    }).join('');
    el.querySelectorAll('.cat-card').forEach(c => c.addEventListener('click', () => { state.catalogType = c.dataset.cat; switchView('catalog'); }));
    setStat('catalog', list.length);
  }).catch(() => document.getElementById('homeCatalog').innerHTML = '<div class="empty">加载失败</div>');

  api('/api/resources?section=data').then(list => {
    const el = document.getElementById('homeData');
    el.innerHTML = list.length ? list.slice(0, 4).map(resourceCard).join('') : '<div class="empty">暂无数据文件</div>';
    setStat('data', list.length);
  }).catch(() => document.getElementById('homeData').innerHTML = '<div class="empty">加载失败</div>');

  api('/api/tools').then(list => {
    const el = document.getElementById('homeTools');
    el.innerHTML = list.length ? list.slice(0, 6).map(toolCard).join('') : '<div class="empty">暂无工具，请到后台添加</div>';
    bindToolCards(el);
    setStat('tools', list.length);
  }).catch(() => document.getElementById('homeTools').innerHTML = '<div class="empty">加载失败</div>');
}

function setStat(key, val) {
  const el = document.querySelector(`.hs-num[data-c="${key}"]`);
  if (el) el.textContent = val;
}

function bindAuditCard(url) {
  const el = document.querySelector('.quick-card[data-audit]');
  if (!el) return;
  el.onclick = () => {
    if (url && /^https?:\/\//i.test(url.trim())) window.open(url.trim(), '_blank', 'noopener');
    else showToast('该链接尚未在后台配置，请联系管理员');
  };
}
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:42px;transform:translateX(-50%);background:rgba(15,23,42,.92);color:#fff;padding:11px 20px;border-radius:24px;font-size:13px;z-index:400;opacity:0;transition:opacity .2s;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => { t.style.opacity = '0'; }, 2400);
}

function bindHomeEvents() {
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); switchView(a.dataset.go); }));
  const hs = document.getElementById('search');
  if (hs) hs.addEventListener('keydown', e => { if (e.key === 'Enter') doHomeSearch(); });
  const hb = document.getElementById('heroSearchBtn');
  if (hb) hb.addEventListener('click', doHomeSearch);
}
function doHomeSearch() {
  const v = ((document.getElementById('search') || {}).value || '').trim();
  state.search = v;
  switchView('policy', true);
}

/* ---------- 渲染：通知 ---------- */
function noticeItem(n) {
  let dNum = '—', dMon = '';
  if (n.date && /^\d{4}-\d{2}-\d{2}$/.test(n.date)) {
    const p = n.date.split('-'); dNum = Number(p[2]); dMon = Number(p[1]) + '月';
  }
  return `<div class="notice-item ${n.pinned ? 'pinned' : ''}">
    <div class="notice-date"><div class="d-num">${dNum}</div><div class="d-mon">${dMon}</div></div>
    <div class="nright">
      <div class="nhead"><h3>${esc(n.title)}</h3>${n.pinned ? '<span class="badge-pin">置顶</span>' : ''}</div>
      <div class="nmeta">发布：${esc(n.author || '医保办')} · ${esc(n.date || '')}</div>
      <div class="nbody">${esc(n.content)}</div>
    </div>
  </div>`;
}
function renderNotices() {
  main.innerHTML = `
    <div class="section-title"><span class="bar"></span><h2>通知公告</h2></div>
    <div class="search-bar"><input id="search" placeholder="搜索通知标题 / 内容…" value="${esc(state.search)}" /></div>
    <div class="notice-list" id="list"><div class="empty">加载中…</div></div>`;
  bindSearch();
  loadAndRenderNotices();
}
async function loadAndRenderNotices() {
  const list = state.cache.notices || (state.cache.notices = await api('/api/notices'));
  const kw = state.search.trim().toLowerCase();
  const filtered = kw ? list.filter(n => (n.title + n.content + (n.author || '')).toLowerCase().includes(kw)) : list;
  const el = document.getElementById('list');
  el.innerHTML = filtered.length ? filtered.map(noticeItem).join('') : '<div class="empty">没有匹配的通知</div>';
}

/* ---------- 渲染：资源（政策 / 数据） ---------- */
function resourceCard(r) {
  const s = SECTIONS[r.section] || { tag: '', tagText: '' };
  return `<div class="card is-${r.section}">
    <span class="tag ${s.tag}">${s.tagText}${r.section === 'catalog' && r.catalogType ? '·' + esc(r.catalogType) : ''}</span>
    <h3>${esc(r.title)}</h3>
    <p class="desc">${esc(r.desc || '点击下载查看文件内容。')}</p>
    <div class="meta"><span>📎 ${esc(r.originalName)}</span><span>💾 ${fmtSize(r.size)}</span><span>👤 ${esc(r.uploader || '')}</span></div>
    <div class="actions"><a class="btn btn-primary" href="${esc(r.downloadUrl)}">⬇ 下载</a></div>
  </div>`;
}
function renderResourceView(section) {
  const s = SECTIONS[section];
  main.innerHTML = `
    <div class="section-title"><span class="bar"></span><h2>${s.label}</h2></div>
    <div class="search-bar"><input id="search" placeholder="搜索标题 / 文件名…" value="${esc(state.search)}" /></div>
    <div class="grid" id="list"><div class="empty">加载中…</div></div>`;
  bindSearch();
  loadAndRenderResources(section);
}
async function loadAndRenderResources(section) {
  const all = state.cache.resources || (state.cache.resources = await api('/api/resources'));
  let list = all.filter(r => r.section === section);
  const kw = state.search.trim().toLowerCase();
  if (kw) list = list.filter(r => (r.title + r.originalName + (r.desc || '')).toLowerCase().includes(kw));
  const el = document.getElementById('list');
  el.innerHTML = list.length ? list.map(resourceCard).join('') : '<div class="empty">暂无内容，请到后台发布</div>';
}

/* ---------- 渲染：三大目录（带子标签） ---------- */
function renderCatalog() {
  main.innerHTML = `
    <div class="section-title"><span class="bar"></span><h2>三大目录下载</h2>
      <span class="hint">药品目录 · 诊疗项目目录 · 耗材目录</span></div>
    <div class="subtabs" id="subtabs">
      ${CATALOG_TYPES.map(t => `<button data-cat="${t}" class="${t === state.catalogType ? 'active' : ''}">${t}目录</button>`).join('')}
    </div>
    <div class="search-bar"><input id="search" placeholder="搜索目录标题 / 文件名…" value="${esc(state.search)}" /></div>
    <div class="grid" id="list"><div class="empty">加载中…</div></div>`;
  document.getElementById('subtabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.catalogType = b.dataset.cat; renderCatalog();
  });
  bindSearch();
  loadAndRenderCatalog();
}
async function loadAndRenderCatalog() {
  const all = state.cache.resources || (state.cache.resources = await api('/api/resources'));
  let list = all.filter(r => r.section === 'catalog' && r.catalogType === state.catalogType);
  const kw = state.search.trim().toLowerCase();
  if (kw) list = list.filter(r => (r.title + r.originalName + (r.desc || '')).toLowerCase().includes(kw));
  const el = document.getElementById('list');
  el.innerHTML = list.length ? list.map(resourceCard).join('') : '<div class="empty">该目录暂无文件</div>';
}

/* ---------- 渲染：医保工具 ---------- */
function toolCard(t) {
  const icon = t.icon && t.icon.trim() ? t.icon : '🛠️';
  return `<div class="tool-card" data-url="${esc(t.url)}">
    <div class="tool-ico">${esc(icon)}</div>
    <div class="tool-body">
      <h3>${esc(t.title)}</h3>
      <p class="desc">${esc(t.desc || '点击打开工具')}</p>
    </div>
    <span class="tool-go">↗</span>
  </div>`;
}
function bindToolCards(container) {
  container.querySelectorAll('.tool-card').forEach(c => c.addEventListener('click', () => {
    const u = c.dataset.url;
    if (u && /^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener');
    else showToast('该工具链接无效');
  }));
}
function renderTools() {
  main.innerHTML = `
    <div class="section-title"><span class="bar"></span><h2>医保工具</h2>
      <span class="hint">常用小工具合集 · 点击卡片打开</span></div>
    <div class="search-bar"><input id="search" placeholder="搜索工具名称 / 说明…" value="${esc(state.search)}" /></div>
    <div class="grid" id="list"><div class="empty">加载中…</div></div>`;
  bindSearch();
  loadAndRenderTools();
}
async function loadAndRenderTools() {
  const list = state.cache.tools || (state.cache.tools = await api('/api/tools'));
  const kw = state.search.trim().toLowerCase();
  const filtered = kw ? list.filter(t => (t.title + (t.desc || '')).toLowerCase().includes(kw)) : list;
  const el = document.getElementById('list');
  el.innerHTML = filtered.length ? filtered.map(toolCard).join('') : '<div class="empty">暂无工具，请到后台添加</div>';
  bindToolCards(el);
}

/* ---------- 事件绑定 ---------- */
function bindSearch() {
  const inp = document.getElementById('search');
  if (inp) inp.addEventListener('input', e => { state.search = e.target.value; rerenderCurrent(); });
}
function rerenderCurrent() {
  if (state.view === 'notices') loadAndRenderNotices();
  else if (state.view === 'catalog') loadAndRenderCatalog();
  else if (state.view === 'policy') loadAndRenderResources('policy');
  else if (state.view === 'data') loadAndRenderResources('data');
  else if (state.view === 'tools') loadAndRenderTools();
}

function switchView(v, preserve) {
  state.view = v; if (!preserve) state.search = '';
  document.querySelectorAll('#navTabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'home') renderHome();
  else if (v === 'notices') renderNotices();
  else if (v === 'policy') renderResourceView('policy');
  else if (v === 'catalog') renderCatalog();
  else if (v === 'data') renderResourceView('data');
  else if (v === 'tools') renderTools();
  window.scrollTo(0, 0);
}

/* ---------- 初始化 ---------- */
document.getElementById('navTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; switchView(b.dataset.view);
});
api('/api/public').then(d => { if (d.siteName) document.getElementById('siteName').textContent = d.siteName; }).catch(() => {});
renderHome();

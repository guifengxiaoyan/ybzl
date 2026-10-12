/* 医保专栏后台逻辑 */
const TOKEN_KEY = 'yb_admin_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let curList = 'notices';

const $ = id => document.getElementById(id);
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtSize(n) { if (!n && n !== 0) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }

async function api(path, opts = {}) {
  const headers = {};
  if (token) headers['x-admin-token'] = token;
  if (opts.json && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body });
  if (res.status === 401) { logout(); throw new Error('登录已失效'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

/* ---------- 登录 ---------- */
function showLogin() { $('loginMask').classList.remove('hidden'); $('app').classList.add('hidden'); }
function showApp() { $('loginMask').classList.add('hidden'); $('app').classList.remove('hidden'); $('who').textContent = '已登录'; }

async function doLogin() {
  const pwd = $('pwd').value;
  try {
    const d = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
    const data = await d.json();
    if (!d.ok) { $('loginErr').textContent = data.error || '登录失败'; return; }
    token = data.token; localStorage.setItem(TOKEN_KEY, token);
    boot();
  } catch (e) { $('loginErr').textContent = '网络错误'; }
}
function logout() { token = ''; localStorage.removeItem(TOKEN_KEY); showLogin(); }

/* ---------- 初始化 ---------- */
function bindLoginUI() {
  $('loginBtn').onclick = doLogin;
  $('pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('logoutBtn').onclick = logout;
}

function boot() {
  showApp();
  refreshStats();
  bindUI();
  loadList('notices');
}

function bindUI() {
  // 表单子标签
  $('formTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#formTabs button').forEach(x => x.classList.toggle('active', x === b));
    $('formNotice').classList.toggle('hidden', b.dataset.f !== 'notice');
    $('formFile').classList.toggle('hidden', b.dataset.f !== 'file');
    $('formAudit').classList.toggle('hidden', b.dataset.f !== 'audit');
    $('formTool').classList.toggle('hidden', b.dataset.f !== 'tool');
    $('formPwd').classList.toggle('hidden', b.dataset.f !== 'pwd');
    if (b.dataset.f === 'audit') loadAuditUrl();
  });
  // 文件栏目切换显示目录类型
  $('f_section').addEventListener('change', e => {
    $('f_catalogWrap').classList.toggle('hidden', e.target.value !== 'catalog');
  });
  // 列表子标签
  $('listTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#listTabs button').forEach(x => x.classList.toggle('active', x === b));
    loadList(b.dataset.l);
  });

  $('n_submit').onclick = submitNotice;
  $('f_submit').onclick = submitFile;
  $('audit_submit').onclick = saveAuditUrl;
  $('t_submit').onclick = submitTool;
  $('pwd_submit').onclick = submitPwd;
  $('n_date').value = new Date().toISOString().slice(0, 10);
}

async function refreshStats() {
  try { const s = await api('/api/admin/stats'); $('stats').innerHTML = `
    <div class="stat"><div class="num">${s.notices}</div><div class="lbl">通知总数</div></div>
    <div class="stat"><div class="num">${s.resources}</div><div class="lbl">文件总数</div></div>
    <div class="stat"><div class="num">${s.publishedNotices}</div><div class="lbl">已发布通知</div></div>
    <div class="stat"><div class="num">${s.publishedResources}</div><div class="lbl">已发布文件</div></div>`;
  } catch (e) {}
}

/* ---------- 发布通知 ---------- */
async function submitNotice() {
  const title = $('n_title').value.trim();
  if (!title) { toast('请填写标题'); return; }
  const body = {
    title, content: $('n_content').value, author: $('n_author').value || '医保办',
    date: $('n_date').value || new Date().toISOString().slice(0, 10),
    pinned: $('n_pinned').checked, published: $('n_pub').checked
  };
  try {
    await api('/api/admin/notices', { method: 'POST', json: true, body: JSON.stringify(body) });
    toast('通知已发布');
    $('n_title').value = ''; $('n_content').value = ''; $('n_pinned').checked = false;
    refreshStats(); loadList('notices');
  } catch (e) { toast(e.message); }
}

/* ---------- 上传文件 ---------- */
async function submitFile() {
  const file = $('f_file').files[0];
  if (!file) { toast('请选择文件'); return; }
  const fd = new FormData();
  fd.append('section', $('f_section').value);
  fd.append('catalogType', $('f_catalogType').value);
  fd.append('title', $('f_title').value);
  fd.append('desc', $('f_desc').value);
  fd.append('uploader', $('f_uploader').value || '医保办');
  fd.append('published', $('f_pub').checked ? 'true' : 'false');
  fd.append('file', file);
  try {
    await api('/api/admin/resources', { method: 'POST', body: fd });
    toast('文件已上传发布');
    $('f_title').value = ''; $('f_desc').value = ''; $('f_file').value = '';
    refreshStats(); loadList($('f_section').value === 'catalog' ? 'catalog' : $('f_section').value);
  } catch (e) { toast(e.message); }
}

/* ---------- 智能审核链接设置 ---------- */
async function loadAuditUrl() {
  try {
    const d = await api('/api/admin/settings');
    $('audit_url').value = d.intelligentAuditUrl || '';
  } catch (e) { toast(e.message); }
}
async function saveAuditUrl() {
  const url = $('audit_url').value.trim();
  if (url && !/^https?:\/\//i.test(url)) { toast('请输入以 http:// 或 https:// 开头的网址'); return; }
  try {
    await api('/api/admin/settings', { method: 'PUT', json: true, body: JSON.stringify({ intelligentAuditUrl: url }) });
    toast('审核反馈链接已保存');
  } catch (e) { toast(e.message); }
}

/* ---------- 修改管理员密码 ---------- */
async function submitPwd() {
  const cur = $('pwd_current').value;
  const neu = $('pwd_new').value;
  const conf = $('pwd_confirm').value;
  if (!cur || !neu || !conf) { toast('请填写全部字段'); return; }
  if (neu.length < 6) { toast('新密码至少 6 位'); return; }
  if (neu !== conf) { toast('两次输入的新密码不一致'); return; }
  try {
    await api('/api/admin/password', { method: 'PUT', json: true, body: JSON.stringify({ currentPassword: cur, newPassword: neu }) });
    $('pwd_current').value = ''; $('pwd_new').value = ''; $('pwd_confirm').value = '';
    toast('密码已修改，请使用新密码重新登录');
  } catch (e) { toast(e.message); }
}

/* ---------- 发布工具 ---------- */
async function submitTool() {
  const title = $('t_title').value.trim();
  if (!title) { toast('请填写工具名称'); return; }
  const url = $('t_url').value.trim();
  if (!/^https?:\/\//i.test(url)) { toast('链接需以 http:// 或 https:// 开头'); return; }
  const body = { title, url, icon: $('t_icon').value.trim(), desc: $('t_desc').value, published: $('t_pub').checked };
  try {
    await api('/api/admin/tools', { method: 'POST', json: true, body: JSON.stringify(body) });
    toast('工具已添加');
    $('t_title').value = ''; $('t_icon').value = ''; $('t_url').value = ''; $('t_desc').value = ''; $('t_pub').checked = true;
    refreshStats(); loadList('tools');
  } catch (e) { toast(e.message); }
}

/* ---------- 列表管理 ---------- */
async function loadList(type) {
  curList = type;
  const area = $('listArea');
  area.innerHTML = '<div class="empty">加载中…</div>';
  try {
    if (type === 'notices') {
      const list = await api('/api/admin/notices');
      area.innerHTML = noticeTable(list);
    } else if (type === 'tools') {
      const list = await api('/api/admin/tools');
      area.innerHTML = toolTable(list);
    } else {
      let list = await api('/api/admin/resources');
      list = list.filter(r => r.section === type);
      area.innerHTML = resourceTable(list);
    }
    bindRowEvents();
  } catch (e) { area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function noticeTable(list) {
  if (!list.length) return '<div class="empty">暂无通知，请在左侧发布</div>';
  return `<table class="table"><thead><tr><th>状态</th><th>标题</th><th>发布人/日期</th><th>操作</th></tr></thead><tbody>
    ${list.map(n => `<tr data-id="${n.id}" data-type="notice">
      <td><span class="status-dot ${n.published ? 'on' : 'off'}">${n.published ? '已发布' : '草稿'}</span>${n.pinned ? ' 📌' : ''}</td>
      <td class="title-cell">${esc(n.title)}</td>
      <td>${esc(n.author || '')}<br>${esc(n.date || '')}</td>
      <td><div class="row-actions">
        <button class="mini ${n.published ? 'unpub' : 'pub'}" data-act="toggle">${n.published ? '转草稿' : '发布'}</button>
        <button class="mini edit" data-act="edit">编辑</button>
        <button class="mini del" data-act="del">删除</button>
      </div></td></tr>`).join('')}
  </tbody></table>`;
}
function resourceTable(list) {
  if (!list.length) return '<div class="empty">暂无文件，请在左侧上传</div>';
  return `<table class="table"><thead><tr><th>状态</th><th>标题 / 文件</th><th>类型</th><th>操作</th></tr></thead><tbody>
    ${list.map(r => `<tr data-id="${r.id}" data-type="resource">
      <td><span class="status-dot ${r.published ? 'on' : 'off'}">${r.published ? '已发布' : '草稿'}</span></td>
      <td class="title-cell"><b>${esc(r.title)}</b><br><span style="color:var(--muted)">${esc(r.originalName)} · ${fmtSize(r.size)}</span></td>
      <td>${r.section === 'catalog' ? esc(r.catalogType) : ({ policy: '政策', data: '数据' }[r.section] || '')}</td>
      <td><div class="row-actions">
        <button class="mini ${r.published ? 'unpub' : 'pub'}" data-act="toggle">${r.published ? '转草稿' : '发布'}</button>
        <button class="mini edit" data-act="edit">编辑</button>
        <button class="mini del" data-act="del">删除</button>
      </div></td></tr>`).join('')}
  </tbody></table>`;
}
function toolTable(list) {
  if (!list.length) return '<div class="empty">暂无工具，请在左侧添加</div>';
  return `<table class="table"><thead><tr><th>状态</th><th>名称 / 说明</th><th>链接</th><th>操作</th></tr></thead><tbody>
    ${list.map(t => `<tr data-id="${t.id}" data-type="tool">
      <td><span class="status-dot ${t.published ? 'on' : 'off'}">${t.published ? '已发布' : '草稿'}</span></td>
      <td class="title-cell"><b>${esc(t.icon || '🛠️')} ${esc(t.title)}</b><br><span style="color:var(--muted)">${esc(t.desc || '')}</span></td>
      <td style="max-width:300px;word-break:break-all"><a href="${esc(t.url)}" target="_blank" style="color:var(--primary-700)">${esc(t.url)}</a></td>
      <td><div class="row-actions">
        <button class="mini ${t.published ? 'unpub' : 'pub'}" data-act="toggle">${t.published ? '转草稿' : '发布'}</button>
        <button class="mini edit" data-act="edit">编辑</button>
        <button class="mini del" data-act="del">删除</button>
      </div></td></tr>`).join('')}
  </tbody></table>`;
}

function bindRowEvents() {
  document.querySelectorAll('#listArea tr[data-id]').forEach(tr => {
    const id = tr.dataset.id, type = tr.dataset.type;
    tr.querySelectorAll('.mini').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === 'del') onDelete(type, id);
        else if (act === 'toggle') onToggle(type, id);
        else if (act === 'edit') onEdit(type, id);
      };
    });
  });
}

async function onDelete(type, id) {
  if (!confirm('确定删除该项？此操作不可恢复。')) return;
  try {
    const base = type === 'notice' ? 'notices' : type === 'tool' ? 'tools' : 'resources';
    await api(`/api/admin/${base}/${id}`, { method: 'DELETE' });
    toast('已删除'); refreshStats(); loadList(curList);
  } catch (e) { toast(e.message); }
}
async function onToggle(type, id) {
  const base = type === 'notice' ? 'notices' : type === 'tool' ? 'tools' : 'resources';
  try {
    const item = await api(`/api/admin/${base}/${id}`);
    let body;
    if (type === 'notice') body = { published: !item.published };
    else if (type === 'tool') body = { published: !item.published, title: item.title, url: item.url, desc: item.desc, icon: item.icon };
    else body = { published: !item.published, title: item.title, desc: item.desc, catalogType: item.catalogType };
    await api(`/api/admin/${base}/${id}`, { method: 'PUT', json: true, body: JSON.stringify(body) });
    toast('状态已更新'); refreshStats(); loadList(curList);
  } catch (e) { toast(e.message); }
}

/* ---------- 编辑弹窗 ---------- */
function openModal(html) {
  let m = $('modal');
  if (!m) { m = document.createElement('div'); m.id = 'modal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:300;'; document.body.appendChild(m); }
  m.innerHTML = `<div style="background:#fff;border-radius:14px;padding:24px;width:420px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,.25)">
    <h3 style="margin-bottom:14px;font-size:17px">编辑</h3>${html}
    <div style="display:flex;gap:10px;margin-top:8px"><button id="m_ok" class="btn btn-primary" style="flex:1">保存</button><button id="m_cancel" class="btn btn-ghost" style="flex:1">取消</button></div>
  </div>`;
  m.style.display = 'flex';
  m.onclick = e => { if (e.target === m) closeModal(); };
  $('m_cancel').onclick = closeModal;
  return m;
}
function closeModal() { const m = $('modal'); if (m) m.style.display = 'none'; }

async function onEdit(type, id) {
  const base = type === 'notice' ? 'notices' : type === 'tool' ? 'tools' : 'resources';
  const item = await api(`/api/admin/${base}/${id}`);
  if (type === 'notice') {
    const m = openModal(`
      <div class="form-row"><label>标题</label><input id="e_title" value="${esc(item.title)}"></div>
      <div class="form-row"><label>正文</label><textarea id="e_content">${esc(item.content)}</textarea></div>
      <div class="form-row"><label>发布人</label><input id="e_author" value="${esc(item.author || '')}"></div>
      <div class="form-row"><label>日期</label><input id="e_date" type="date" value="${esc(item.date || '')}"></div>
      <div class="check-row"><input type="checkbox" id="e_pinned" ${item.pinned ? 'checked' : ''}><label for="e_pinned" style="margin:0">置顶</label></div>
      <div class="check-row"><input type="checkbox" id="e_pub" ${item.published ? 'checked' : ''}><label for="e_pub" style="margin:0">已发布</label></div>`);
    $('m_ok').onclick = async () => {
      try {
        await api('/api/admin/notices/' + id, { method: 'PUT', json: true, body: JSON.stringify({
          title: $('e_title').value, content: $('e_content').value, author: $('e_author').value,
          date: $('e_date').value, pinned: $('e_pinned').checked, published: $('e_pub').checked
        }) });
        closeModal(); toast('已保存'); loadList('notices');
      } catch (e) { toast(e.message); }
    };
  } else if (type === 'tool') {
    const m = openModal(`
      <div class="form-row"><label>名称</label><input id="e_title" value="${esc(item.title)}"></div>
      <div class="form-row"><label>图标</label><input id="e_icon" value="${esc(item.icon || '')}"></div>
      <div class="form-row"><label>链接</label><input id="e_url" value="${esc(item.url)}"></div>
      <div class="form-row"><label>说明</label><textarea id="e_desc">${esc(item.desc || '')}</textarea></div>
      <div class="check-row"><input type="checkbox" id="e_pub" ${item.published ? 'checked' : ''}><label for="e_pub" style="margin:0">已发布</label></div>`);
    $('m_ok').onclick = async () => {
      try {
        await api('/api/admin/tools/' + id, { method: 'PUT', json: true, body: JSON.stringify({
          title: $('e_title').value, icon: $('e_icon').value, url: $('e_url').value, desc: $('e_desc').value, published: $('e_pub').checked
        }) });
        closeModal(); toast('已保存'); loadList('tools');
      } catch (e) { toast(e.message); }
    };
  } else {
    const m = openModal(`
      <div class="form-row"><label>标题</label><input id="e_title" value="${esc(item.title)}"></div>
      <div class="form-row"><label>说明</label><textarea id="e_desc">${esc(item.desc || '')}</textarea></div>
      ${item.section === 'catalog' ? `<div class="form-row"><label>目录类型</label><select id="e_cat"><option ${item.catalogType === '药品' ? 'selected' : ''}>药品</option><option ${item.catalogType === '诊疗项目' ? 'selected' : ''}>诊疗项目</option><option ${item.catalogType === '耗材' ? 'selected' : ''}>耗材</option></select></div>` : ''}
      <div class="check-row"><input type="checkbox" id="e_pub" ${item.published ? 'checked' : ''}><label for="e_pub" style="margin:0">已发布</label></div>`);
    $('m_ok').onclick = async () => {
      try {
        const body = { title: $('e_title').value, desc: $('e_desc').value, published: $('e_pub').checked };
        if (item.section === 'catalog') body.catalogType = $('e_cat').value;
        await api('/api/admin/resources/' + id, { method: 'PUT', json: true, body: JSON.stringify(body) });
        closeModal(); toast('已保存'); loadList(curList);
      } catch (e) { toast(e.message); }
    };
  }
}

/* ---------- 启动 ---------- */
(async function init() {
  bindLoginUI(); // 无论是否已登录，先绑定登录/退出按钮，避免首次打开点登录无反应
  if (!token) { showLogin(); return; }
  try { await api('/api/admin/stats'); boot(); }
  catch (e) { showLogin(); } // token 失效（如服务端重启）则回到登录页
})();

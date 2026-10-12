/**
 * 医院医保专栏 - 后端服务（纯 Node.js，无外部依赖）
 * 运行： node server.js   （可选环境变量 PORT / SITE_NAME / ADMIN_PASSWORD / DATA_DIR）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = parseInt(process.env.PORT || '51888', 10);
const SITE_NAME = process.env.SITE_NAME || '医保专栏';
const MAX_UPLOAD = 200 * 1024 * 1024; // 单个文件上限 200MB

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------------- 数据层 ---------------- */
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* 损坏则重建 */ }
  }
  const defaultPw = process.env.ADMIN_PASSWORD || 'admin123';
  const init = {
    settings: { adminPasswordHash: crypto.createHash('sha256').update(defaultPw).digest('hex') },
    notices: [],
    resources: [],
    tools: []
  };
  init.notices.push({
    id: genId(),
    title: '欢迎使用医院医保专栏',
    content: '本专栏用于发布医保政策文件、通知公告、三大目录（药品/诊疗项目/耗材）及院内数据分享。管理员请通过后台发布与管理内容。',
    author: '医保办',
    date: new Date().toISOString().slice(0, 10),
    published: true,
    pinned: true
  });
  fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
  return init;
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function genId() { return crypto.randomBytes(8).toString('hex'); }

let db = loadDB();
if (!Array.isArray(db.tools)) db.tools = [];

/* ---------------- 会话（后台登录） ---------------- */
const sessions = new Set();
function makeToken() { const t = crypto.randomBytes(24).toString('hex'); sessions.add(t); return t; }
function checkAuth(req) { const t = req.headers['x-admin-token']; return !!(t && sessions.has(t)); }

/* ---------------- 工具函数 ---------------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('上传过大')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function stripFile(r) {
  const { storedName, ...rest } = r;
  return rest;
}

/* 按分隔符切分 Buffer，返回 Buffer 数组（兼容无 Buffer.split 的 Node 版本） */
function bufferSplit(buffer, sep) {
  const out = [];
  let start = 0, idx;
  while ((idx = buffer.indexOf(sep, start)) !== -1) {
    out.push(buffer.slice(start, idx));
    start = idx + sep.length;
  }
  out.push(buffer.slice(start));
  return out;
}

/* 解析 multipart/form-data（支持文本字段 + 单个文件字段） */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  const raw = bufferSplit(buffer, delim);
  for (const part of raw) {
    if (part.length < 4) continue;
    let p = part;
    if (p.slice(0, 2).equals(Buffer.from('\r\n'))) p = p.slice(2);
    if (p.slice(-2).equals(Buffer.from('\r\n'))) p = p.slice(0, -2);
    const he = p.indexOf('\r\n\r\n');
    if (he < 0) continue;
    const header = p.slice(0, he).toString('utf8');
    const content = p.slice(he + 4);
    const disp = header.match(/Content-Disposition:\s*form-data;\s*name="([^"]*)"(?:;\s*filename="([^"]*)")?/i);
    if (!disp) continue;
    const name = disp[1];
    const filename = disp[2];
    if (filename) {
      const ct = (header.match(/Content-Type:\s*(.+)/i) || [])[1] || 'application/octet-stream';
      parts.push({ name, filename, contentType: ct.trim(), content });
    } else {
      parts.push({ name, value: content.toString('utf8') });
    }
  }
  return parts;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/admin' || rel === '/admin.html') rel = '/admin.html';
  const fp = path.join(PUBLIC, path.normalize(rel));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- 业务处理 ---------------- */
async function handleApi(req, res, u) {
  const p = u.pathname;
  const method = req.method;

  // 公开接口
  if (p === '/api/health') return json(res, 200, { ok: true });
  if (p === '/api/public') return json(res, 200, { siteName: SITE_NAME, intelligentAuditUrl: db.settings.intelligentAuditUrl || '' });

  if (p === '/api/notices' && method === 'GET') {
    const list = db.notices.filter(n => n.published)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));
    return json(res, 200, list);
  }

  if (p === '/api/resources' && method === 'GET') {
    const section = u.searchParams.get('section');
    const ct = u.searchParams.get('catalogType');
    let list = db.resources.filter(r => r.published);
    if (section) list = list.filter(r => r.section === section);
    if (ct) list = list.filter(r => (r.catalogType || '') === ct);
    list = list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return json(res, 200, list.map(r => ({ ...stripFile(r), downloadUrl: '/api/download/' + r.id })));
  }

  if (p === '/api/tools' && method === 'GET') {
    const list = db.tools.filter(t => t.published)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return json(res, 200, list);
  }

  if (p.startsWith('/api/download/') && method === 'GET') {
    const id = p.split('/').pop();
    const r = db.resources.find(x => x.id === id);
    if (!r) return json(res, 404, { error: '文件不存在' });
    if (!r.published && !checkAuth(req)) return json(res, 403, { error: '无权限访问' });
    const fp = path.join(UPLOADS, r.storedName);
    if (!fs.existsSync(fp)) return json(res, 404, { error: '文件已丢失' });
    res.writeHead(200, {
      'Content-Type': r.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(r.originalName)}`,
      'Content-Length': r.size
    });
    return fs.createReadStream(fp).pipe(res);
  }

  // 登录
  if (p === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    let pw = '';
    try { pw = JSON.parse(body.toString('utf8')).password || ''; } catch (e) {}
    const hash = crypto.createHash('sha256').update(pw).digest('hex');
    if (hash === db.settings.adminPasswordHash) return json(res, 200, { token: makeToken() });
    return json(res, 401, { error: '密码错误' });
  }

  // 后台接口（需鉴权）
  if (p.startsWith('/api/admin/')) {
    if (!checkAuth(req)) return json(res, 401, { error: '未授权，请先登录' });

    if (p === '/api/admin/stats' && method === 'GET') {
      return json(res, 200, {
        notices: db.notices.length,
        resources: db.resources.length,
        publishedNotices: db.notices.filter(n => n.published).length,
        publishedResources: db.resources.filter(r => r.published).length
      });
    }

    if (p === '/api/admin/settings' && method === 'GET') {
      return json(res, 200, { intelligentAuditUrl: db.settings.intelligentAuditUrl || '' });
    }
    if (p === '/api/admin/settings' && method === 'PUT') {
      const body = await readBody(req);
      let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      if (o.intelligentAuditUrl !== undefined) db.settings.intelligentAuditUrl = String(o.intelligentAuditUrl);
      saveDB();
      return json(res, 200, { ok: true, intelligentAuditUrl: db.settings.intelligentAuditUrl });
    }

    if (p === '/api/admin/password' && method === 'PUT') {
      const body = await readBody(req);
      let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const cur = String(o.currentPassword || '');
      const neu = String(o.newPassword || '');
      if (crypto.createHash('sha256').update(cur).digest('hex') !== db.settings.adminPasswordHash)
        return json(res, 401, { error: '当前密码不正确' });
      if (neu.length < 6) return json(res, 400, { error: '新密码至少 6 位' });
      db.settings.adminPasswordHash = crypto.createHash('sha256').update(neu).digest('hex');
      saveDB();
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/notices' && method === 'GET') {
      return json(res, 200, db.notices.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    }
    if (p === '/api/admin/notices' && method === 'POST') {
      const body = await readBody(req);
      let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const n = {
        id: genId(), title: String(o.title || '').trim(), content: String(o.content || ''),
        author: String(o.author || '管理员'), date: String(o.date || new Date().toISOString().slice(0, 10)),
        published: o.published !== false, pinned: !!o.pinned
      };
      if (!n.title) return json(res, 400, { error: '标题必填' });
      db.notices.unshift(n); saveDB(); return json(res, 200, n);
    }
    let m = p.match(/^\/api\/admin\/notices\/([\w]+)$/);
    if (m && (method === 'PUT' || method === 'DELETE')) {
      const idx = db.notices.findIndex(n => n.id === m[1]);
      if (idx < 0) return json(res, 404, { error: '未找到' });
      if (method === 'DELETE') { db.notices.splice(idx, 1); saveDB(); return json(res, 200, { ok: true }); }
      const body = await readBody(req); let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const cur = db.notices[idx];
      Object.assign(cur, {
        title: o.title !== undefined ? String(o.title) : cur.title,
        content: o.content !== undefined ? String(o.content) : cur.content,
        author: o.author !== undefined ? String(o.author) : cur.author,
        date: o.date !== undefined ? String(o.date) : cur.date,
        published: o.published !== undefined ? !!o.published : cur.published,
        pinned: o.pinned !== undefined ? !!o.pinned : cur.pinned
      });
      saveDB(); return json(res, 200, cur);
    }

    if (p === '/api/admin/resources' && method === 'GET') {
      return json(res, 200, db.resources.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    }
    if (p === '/api/admin/resources' && method === 'POST') {
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('multipart/form-data')) return json(res, 400, { error: '请通过表单上传文件' });
      const b = ct.split('boundary=')[1] || '';
      const boundary = b.split(';')[0].trim().replace(/^"|"$/g, '');
      const body = await readBody(req);
      const parts = parseMultipart(body, boundary);
      const filePart = parts.find(x => x.filename);
      const getf = n => { const f = parts.find(x => x.name === n); return f ? f.value : ''; };
      if (!filePart) return json(res, 400, { error: '未收到文件' });
      const section = getf('section');
      if (!['policy', 'catalog', 'data'].includes(section)) return json(res, 400, { error: '栏目无效' });
      const originalName = filePart.filename;
      const safe = originalName.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
      const storedName = genId() + '_' + safe;
      fs.writeFileSync(path.join(UPLOADS, storedName), filePart.content);
      const r = {
        id: genId(), section, title: String(getf('title') || originalName).trim() || originalName,
        desc: String(getf('desc') || ''),
        catalogType: section === 'catalog' ? String(getf('catalogType') || '药品') : '',
        originalName, storedName, size: filePart.content.length, contentType: filePart.contentType,
        uploader: String(getf('uploader') || '管理员'),
        createdAt: new Date().toISOString(), published: getf('published') !== 'false'
      };
      db.resources.unshift(r); saveDB(); return json(res, 200, r);
    }
    m = p.match(/^\/api\/admin\/resources\/([\w]+)$/);
    if (m && (method === 'DELETE' || method === 'PUT')) {
      const idx = db.resources.findIndex(r => r.id === m[1]);
      if (idx < 0) return json(res, 404, { error: '未找到' });
      if (method === 'DELETE') {
        try { fs.unlinkSync(path.join(UPLOADS, db.resources[idx].storedName)); } catch (e) {}
        db.resources.splice(idx, 1); saveDB(); return json(res, 200, { ok: true });
      }
      const body = await readBody(req); let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const cur = db.resources[idx];
      Object.assign(cur, {
        title: o.title !== undefined ? String(o.title) : cur.title,
        desc: o.desc !== undefined ? String(o.desc) : cur.desc,
        catalogType: o.catalogType !== undefined ? String(o.catalogType) : cur.catalogType,
        published: o.published !== undefined ? !!o.published : cur.published
      });
      saveDB(); return json(res, 200, cur);
    }

    if (p === '/api/admin/tools' && method === 'GET') {
      return json(res, 200, db.tools.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    }
    if (p === '/api/admin/tools' && method === 'POST') {
      const body = await readBody(req);
      let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const t = {
        id: genId(),
        title: String(o.title || '').trim(),
        url: String(o.url || '').trim(),
        desc: String(o.desc || ''),
        icon: (String(o.icon || '').trim()) || '🛠️',
        published: o.published !== false,
        createdAt: new Date().toISOString()
      };
      if (!t.title) return json(res, 400, { error: '工具名称必填' });
      if (!/^https?:\/\//i.test(t.url)) return json(res, 400, { error: '链接需以 http:// 或 https:// 开头' });
      db.tools.unshift(t); saveDB(); return json(res, 200, t);
    }
    m = p.match(/^\/api\/admin\/tools\/([\w]+)$/);
    if (m && (method === 'DELETE' || method === 'PUT')) {
      const idx = db.tools.findIndex(t => t.id === m[1]);
      if (idx < 0) return json(res, 404, { error: '未找到' });
      if (method === 'DELETE') { db.tools.splice(idx, 1); saveDB(); return json(res, 200, { ok: true }); }
      const body = await readBody(req); let o = {}; try { o = JSON.parse(body.toString('utf8')); } catch (e) {}
      const cur = db.tools[idx];
      Object.assign(cur, {
        title: o.title !== undefined ? String(o.title) : cur.title,
        url: o.url !== undefined ? String(o.url) : cur.url,
        desc: o.desc !== undefined ? String(o.desc) : cur.desc,
        icon: o.icon !== undefined ? String(o.icon) : cur.icon,
        published: o.published !== undefined ? !!o.published : cur.published
      });
      saveDB(); return json(res, 200, cur);
    }

    return json(res, 404, { error: '未找到接口' });
  }

  return json(res, 404, { error: '未找到' });
}

/* ---------------- 启动 ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname.startsWith('/api/')) await handleApi(req, res, u);
    else serveStatic(req, res, u.pathname);
  } catch (e) {
    console.error('[ERR]', e);
    if (!res.headersSent) json(res, 500, { error: '服务器内部错误' });
    else try { res.end(); } catch (_) {}
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`医保专栏已启动： http://0.0.0.0:${PORT}`);
  console.log(`后台管理： http://<服务器IP>:${PORT}/admin   （默认密码 admin123，可用环境变量 ADMIN_PASSWORD 修改）`);
});

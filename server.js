const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'members.json');
const BLOCKED_WORDS_FILE = path.join(DATA_DIR, 'blocked_words.json');
const PORT = Number(process.env.PORT || 3000);
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]\n', { mode: 0o600 });

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function save(rows) { const tmp = `${DATA_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 }); fs.renameSync(tmp, DATA_FILE); }
function sidFor() { return crypto.randomBytes(8).toString('hex').toUpperCase(); }
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 16_384) reject(new Error('表单内容过大')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('无法解析请求内容')); } }); req.on('error', reject); }); }
function clean(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function nicknameIsBlocked(nickname) {
  let words;
  try { words = JSON.parse(fs.readFileSync(BLOCKED_WORDS_FILE, 'utf8')); } catch { words = []; }
  if (!Array.isArray(words)) return false;
  const candidate = nickname.normalize('NFKC').toLocaleLowerCase('zh-CN');
  return words.some(word => typeof word === 'string' && word.trim() && candidate.includes(word.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')));
}
function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && url.pathname === '/api/members') {
      const q = clean(url.searchParams.get('q') || '', 80).toLocaleLowerCase('zh-CN');
      const rows = load().filter(m => !q || [m.nickname, m.biliUid, m.hometown?.province, m.hometown?.city, m.active?.province, m.active?.city].some(x => String(x || '').toLocaleLowerCase('zh-CN').includes(q)));
      return send(res, 200, rows.map(({ nickname, biliUid, hometown, active, updatedAt }) => ({ nickname, biliUid, hometown, active, updatedAt })));
    }
    if (req.method === 'POST' && url.pathname === '/api/register') {
      return body(req).then(input => {
        const nickname = clean(input.nickname, 40), biliUid = clean(input.biliUid, 30);
        const region = x => ({ province: clean(x?.province, 30), city: clean(x?.city, 40) });
        const hometown = region(input.hometown), active = region(input.active);
        if (!nickname) return send(res, 400, { error: '请填写昵称。' });
        if (nicknameIsBlocked(nickname)) return send(res, 400, { error: '不要乱填名字哦！', blockedNickname: true });
        const hasHome = Boolean(hometown.province && hometown.city), hasActive = Boolean(active.province && active.city);
        const partialHome = Boolean(hometown.province || hometown.city) && !hasHome;
        const partialActive = Boolean(active.province || active.city) && !hasActive;
        if (!hasHome && !hasActive || partialHome || partialActive) return send(res, 400, { error: '家乡位置和活跃位置至少填写一项；填写某一项时请同时选择省份和城市。' });
        const members = load(), key = nickname.normalize('NFC').toLocaleLowerCase('zh-CN');
        const suppliedSid = clean(input.sid, 40).toUpperCase();
        const prior = members.find(m => m.nickname.normalize('NFC').toLocaleLowerCase('zh-CN') === key);
        const owner = suppliedSid ? members.find(m => m.map_sid === suppliedSid) : null;
        if (prior && prior !== owner) return send(res, 409, { error: '你之前似乎已经加入过地图了哦？如果确实是你，请在下方填写神秘代码：', needsSid: true });
        // A valid SID identifies the existing account even when its nickname changes.
        // Remove that account's old row, then insert the submitted profile atomically.
        const member = { nickname, biliUid, hometown, active, map_sid: owner?.map_sid || sidFor(), updatedAt: new Date().toISOString() };
        const next = members.filter(m => m !== owner && m !== prior);
        next.push(member);
        save(next);
        return send(res, 200, { ok: true, map_sid: member.map_sid, member: { nickname, biliUid, hometown, active, updatedAt: member.updatedAt } });
      }).catch(err => send(res, 400, { error: err.message || '提交失败' }));
    }
    return send(res, 404, { error: '接口不存在' });
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = rel === 'map_china_2019.jpg' ? path.join(ROOT, rel) : path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, 'index.html') && file !== path.join(ROOT, 'map_china_2019.jpg')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  });
}
http.createServer(handler).listen(PORT, () => console.log(`音MADer 地图 (Alpha) running at http://localhost:${PORT}`));

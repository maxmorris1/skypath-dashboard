/* SkyPath — shared client behaviour */
const $ = (id) => document.getElementById(id);
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function post(url, body) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}) });
    location.reload();
  } catch (e) { console.error(e); }
}

/* ---------------------------------------------------------- companion */
function renderCtx(s) {
  if (!s) { $('ctx').innerHTML = '<div class="empty">Waiting for your world…</div>'; return; }
  const rows = [
    ['area', s.area], ['location', s.location],
    ['coords', 'X ' + Math.round(s.x) + '  Y ' + Math.round(s.y) + '  Z ' + Math.round(s.z)],
    ['health', Math.round(s.health)], ['facing', Math.round(s.yaw) + '°'],
    ['dimension', String(s.dimension || '').replace('minecraft:', '')],
    ['server', s.server], ['player', s.player]
  ];
  $('ctx').innerHTML = rows.map(([k, v]) =>
    `<div class="spread tiny" style="padding:5px 0;border-bottom:1px solid #ffffff08">
      <span class="muted">${k}</span><span style="color:#d6d3cd">${escHtml(v == null ? '—' : v)}</span></div>`).join('');
  const sb = Array.isArray(s.scoreboard) ? s.scoreboard : [];
  $('scoreboard').textContent = sb.length ? sb.join('\n') : 'No scoreboard snapshot yet.';

  const list = Array.isArray(s.nearbyEntities) ? s.nearbyEntities : [];
  $('npcs').innerHTML = list.length
    ? list.map(n => `<div class="spread tiny" style="padding:6px 0;border-bottom:1px solid #ffffff08">
        <span style="color:#d6d3cd">${escHtml(n.name)} <span class="dim">${escHtml(n.type || '')}</span></span>
        <span><span style="color:var(--amber)">${Math.round(n.distance)}m</span>
        <span class="pixel" style="color:var(--sky);margin-left:8px">${escHtml(n.compass || '')}</span></span></div>`).join('')
    : '<div class="empty">No known NPCs in view.</div>';
}

let lastFocus = '';
async function refreshCompanion() {
  try {
    const d = await (await fetch('/api/dashboard', { cache: 'no-store' })).json();
    renderCtx(d.state);
    const st = $('status'), txt = $('statusText');
    if (d.connected) { st.classList.add('live');
      txt.textContent = 'live · ' + Math.round((Date.now() - d.lastStateAt) / 1000) + 's ago'; }
    else if (d.paired) { st.classList.remove('live'); txt.textContent = 'paired · waiting for SkyBlock'; }
    else { st.classList.remove('live'); txt.textContent = 'not connected'; }

    if (d.focus && d.focus.goal && $('curFocus') && d.focus.goal !== lastFocus) {
      lastFocus = d.focus.goal; $('curFocus').textContent = d.focus.goal;
      if (sessionStorage.getItem('skypath-notify') === '1') notify('SkyPath focus', d.focus.stepTitle);
    }
  } catch (e) {}
}

function notify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(title, { body });
  } catch (e) {}
}

if ($('status')) { refreshCompanion(); setInterval(refreshCompanion, 2500); }

if ($('notifyBtn')) $('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) { $('notifyBtn').textContent = 'unsupported'; return; }
  const r = await Notification.requestPermission();
  sessionStorage.setItem('skypath-notify', r === 'granted' ? '1' : '0');
  $('notifyBtn').textContent = r === 'granted' ? 'notifications on' : 'notifications blocked';
});

if ($('genCode')) $('genCode').addEventListener('click', async () => {
  const d = await (await fetch('/api/pair/code', { method: 'POST' })).json();
  $('codeVal').textContent = d.code.split('').join(' ');
  $('codeVal').dataset.raw = d.code;               // exact text the copy button sends
  $('copyCode').disabled = false;
  $('copyCode').textContent = '⧉ copy code';
  let left = d.expiresInSeconds;
  $('codeExp').textContent = left + 's';
  const iv = setInterval(() => { left--; $('codeExp').textContent = left > 0 ? left + 's' : 'expired';
    if (left <= 0) clearInterval(iv); }, 1000);
});

if ($('copyCode')) $('copyCode').addEventListener('click', async () => {
  const code = ($('codeVal').dataset.raw || $('codeVal').textContent).replace(/\s+/g, '');
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; }
  catch (e) {                                     // fallback for non-secure origins (LAN http)
    try {
      const t = document.createElement('textarea');
      t.value = code; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      ok = document.execCommand('copy');
      t.remove();
    } catch (e2) {}
  }
  $('copyCode').textContent = ok ? '✓ copied — /skypath pair ' + code : 'select it manually';
  setTimeout(() => { $('copyCode').textContent = '⧉ copy code'; }, 4000);
});

if ($('revoke')) $('revoke').addEventListener('click', async () => {
  await fetch('/api/revoke', { method: 'POST' }); location.reload();
});

/* -------------------------------------------------------------- goals */
function filterGoals(attr, value) {
  document.querySelectorAll('#goalList > .card').forEach(c => {
    const hit = attr === null || c.dataset[attr] === value;
    c.style.display = hit ? '' : 'none';
  });
}
function addGoal() {
  post('/api/goals/add', {
    title: $('gTitle').value, cat: $('gCat').value,
    current: $('gCur').value || 0, target: $('gTgt').value || 1,
    unit: $('gUnit').value, priority: $('gPri').value
  });
}
function addGoalFrom(title) {
  post('/api/goals/add', { title, cat: 'other', current: 0, target: 1, unit: 'level', priority: 'medium' });
}

/* ------------------------------------------------------------ roadmap */
function filterRoadmap(cat) {
  document.querySelectorAll('[data-rm-cat]').forEach(el => {
    const ok = (cat === 'all' || el.dataset.rmCat === cat);
    el.style.display = ok ? '' : 'none';
  });
}
function toggleDone(e) {
  const hide = e.target.checked;
  document.querySelectorAll('[data-rm-done]').forEach(el => {
    if (hide && el.dataset.rmDone === 'true') el.style.display = 'none';
    else el.style.display = '';
  });
}

/* ------------------------------------------------------------ advisor */
function addMsg(cls, text) {
  const d = document.createElement('div');
  d.style.marginTop = '10px'; d.className = cls;
  d.innerHTML = text; $('chat').appendChild(d); $('chat').scrollTop = $('chat').scrollHeight;
}
async function ask(q) { $('q').value = q; await send({ preventDefault() {} }); }
async function send(ev) {
  ev.preventDefault();
  const q = $('q').value.trim();
  if (!q) return false;
  $('q').value = '';
  addMsg('', '<b style="color:#d6d3cd">❯ ' + escHtml(q) + '</b>');
  addMsg('', '<span style="color:var(--faint)">thinking…</span>');
  const r = await (await fetch('/api/advisor/ask', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) })).json();
  $('chat').lastChild.remove();
  addMsg('', '✦ ' + escHtml(r.answer).replace(/\n/g, '<br>'));
  return false;
}

/* -------------------------------------------------------- accessories */
async function optimize() {
  const budget = $('budget').value;
  const d = await (await fetch('/api/accessories/optimize', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ budget }) })).json();
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : n;
  $('optResult').innerHTML = `<div style="color:#6ee7b7">+${d.mp} MP for ${fmt(d.spend)} → ${d.picks.length} accessories.</div>` +
    d.picks.map((p, i) => `<div class="spread tiny" style="padding:3px 0">
      <span style="color:#d6d3cd">${i + 1}. ${escHtml(p.name)}</span>
      <span><span style="color:var(--sky)">+${p.mp} MP</span> <span style="color:var(--amber);margin-left:8px">${escHtml(p.cost === 0 ? 'free' : fmt(p.cost))}</span></span></div>`).join('');
}

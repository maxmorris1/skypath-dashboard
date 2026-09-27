/**
 * SkyPath — full SkyBlock progression companion.
 *
 * Zero dependencies (Node stdlib only). Ports the original Next.js app:
 *   overview / live companion / goals / roadmap / advisor / accessories / economy / profile
 * and keeps the read-only Fabric mod bridge:
 *   POST /api/game/pair   { code }   -> { token }
 *   POST /api/game/state  {...}      -> 200   (Bearer)
 *   GET  /api/game/guide             -> { goal, stepTitle, destination }
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DOWNLOADS = path.join(ROOT, 'downloads');
const DATA_FILE = path.join(ROOT, 'data.json');
const DATA_DEFAULT = path.join(ROOT, 'data.default.json');
const ROADMAP_FILE = path.join(ROOT, 'data', 'roadmap.json');
const ACCESSORIES_FILE = path.join(ROOT, 'data', 'accessories.json');

const JAR_NAME = 'skypath-companion-2.0.1.jar';
const MC_VERSION = '26.1.2';
const FABRIC_API = '0.155.3+26.1.2';
const CODE_TTL_MS = 5 * 60 * 1000;
const REFRESH_MS = 2500;

if (!fs.existsSync(DATA_FILE)) { fs.copyFileSync(DATA_DEFAULT, DATA_FILE); console.log('[skypath] seeded data.json from data.default.json'); }
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const ROADMAP = JSON.parse(fs.readFileSync(ROADMAP_FILE, 'utf8'));
const ACCESSORIES = JSON.parse(fs.readFileSync(ACCESSORIES_FILE, 'utf8'));

const persist = () => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 1)); } catch (e) {} };
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ------------------------------------------------------------------ format

function coins(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'b';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'm';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}
function parseCost(s) {
  const m = String(s || '').trim().toLowerCase().replace(/[^0-9.kmb]/g, '');
  const n = parseFloat(m);
  if (isNaN(n)) return 0;
  if (m.endsWith('b')) return n * 1e9;
  if (m.endsWith('m')) return n * 1e6;
  if (m.endsWith('k')) return n * 1e3;
  return n;
}
function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
function barColor(p) { return p >= 90 ? 'var(--emerald)' : p >= 50 ? 'var(--sky)' : 'var(--amber)'; }
function bar(p, color) {
  p = Math.max(0, Math.min(100, Number(p) || 0));
  return `<div class="bar"><span style="width:${p}%;background:${color || barColor(p)}"></span></div>`;
}

// ------------------------------------------------------------------- model

function goalPct(g) {
  if (g.done) return 100;
  if (!g.target) return 0;
  return Math.max(0, Math.min(100, (g.current / g.target) * 100));
}
function activeFocus() {
  let goal = data.focusGoalId ? data.goals.find(g => g.id === data.focusGoalId && !g.done) : null;
  if (!goal) goal = data.goals.find(g => !g.done);
  if (!goal) return { goal: '', stepTitle: 'Pick a goal on SkyPath', destination: '', rationale: '', method: '' };
  const step = goal.steps.find(s => !s.done);
  return {
    goal: goal.title,
    stepTitle: step ? step.title : 'Every step is checked — add a new one',
    destination: goal.destination || '',
    rationale: goal.rationale || '',
    method: goal.method || ''
  };
}
function roadmapDone(m) {
  return Object.prototype.hasOwnProperty.call(data.roadmapOverrides, m.id)
    ? data.roadmapOverrides[m.id] : m.done;
}
function roadmapStats() {
  const total = ROADMAP.length;
  const done = ROADMAP.filter(roadmapDone).length;
  return { total, done };
}
function skillAvg() {
  const v = Object.values(data.profile.skills);
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
}
function isConnected() {
  return !!(data.bridge.tokenHash && !data.bridge.revoked && data.lastStateAt &&
    Date.now() - data.lastStateAt < 30000);
}

// ------------------------------------------------------------------ layout

const NAV = [
  { href: '/', key: 'overview', label: 'overview', kbd: '1' },
  { href: '/companion', key: 'companion', label: 'live companion', kbd: '2' },
  { href: '/goals', key: 'goals', label: 'goals', kbd: '3' },
  { href: '/roadmap', key: 'roadmap', label: 'roadmap', kbd: '4' },
  { href: '/advisor', key: 'advisor', label: 'advisor', kbd: '5' },
  { href: '/accessories', key: 'accessories', label: 'accessories', kbd: '6' },
  { href: '/bazaar', key: 'economy', label: 'economy', kbd: '7', group: 'tools' },
  { href: '/profile', key: 'profile', label: 'profile', kbd: '8' }
];

function layout(active, head, body) {
  const p = data.profile;
  const nav = NAV.map(n => {
    const on = n.key === active ? ' on' : '';
    return (n.group ? `<div class="label grp">${n.group}</div>` : '') +
      `<a class="${on.trim()}" href="${n.href}"><span><span class="arw">❯</span>${n.label}</span><span class="kbd">${n.kbd}</span></a>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SkyPath — SkyBlock progression companion</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/app.css"></head><body>
<div class="shell">
<aside>
  <a class="brand" href="/">
    <div class="logo">S</div>
    <div><div class="name">SkyPath</div><div class="sub">progression companion</div></div>
  </a>
  <nav>${nav}</nav>
  <div class="track">
    <div class="label">tracking</div>
    <div class="pixel" style="margin-top:6px;font-size:16px;color:#f5f3ef">${esc(p.username)}</div>
    <div class="tiny" style="color:#9c968b">${esc(p.profileName)} · lvl ${p.level}</div>
    <div class="chip" style="margin-top:8px;border-color:#6366f140;background:#6366f114;color:var(--indigo-lt)">${esc(p.stage)}</div>
  </div>
</aside>
<main><div class="wrap">
  <div style="margin-bottom:28px">${head}</div>
  ${body}
</div></main>
</div>
<script src="/app.js"></script>
</body></html>`;
}

function statCard(label, value, sub, accent) {
  return `<div class="card pad" style="position:relative;overflow:hidden">
    <div class="accent-l" style="background:${accent}"></div>
    <div style="padding-left:8px"><div class="label">${esc(label)}</div>
    <div class="pixel" style="margin-top:6px;font-size:24px;line-height:1;color:#faf9f7">${value}</div>
    <div class="tiny muted" style="margin-top:6px">${sub}</div></div></div>`;
}

// --------------------------------------------------------------- overview

function pageOverview() {
  const p = data.profile;
  const rs = roadmapStats();
  const snaps = data.snapshots;
  const week = snaps.length > 6 ? ((snaps[0].value - snaps[6].value) / snaps[6].value * 100) : 0;
  const mid = ROADMAP.filter(m => m.stage === 'Mid Game');
  const skills = Object.entries(p.skills).map(([k, v]) =>
    `<div><div class="spread tiny"><span class="muted">${k.slice(0, 5)}</span><span class="pixel">${v}</span></div>
     ${bar(v / 60 * 100, 'var(--sky)')}</div>`).join('');
  const slayers = Object.entries(p.slayers).map(([k, v]) =>
    `<div><div class="spread tiny"><span class="muted">${k.slice(0, 5)}</span><span class="pixel">${v}</span></div>
     ${bar(v / 9 * 100, 'var(--pink)')}</div>`).join('');
  const priorities = data.advisor.slice(0, 6).map((a, i) =>
    `<li class="row" style="align-items:flex-start;gap:12px">
      <span class="pixel" style="color:var(--indigo-lt);font-size:14px">${String(i + 1).padStart(2, '0')}</span>
      <div style="min-width:0"><div class="sm" style="color:#f5f3ef">${esc(a.title)}</div>
      <div class="tiny dim" style="margin-top:2px">${esc(a.desc)}</div></div></li>`).join('');
  const closest = ROADMAP.filter(m => !roadmapDone(m) && m.pct != null).sort((a, b) => b.pct - a.pct).slice(0, 3)
    .map(m => `<div><div class="spread tiny"><span style="color:#d6d3cd">${esc(m.title)}</span><span class="dim">${m.pct}%</span></div>
      <div style="margin-top:4px">${bar(m.pct, 'var(--emerald)')}</div></div>`).join('');
  const bazaar = data.bazaar.map(b =>
    `<li class="spread tiny"><span style="color:#d6d3cd">${esc(b.name)}</span><span style="color:#6ee7b7">${esc(b.delta)}</span></li>`).join('');

  return layout('overview',
    `<div class="spread" style="align-items:flex-end;flex-wrap:wrap;gap:16px">
      <div><div class="label prompt">${esc(p.stage.toLowerCase())} · lvl ${p.level} · ${esc(p.profileName)}</div>
        <h1 class="page">${esc(p.username)}</h1>
        <p class="lede">Updated ${timeAgo(p.updatedAt)}. Here's where you are, what's next, and what you're working toward.</p></div>
      <form class="row" method="POST" action="/api/snapshot">
        <input class="input" style="width:140px" name="value" placeholder="net worth" value="${p.networth}">
        <button class="btn-ghost" type="submit">+ snapshot</button></form>
    </div>`,
    `<div class="grid g6" style="margin-bottom:20px">
      ${statCard('net worth', coins(p.networth), `<span style="color:#6ee7b7">${week >= 0 ? '+' : ''}${week.toFixed(1)}% / 7d</span>`, 'var(--emerald)')}
      ${statCard('liquid', coins(p.purse + p.bank), `purse ${coins(p.purse)}`, 'var(--amber)')}
      ${statCard('skill avg', skillAvg(), `combat ${p.skills.combat} · mining ${p.skills.mining}`, 'var(--indigo)')}
      ${statCard('catacombs', p.cata, 'F7 unlocked', 'var(--pink)')}
      ${statCard('magical power', p.mp, `${ROADMAP.length && p.mp} · 51 accessories`, 'var(--sky)')}
      ${statCard('roadmap', `${rs.done}/${rs.total}`, `${mid.filter(roadmapDone).length}/${mid.length} in mid game`, 'var(--emerald)')}
    </div>
    <div class="grid g3">
      <div class="card pad">
        <div class="spread" style="margin-bottom:12px"><h2 class="card-title">focus next</h2>
          <a class="tiny" style="color:var(--indigo-lt)" href="/advisor">ask advisor →</a></div>
        <ol style="list-style:none;margin:0;padding:0;display:grid;gap:12px">${priorities}</ol>
      </div>
      <div class="card pad">
        <div class="spread" style="margin-bottom:12px"><h2 class="card-title">closest milestones</h2>
          <a class="tiny" style="color:var(--indigo-lt)" href="/roadmap">roadmap →</a></div>
        <div style="display:grid;gap:12px">${closest || '<div class="empty">Nothing in progress.</div>'}</div>
        <hr class="sep">
        <div class="label" style="margin-bottom:8px">skills</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px 16px">${skills}</div>
        <div class="label" style="margin:16px 0 8px">slayers</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px 16px">${slayers}</div>
      </div>
      <div class="card pad">
        <div class="spread" style="margin-bottom:12px"><h2 class="card-title">bazaar moves</h2>
          <span class="chip">live bazaar</span></div>
        <ul style="list-style:none;margin:0;padding:0;display:grid;gap:10px">${bazaar}</ul>
        <hr class="sep">
        <div class="label" style="margin-bottom:8px">recent net worth</div>
        ${snaps.slice(0, 6).map(s => `<div class="spread tiny"><span class="muted">${esc(s.date)}</span>
          <span class="pixel">${coins(s.value)}</span>
          <span style="color:${(s.delta || '').startsWith('-') ? '#f87171' : '#6ee7b7'}">${esc(s.delta || '')}</span></div>`).join('')}
      </div>
    </div>`);
}

// -------------------------------------------------------------- companion

function pageCompanion() {
  const f = activeFocus();
  const goalOpts = [`<label class="row tiny" style="gap:8px;cursor:pointer;padding:5px 0">
      <input type="radio" name="focus" value="" ${!data.focusGoalId ? 'checked' : ''}
        onchange="post('/api/focus',{goalId:''})">
      <span style="color:${!data.focusGoalId ? 'var(--indigo-lt)' : '#9c968b'}">Auto · highest-priority active goal</span></label>`]
    .concat(data.goals.filter(g => !g.done).map(g => `<label class="row tiny" style="gap:8px;cursor:pointer;padding:5px 0">
      <input type="radio" name="focus" value="${g.id}" ${data.focusGoalId === g.id ? 'checked' : ''}
        onchange="post('/api/focus',{goalId:'${g.id}'})">
      <span style="color:${data.focusGoalId === g.id ? 'var(--indigo-lt)' : '#9c968b'}">${esc(g.title)}</span></label>`)).join('');

  return layout('companion',
    `<div class="label prompt" style="margin-bottom:8px">live companion</div>
     <h1 class="page">Stay in the game</h1>
     <p class="lede">Keep SkyPath beside Minecraft on your second screen, or pin the goal card inside the game.
       The companion reads visible game context, points out nearby named NPCs and keeps your next progression step in view.</p>`,
    `<div class="spread" style="margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div class="row" style="gap:20px">
        <div><div class="pixel" style="font-size:22px">${(REFRESH_MS / 1000).toFixed(1)}s</div>
          <div class="label">dashboard refresh</div></div>
        <div id="status" class="pill"><span class="dot"></span><span id="statusText">not connected</span></div>
      </div>
      <button class="btn-ghost" id="notifyBtn">enable notifications</button>
    </div>

    <div class="grid g3">
      <div class="card pad">
        <h2 class="card-title">live game context</h2>
        <div class="tiny dim" style="margin:4px 0 12px">Once paired, your scoreboard location appears here automatically.</div>
        <div id="ctx"><div class="empty">Waiting for your world…</div></div>
      </div>

      <div class="card pad">
        <h2 class="card-title">your next step</h2>
        <div class="tiny dim" style="margin:4px 0 12px">suggested destination · not an autopilot</div>
        <div class="pixel" style="font-size:17px;color:#faf9f7">${esc(f.stepTitle)}</div>
        ${f.rationale ? `<div class="tiny muted" style="margin-top:8px;line-height:1.7">${esc(f.rationale)}</div>` : ''}
        <div style="margin-top:14px"><div class="label">goal</div>
          <div class="sm" style="color:#d6d3cd;margin-top:3px">${esc(f.goal || '—')}</div></div>
        ${f.destination ? `<div style="margin-top:12px"><div class="label">suggested destination</div>
          <div class="sm" style="color:var(--amber);margin-top:3px">${esc(f.destination)}</div></div>` : ''}
        ${f.method ? `<div class="tiny dim" style="margin-top:10px">${esc(f.method)}</div>` : ''}
        <div class="tiny dim" style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
          SkyPath reads the location text from your Hypixel sidebar scoreboard.</div>
      </div>

      <div class="card pad">
        <h2 class="card-title">local entity scan</h2>
        <div class="tiny dim" style="margin:4px 0 12px">client-loaded names · no through-wall scan</div>
        <div id="npcs"><div class="empty">Pair the mod and connect to Hypixel to discover nearby NPCs.</div></div>
        <div class="tiny dim" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;line-height:1.7">
          Directions are relative to your current facing. This is a convenience hint, not a pathfinder:
          it never reads hidden entities or moves your character.</div>
      </div>
    </div>

    <div class="grid g2" style="margin-top:12px">
      <div class="card pad">
        <h2 class="card-title">Visible scoreboard context</h2>
        <div class="tiny dim" style="margin:4px 0 12px">no chat capture</div>
        <div class="scroll" style="font-size:12px;white-space:pre-wrap;color:#9c968b" id="scoreboard">No scoreboard snapshot yet.</div>
      </div>
      <div class="card pad">
        <h2 class="card-title">focus for the overlay</h2>
        <div class="tiny dim" style="margin:4px 0 12px">The first unchecked step for this goal is shown in Minecraft.</div>
        <div id="goalOpts">${goalOpts}</div>
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
          <div class="label">current focus</div>
          <div class="sm" style="color:#faf9f7;margin-top:4px" id="curFocus">${esc(f.goal || '—')}</div></div>
      </div>
    </div>

    <div class="card pad" style="margin-top:12px">
      <h2 class="card-title">pair the Fabric mod</h2>
      <div class="tiny dim" style="margin:4px 0 14px;max-width:720px;line-height:1.7">Download the compiled client mod,
        install it with Fabric API, then pair once with a short-lived code. Your bearer token is stored only in your
        local Minecraft config; the site stores its hash.</div>
      <div class="row" style="margin-bottom:14px">
        <a class="btn" href="/downloads/${JAR_NAME}" download>↓ download SkyPath Companion · 2.0.1</a>
        <button class="btn-ghost" id="genCode">generate pairing code</button>
        <button class="btn-danger" id="revoke">revoke bridge</button>
      </div>
      <div class="tiny dim" style="margin-bottom:12px">Fabric · Minecraft ${MC_VERSION} · Java 25 · Fabric API ${FABRIC_API} required</div>
      <div class="card pad" style="background:var(--surface2);border-style:dashed">
        <div class="spread">
          <div><div class="label">pairing code</div>
            <div class="pixel" style="font-size:26px;letter-spacing:5px;color:var(--amber);margin-top:6px;user-select:all" id="codeVal">· · · · · ·</div>
            <button id="copyCode" class="btn" style="margin-top:8px;padding:5px 14px;font-size:12px" disabled>⧉ copy code</button></div>
          <div style="text-align:right"><div class="label">expires</div><div id="codeExp" style="margin-top:6px">—</div></div>
        </div>
      </div>
      <ol style="margin:16px 0 0;padding-left:20px;color:#9c968b;font-size:12.5px;line-height:1.8">
        <li>Install <b>Fabric Loader for Minecraft ${MC_VERSION}</b> and the matching Fabric API (${FABRIC_API}). Put the downloaded jar in your Minecraft <code>mods</code> folder.</li>
        <li>Launch the Fabric profile. Generate a pairing code here, then run the two local commands below in Minecraft (they are not sent to Hypixel chat).</li>
        <li>Join Hypixel SkyBlock. This page updates live; press <code>O</code> to toggle the in-game corner card.</li>
      </ol>
      <div style="margin-top:14px;display:grid;gap:6px">
        <code class="tiny" style="display:block;background:#121110;border:1px solid var(--border);border-radius:8px;padding:10px">/skypath url &lt;this page's https address&gt;</code>
        <code class="tiny" style="display:block;background:#121110;border:1px solid var(--border);border-radius:8px;padding:10px">/skypath pair &lt;code&gt;</code>
      </div>
      <hr class="sep">
      <div class="label" style="margin-bottom:8px">privacy &amp; safety</div>
      <div class="tiny dim" style="line-height:1.8">The mod sends your Minecraft username, Hypixel scoreboard text, area,
        coordinates, health and nearby named entities every five seconds. It never captures screenshots, chat, inventory,
        keys or packets. No clicks, commands to Hypixel, macros, movement, combat helpers or hidden-entity scanning.
        Hypixel mods are use-at-your-own-risk; check current rules before use. Revoke the bridge here to invalidate its token.</div>
    </div>`);
}

// ------------------------------------------------------------------ goals

function pageGoals() {
  const active = data.goals.filter(g => !g.done);
  const done = data.goals.filter(g => g.done);
  const days = active.reduce((a, g) => a + (parseFloat(g.eta) || 0), 0);
  const cats = ['skill','slayer','dungeons','coins','collection','accessory','gear','pet','other'];
  const cards = data.goals.map(g => {
    const pct = goalPct(g);
    const remain = g.unit === 'coins' ? coins((g.target - g.current) * 1e6) : (g.target - g.current);
    return `<div class="card pad" data-cat="${esc(g.cat)}" data-pri="${esc(g.priority)}">
      <div class="spread" style="align-items:flex-start">
        <div style="min-width:0">
          <div class="sm" style="color:#faf9f7;${g.done ? 'text-decoration:line-through;color:var(--dim)' : ''}">${esc(g.title)}</div>
          <div class="row" style="gap:6px;margin-top:6px"><span class="chip">${esc(g.cat)}</span>
            <span class="chip">${esc(g.priority)}</span></div>
          ${g.method ? `<div class="tiny dim" style="margin-top:8px">${esc(g.method)}</div>` : ''}
        </div>
        <div class="row" style="gap:6px">
          <button class="btn-ghost" style="padding:4px 8px;font-size:11px"
            onclick="post('/api/goals/toggle',{id:'${g.id}'})">${g.done ? '↺' : '✓ done'}</button>
          <button class="btn-danger" style="padding:4px 8px;font-size:11px"
            onclick="post('/api/goals/remove',{id:'${g.id}'})">✕</button>
        </div>
      </div>
      <div class="spread tiny" style="margin-top:14px">
        <span class="pixel" style="font-size:13px">${g.unit === 'coins' ? coins(g.current * 1e6) : g.current}
          <span class="dim">/ ${g.unit === 'coins' ? coins(g.target * 1e6) : g.target} ${esc(g.unit)}</span></span>
        <span class="dim">${Math.round(pct)}%</span>
      </div>
      <div style="margin-top:6px">${bar(pct)}</div>
      <div class="tiny dim" style="margin-top:8px">remaining <b style="color:#9c968b">${remain}</b>${g.eta ? ` · eta <b style="color:var(--amber)">${esc(g.eta)}</b> (${esc(g.etaHours || '')})` : ''}</div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;display:grid;gap:6px">
        ${g.steps.map(s => `<label class="row tiny" style="gap:8px;cursor:pointer">
          <input type="checkbox" class="tick" ${s.done ? 'checked' : ''}
            onchange="post('/api/goals/step',{id:'${g.id}',stepId:'${s.id}'})">
          <span style="color:${s.done ? 'var(--dim)' : '#9c968b'};${s.done ? 'text-decoration:line-through' : ''}">${esc(s.title)}</span></label>`).join('')}
      </div>
      <button class="btn-ghost" style="margin-top:12px;padding:5px 10px;font-size:11px"
        onclick="location.href='/advisor'">✦ help me get there</button>
    </div>`;
  }).join('');

  return layout('goals',
    `<div class="label prompt" style="margin-bottom:8px">goals</div>
     <h1 class="page">What you're working toward</h1>
     <p class="lede">Each goal gets a concrete plan: requirements, steps, the best method and an ETA.
       Plans are generated by an AI model if one is connected, Gemini Nano in Chrome, or SkyPath's built-in planner.</p>`,
    `<div class="row" style="gap:20px;margin-bottom:18px">
      <div><div class="pixel" style="font-size:22px">${active.length}</div><div class="label">active</div></div>
      <div><div class="pixel" style="font-size:22px">${done.length}</div><div class="label">done</div></div>
      <div><div class="pixel" style="font-size:22px">≈${days.toFixed(1)}d</div><div class="label">of play queued</div></div>
      <button class="btn" onclick="document.getElementById('newGoal').scrollIntoView({behavior:'smooth'})">new goal</button>
    </div>
    <div class="row" style="margin-bottom:16px">
      ${cats.map(c => `<button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="filterGoals('cat','${c}')">${c}</button>`).join('')}
      <span class="dim tiny" style="margin-left:8px">|</span>
      ${['high','medium','low'].map(c => `<button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="filterGoals('pri','${c}')">${c}</button>`).join('')}
      <button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="filterGoals(null,null)">show all</button>
    </div>
    <div class="grid g2" id="goalList">${cards || '<div class="empty">No goals yet.</div>'}</div>
    <div class="card pad" style="margin-top:16px" id="newGoal">
      <h2 class="card-title">add goal</h2>
      <div class="grid" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr auto;gap:8px;margin-top:12px">
        <input class="input" id="gTitle" placeholder="title">
        <select class="input" id="gCat">${cats.map(c => `<option>${c}</option>`).join('')}</select>
        <input class="input" id="gCur" placeholder="current" type="number" step="any">
        <input class="input" id="gTgt" placeholder="target" type="number" step="any">
        <select class="input" id="gUnit"><option>level</option><option>coins</option><option>MP</option></select>
        <select class="input" id="gPri"><option>high</option><option selected>medium</option><option>low</option></select>
        <button class="btn" onclick="addGoal()">add</button>
      </div>
      <hr class="sep">
      <div class="label" style="margin-bottom:8px">how planning works</div>
      <ol class="tiny dim" style="margin:0;padding-left:18px;line-height:1.9">
        <li>Cloud model if <code>ANTHROPIC_API_KEY</code>, <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> is set.</li>
        <li>Otherwise Chrome's on-device Gemini Nano if available.</li>
        <li>Otherwise the built-in planner — deterministic, uses your stats and SkyPath's method database.</li>
      </ol>
    </div>`);
}

// ---------------------------------------------------------------- roadmap

function pageRoadmap() {
  const rs = roadmapStats();
  const stages = ['Early Game', 'Mid Game', 'Late Game'];
  const cats = ['all','combat','mining','farming','gear','dungeons','slayer','accessories','economy','skills'];
  const html = stages.map(st => {
    const items = ROADMAP.filter(m => m.stage === st);
    const d = items.filter(roadmapDone).length;
    return `<div style="margin-bottom:22px">
      <div class="spread" style="margin-bottom:10px">
        <div class="row" style="gap:10px"><h2 class="card-title">${st}</h2>
          ${st === 'Mid Game' ? '<span class="chip" style="border-color:#6366f140;background:#6366f114;color:var(--indigo-lt)">you are here</span>' : ''}</div>
        <span class="tiny dim">${d}/${items.length}</span></div>
      <div class="card" style="overflow:hidden">
        ${items.map(m => { const dn = roadmapDone(m); return `<div class="row" data-rm-cat="${esc(m.cat)}" data-rm-done="${dn}"
            style="gap:10px;align-items:flex-start;padding:11px 14px;border-bottom:1px solid #ffffff08">
          <input type="checkbox" class="tick" style="margin-top:2px" ${dn ? 'checked' : ''}
            onchange="post('/api/roadmap/toggle',{id:'${m.id}'})">
          <div style="flex:1;min-width:0">
            <div class="sm" style="color:${dn ? 'var(--dim)' : '#d6d3cd'};${dn ? 'text-decoration:line-through' : ''}">${esc(m.title)}</div>
            ${m.desc ? `<div class="tiny dim" style="margin-top:2px">${esc(m.desc)}</div>` : ''}
            ${m.pct != null ? `<div style="margin-top:6px;max-width:260px">${bar(m.pct, 'var(--emerald)')}</div>` : ''}
          </div>
          <div class="row" style="gap:6px">
            <span class="chip">${esc(m.cat)}</span>
            ${m.auto ? '<span class="chip auto">auto</span>' : ''}
            ${m.hasGoal ? `<button class="btn-ghost" style="padding:3px 7px;font-size:10.5px"
              onclick="addGoalFrom('${esc(m.title).replace(/'/g, "")}')">+ goal</button>` : ''}
          </div></div>`; }).join('')}
      </div></div>`;
  }).join('');

  return layout('roadmap',
    `<div class="label prompt" style="margin-bottom:8px">roadmap</div>
     <h1 class="page">The path from early to endgame</h1>
     <p class="lede">A staged checklist of the milestones that actually matter. Stat-based milestones tick themselves from your
       profile; the rest you check off. Turn any milestone into a goal to get a plan for it.</p>`,
    `<div class="row" style="gap:24px;margin-bottom:16px">
      <div><div class="pixel" style="font-size:22px">${rs.done}/${rs.total}</div><div class="label">milestones complete</div></div>
    </div>
    <div class="row" style="margin-bottom:16px">
      ${cats.map(c => `<button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="filterRoadmap('${c}')">${c}</button>`).join('')}
      <label class="row tiny dim" style="gap:6px;margin-left:8px;cursor:pointer">
        <input type="checkbox" class="tick" onchange="toggleDone(event)"> hide completed</label>
    </div>
    ${html}`);
}

// ---------------------------------------------------------------- advisor

function pageAdvisor() {
  const q = ['What should I focus on next?','Best money method for me right now?','How do I get to Catacombs 30 fastest?',
    'Plan my Enderman slayer progression','Cheapest way to gain 100 Magical Power?','What mining setup should I get?'];
  const list = data.advisor.map((a, i) => `<div style="padding:12px 0;border-bottom:1px solid #ffffff08">
      <div class="spread" style="align-items:flex-start;gap:12px">
        <div style="min-width:0">
          <div class="sm" style="color:#faf9f7"><span class="pixel" style="color:var(--indigo-lt);margin-right:8px">${String(i + 1).padStart(2, '0')}</span>${esc(a.title)}</div>
          <div class="tiny dim" style="margin-top:4px">${esc(a.desc)}</div>
          <div class="row tiny dim" style="gap:14px;margin-top:8px">
            <span>impact <b style="color:#9c968b">${a.impact}</b>/10</span>
            <span>effort <b style="color:#9c968b">${a.effort}</b>/10</span>
            ${a.cost ? `<span>~<b style="color:var(--amber)">${esc(a.cost)}</b></span>` : ''}</div>
        </div>
        <button class="btn-ghost" style="padding:4px 8px;font-size:11px"
          onclick="addGoalFrom('${esc(a.title).replace(/'/g, "")}')">+ goal</button>
      </div></div>`).join('');

  return layout('advisor',
    `<div class="label prompt" style="margin-bottom:8px">advisor</div>
     <h1 class="page">Figure out how to get there</h1>
     <p class="lede">Ask in plain language. The advisor knows your profile and SkyPath's progression database; it answers with a
       connected model, on-device Gemini Nano, or the built-in rules engine.</p>`,
    `<div class="grid g2" style="align-items:start">
      <div class="card pad" style="display:flex;flex-direction:column;min-height:520px">
        <div class="spread" style="margin-bottom:12px">
          <div class="row" style="gap:8px"><span class="label">skypath advisor</span><span class="chip">engine</span></div>
          <span class="chip" style="border-color:#6366f140;background:#6366f114;color:var(--indigo-lt)">✦ built-in planner</span>
        </div>
        <div id="chat" style="flex:1;overflow:auto;font-size:12.5px;line-height:1.75;color:#9c968b">
          <div>✦ hey ${esc(data.profile.username)}. i've loaded your profile — skills, slayers, cata, MP and coins.
            ask me what to do next, how to reach a goal, or what a grind needs.</div>
        </div>
        <div class="row" style="gap:6px;margin:12px 0;flex-wrap:wrap">
          ${q.map(s => `<button class="btn-ghost" style="padding:4px 8px;font-size:11px" onclick="ask(${JSON.stringify(JSON.stringify(s))})">${esc(s)}</button>`).join('')}
        </div>
        <form class="row" style="gap:8px" onsubmit="return send(event)">
          <span class="prompt" style="color:var(--orange)"></span>
          <input class="input" id="q" placeholder="ask SkyPath…" autocomplete="off">
          <button class="btn" type="submit">send</button></form>
      </div>
      <div class="card pad">
        <div class="spread" style="margin-bottom:6px"><h2 class="card-title">upgrade priorities</h2>
          <span class="chip">${esc(data.profile.stage)}</span></div>
        ${list}
      </div>
    </div>`);
}

// ------------------------------------------------------------ accessories

function pageAccessories() {
  const owned = data.accessoriesOwned || [];
  const totalMp = ACCESSORIES.reduce((a, x) => a + (x.mp || 0), 0);
  const ownedMp = ACCESSORIES.filter(x => owned.includes(x.name)).reduce((a, x) => a + (x.mp || 0), 0);
  const budget = data.profile.purse + data.profile.bank;
  const rows = ACCESSORIES.map(a => `<tr>
      <td><label class="row tiny" style="gap:8px;cursor:pointer">
        <input type="checkbox" class="tick" ${owned.includes(a.name) ? 'checked' : ''}
          onchange="post('/api/accessories/toggle',{name:${JSON.stringify(JSON.stringify(a.name))}})">
        <span style="color:${owned.includes(a.name) ? 'var(--dim)' : '#d6d3cd'}">${esc(a.name)}</span></label></td>
      <td class="tiny dim">${esc(a.desc)}</td>
      <td><span class="chip">${esc(a.src)}</span></td>
      <td class="pixel tiny" style="color:var(--sky)">+${a.mp} MP</td>
      <td class="tiny" style="color:var(--amber)">${esc(a.cost)}</td></tr>`).join('');

  return layout('accessories',
    `<div class="label prompt" style="margin-bottom:8px">accessories</div>
     <h1 class="page">Talisman progression</h1>
     <p class="lede">Every accessory family with its Talisman → Ring → Artifact → Relic path, unlock requirements and approximate
       cost. Mark what you own and the optimizer tells you the cheapest way to gain Magical Power. Prices are estimates – always verify on the AH/Bazaar.</p>`,
    `<div class="grid g6" style="margin-bottom:18px">
      ${statCard('tracked MP', ownedMp, `of ${totalMp} possible in this list`, 'var(--indigo)')}
      ${statCard('owned accessories', owned.length, `${ACCESSORIES.length - owned.length} missing`, 'var(--emerald)')}
    </div>
    <div class="card pad" style="margin-bottom:16px">
      <h2 class="card-title">MP Optimizer</h2>
      <div class="tiny dim" style="margin:4px 0 12px">Greedy best MP-per-coin set within budget.</div>
      <div class="row">
        <label class="row tiny dim" style="gap:6px"><input type="checkbox" class="tick" id="ironman"> Ironman (craft-only)</label>
        <input class="input" style="width:160px" id="budget" value="${budget}">
        <button class="btn" onclick="optimize()">= optimise</button>
        <span class="tiny dim">“I have <b id="budgetLbl">${coins(budget)}</b> – what should I buy?”</span>
      </div>
      <div id="optResult" class="tiny dim" style="margin-top:12px"></div>
    </div>
    <div class="card pad">
      <h2 class="card-title">cheapest upgrades</h2>
      <div class="scroll" style="margin-top:12px">
        <table><thead><tr><th>accessory</th><th>how</th><th>source</th><th>mp</th><th>est. cost</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div></div>`);
}

// --------------------------------------------------------------- economy

function pageEconomy() {
  const snaps = data.snapshots;
  const max = Math.max(...snaps.map(s => s.value));
  const chart = snaps.slice().reverse().map(s => {
    const h = Math.max(4, Math.round((s.value / max) * 90));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
      <div class="tiny dim">${coins(s.value)}</div>
      <div style="width:100%;height:${h}px;background:linear-gradient(180deg,var(--indigo),#4338ca);border-radius:4px 4px 0 0"></div>
      <div class="tiny dim">${esc(s.date.split(' ')[1])}</div></div>`;
  }).join('');
  const bazaar = data.bazaar.map(b =>
    `<tr><td>${esc(b.name)}</td><td style="color:#6ee7b7">${esc(b.delta)}</td></tr>`).join('');

  return layout('economy',
    `<div class="label prompt" style="margin-bottom:8px">economy</div>
     <h1 class="page">Coins in, coins out</h1>
     <p class="lede">Net worth over time plus the bazaar moves worth watching. Record a snapshot whenever you check your value
       (e.g. via SkyCrypt / NEU).</p>`,
    `<div class="grid g2">
      <div class="card pad">
        <div class="spread" style="margin-bottom:14px"><h2 class="card-title">net worth</h2>
          <form class="row" method="POST" action="/api/snapshot">
            <input class="input" style="width:130px" name="value" placeholder="net worth" value="${data.profile.networth}">
            <button class="btn-ghost" type="submit">save snapshot</button></form></div>
        <div class="row" style="align-items:flex-end;gap:6px;height:150px">${chart}</div>
      </div>
      <div class="card pad">
        <h2 class="card-title">bazaar</h2>
        <div class="tiny dim" style="margin:4px 0 12px">live bazaar</div>
        <table><thead><tr><th>item</th><th>change</th></tr></thead><tbody>${bazaar}</tbody></table>
        <hr class="sep">
        <div class="label" style="margin-bottom:8px">snapshots</div>
        ${snaps.map(s => `<div class="spread tiny"><span class="muted">${esc(s.date)}</span>
          <span class="pixel">${coins(s.value)}</span>
          <span style="color:${(s.delta || '').startsWith('-') ? '#f87171' : '#6ee7b7'}">${esc(s.delta || '')}</span></div>`).join('')}
      </div>
    </div>`);
}

// ---------------------------------------------------------------- profile

function pageProfile() {
  const p = data.profile;
  const skills = Object.keys(p.skills).map(k =>
    `<div><div class="label" style="margin-bottom:4px">${k}</div>
      <input class="input" name="skill_${k}" value="${p.skills[k]}" type="number"></div>`).join('');
  const slayers = Object.keys(p.slayers).map(k =>
    `<div><div class="label" style="margin-bottom:4px">${k}</div>
      <input class="input" name="slayer_${k}" value="${p.slayers[k]}" type="number"></div>`).join('');

  return layout('profile',
    `<div class="label prompt" style="margin-bottom:8px">profile</div>
     <h1 class="page">Your data</h1>
     <p class="lede">Import your SkyBlock profile from the Hypixel API, or enter your stats manually. Everything else on SkyPath is
       computed from these numbers.</p>`,
    `<div class="grid g2" style="align-items:start">
      <form class="card pad" method="POST" action="/api/profile/save">
        <div class="spread" style="margin-bottom:12px"><h2 class="card-title">Manual stats</h2>
          <span class="tiny dim">Last updated ${timeAgo(p.updatedAt)}</span></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <div><div class="label" style="margin-bottom:4px">username</div><input class="input" name="username" value="${esc(p.username)}"></div>
          <div><div class="label" style="margin-bottom:4px">profile name</div><input class="input" name="profileName" value="${esc(p.profileName)}"></div>
          <div><div class="label" style="margin-bottom:4px">game mode</div>
            <select class="input" name="gamemode">${['Normal','Ironman','Stranded','Bingo'].map(g =>
              `<option ${p.gamemode === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          <div><div class="label" style="margin-bottom:4px">skyblock level</div><input class="input" name="level" value="${p.level}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">purse</div><input class="input" name="purse" value="${p.purse}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">bank</div><input class="input" name="bank" value="${p.bank}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">net worth</div><input class="input" name="networth" value="${p.networth}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">catacombs</div><input class="input" name="cata" value="${p.cata}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">magical power</div><input class="input" name="mp" value="${p.mp}" type="number"></div>
          <div><div class="label" style="margin-bottom:4px">HOTM tier</div><input class="input" name="hotm" value="${p.hotm}" type="number"></div>
        </div>
        <div class="label" style="margin:16px 0 8px">skills</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">${skills}</div>
        <div class="label" style="margin:16px 0 8px">slayers</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">${slayers}</div>
        <button class="btn" style="margin-top:18px" type="submit">Save profile</button>
      </form>
      <div style="display:grid;gap:12px">
        <div class="card pad">
          <h2 class="card-title">Import from Hypixel</h2>
          <div class="tiny dim" style="margin-top:8px">No <code>HYPIXEL_API_KEY</code> set. Add one to your environment to import
            skills, slayers, Catacombs and MP automatically.</div>
        </div>
        <div class="card pad">
          <div class="spread" style="margin-bottom:10px"><h2 class="card-title">Net worth snapshots</h2>
            <form class="row" method="POST" action="/api/snapshot">
              <input class="input" style="width:120px" name="value" placeholder="value" value="${p.networth}">
              <button class="btn-ghost" type="submit">save snapshot</button></form></div>
          <div class="tiny dim" style="margin-bottom:10px">Snapshots power the net worth chart. Record one whenever you check your value.</div>
          ${data.snapshots.map(s => `<div class="spread tiny" style="padding:5px 0;border-bottom:1px solid #ffffff08">
            <span class="muted">${esc(s.date)}</span><span class="pixel">${coins(s.value)}</span>
            <span style="color:${(s.delta || '').startsWith('-') ? '#f87171' : '#6ee7b7'}">${esc(s.delta || '')}</span></div>`).join('')}
        </div>
        <div class="card pad">
          <div class="label" style="margin-bottom:8px">about the data</div>
          <div class="tiny dim" style="line-height:1.8">Bazaar prices come live from the public Hypixel API (no key needed).
            Profile import needs a Hypixel API key (developer.hypixel.net).</div>
        </div>
      </div>
    </div>`);
}

// ----------------------------------------------------------------- server

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.jar':'application/java-archive',
  '.svg':'image/svg+xml', '.png':'image/png' };

function serveFile(res, fp) {
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': buf.length });
    res.end(buf);
  });
}
function sendJson(res, status, body) {
  const p = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(p), 'Cache-Control':'no-store' });
  res.end(p);
}
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function readForm(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { const o = {}; new URLSearchParams(raw).forEach((v, k) => o[k] = v); resolve(o); });
  });
}
function back(res, req) { res.writeHead(303, { Location: req.headers.referer || '/' }); res.end(); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url.startsWith('//') ? req.url.slice(1) : req.url,
    `http://${req.headers.host || 'localhost'}`);
  // tolerate double/trailing slashes so mod-built URLs never 404 on a typo
  const p = url.pathname.replace(/\/\{2,}/g, '/').replace(/\/+$/, '') || '/';

  if (p.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }

  try {
    // ---- mod bridge -------------------------------------------------
    if (p === '/api/game/pair' && req.method === 'POST') {
      const body = await readBody(req);
      const code = String(body.code || '').toUpperCase().replace(/[^A-F0-9]/g, '');
      for (const [k, v] of Object.entries(data.pendingCodes)) if (Date.now() - v.createdAt > CODE_TTL_MS) delete data.pendingCodes[k];
      if (!data.pendingCodes[code]) return sendJson(res, 400, { error: 'Unknown or expired pairing code' });
      delete data.pendingCodes[code];
      const token = crypto.randomBytes(32).toString('hex');
      data.bridge = { tokenHash: hash(token), createdAt: Date.now(), revoked: false };
      persist();
      return sendJson(res, 200, { token });
    }
    if (p === '/api/game/state' && req.method === 'POST') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token || !data.bridge.tokenHash || data.bridge.revoked) return sendJson(res, 401, { error: 'not paired' });
      if (!crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(data.bridge.tokenHash))) return sendJson(res, 401, { error: 'invalid token' });
      data.state = await readBody(req);
      data.lastStateAt = Date.now();
      persist();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/game/guide' && req.method === 'GET') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token || !data.bridge.tokenHash || data.bridge.revoked) return sendJson(res, 401, { error: 'not paired' });
      if (!crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(data.bridge.tokenHash))) return sendJson(res, 401, { error: 'invalid token' });
      return sendJson(res, 200, activeFocus());
    }

    // ---- dashboard api ----------------------------------------------
    if (p === '/api/pair/code' && req.method === 'POST') {
      for (const [k, v] of Object.entries(data.pendingCodes)) if (Date.now() - v.createdAt > CODE_TTL_MS) delete data.pendingCodes[k];
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      data.pendingCodes[code] = { createdAt: Date.now() };
      persist();
      return sendJson(res, 200, { code, expiresInSeconds: CODE_TTL_MS / 1000 });
    }
    if (p === '/api/revoke' && req.method === 'POST') {
      data.bridge = { tokenHash: null, createdAt: null, revoked: true };
      data.pendingCodes = {}; data.state = null; data.lastStateAt = null;
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/dashboard' && req.method === 'GET') {
      return sendJson(res, 200, {
        connected: isConnected(),
        paired: !!(data.bridge.tokenHash && !data.bridge.revoked),
        lastStateAt: data.lastStateAt, state: data.state,
        goals: data.goals, focus: activeFocus(), jar: JAR_NAME
      });
    }
    if (p === '/api/focus' && req.method === 'POST') {
      const b = await readBody(req);
      data.focusGoalId = b.goalId || null; persist();
      return sendJson(res, 200, { focus: activeFocus() });
    }
    if (p === '/api/goals/step' && req.method === 'POST') {
      const b = await readBody(req);
      const g = data.goals.find(x => x.id === b.id);
      if (g) { const s = g.steps.find(x => x.id === b.stepId); if (s) s.done = !s.done; }
      persist(); return sendJson(res, 200, { focus: activeFocus() });
    }
    if (p === '/api/goals/toggle' && req.method === 'POST') {
      const b = await readBody(req);
      const g = data.goals.find(x => x.id === b.id);
      if (g) g.done = !g.done;
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/goals/remove' && req.method === 'POST') {
      const b = await readBody(req);
      data.goals = data.goals.filter(x => x.id !== b.id);
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/goals/add' && req.method === 'POST') {
      const b = await readBody(req);
      const title = String(b.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'title required' });
      data.goals.push({ id: 'g' + Date.now().toString(36), title, cat: b.cat || 'other',
        priority: b.priority || 'medium', method: '', current: Number(b.current) || 0,
        target: Number(b.target) || 1, unit: b.unit || 'level', eta: null, etaHours: null,
        done: false, rationale: '', destination: '',
        steps: [{ id: 's' + Date.now().toString(36), title: 'First step', done: false }] });
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/roadmap/toggle' && req.method === 'POST') {
      const b = await readBody(req);
      const m = ROADMAP.find(x => x.id === b.id);
      if (m) data.roadmapOverrides[m.id] = !roadmapDone(m);
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/accessories/toggle' && req.method === 'POST') {
      const b = await readBody(req);
      const i = data.accessoriesOwned.indexOf(b.name);
      if (i >= 0) data.accessoriesOwned.splice(i, 1); else data.accessoriesOwned.push(b.name);
      persist(); return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/accessories/optimize' && req.method === 'POST') {
      const b = await readBody(req);
      let budget = Number(b.budget) || 0;
      const pool = ACCESSORIES.filter(a => !data.accessoriesOwned.includes(a.name))
        .map(a => ({ ...a, cost: parseCost(a.cost) }))
        .sort((x, y) => (y.mp / (y.cost || 1e9)) - (x.mp / (x.cost || 1e9)));
      const picks = []; let mp = 0, spend = 0;
      for (const a of pool) { if (a.cost <= budget - spend) { picks.push(a); mp += a.mp; spend += a.cost; } }
      return sendJson(res, 200, { picks, mp, spend, budget });
    }
    if (p === '/api/advisor/ask' && req.method === 'POST') {
      const b = await readBody(req);
      return sendJson(res, 200, { answer: advise(String(b.q || '')) });
    }
    if (p === '/api/profile/save' && req.method === 'POST') {
      const f = await readForm(req);
      const pr = data.profile;
      ['username','profileName','gamemode'].forEach(k => { if (f[k] != null) pr[k] = f[k]; });
      ['level','purse','bank','networth','cata','mp','hotm'].forEach(k => { if (f[k] != null) pr[k] = Number(f[k]) || pr[k]; });
      Object.keys(pr.skills).forEach(k => { if (f['skill_' + k] != null) pr.skills[k] = Number(f['skill_' + k]) || pr.skills[k]; });
      Object.keys(pr.slayers).forEach(k => { if (f['slayer_' + k] != null) pr.slayers[k] = Number(f['slayer_' + k]) || pr.slayers[k]; });
      pr.stage = pr.level >= 250 ? 'Late Game' : pr.level >= 120 ? 'Mid Game' : 'Early Game';
      pr.updatedAt = Date.now();
      persist(); return back(res, req);
    }
    if (p === '/api/snapshot' && req.method === 'POST') {
      const f = await readForm(req);
      const v = Number(f.value) || data.profile.networth;
      const prev = data.snapshots[0] ? data.snapshots[0].value : v;
      const diff = v - prev;
      const d = new Date();
      data.snapshots.unshift({ date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v, delta: (diff >= 0 ? '+' : '') + coins(Math.abs(diff)) });
      data.snapshots = data.snapshots.slice(0, 20);
      data.profile.networth = v; data.profile.updatedAt = Date.now();
      persist(); return back(res, req);
    }

    // ---- pages -------------------------------------------------------
    const pages = { '/': pageOverview, '/companion': pageCompanion, '/goals': pageGoals,
      '/roadmap': pageRoadmap, '/advisor': pageAdvisor, '/accessories': pageAccessories,
      '/bazaar': pageEconomy, '/profile': pageProfile };
    if (pages[p]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(pages[p]());
    }
    if (p.startsWith('/downloads/')) return serveFile(res, path.join(DOWNLOADS, path.basename(p)));
    return serveFile(res, path.join(PUBLIC, p.replace(/^\/+/, '')));
  } catch (err) {
    console.error('[skypath]', err);
    if (!res.headersSent) return sendJson(res, 500, { error: 'Internal error' });
    res.end();
  }
});

// ------------------------------------------------- built-in advisor engine

function advise(qRaw) {
  const q = qRaw.toLowerCase();
  const p = data.profile;
  const focus = activeFocus();
  const g = (name) => data.goals.find(x => x.id === name);

  if (/catacombs|cata|dungeon|floor|f7|m3/.test(q)) {
    const c = g('cata30');
    return `You're Catacombs ${p.cata} — ${30 - p.cata} levels from Cata 30. Run the highest floor you can clear consistently: ` +
      `F7 gives ~2x the XP of F6, and M3 beats it again once you survive it. A full team with Bonzo/Spirit masks cuts deaths ` +
      `(deaths cost score, and score is where the XP is). ${c ? 'Tracked as "' + c.title + '" (~' + c.eta + ').' : ''}`;
  }
  if (/money|coin|profit|bazaar|ah|auction|hourly/.test(q)) {
    return `With ${coins(p.purse + p.bank)} liquid and Mining ${p.skills.mining}, gemstone mining is your strongest steady income; ` +
      `bazaar flipping scales with the coins you already have, so it gets better as your purse grows. ` +
      `Diana events are the best burst money if you can commit to a few hours.`;
  }
  if (/enderman|eman|voidgloom|terminator|judgement/.test(q)) {
    const e = g('eman7');
    return `Enderman Slayer ${p.slayers.enderman}. Grind T3s for steady XP, then step to T4 once you have Final Destination armour ` +
      `and a decent Voidedge. ${e ? 'Eman 7 is ' + (7 - p.slayers.enderman) + ' levels away (~' + e.eta + ') and unlocks the Terminator.' : ''}`;
  }
  if (/magical power|mp|talisman|accessor|maxwell/.test(q)) {
    return `You're at ${p.mp} MP. The cheapest gains come from the accessory list on the Accessories page — run the optimizer with your ` +
      `current purse and buy the best MP-per-coin picks first. Recombobulating cheap talismans beats buying expensive ones.`;
  }
  if (/mining|hotm|gemstone|mineshaft|powder/.test(q)) {
    return `HOTM ${p.hotm} and Mining ${p.skills.mining}. Push HOTM 7 next — it unlocks Mineshafts and the strongest gemstone powder ` +
      `perks, which is where late mining income actually comes from. Spend powder on Great Explorer first, then fortune.`;
  }
  if (/farming|garden|contest|anita/.test(q)) {
    return `Farming ${p.skills.farming}. Get to 30 for Anita's Farming Fortune upgrades and run Jacob's contests for medals — ` +
      `the garden is still the most reliable low-effort income you have.`;
  }
  if (/next|focus|should i|priority|what now/.test(q)) {
    return `Right now your focus is "${focus.stepTitle}"${focus.goal ? ' for ' + focus.goal : ''}. ` +
      `The advisor's top upgrade is "${data.advisor[0].title}" (impact ${data.advisor[0].impact}/10, effort ${data.advisor[0].effort}/10). ` +
      `You're ${p.stage.toLowerCase()} at level ${p.level} with ${coins(p.networth)} net worth.`;
  }
  return `I work from your profile: level ${p.level}, Catacombs ${p.cata}, ${p.mp} MP, ` +
    `skill average ${skillAvg()}, ${coins(p.networth)} net worth. Try asking about catacombs, money methods, ` +
    `enderman slayer, magical power, mining, or just "what should I focus on next?"`;
}

server.listen(PORT, () => console.log(`[skypath] on http://localhost:${PORT} (all interfaces, IPv4+IPv6)`));

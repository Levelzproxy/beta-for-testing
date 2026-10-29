/*!
 * Wavey chps — script.js
 * A browser-style web portal: real tabs, themes, relay-based page loading,
 * bookmarks, history, most-visited sites. Single file, no dependencies.
 */
(() => {
  'use strict';

  /* ╔══════════════════════════════════════════════════════════════════════════════╗
     ║   ★★★  EDIT ME  —  the only part of this file you need to change  ★★★        ║
     ╚══════════════════════════════════════════════════════════════════════════════╝ */

  // 1) RELEASE VERSION — shown at the bottom right as "Wavey chps v.<VERSION>".
  const VERSION = '1.02';

  // 2) CREDITS — shown when someone presses the "Credits" button (bottom left, next to the gear).
  //    Each credit is one line:  { name: 'Who', role: 'What they did', url: 'https://optional-link' }
  //    • Add a credit  → copy a line and paste it before the closing  ];
  //    • Remove one    → delete its line.     • No link?     → leave url: '' (empty).
  //    • Change the text above the list → edit CREDITS_INTRO.
  const CREDITS_INTRO = 'Wavey chps is made possible by these people and projects.';
  const CREDITS = [
    { name: 'Your Name Here',        role: 'Creator & developer of Wavey chps', url: '' },
    { name: 'Another Person',        role: 'Design / testing / ideas',           url: '' },
    { name: 'Tobnyi',                role: 'Meld — our partner',                 url: 'http://meld-gzpp.onrender.com/' },
    { name: 'Inter & Sora',          role: 'Fonts (Google Fonts)',               url: 'https://fonts.google.com/' },
    { name: 'AllOrigins, corsproxy.io, cors.eu.org and friends', role: 'Free public relays that load pages', url: '' }
  ];

  // 3) SIGN-IN. Works out of the box with accounts stored only in the visitor's own browser.
  //    For REAL accounts that follow people between devices, fill in ONE of these:
  //    A) Firebase (best: email+password AND Google).  console.firebase.google.com → create project →
  //       Build ▸ Authentication ▸ enable "Email/Password" and "Google" → Project settings ▸ "Your apps" ▸ Web (</>) →
  //       copy the 4 values below. Then Authentication ▸ Settings ▸ Authorized domains ▸ add your website's domain.
  //    B) Google only: console.cloud.google.com ▸ APIs & Services ▸ Credentials ▸ OAuth client ID ▸ "Web application" ▸
  //       add your website under "Authorized JavaScript origins" ▸ paste the Client ID into googleClientId.
  const AUTH = {
    firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
    googleClientId: ''
  };

  // 4) "USERS ONLINE" counter near the top of the page.
  //    • Leave as is  → uses the free public ntfy.sh service (no sign-up). It works but anyone could fake the number.
  //    • Better       → a Firebase Realtime Database: paste its URL in firebaseDbUrl, e.g.
  //                     'https://YOUR-PROJECT-default-rtdb.firebaseio.com'  and set its Rules to:
  //      {"rules":{"presence":{".read":true,".indexOn":["t"],"$id":{".write":true,".validate":"newData.hasChild('t') && newData.child('t').isNumber()"}}}}
  //    • Change ntfyTopic to any long random word so your count is only yours.
  const PRESENCE = {
    firebaseDbUrl: '',
    ntfyTopic: 'wavey-chps-online-7f3k9x2q'
  };

  /* ═══════════════════════════ end of the editable block ═══════════════════════════ */

  /* ═══════════════════════════ Helpers ═══════════════════════════ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, c = '') => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
  const isHttp = (u) => /^https?:\/\//i.test(u);
  const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  const avatarBg = (s) => { const h = hue(s); return `linear-gradient(135deg, hsl(${h} 72% 58%), hsl(${(h + 48) % 360} 72% 48%))`; };
  const safeJSON = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const hexRgb = (h) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); if (isNaN(n)) throw new Error('bad colour'); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const displayUrl = (u) => { try { const x = new URL(u); return x.host.replace(/^www\./, '') + (x.pathname + x.search + x.hash).replace(/\/$/, ''); } catch { return u; } };

  /* ═══════════════════════════ Constants ═══════════════════════════ */
  const HOSTED_DEFAULT = 'https://up4b.z20.web.core.windows.net/';
  const KEY = 'wavey.v1';
  let LOGO = '';

  const SEARCH = {
    ddg:   { name: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/?q=%s' },
    brave: { name: 'Brave',      url: 'https://search.brave.com/search?q=%s' },
    bing:  { name: 'Bing',       url: 'https://www.bing.com/search?q=%s' },
    google:{ name: 'Google',     url: 'https://www.google.com/search?q=%s' },
    wiki:  { name: 'Wikipedia',  url: 'https://en.wikipedia.org/w/index.php?search=%s' }
  };

  // Public relays. {enc} = URL-encoded target, {raw} = target appended as-is.
  //   field   → relay answers with JSON and the page lives in that field
  //   lossy   → relay truncates big pages (used only after the others)
  //   rendered→ page is rendered server-side (scripts are dropped)
  //   archive → last-resort copy from the Internet Archive
  const RELAYS = [
    { id: 'allorigins',   name: 'AllOrigins',               tpl: 'https://api.allorigins.win/raw?url={enc}' },
    { id: 'aojson',       name: 'AllOrigins (JSON)',        tpl: 'https://api.allorigins.win/get?url={enc}', field: 'contents' },
    { id: 'aohex',        name: 'AllOrigins mirror',        tpl: 'https://api.allorigins.hexlet.app/raw?url={enc}' },
    { id: 'aohexj',       name: 'AllOrigins mirror (JSON)', tpl: 'https://api.allorigins.hexlet.app/get?url={enc}', field: 'contents' },
    { id: 'corsproxy',    name: 'corsproxy.io',             tpl: 'https://corsproxy.io/?url={enc}' },
    { id: 'corsproxyorg', name: 'corsproxy.org',            tpl: 'https://corsproxy.org/?{enc}' },
    { id: 'euorg',        name: 'cors.eu.org',              tpl: 'https://cors.eu.org/{raw}' },
    { id: 'corslol',      name: 'cors.lol',                 tpl: 'https://api.cors.lol/?url={enc}' },
    { id: 'x2u',          name: 'cors.x2u.in',              tpl: 'https://cors.x2u.in/{raw}' },
    { id: 'azm',          name: 'CORS Anywhere (Workers)',  tpl: 'https://cors-anywhere.azm.workers.dev/{raw}' },
    { id: 'zibri',        name: 'cors.workers.dev',         tpl: 'https://test.cors.workers.dev/?{raw}' },
    { id: 'yacdn',        name: 'YaCDN',                    tpl: 'https://yacdn.org/proxy/{raw}' },
    { id: 'htmldriven',   name: 'HTMLDriven',               tpl: 'https://cors-proxy.htmldriven.com/?url={enc}', field: 'body' },
    { id: 'thingproxy',   name: 'ThingProxy',               tpl: 'https://thingproxy.freeboard.io/fetch/{raw}', lossy: true },
    // Renders the page in a real browser on the server, so it often succeeds where plain relays are refused.
    { id: 'reader',       name: 'Reader',                   tpl: 'https://r.jina.ai/{raw}', headers: { 'X-Respond-With': 'html' }, rendered: true },
    { id: 'wayback',      name: 'Internet Archive copy',    tpl: 'https://web.archive.org/web/2099id_/{raw}', archive: true }
  ];

  const DEFAULT_SITES = [
    { title: 'Wikipedia',   url: 'https://en.wikipedia.org/' },
    { title: 'DuckDuckGo',  url: 'https://html.duckduckgo.com/html/' },
    { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
    { title: 'Reddit',      url: 'https://old.reddit.com/' },
    { title: 'GitHub',      url: 'https://github.com/' },
    { title: 'MDN',         url: 'https://developer.mozilla.org/' },
    { title: 'BBC News',    url: 'https://www.bbc.com/news' },
    { title: 'Internet Archive', url: 'https://archive.org/' }
  ];

  const FX_MODES = { off: 'Off', constellation: 'Constellation', stars: 'Starfield', ripples: 'Ripples', fireflies: 'Fireflies', bubbles: 'Bubbles', rain: 'Digital rain', trail: 'Comet trail' };
  const TH = (name, a, b, bg, bg1, o1, o2, o3, m, f, fx) => ({ name, a, b, bg, fx, vars: { '--bg0': bg, '--bg1': bg1, '--accent': a, '--accent2': b, '--accent-rgb': hexRgb(a).join(', '), '--orb1': o1, '--orb2': o2, '--orb3': o3, '--muted': m, '--faint': f } });
  const THEMES = {
    violet:    { name: 'Violet',   a: '#a78bfa', b: '#ec4899', bg: '#0b0613', css: true, fx: 'constellation' },
    ocean:     { name: 'Ocean',    a: '#38bdf8', b: '#6366f1', bg: '#050d1a', css: true, fx: 'bubbles' },
    sunset:    { name: 'Sunset',   a: '#fb923c', b: '#f43f5e', bg: '#140a08', css: true, fx: 'fireflies' },
    emerald:   { name: 'Emerald',  a: '#34d399', b: '#22d3ee', bg: '#04120e', css: true, fx: 'ripples' },
    rose:      { name: 'Rose',     a: '#f472b6', b: '#c084fc', bg: '#13060f', css: true, fx: 'trail' },
    graphite:  { name: 'Graphite', a: '#e5e7eb', b: '#94a3b8', bg: '#0a0a0c', css: true, fx: 'off' },
    midnight:  TH('Midnight',  '#818cf8', '#38bdf8', '#03040d', '#0b1030', '#4338ca', '#0ea5e9', '#1e3a8a', '#9aa5d4', '#5c6591', 'stars'),
    aurora:    TH('Aurora',    '#4ade80', '#a78bfa', '#04100f', '#0b2a2e', '#10b981', '#7c3aed', '#06b6d4', '#9cc7bd', '#5f8a82', 'fireflies'),
    cherry:    TH('Cherry',    '#fb7185', '#f43f5e', '#14050a', '#3b0d1b', '#be123c', '#e11d48', '#9f1239', '#d4a0ab', '#94606c', 'trail'),
    neon:      TH('Neon',      '#00f0ff', '#ff2bd6', '#07030f', '#1a0536', '#00b3c4', '#c026d3', '#6d28d9', '#b9a6d9', '#7a6a9c', 'constellation'),
    matrix:    TH('Matrix',    '#4ade80', '#22c55e', '#010a04', '#03200c', '#15803d', '#166534', '#14532d', '#8fbf9f', '#4f7a5e', 'rain'),
    golden:    TH('Golden',    '#fbbf24', '#f97316', '#120d03', '#33240a', '#d97706', '#ea580c', '#ca8a04', '#cdb98c', '#8f7c52', 'fireflies'),
    ice:       TH('Ice',       '#7dd3fc', '#a5f3fc', '#05101a', '#0e2a3f', '#0ea5e9', '#67e8f9', '#3b82f6', '#a3c2d6', '#628198', 'ripples'),
    synthwave: TH('Synthwave', '#ff5ecb', '#7c5cff', '#0f0420', '#2a0a4a', '#d946ef', '#6366f1', '#f43f5e', '#c3a6e0', '#85689f', 'stars'),
    forest:    TH('Forest',    '#86efac', '#bef264', '#07100a', '#14301c', '#166534', '#3f6212', '#15803d', '#a1c4aa', '#628a6c', 'fireflies'),
    lava:      TH('Lava',      '#fb923c', '#ef4444', '#120403', '#3a0d06', '#dc2626', '#ea580c', '#b91c1c', '#d1a79b', '#93695d', 'fireflies'),
    coffee:    TH('Coffee',    '#d6a77a', '#c08457', '#100b08', '#2c1c12', '#92400e', '#78350f', '#b45309', '#c7ae98', '#8a7260', 'off'),
    jellybean: TH('Jellybean', '#a3e635', '#65a30d', '#0a1204', '#1d3308', '#65a30d', '#84cc16', '#3f6212', '#b3c99a', '#72875a', 'bubbles'),
    custom:    { name: 'Custom', a: '#a78bfa', b: '#ec4899', bg: '#0b0613', custom: true, fx: 'constellation' }
  };
  function currentTheme() {
    const th = THEMES[S.theme] || THEMES.violet;
    if (!th.custom) return th;
    let a = th.a, b = th.b, bg = th.bg;
    try { hexRgb(S.cA); a = S.cA; } catch { /* default */ }
    try { hexRgb(S.cB); b = S.cB; } catch { /* default */ }
    try { hexRgb(S.cBg); bg = S.cBg; } catch { /* default */ }
    const mix = mixHex(a, b, 0.5);
    return { ...th, a, b, bg, vars: { '--bg0': bg, '--bg1': mixHex(bg, a, 0.17), '--accent': a, '--accent2': b, '--accent-rgb': hexRgb(a).join(', '), '--orb1': a, '--orb2': b, '--orb3': mix, '--muted': mixHex(bg, '#ffffff', 0.66), '--faint': mixHex(bg, '#ffffff', 0.4) } };
  }

  const SANDBOX_DOC = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation';
  const SANDBOX_DIRECT = SANDBOX_DOC + ' allow-same-origin';
  const FRAME_ALLOW = 'fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture';
  const RELAY_PARALLEL = 3;     // relays started immediately
  const RELAY_HEDGE_MS = 650;   // start one more every N ms while nobody has answered
  const RELAY_TIMEOUT = 8000;   // per relay (plain)
  const RELAY_TIMEOUT_SLOW = 14000; // per relay (Reader / archive)
  const RELAY_OVERALL = 22000;  // whole race
  const HEALTH_KEY = 'wavey.health.v1';

  const WORKER_SNIPPET = `// Cloudflare Worker — your own free relay (workers.cloudflare.com)
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const target = new URL(request.url).searchParams.get('url');
    if (!/^https?:\\/\\//i.test(target || '')) {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
    }
    const upstream = await fetch(target, {
      headers: { 'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0' },
      redirect: 'follow'
    });
    const headers = new Headers(upstream.headers);
    ['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'set-cookie']
      .forEach((h) => headers.delete(h));
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};`;

  /* ═══════════════════════════ Storage ═══════════════════════════ */
  const mem = {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* noop */ } delete mem[k]; }
  };

  const DEFAULTS = {
    theme: 'violet', fx: 'constellation', glow: true, cursor: true, cA: '#a78bfa', cB: '#ec4899', cBg: '#0b0613', engine: 'relay', search: 'ddg', glass: 22, motion: true, restore: true,
    customRelay: '', disabledRelays: [], lastRelay: '', hosted: HOSTED_DEFAULT, hostedAuto: true,
    cloakTitle: '', cloakIcon: '', panicKey: '`', panicUrl: 'https://www.wikipedia.org/'
  };
  const data = { settings: { ...DEFAULTS }, bookmarks: [], history: [], visits: {}, hidden: [], session: [], apps: [], pinned: [] };
  const S = data.settings;

  function load() {
    try {
      const raw = ls.get(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(S, d.settings || {});
      if (!THEMES[S.theme]) S.theme = 'violet';
      if (!SEARCH[S.search]) S.search = 'ddg';
      if (!['relay', 'direct', 'custom', 'hosted'].includes(S.engine)) S.engine = 'relay';
      if (!Array.isArray(S.disabledRelays)) S.disabledRelays = [];
      if (Array.isArray(d.bookmarks)) data.bookmarks = d.bookmarks.filter((b) => b && isHttp(b.url));
      if (Array.isArray(d.history)) data.history = d.history.filter((h) => h && isHttp(h.url)).slice(0, 600);
      if (d.visits && typeof d.visits === 'object') data.visits = d.visits;
      if (Array.isArray(d.hidden)) data.hidden = d.hidden;
      if (Array.isArray(d.apps)) data.apps = d.apps.filter((a) => a && isHttp(a.url) && a.name);
      if (Array.isArray(d.session)) data.session = d.session;
      if (Array.isArray(d.pinned)) data.pinned = d.pinned.filter((x) => x && isHttp(x.url)).map((x) => ({ title: String(x.title || hostOf(x.url)).slice(0, 40), url: x.url })).slice(0, 24);
      if (!FX_MODES[S.fx]) S.fx = 'off';
    } catch { /* corrupted storage — start fresh */ }
  }
  const save = debounce(() => ls.set(KEY, JSON.stringify(data)), 250);

  /* ═══════════════════════════ Toasts ═══════════════════════════ */
  function toast(msg, kind = 'info', ms = 3000) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = `${icon(kind === 'warn' ? 'warn' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  }

  /* ═══════════════════════════ URL handling ═══════════════════════════ */
  const searchUrl = (q) => SEARCH[S.search].url.replace('%s', encodeURIComponent(q));

  function resolveInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/^(wavey:\/\/home|about:home|about:blank)$/i.test(s)) return { home: true };
    if (isHttp(s)) return { url: s };
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^\s:/]+:\d+(\/|$)/.test(s);
    if (!hasScheme && !/\s/.test(s)) {
      if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#]|$)/i.test(s) || /^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(s)) {
        return { url: 'https://' + s };
      }
    }
    return { url: searchUrl(s), query: s };
  }

  function unwrapRedirect(u) {
    try {
      const x = new URL(u);
      if (/(^|\.)duckduckgo\.com$/.test(x.hostname) && x.pathname === '/l/' && x.searchParams.get('uddg')) return x.searchParams.get('uddg');
      if (/(^|\.)google\.[a-z.]+$/.test(x.hostname) && x.pathname === '/url') {
        const q = x.searchParams.get('q') || x.searchParams.get('url');
        if (q && isHttp(q)) return q;
      }
    } catch { /* ignore */ }
    return u;
  }

  /* ═══════════════════════════ Relay engine ═══════════════════════════ */
  function relayUrl(r, url) {
    let t = r.tpl;
    if (!/\{(enc|raw)\}/.test(t)) t += '{enc}';
    return t.replace('{enc}', () => encodeURIComponent(url)).replace('{raw}', () => url);
  }

  function customRelays() {
    return String(S.customRelay || '').split(/\n+/).map((x) => x.trim()).filter((x) => isHttp(x))
      .map((tpl, i) => ({ id: 'custom' + i, name: hostOf(tpl) || 'Custom', tpl, custom: true }));
  }

  /* Relay health: remembers which relays answered fast / failed, so the fastest are tried first
     and dead ones are put on a short cool-down instead of being retried every time. */
  let health = {};
  try { health = JSON.parse(ls.get(HEALTH_KEY) || '{}') || {}; } catch { health = {}; }
  const saveHealth = debounce(() => ls.set(HEALTH_KEY, JSON.stringify(health)), 400);
  function hrec(r, ok, ms) {
    if (r.custom) return;
    const h = health[r.id] || (health[r.id] = { ok: 0, bad: 0, ms: 0, run: 0, cool: 0, t: 0 });
    if (ok) { h.ok++; h.run = 0; h.cool = 0; h.ms = h.ms ? Math.round(h.ms * 0.6 + ms * 0.4) : Math.round(ms); }
    else { h.bad++; h.run++; if (h.run >= 3) h.cool = Date.now() + Math.min(30, 5 * h.run) * 60000; }
    h.t = Date.now();
    saveHealth();
  }
  function hscore(r) {
    const h = health[r.id];
    if (!h || Date.now() - h.t > 864e5) return 2500;
    const tot = h.ok + h.bad, rate = tot ? h.ok / tot : 0.5;
    return (h.ms || 2500) * (1 + (1 - rate) * 3) + h.run * 1500;
  }
  const relayTier = (r) => (r.archive ? 3 : r.lossy ? 2 : r.rendered ? 1 : 0);

  function relayList(mode) {
    const custom = customRelays();
    if (mode === 'custom') return custom;
    const now = Date.now();
    const key = (r) => { const h = health[r.id]; return [relayTier(r) + (h && h.cool > now ? 10 : 0), hscore(r) - (r.id === S.lastRelay ? 800 : 0)]; };
    const builtin = RELAYS.filter((r) => !S.disabledRelays.includes(r.id)).map((r) => ({ r, k: key(r) }))
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1]).map((x) => x.r);
    return [...custom, ...builtin];
  }

  function decodeBody(buf, ct) {
    let cs = (/charset\s*=\s*["']?([\w-]+)/i.exec(ct || '') || [])[1];
    if (!cs) {
      try {
        const head = new TextDecoder('windows-1252').decode(buf.slice(0, 3072));
        const m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
        if (m) cs = m[1];
      } catch { /* noop */ }
    }
    try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder().decode(buf); }
  }

  // Detects relay error pages / bot-check pages that come back as "200 OK".
  function badReason(t) {
    const s = t.trim();
    if (s.length < 15) return 'empty response';
    const head = s.slice(0, 3000);
    if (s.length < 2500 && /(has been blocked|can't be proxied|rate.?limit|too many requests|access denied|missing required request header|origin.{0,30}not allowed|bad gateway|service unavailable|error code: ?\d{3,4})/i.test(head)) return 'relay refused';
    if (s.length < 60000 && /<title>\s*(just a moment|attention required|access denied|are you a robot|403 forbidden|ddos-guard|security check)/i.test(head)) return 'bot check page';
    if (s.length < 60000 && /enable javascript and cookies to continue/i.test(s)) return 'bot check page';
    return '';
  }
  const looksTruncated = (t) => t.length > 2000 && /^\s*(<!doctype|<html)/i.test(t) && !/<\/(html|body)\s*>/i.test(t.slice(-4000));

  // Hedged race: start the best few relays at once, add another every RELAY_HEDGE_MS while nobody
  // has answered (and immediately when one fails), cancel the losers as soon as someone wins.
  function fetchViaRelays(url, relays, outer) {
    return new Promise((resolve, reject) => {
      let done = false, next = 0, pending = relays.length, soft = null, softTimer = 0;
      const timers = [], ctrls = [], errs = [];
      const abortErr = () => new DOMException('Aborted', 'AbortError');
      const finish = (fn, v) => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout); clearTimeout(softTimer);
        ctrls.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
        fn(v);
      };
      if (!relays.length) return reject(new Error('No relays available.'));
      if (outer) {
        if (outer.aborted) return reject(abortErr());
        outer.addEventListener('abort', () => finish(reject, abortErr()), { once: true });
      }
      timers.push(setTimeout(() => (soft ? finish(resolve, soft) : finish(reject, new Error('Timed out. ' + errs.slice(-3).join('  ·  ')))), RELAY_OVERALL));
      const allSettled = () => (soft ? finish(resolve, soft) : finish(reject, new Error(errs.join('  ·  '))));

      function launch() { if (done || next >= relays.length) return false; run(relays[next++]); return true; }
      function hedge() { if (done) return; if (launch()) timers.push(setTimeout(hedge, RELAY_HEDGE_MS)); }

      async function run(r) {
        const t0 = performance.now();
        const c = new AbortController();
        ctrls.push(c);
        const to = setTimeout(() => c.abort(), r.rendered || r.archive ? RELAY_TIMEOUT_SLOW : RELAY_TIMEOUT);
        let ended = false;
        const end = (msg, penalise = true) => {
          if (ended) return; ended = true; clearTimeout(to);
          if (done) return;
          if (msg) { errs.push(`${r.name}: ${msg}`); if (penalise) hrec(r, false); }
          if (--pending <= 0) return allSettled();
          launch();
        };
        try {
          const resp = await fetch(relayUrl(r, url), { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: r.headers || {} });
          if (done) return;
          if (!resp.ok) return end('HTTP ' + resp.status, resp.status !== 404 && resp.status !== 410);
          const ct = (resp.headers.get('content-type') || '').toLowerCase();
          if (!r.field && /^(image|audio|video)\/|application\/(pdf|zip|octet-stream)/.test(ct)) {
            try { if (resp.body) resp.body.cancel(); } catch { /* noop */ }
            hrec(r, true, performance.now() - t0); ended = true; clearTimeout(to);
            return finish(resolve, { binary: true, ct, relay: r });
          }
          const buf = await resp.arrayBuffer();
          if (done) return;
          let text, ctype = ct;
          if (r.field) {
            try { const j = JSON.parse(new TextDecoder().decode(buf)); text = typeof j[r.field] === 'string' ? j[r.field] : ''; ctype = (j.status && j.status.content_type) || 'text/html'; } catch { text = ''; }
          } else text = decodeBody(buf, ct);
          const bad = badReason(text);
          if (bad) return end(bad);
          const ms = performance.now() - t0;
          hrec(r, true, ms);
          ended = true; clearTimeout(to);
          const res = { text, ct: ctype, relay: r, ms };
          if (r.lossy || r.archive || looksTruncated(text)) {
            if (!soft || (soft.relay.archive && !r.archive)) soft = res;
            if (--pending <= 0) return allSettled();
            if (!soft.relay.archive && !softTimer) softTimer = setTimeout(() => soft && finish(resolve, soft), 2500);
            return launch();
          }
          finish(resolve, res);
        } catch (e) {
          end(e.name === 'AbortError' ? 'timed out' : (e.message || 'network error'));
        }
      }

      for (let i = 0; i < RELAY_PARALLEL; i++) launch();
      timers.push(setTimeout(hedge, RELAY_HEDGE_MS));
    });
  }

  /* Runs INSIDE the proxied page (serialised via toString). Plain ES5 on purpose. */
  function bridge(BASE, RELAY, STATIC) {
    var P = window.parent;
    function send(m) { m.wavey = 1; try { P.postMessage(m, '*'); } catch (e) { /* noop */ } }
    function abs(u) { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } }
    function inField(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }

    function onLink(e) {
      if (e.defaultPrevented) return;
      if (e.type === 'click' && e.button !== 0) return;
      var t = e.target, a = t && t.closest ? t.closest('a[href], area[href]') : null;
      if (!a) return;
      var raw = a.getAttribute('href') || '';
      if (/^\s*(javascript:|mailto:|tel:|sms:|data:|blob:)/i.test(raw)) return;
      if (raw.charAt(0) === '#') {
        e.preventDefault();
        var id = raw.slice(1);
        try { id = decodeURIComponent(id); } catch (_) { /* noop */ }
        var el = id ? (document.getElementById(id) || document.getElementsByName(id)[0]) : null;
        if (el && el.scrollIntoView) el.scrollIntoView(); else if (!id) window.scrollTo(0, 0);
        return;
      }
      var u = abs(raw);
      if (!u) return;
      e.preventDefault();
      e.stopPropagation();
      send({ type: 'nav', url: u, newTab: e.type === 'auxclick' || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank' });
    }
    document.addEventListener('click', onLink, true);
    document.addEventListener('auxclick', function (e) { if (e.button === 1) onLink(e); }, true);

    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM' || e.defaultPrevented) return;
      e.preventDefault();
      if (f.querySelector('input[type=password]')) { send({ type: 'blocked', reason: 'password' }); return; }
      var u;
      try { u = new URL(abs(f.getAttribute('action') || '') || BASE); } catch (_) { return; }
      var fd;
      try { fd = new FormData(f); } catch (_) { return; }
      u.search = '';
      fd.forEach(function (v, k) { if (typeof v === 'string') u.searchParams.append(k, v); });
      var sub = e.submitter;
      if (sub && sub.name && !fd.has(sub.name)) u.searchParams.append(sub.name, sub.value);
      send({ type: 'nav', url: u.href });
    }, true);

    try { window.open = function (u) { var a = u ? abs(u) : null; if (a) send({ type: 'nav', url: a, newTab: true }); return null; }; } catch (_) { /* noop */ }

    // Keep SPAs from crashing: history API throws in an opaque-origin frame.
    try {
      ['pushState', 'replaceState'].forEach(function (k) {
        var o = history[k];
        history[k] = function () { try { return o.apply(this, arguments); } catch (_) { /* noop */ } };
      });
    } catch (_) { /* noop */ }

    // Storage + cookies throw in a sandboxed frame; give pages an in-memory stand-in.
    function memStore() {
      var d = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
        setItem: function (k, v) { d[k] = String(v); },
        removeItem: function (k) { delete d[k]; },
        clear: function () { d = {}; },
        key: function (i) { return Object.keys(d)[i] || null; },
        get length() { return Object.keys(d).length; }
      };
    }
    ['localStorage', 'sessionStorage'].forEach(function (n) {
      try { void window[n]; } catch (_) {
        try { Object.defineProperty(window, n, { value: memStore(), configurable: true }); } catch (__) { /* noop */ }
      }
    });
    try { void document.cookie; } catch (_) {
      var ck = {};
      try {
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          get: function () { return Object.keys(ck).map(function (k) { return k + '=' + ck[k]; }).join('; '); },
          set: function (v) { var p = String(v).split(';')[0], i = p.indexOf('='); if (i > 0) ck[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
        });
      } catch (__) { /* noop */ }
    }

    // Route page-level GET fetch/XHR through the same relay that served the page.
    if (RELAY) {
      var RO = '';
      try { RO = new URL(RELAY.replace(/\{(enc|raw)\}[\s\S]*$/, '')).origin; } catch (_) { /* noop */ }
      var viaRelay = function (u) {
        var a = abs(u);
        if (!a || !/^https?:/i.test(a)) return u;
        if (RO && a.indexOf(RO) === 0) return u;
        var t = RELAY;
        if (!/\{(enc|raw)\}/.test(t)) t += '{enc}';
        return t.replace('{enc}', function () { return encodeURIComponent(a); }).replace('{raw}', function () { return a; });
      };
      try {
        var of = window.fetch;
        if (of) window.fetch = function (input, init) {
          try {
            var m = (init && init.method) || (input && input.method) || 'GET';
            if (/^(GET|HEAD)$/i.test(m) && (typeof input === 'string' || input instanceof URL)) {
              input = viaRelay(String(input));
              init = Object.assign({}, init || {}, { credentials: 'omit' });
            }
          } catch (_) { /* noop */ }
          return of.call(this, input, init);
        };
      } catch (_) { /* noop */ }
      try {
        var oo = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, u) {
          try { if (/^(GET|HEAD)$/i.test(m)) arguments[1] = viaRelay(String(u)); } catch (_) { /* noop */ }
          return oo.apply(this, arguments);
        };
      } catch (_) { /* noop */ }
    }

    function meta() { send({ type: 'meta', title: document.title || '' }); }
    window.addEventListener('load', function () { meta(); setTimeout(meta, 1500); });
    document.addEventListener('DOMContentLoaded', function () { send({ type: 'ready' }); });

    // Stylesheets that the browser refused to load (hotlink / MIME / CORS) are re-fetched by the parent through a relay.
    var cssTried = {}, cssN = 0;
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'LINK' && /stylesheet/i.test(t.rel || '') && t.href && !cssTried[t.href] && cssN < 14) {
        cssTried[t.href] = 1; cssN++;
        send({ type: 'css', href: t.href });
      }
    }, true);
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (e.source !== P || !d || d.wavey !== 1 || d.type !== 'css-data' || typeof d.css !== 'string') return;
      var s = document.createElement('style');
      s.setAttribute('data-wavey-css', d.href);
      s.textContent = d.css;
      (document.head || document.documentElement).appendChild(s);
    });

    // Un-hide pages that wait for a script to reveal them, and report pages that are still empty.
    function visible() {
      try {
        var b = document.body, h = document.documentElement;
        if (!b) return false;
        [h, b].forEach(function (el) {
          var cs = getComputedStyle(el);
          if (cs.display === 'none') el.style.setProperty('display', 'block', 'important');
          if (parseFloat(cs.opacity) === 0) el.style.setProperty('opacity', '1', 'important');
          if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
        });
        if ((b.innerText || '').replace(/\s+/g, '').length > 30) return true;
        return !!b.querySelector('img,canvas,video,picture,iframe,object,embed,audio,input,textarea,select');
      } catch (e) { return true; }
    }
    setTimeout(visible, 2200);
    setTimeout(function () { if (!visible()) send({ type: 'blank', static: STATIC ? 1 : 0 }); }, 5200);

    document.addEventListener('keydown', function (e) {
      var mod = e.altKey || e.ctrlKey || e.metaKey;
      if (!e.key) return;
      if (inField(e.target) && !mod) return;
      if (!(mod || e.key === 'Escape' || e.key.length === 1)) return;
      send({ type: 'key', key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
    }, true);
  }

  const looksHtml = (s) => /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(s) || /<(html|body|head|div|p|a|table|section)[\s>]/i.test(s.slice(0, 4000));

  // Hosts whose scripts only slow a proxied page down (analytics, ads, cookie walls) — dropped before rendering.
  const BLOCKED_HOSTS = /(^|\.)(google-analytics\.com|googletagmanager\.com|googletagservices\.com|doubleclick\.net|googlesyndication\.com|adservice\.google\.[a-z.]+|connect\.facebook\.net|hotjar\.com|clarity\.ms|scorecardresearch\.com|quantserve\.com|taboola\.com|outbrain\.com|criteo\.(com|net)|amazon-adsystem\.com|adsrvr\.org|adnxs\.com|pubmatic\.com|rubiconproject\.com|moatads\.com|chartbeat\.(com|net)|segment\.(com|io)|mixpanel\.com|fullstory\.com|mouseflow\.com|optimizely\.com|nr-data\.net|newrelic\.com|bat\.bing\.com|ads-twitter\.com|onesignal\.com|cookielaw\.org|onetrust\.com|cookiebot\.com|trustarc\.com|sentry-cdn\.com|sentry\.io|datadoghq\.com|permutive\.com|parsely\.com)$/i;
  function curCss() {
    if (!S.cursor) return '';
    const cs = getComputedStyle(document.documentElement);
    const c = cs.getPropertyValue('--cur1').trim(), h = cs.getPropertyValue('--cur-h1').trim();
    if (!c || !h) return '';
    return `html,html *{cursor:${c} 7 5,auto!important}a,a *,button,[role=button],label,select,summary,input[type=checkbox],input[type=radio],input[type=range],input[type=submit],input[type=button]{cursor:${h} 9 6,pointer!important}input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=button]):not([type=color]),textarea,[contenteditable]{cursor:text!important}`;
  }
  const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url'];

  function prepareDocument(text, ct, url, relay, opts = {}) {
    if (!(/html/.test(ct) || looksHtml(text))) {
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(hostOf(url))}</title><style>body{margin:0;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#1b1b1f;background:#fff;white-space:pre-wrap;word-break:break-word}</style><body>${esc(text)}</body>`;
      return { html, title: hostOf(url), staticLen: text.length };
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const staticMode = !!opts.static || !!(relay && relay.rendered);

    const mr = doc.querySelector('meta[http-equiv="refresh" i]');
    if (mr) {
      const m = /^\s*(\d+(?:\.\d+)?)\s*[;,]\s*(?:url\s*=\s*)?['"]?([^'"]+)/i.exec(mr.getAttribute('content') || '');
      if (m && parseFloat(m[1]) <= 5) { try { return { redirect: new URL(m[2].trim(), url).href }; } catch { /* ignore */ } }
    }
    $$('meta[http-equiv]', doc).forEach((m) => {
      const v = (m.getAttribute('http-equiv') || '').toLowerCase();
      if (v === 'content-security-policy' || v === 'content-security-policy-report-only' || v === 'refresh' || v === 'x-frame-options') m.remove();
    });
    // Anti-clickjacking snippets hide the whole page until a script confirms it is top-level — that is the classic "blank white page".
    $$('style', doc).forEach((s) => {
      const c = s.textContent || '';
      if (c.length < 500 && /(body|html)\s*\{[^}]*display\s*:\s*none/i.test(c) && !/@media|<|visible/.test(c)) s.remove();
    });
    // CORS-mode / integrity attributes make perfectly good CSS, fonts and scripts fail inside a sandboxed frame.
    $$('[integrity]', doc).forEach((n) => n.removeAttribute('integrity'));
    $$('[crossorigin]', doc).forEach((n) => n.removeAttribute('crossorigin'));
    $$('[referrerpolicy]', doc).forEach((n) => n.removeAttribute('referrerpolicy'));
    $$('link[rel]', doc).forEach((l) => {
      const rel = (l.getAttribute('rel') || '').toLowerCase();
      if (/\bpreload\b/.test(rel) && (l.getAttribute('as') || '').toLowerCase() === 'style') {
        l.setAttribute('rel', 'stylesheet'); l.removeAttribute('as'); l.removeAttribute('onload');
      } else if (/\b(preload|prefetch|prerender|modulepreload|dns-prefetch|preconnect|manifest)\b/.test(rel)) l.remove();
      else if (/stylesheet/.test(rel) && l.hasAttribute('media') && /media\s*=/.test(l.getAttribute('onload') || '')) l.removeAttribute('media');
    });
    $$('script[src]', doc).forEach((s) => {
      try { if (BLOCKED_HOSTS.test(new URL(s.getAttribute('src'), url).hostname)) s.remove(); } catch { /* ignore */ }
    });
    // Lazy-loaded images whose script may never run.
    $$('img', doc).forEach((im) => {
      const ds = LAZY_ATTRS.map((a) => im.getAttribute(a)).find((v) => v && !/^\s*$/.test(v));
      const cur = im.getAttribute('src') || '';
      if (ds && (!cur || /^data:/i.test(cur) || /(placeholder|blank|spacer|lazy|1x1|pixel|loading)/i.test(cur))) im.setAttribute('src', ds);
      const dss = im.getAttribute('data-srcset') || im.getAttribute('data-lazy-srcset');
      if (dss) im.setAttribute('srcset', dss);
    });
    $$('source[data-srcset]', doc).forEach((s) => s.setAttribute('srcset', s.getAttribute('data-srcset')));

    if (staticMode) {
      $$('script', doc).forEach((n) => n.remove());
      $$('noscript', doc).forEach((n) => { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); });
      $$('*', doc).forEach((el) => Array.from(el.attributes).forEach((a) => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }));
    }

    let staticLen = 0;
    try {
      const c = doc.body.cloneNode(true);
      $$('script, style, template', c).forEach((n) => n.remove());
      staticLen = (c.textContent || '').replace(/\s+/g, ' ').trim().length;
    } catch { /* noop */ }

    let base = url;
    const b = doc.querySelector('base[href]');
    if (b) { try { base = new URL(b.getAttribute('href'), url).href; } catch { /* ignore */ } }
    $$('base', doc).forEach((n) => n.remove());

    const head = doc.head || doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
    const mk = (tag, attrs, txt) => {
      const n = doc.createElement(tag);
      Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
      if (txt) n.textContent = txt;
      return n;
    };
    const cur = curCss();
    const nodes = [
      mk('meta', { charset: 'utf-8' }),
      mk('meta', { name: 'referrer', content: 'no-referrer' }),
      mk('meta', { 'http-equiv': 'Content-Security-Policy', content: 'upgrade-insecure-requests' }),
      mk('base', { href: base }),
      ...(cur ? [mk('style', { id: 'wavey-cursor' }, cur)] : []),
      mk('script', {}, `(${bridge.toString()})(${safeJSON(base)}, ${safeJSON(relay && !relay.rendered && !relay.field && !relay.archive ? relay.tpl : '')}, ${staticMode ? 1 : 0});`)
    ];
    if (!doc.querySelector('meta[name="viewport" i]')) nodes.splice(1, 0, mk('meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }));
    for (let i = nodes.length - 1; i >= 0; i--) head.insertBefore(nodes[i], head.firstChild);
    return { html: '<!DOCTYPE html>' + doc.documentElement.outerHTML, title: (doc.title || '').trim(), staticLen };
  }

  /* ═══════════════════════════ Tabs & state ═══════════════════════════ */
  const tabs = [];
  let activeId = null;
  const tabsEl = $('#tabs'), framesEl = $('#frames');
  const tab = () => tabs.find((t) => t.id === activeId);

  function createTab() {
    const t = { id: uid(), url: null, title: 'New Tab', hist: [{ url: null }], idx: 0, loading: false, error: null, nav: 0, pending: 0, relay: '', abort: null, counted: false, hinted: false, timer: 0, frame: null };
    const f = document.createElement('iframe');
    f.className = 'frame';
    f.title = 'Page';
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.setAttribute('allow', FRAME_ALLOW);
    f.setAttribute('sandbox', SANDBOX_DOC);
    f.addEventListener('load', () => { if (!t.pending) return; t.pending = 0; finishLoad(t); });
    framesEl.appendChild(f);
    t.frame = f;
    tabs.push(t);
    return t;
  }

  function openTab(input, { activate = true, at } = {}) {
    if (activate) setPage('browser');
    const t = createTab();
    if (typeof at === 'number') { tabs.splice(tabs.indexOf(t), 1); tabs.splice(at, 0, t); }
    if (activate) activeId = t.id;
    if (!activeId) activeId = t.id;
    refresh();
    if (input) navigate(t, input);
    else if (activate) setTimeout(() => $('#homeInput').focus({ preventScroll: true }), 50);
    persistSession();
    return t;
  }

  function closeTab(id) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = tabs[i];
    if (t.abort) t.abort.abort();
    clearTimeout(t.timer);
    t.frame.remove();
    tabs.splice(i, 1);
    if (!tabs.length) { activeId = null; openTab(); return; }
    if (activeId === id) activeId = tabs[Math.min(i, tabs.length - 1)].id;
    refresh();
    persistSession();
  }

  function activateTab(id) {
    setPage('browser');
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    activeId = id;
    if (t.lazyUrl) { const u = t.lazyUrl; t.lazyUrl = null; t.url = null; navigate(t, { url: u }, { push: false }); return; }
    refresh();
  }

  function pushEntry(t, url) {
    const cur = t.hist[t.idx];
    if (cur && cur.url === url) return;
    t.hist = t.hist.slice(0, t.idx + 1);
    t.hist.push({ url });
    t.idx = t.hist.length - 1;
  }

  function goHome(t, push = true) {
    if (t.abort) t.abort.abort();
    t.nav++;
    clearTimeout(t.timer);
    t.raw = null; t.url = null; t.error = null; t.loading = false; t.title = 'New Tab'; t.relay = ''; t.hostedFront = false;
    t.pending = 0;
    t.frame.removeAttribute('srcdoc');
    t.frame.src = 'about:blank';
    if (push) pushEntry(t, null);
    refresh();
    persistSession();
    if (t.id === activeId) setTimeout(() => $('#homeInput').focus({ preventScroll: true }), 30);
  }

  function armTimer(t) {
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { if (t.loading && !t.error) { t.pending = 0; finishLoad(t); } }, 22000);
  }

  function setFrameDoc(t, html) {
    t.frame.setAttribute('sandbox', SANDBOX_DOC);
    t.frame.removeAttribute('src');
    t.pending = 1;
    t.frame.srcdoc = html;
    armTimer(t);
  }

  function setFrameSrc(t, url, sameOrigin = true) {
    t.frame.setAttribute('sandbox', sameOrigin ? SANDBOX_DIRECT : SANDBOX_DOC);
    t.frame.removeAttribute('srcdoc');
    t.pending = 1;
    t.frame.src = url;
    armTimer(t);
  }

  function finishLoad(t) {
    clearTimeout(t.timer);
    t.loading = false;
    if (t.url && !t.error && !t.counted) { t.counted = true; recordVisit(t); }
    if (t.url && t.directMode && !t.hinted) {
      t.hinted = true;
      toast('Blank or refused? That site may block embedding — switch to Relay.', 'info', 4200);
    }
    refresh();
  }

  async function navigate(t, input, opts = {}) {
    const r = typeof input === 'string' ? resolveInput(input) : input;
    if (!r) return;
    setPage('browser');
    if (r.home) return goHome(t, opts.push !== false);
    let url = unwrapRedirect(r.url);
    try { url = new URL(url).href; } catch { toast('That address is not valid', 'warn'); return; }
    if (!isHttp(url)) { toast('Only http and https addresses are supported', 'warn'); return; }

    if (t.abort) t.abort.abort();
    const ac = new AbortController();
    t.abort = ac;
    const token = ++t.nav;
    const mode = opts.forceMode || S.engine;
    t.raw = null; t.error = null; t.url = url; t.loading = true; t.title = hostOf(url); t.relay = ''; t.hostedFront = false; t.counted = false; t.directMode = mode === 'direct';
    if (opts.push !== false) pushEntry(t, url);
    else if (t.hist[t.idx]) t.hist[t.idx].url = url;
    refresh();
    persistSession();

    try {
      if (!navigator.onLine) throw new Error('You appear to be offline.');
      if (mode === 'direct') setFrameSrc(t, url, true);
      else await loadViaRelay(t, url, ac.signal, token, opts.hops || 0, mode);
    } catch (e) {
      if (e.name === 'AbortError' || token !== t.nav) return;
      clearTimeout(t.timer);
      t.loading = false;
      t.error = { url, msg: e.message || String(e) };
      refresh();
    }
  }

  async function loadViaRelay(t, url, signal, token, hops, mode) {
    if (mode === 'hosted') return loadHosted(t, url, token);
    const fallback = !!(S.hosted && S.hostedAuto && mode !== 'custom');
    const relays = relayList(mode);
    if (!relays.length) {
      if (fallback) return loadHosted(t, url, token);
      throw new Error(mode === 'custom'
        ? 'No custom relay is set yet. Add your Worker URL in Settings → Browsing.'
        : 'Every relay is switched off. Turn one on in Settings → Browsing.');
    }
    let res;
    try { res = await fetchViaRelays(url, relays, signal); } catch (e) {
      if (e.name === 'AbortError' || token !== t.nav) throw e;
      if (fallback) { toast('Public relays failed — switching to the hosted proxy', 'warn'); return loadHosted(t, url, token); }
      throw new Error((mode === 'custom' ? '' : 'None of the public relays could load this page — they are often rate-limited or refuse big sites. ') + e.message);
    }
    if (token !== t.nav) return;
    if (res.binary) { t.relay = res.relay.name; setFrameSrc(t, url, true); return; }
    const doc = prepareDocument(res.text, res.ct, url, res.relay);
    if (doc.redirect) {
      if (hops >= 5) throw new Error('Too many redirects.');
      return navigate(t, { url: doc.redirect }, { push: false, hops: hops + 1, forceMode: mode });
    }
    t.raw = { url, res, staticLen: doc.staticLen, stage: res.relay.rendered || res.relay.archive ? 2 : 0, busy: false };
    t.title = doc.title || hostOf(url);
    t.relay = res.relay.name;
    if (!res.relay.custom && S.lastRelay !== res.relay.id) { S.lastRelay = res.relay.id; save(); }
    setFrameDoc(t, doc.html);
    refresh();
  }

  function step(dir) {
    const t = tab();
    const i = t.idx + dir;
    if (i < 0 || i >= t.hist.length) return;
    t.idx = i;
    const e = t.hist[i];
    if (e.url) navigate(t, { url: e.url }, { push: false }); else goHome(t, false);
  }
  const reload = () => { const t = tab(); if (t && t.url) navigate(t, { url: t.url }, { push: false }); };

  /* ═══════════════════════════ History / bookmarks / visits ═══════════════════════════ */
  function recordVisit(t) {
    const url = t.url;
    const h = data.history;
    if (h[0] && h[0].url === url) { h[0].t = Date.now(); h[0].title = t.title; }
    else { h.unshift({ url, title: t.title, t: Date.now() }); if (h.length > 600) h.length = 600; }
    const o = originOf(url);
    if (o) {
      const def = DEFAULT_SITES.find((d) => originOf(d.url) === o);
      const v = data.visits[o] || (data.visits[o] = { count: 0, url: def ? def.url : o + '/' });
      v.count++; v.last = Date.now();
    }
    save();
    renderTiles();
  }

  function updateHistoryTitle(url, title) {
    const h = data.history.find((x) => x.url === url);
    if (h && title) { h.title = title; save(); }
  }

  const isBookmarked = (u) => !!u && data.bookmarks.some((b) => b.url === u);
  function toggleBookmark() {
    const t = tab();
    if (!t || !t.url) { toast('Open a page first to bookmark it', 'warn'); return; }
    if (isBookmarked(t.url)) { data.bookmarks = data.bookmarks.filter((b) => b.url !== t.url); toast('Bookmark removed'); }
    else { data.bookmarks.unshift({ url: t.url, title: t.title || hostOf(t.url), t: Date.now() }); toast('Bookmarked'); }
    save();
    syncStar();
    if (panelName === 'bookmarks') renderPanel(true);
  }

  /* ═══════════════════════════ Rendering: tabs, omnibox, view ═══════════════════════════ */
  function favHtml(t) {
    if (t.loading) return '<span class="spin"></span>';
    if (!t.url) return `<span class="fav logo"><img src="${LOGO}" alt=""></span>`;
    const o = originOf(t.url);
    const letter = esc((hostOf(t.url)[0] || '•').toUpperCase());
    return `<span class="fav" style="background:${avatarBg(hostOf(t.url))}" data-letter="${letter}"><img src="${esc(o)}/favicon.ico" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`;
  }

  function renderTabs() {
    tabsEl.innerHTML = tabs.map((t) => `
      <div class="tab ${t.id === activeId ? 'active' : ''}" role="tab" aria-selected="${t.id === activeId}" draggable="true" data-id="${t.id}" title="${esc(t.title)}">
        ${favHtml(t)}<span class="ttl">${esc(t.title)}</span>
        <button class="x" data-close aria-label="Close tab" tabindex="-1">${icon('close')}</button>
      </div>`).join('');
  }
  tabsEl.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG') { const p = img.parentElement; if (p && p.dataset.letter) p.textContent = p.dataset.letter; }
  }, true);

  function syncOmni(force) {
    const t = tab(), input = $('#omniInput');
    if (!t) return;
    if (force || document.activeElement !== input) input.value = t.url ? displayUrl(t.url) : '';
    const ico = $('#omniIco');
    ico.classList.toggle('secure', !!t.url && /^https:/i.test(t.url));
    ico.innerHTML = icon(t.url ? (/^https:/i.test(t.url) ? 'lock' : 'globe') : 'search');
  }

  function syncStar() {
    const t = tab(), b = $('#starBtn');
    const on = !!t && isBookmarked(t.url);
    b.classList.toggle('on', on);
    b.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this page');
    b.title = on ? 'Remove bookmark' : 'Bookmark this page';
  }

  function syncNav() {
    const t = tab();
    if (!t) return;
    $('#backBtn').disabled = t.idx <= 0;
    $('#forwardBtn').disabled = t.idx >= t.hist.length - 1;
    $('#reloadBtn').disabled = !t.url;
    const pill = $('#enginePillText');
    pill.textContent = S.engine === 'direct' ? 'Direct' : S.engine === 'custom' ? 'My Worker' : S.engine === 'hosted' ? 'Hosted' : (t.relay && t.url ? 'Relay · ' + t.relay : 'Relay');
  }

  function updateView() {
    const t = tab();
    if (!t) return;
    $('#home').classList.toggle('show', !t.url);
    $('#errorView').classList.toggle('show', !!t.error);
    tabs.forEach((x) => x.frame.classList.toggle('active', x === t && !!x.url && !x.error));
    $('#loadbar').classList.toggle('on', t.loading);
    $('#hostbar').classList.toggle('show', !!t.hostedFront && !!t.url && !t.error);
    if (t.hostedFront && t.url) $('#hostUrl').textContent = displayUrl(t.url);
    if (t.error) {
      $('#errTitle').textContent = 'Couldn’t load this page';
      $('#errUrl').textContent = t.error.url;
      $('#errMsg').textContent = t.error.msg;
    }
  }

  function applyCloak() {
    const t = tab();
    document.title = S.cloakTitle || (t && t.url ? `${t.title} — Wavey chps` : 'Wavey chps');
    const fav = $('#favicon');
    if (S.cloakIcon) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="50" font-size="48" text-anchor="middle">${esc(S.cloakIcon.slice(0, 2))}</text></svg>`;
      fav.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    } else if (fav.dataset.def) fav.href = fav.dataset.def;
  }

  function refresh() {
    renderTabs(); updateView(); syncOmni(); syncStar(); syncNav(); applyCloak();
  }

  /* ═══════════════════════════ Home: greeting, clock, tiles ═══════════════════════════ */
  function tickClock() {
    const d = new Date(), h = d.getHours();
    $('#greeting').textContent = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('#clock').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function topSites() {
    const hidden = new Set(data.hidden);
    const pinned = data.pinned.map((x) => ({ title: x.title, url: x.url, origin: originOf(x.url), meta: 'Pinned', pin: true }));
    const pinnedO = new Set(pinned.map((x) => x.origin));
    const limit = Math.max(7, pinned.length);
    const mine = Object.entries(data.visits).filter(([o]) => !hidden.has(o) && !pinnedO.has(o)).sort((a, b) => b[1].count - a[1].count).slice(0, limit)
      .map(([o, v]) => ({ title: (DEFAULT_SITES.find((d) => originOf(d.url) === o) || {}).title || hostOf(o), url: v.url || o + '/', origin: o, meta: v.count + (v.count === 1 ? ' visit' : ' visits') }));
    const seen = new Set([...mine.map((m) => m.origin), ...pinnedO]);
    const fill = DEFAULT_SITES.filter((d) => !seen.has(originOf(d.url)) && !hidden.has(originOf(d.url)))
      .map((d) => ({ title: d.title, url: d.url, origin: originOf(d.url), meta: 'Suggested' }));
    return [...pinned, ...mine, ...fill].slice(0, limit);
  }

  function renderTiles() {
    const items = topSites();
    $('#tiles').innerHTML = items.map((s) => `
      <a class="tile" href="${esc(s.url)}" data-url="${esc(s.url)}" data-origin="${esc(s.origin)}" ${s.pin ? 'data-pin="1"' : ''}>
        <span class="av" style="background:${avatarBg(hostOf(s.url))}">${esc((s.title[0] || '?').toUpperCase())}</span>
        <span class="nm">${esc(s.title)}</span><span class="mt">${esc(s.meta)}</span>
        <span class="rm" data-rm role="button" aria-label="Remove ${esc(s.title)}">${icon('close')}</span>
      </a>`).join('') + `
      <button class="tile add" type="button" aria-label="Add a site to Most visited">
        <span class="av">+</span><span class="nm">Add site</span><span class="mt">Pin your own</span>
      </button>`;
  }

  /* ═══════════════════════════ Omnibox + suggestions ═══════════════════════════ */
  const omni = $('#omniInput'), sug = $('#suggest');
  let sugItems = [], sugIdx = -1;

  function buildSuggestions(q) {
    q = q.trim();
    if (!q) return [];
    const out = [];
    const r = resolveInput(q);
    if (r && r.url && !r.query) out.push({ kind: 'go', title: q, sub: 'Open address', value: r.url });
    out.push({ kind: 'search', title: q, sub: 'Search ' + SEARCH[S.search].name, value: searchUrl(q) });
    const ql = q.toLowerCase(), seen = new Set();
    const pool = [...data.bookmarks.map((b) => ({ ...b, kind: 'bookmark' })), ...data.history.map((h) => ({ ...h, kind: 'history' }))];
    for (const p of pool) {
      if (out.length >= 7) break;
      if (seen.has(p.url)) continue;
      if ((p.title || '').toLowerCase().includes(ql) || p.url.toLowerCase().includes(ql)) {
        seen.add(p.url);
        out.push({ kind: p.kind, title: p.title || hostOf(p.url), sub: displayUrl(p.url), value: p.url });
      }
    }
    return out;
  }

  function renderSuggest() {
    sugItems = buildSuggestions(omni.value);
    sugIdx = -1;
    if (!sugItems.length) return closeSuggest();
    const ico = { go: 'globe', search: 'search', bookmark: 'star', history: 'history' };
    sug.innerHTML = sugItems.map((s, i) => `<li role="option" data-i="${i}">${icon(ico[s.kind])}<b>${esc(s.title)}</b><small>${esc(s.sub)}</small></li>`).join('');
    sug.classList.add('open');
    omni.setAttribute('aria-expanded', 'true');
  }
  function closeSuggest() { sug.classList.remove('open'); omni.setAttribute('aria-expanded', 'false'); sugIdx = -1; }
  const suggestOpen = () => sug.classList.contains('open');
  function moveSug(d) {
    if (!sugItems.length) return;
    sugIdx = (sugIdx + d + sugItems.length) % sugItems.length;
    $$('li', sug).forEach((li, i) => li.classList.toggle('sel', i === sugIdx));
  }
  function focusOmni() { omni.focus(); omni.select(); }

  omni.addEventListener('focus', () => { const t = tab(); omni.value = t && t.url ? t.url : ''; omni.select(); });
  omni.addEventListener('blur', () => setTimeout(() => { closeSuggest(); syncOmni(true); }, 120));
  omni.addEventListener('input', renderSuggest);
  omni.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!suggestOpen()) renderSuggest(); moveSug(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSug(-1); }
    else if (e.key === 'Escape') { closeSuggest(); omni.blur(); }
  });
  $('#omniForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pick = sugIdx >= 0 ? sugItems[sugIdx] : null;
    const val = pick ? pick.value : omni.value;
    closeSuggest();
    omni.blur();
    if (val.trim()) navigate(tab(), val);
  });
  sug.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const s = sugItems[+li.dataset.i];
    closeSuggest(); omni.blur();
    if (s) navigate(tab(), s.value);
  });

  /* ═══════════════════════════ Menu & panels ═══════════════════════════ */
  const menu = $('#menu'), panel = $('#panel'), scrim = $('#scrim'), panelBody = $('#panelBody');
  let panelName = null;
  const menuOpen = () => menu.classList.contains('open');
  function openMenu() {
    const r = $('#menuBtn').getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    menu.classList.add('open');
    $('#menuBtn').setAttribute('aria-expanded', 'true');
  }
  function closeMenu() { menu.classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }

  function openPanel(name) {
    closeMenu();
    panelName = name;
    renderPanel();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    scrim.classList.add('show');
  }
  function closePanel() {
    panelName = null;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('show');
  }

  const dayLabel = (t) => {
    const d = new Date(t), n = new Date();
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const diff = Math.round((b - a) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  function itemHtml(it, delAct) {
    const h = hostOf(it.url);
    return `<div class="item" data-act="open" data-url="${esc(it.url)}">
      <span class="av" style="background:${avatarBg(h)}">${esc((h[0] || '?').toUpperCase())}</span>
      <div class="tx"><b>${esc(it.title || h)}</b><small>${esc(displayUrl(it.url))}</small></div>
      <button class="icon-btn sm del" data-act="${delAct}" data-url="${esc(it.url)}" aria-label="Remove">${icon('close')}</button>
    </div>`;
  }

  function historyListHtml(q) {
    q = (q || '').toLowerCase();
    const rows = data.history.filter((h) => !q || (h.title || '').toLowerCase().includes(q) || h.url.toLowerCase().includes(q));
    if (!rows.length) return `<div class="panel-empty">${q ? 'Nothing matches.' : 'Pages you visit will show up here.'}</div>`;
    let last = '', out = '';
    rows.slice(0, 200).forEach((h) => {
      const d = dayLabel(h.t);
      if (d !== last) { out += `<div class="day">${esc(d)}</div>`; last = d; }
      out += itemHtml(h, 'rm-hist');
    });
    return `<div class="list">${out}</div>`;
  }

  function sw(key, label, desc, checked) {
    return `<div class="field"><div class="lbl"><span>${label}</span><label class="switch"><input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}><i></i></label></div>${desc ? `<small>${desc}</small>` : ''}</div>`;
  }

  function settingsHtml() {
    const themes = Object.entries(THEMES).map(([k, v0]) => { const v = k === 'custom' ? currentTheme() : v0; return `<button class="swatch ${S.theme === k ? 'on' : ''}" data-act="theme" data-val="${k}" style="--a:${v.a};--b:${v.b}" aria-label="${v0.name}" title="${v0.name}"><span>${k === 'custom' ? '<i class="pal">✎</i>' : ''}</span></button>`; }).join('');
    const ct = currentTheme();
    const custom = S.theme === 'custom' ? `<div class="cpick"><label>Accent<input type="color" data-key="cA" value="${ct.a}"></label><label>Glow<input type="color" data-key="cB" value="${ct.b}"></label><label>Background<input type="color" data-key="cBg" value="${ct.bg}"></label></div>` : '';
    const fxOpts = Object.entries(FX_MODES).map(([k, n]) => `<option value="${k}" ${S.fx === k ? 'selected' : ''}>${n}</option>`).join('');
    const engines = [['relay', 'Relay'], ['direct', 'Direct'], ['hosted', 'Hosted'], ['custom', 'My Worker']];
    const engDesc = {
      hosted: 'Always opens your hosted proxy (below) inside Wavey.',
      relay: 'Fetches pages through public relays (auto-fallback), rewrites links and forms, and keeps you inside Wavey.',
      direct: 'Loads the site in a plain frame. Fast, but any site that forbids embedding will show blank.',
      custom: 'Uses only the relay URLs you list below — your own Cloudflare Worker is the most reliable option.'
    };
    const relays = RELAYS.map((r) => `
      <div class="relay"><div class="nfo"><b>${esc(r.name)}</b><small>${esc(hostOf(r.tpl))}${r.rendered ? ' · renders JS' : r.archive ? ' · archived copy' : r.lossy ? ' · small pages only' : ''}</small></div>
        <span class="rstat" data-rs="${r.id}"></span>
        <label class="switch"><input type="checkbox" data-relay="${r.id}" ${S.disabledRelays.includes(r.id) ? '' : 'checked'}><i></i></label></div>`).join('');
    const search = Object.entries(SEARCH).map(([k, v]) => `<option value="${k}" ${S.search === k ? 'selected' : ''}>${v.name}</option>`).join('');
    return `
      ${accountHtml()}
      <div class="group"><h3>Appearance</h3>
        <div class="field"><div class="lbl">Theme</div><div class="swatches">${themes}</div>${custom}</div>
        <div class="field"><div class="lbl">Interactive background</div><select data-key="fx" aria-label="Interactive background">${fxOpts}</select><small>Reacts to your mouse and clicks. Pauses by itself while a website is open.</small></div>
        <div class="field"><div class="lbl"><span>Glass blur</span><span id="glassVal">${S.glass}px</span></div><input type="range" min="0" max="40" value="${S.glass}" data-key="glass" aria-label="Glass blur"></div>
        ${sw('glow', 'Pointer glow', 'A soft light that follows your cursor.', S.glow)}
        ${sw('cursor', 'Bean cursor', 'Use the jellybean mouse pointer (also inside pages loaded in Relay mode).', S.cursor)}
        ${sw('motion', 'Animated background', 'Drifting colour glow and shimmer. Turn off to save battery.', S.motion)}
      </div>
      <div class="group"><h3>Browsing</h3>
        <div class="field"><div class="lbl">Proxy engine</div>
          <div class="seg">${engines.map(([k, n]) => `<button class="${S.engine === k ? 'on' : ''}" data-act="engine" data-val="${k}">${n}</button>`).join('')}</div>
          <small>${engDesc[S.engine]}</small></div>
        <div class="field"><div class="lbl">Search engine</div><select data-key="search" aria-label="Search engine">${search}</select>
          <small>Google often refuses relays. DuckDuckGo and Brave are the safest bets.</small></div>
        <div class="field"><div class="lbl"><span>Public relays (${RELAYS.length})</span><button class="btn sm" data-act="test-relays">Test all</button></div>
          <small>The fastest healthy relays go first, several at once; broken ones rest automatically. “Test all” checks every relay in parallel (a few seconds).</small>${relays}</div>
        <div class="field"><div class="lbl">Your own relay URLs</div>
          <textarea data-key="customRelay" spellcheck="false" placeholder="https://my-relay.workers.dev/?url=">${esc(S.customRelay)}</textarea>
          <small>Paste as many as you like — one per line (they are tried first). Use <code>{enc}</code> or <code>{raw}</code> where the page address goes; if omitted, it is appended URL-encoded. See About for a 20-line Worker.</small></div>
        <div class="field"><div class="lbl">Hosted proxy</div>
          <input type="text" data-key="hosted" value="${esc(S.hosted)}" placeholder="https://your-proxy.example/" spellcheck="false" aria-label="Hosted proxy address">
          <small>Shown inside Wavey when the public relays fail. A bare address opens that proxy’s own page (Wavey copies the site address for you to paste). If you know its URL pattern, use <code>{enc}</code>, <code>{b64}</code>, <code>{uv}</code> or <code>{raw}</code> — e.g. <code>https://host/service/{uv}</code>. Whoever runs a hosted proxy can see what is loaded through it.</small></div>
        ${sw('hostedAuto', 'Use the hosted proxy automatically', 'When every public relay fails, fall back to it.', S.hostedAuto)}
        ${sw('restore', 'Restore tabs on launch', 'Reopen the tabs you had last time.', S.restore)}
      </div>
      <div class="group"><h3>Privacy</h3>
        <div class="field"><div class="lbl">Tab title &amp; icon</div>
          <div class="two"><input type="text" data-key="cloakIcon" maxlength="2" value="${esc(S.cloakIcon)}" placeholder="🌊" aria-label="Tab icon emoji"><input type="text" data-key="cloakTitle" value="${esc(S.cloakTitle)}" placeholder="Custom tab title (blank = automatic)" aria-label="Tab title"></div></div>
        <div class="field"><div class="lbl">Panic key</div>
          <div class="two"><input type="text" data-key="panicKey" maxlength="1" value="${esc(S.panicKey)}" placeholder="\`" aria-label="Panic key"><input type="text" data-key="panicUrl" value="${esc(S.panicUrl)}" placeholder="https://www.wikipedia.org/" aria-label="Panic destination"></div>
          <small>Press the key (outside text boxes) to instantly leave this site for the address on the right.</small></div>
        <div class="field"><div class="lbl">Clear data</div>
          <div class="btnrow"><button class="btn sm danger" data-act="clear-history">${icon('trash')}History</button><button class="btn sm danger" data-act="reset-tiles">${icon('trash')}Most visited</button><button class="btn sm danger" data-act="reset-all">${icon('trash')}Everything</button></div></div>
      </div>
      <div class="group"><h3>Backup</h3>
        <div class="field"><div class="btnrow" style="margin-top:0"><button class="btn sm" data-act="export">${icon('download')}Export</button><button class="btn sm" data-act="import">${icon('upload')}Import</button></div>
          <small>Settings, bookmarks, history and shortcuts as a JSON file.</small></div>
      </div>`;
  }

  function aboutHtml() {
    return `<div class="prose">
      <p><b style="color:var(--text)">Wavey chps</b> v.${VERSION} — a glassy, browser-style portal that lives entirely in three static files.</p>
      <h4>How it works</h4>
      <p>In <b>Relay</b> mode a public relay fetches the page for you, Wavey rewrites it (base URL, links, forms, storage and fetch calls) and shows it in a sandboxed frame. Links and searches stay inside Wavey, and the page can’t touch this site’s data.</p>
      <h4>Honest limits</h4>
      <ul>
        <li>Heavy web apps (YouTube, Google, Discord, streaming) usually won’t work through a static relay.</li>
        <li>Public relays can be slow, rate-limited or go offline — use <b>Test all</b> in Settings.</li>
        <li>Only GET requests are relayed; sign-in forms are blocked on purpose.</li>
        <li><b>Hosted</b> mode shows a proxy site inside Wavey. It is used automatically when every relay fails, and whoever runs it can see what is loaded through it.</li>
      </ul>
      <p class="warn">Never type passwords or payment details into a page loaded through a public relay — the relay can read it.</p>
      <h4>Most reliable: your own free relay</h4>
      <p>Create a Cloudflare Worker, paste this in, deploy, then add <code>https://your-worker.workers.dev/?url=</code> under Settings → Your own relay URLs.</p>
      <pre id="workerCode">${esc(WORKER_SNIPPET)}</pre>
      <div class="btnrow"><button class="btn sm" data-act="copy-worker">${icon('copy')}Copy Worker code</button></div>
      <h4>Shortcuts</h4>
      <div class="kbds"><kbd>/</kbd><span>Focus address bar</span><kbd>Alt T</kbd><span>New tab</span><kbd>Alt W</kbd><span>Close tab</span><kbd>Alt R</kbd><span>Reload</span><kbd>Alt ← →</kbd><span>Back / forward</span><kbd>Alt 1–9</kbd><span>Jump to tab</span><kbd>Esc</kbd><span>Close menus</span></div>
    </div>`;
  }

  function renderPanel(keepScroll) {
    const st = keepScroll ? panelBody.scrollTop : 0;
    const title = { bookmarks: 'Bookmarks', history: 'History', settings: 'Settings', about: 'About & help' }[panelName] || '';
    $('#panelTitle').textContent = title;
    if (panelName === 'bookmarks') {
      const t = tab();
      const add = t && t.url && !isBookmarked(t.url) ? `<div class="btnrow"><button class="btn sm primary" data-act="add-bm">${icon('star')}Bookmark this page</button></div>` : '';
      panelBody.innerHTML = add + (data.bookmarks.length ? `<div class="list" style="margin-top:10px">${data.bookmarks.map((b) => itemHtml(b, 'rm-bm')).join('')}</div>` : '<div class="panel-empty">No bookmarks yet.<br>Tap the ★ in the address bar to save a page.</div>');
    } else if (panelName === 'history') {
      panelBody.innerHTML = `<input class="search-in" id="histQ" type="text" placeholder="Search history" aria-label="Search history"><div id="histList">${historyListHtml('')}</div>`;
    } else if (panelName === 'settings') panelBody.innerHTML = settingsHtml();
    else if (panelName === 'about') panelBody.innerHTML = aboutHtml();
    panelBody.scrollTop = st;
  }

  // Fully parallel, time-boxed health check. Every relay is probed at once with a tiny page and the
  // row updates the moment that relay answers — the whole run is capped at a few seconds.
  let testing = false;
  async function testRelays() {
    if (testing) return;
    testing = true;
    const list = [...customRelays(), ...RELAYS];
    const btns = $$('[data-act="test-relays"]');
    btns.forEach((b) => { b.disabled = true; b.textContent = 'Testing…'; });
    $$('[data-rs]').forEach((el) => { el.className = 'rstat'; el.textContent = '…'; });
    const t00 = performance.now();
    let okN = 0, best = null;
    await Promise.all(list.map(async (r) => {
      const els = $$(`[data-rs="${r.id}"]`);
      const set = (cls, txt) => els.forEach((el) => { el.className = 'rstat ' + cls; el.textContent = txt; });
      const t0 = performance.now(), c = new AbortController();
      const to = setTimeout(() => c.abort(), r.rendered || r.archive ? 6000 : 3500);
      try {
        const resp = await fetch(relayUrl(r, 'https://example.com/'), { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: r.headers || {} });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        let txt = await resp.text();
        if (r.field) { try { txt = JSON.parse(txt)[r.field] || ''; } catch { txt = ''; } }
        if (badReason(txt) || !/example/i.test(txt)) throw new Error('bad');
        const ms = Math.round(performance.now() - t0);
        okN++; if (!best || ms < best.ms) best = { r, ms };
        hrec(r, true, ms);
        set('ok', '✓ ' + ms + ' ms');
      } catch (e) {
        hrec(r, false);
        set('bad', e.name === 'AbortError' ? '✕ timeout' : '✕ failed');
      } finally { clearTimeout(to); }
    }));
    testing = false;
    btns.forEach((b) => { b.disabled = false; b.textContent = 'Test all'; });
    const secs = ((performance.now() - t00) / 1000).toFixed(1);
    toast(`${okN} of ${list.length} relays working in ${secs}s${best ? ' · fastest: ' + best.r.name + ' (' + best.ms + ' ms)' : ''}`, okN ? 'info' : 'warn', 4800);
  }

  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); toast('Copied to clipboard'); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied to clipboard'); } catch { toast('Copy failed — select the text manually', 'warn'); }
      ta.remove();
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'wavey-chps', version: VERSION, ...data, session: [] }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wavey-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importData(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || typeof d !== 'object') throw new Error('bad file');
        ls.set(KEY, JSON.stringify({ settings: { ...S, ...(d.settings || {}) }, bookmarks: d.bookmarks || [], history: d.history || [], visits: d.visits || {}, hidden: d.hidden || [], apps: d.apps || [], pinned: d.pinned || [], session: [] }));
        location.reload();
      } catch { toast('That file isn’t a valid Wavey backup', 'warn'); }
    };
    rd.readAsText(file);
  }

  const TVARS = ['--bg0', '--bg1', '--accent', '--accent2', '--accent-rgb', '--orb1', '--orb2', '--orb3', '--muted', '--faint'];
  function applyAll() {
    const root = document.documentElement, th = currentTheme();
    root.dataset.theme = th.css ? S.theme : 'x';
    TVARS.forEach((v) => root.style.removeProperty(v));
    if (!th.css && th.vars) Object.entries(th.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--blur', S.glass + 'px');
    root.classList.toggle('no-motion', !S.motion);
    root.classList.toggle('bean-cursor', !!S.cursor);
    root.classList.toggle('glow-on', !!S.glow && !!S.motion);
    const m = $('meta[name="theme-color"]');
    if (m) m.content = th.bg;
    $('#homeEngine').textContent = SEARCH[S.search].name;
    applyCloak();
    setFx(S.fx);
  }

  const roots = [panelBody, $('#sframeBody')];
  roots.forEach((root) => root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act, val = b.dataset.val, url = b.dataset.url;
    switch (act) {
      case 'open': { closePanel(); navigate(tab(), { url }); break; }
      case 'rm-bm': data.bookmarks = data.bookmarks.filter((x) => x.url !== url); save(); syncStar(); renderPanel(true); break;
      case 'rm-hist': data.history = data.history.filter((x) => x.url !== url); save(); $('#histList').innerHTML = historyListHtml($('#histQ').value); break;
      case 'add-bm': toggleBookmark(); renderPanel(true); break;
      case 'theme': S.theme = val; if (THEMES[val] && THEMES[val].fx && !THEMES[val].custom) S.fx = THEMES[val].fx; applyAll(); save(); renderSettings(true); break;
      case 'sign-in': toggleSettings(false); openAuth(val); break;
      case 'sign-out': signOut(); break;
      case 'engine': S.engine = val; save(); syncNav(); renderSettings(true); break;
      case 'test-relays': testRelays(); break;
      case 'clear-history': data.history = []; save(); toast('History cleared'); break;
      case 'reset-tiles': data.visits = {}; data.hidden = []; save(); renderTiles(); toast('Most visited reset'); break;
      case 'reset-all':
        if (confirm('Erase all Wavey data on this device (settings, bookmarks, history, account and sign-in choices)?')) {
          (async () => {
            try { if (A.mode === 'firebase' && A.user) await signOut(true); } catch { /* noop */ }
            try { Object.keys(localStorage).filter((k) => k.startsWith('wavey.')).forEach((k) => localStorage.removeItem(k)); } catch { /* noop */ }
            Object.keys(mem).forEach((k) => delete mem[k]);
            window.onbeforeunload = null; window.__wipe = true;
            location.reload();
          })();
        }
        break;
      case 'export': exportData(); break;
      case 'import': $('#importFile').click(); break;
      case 'copy-worker': copyText(WORKER_SNIPPET); break;
    }
  }));

  roots.forEach((root) => root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.relay) {
      const id = el.dataset.relay;
      S.disabledRelays = el.checked ? S.disabledRelays.filter((x) => x !== id) : [...S.disabledRelays, id];
      save(); return;
    }
    const k = el.dataset.key;
    if (!k) return;
    if (el.type === 'checkbox') S[k] = el.checked;
    else if (k === 'panicUrl') { const v = el.value.trim(); if (v && !isHttp(v)) { toast('Panic address must start with http(s)://', 'warn'); el.value = S.panicUrl; return; } S.panicUrl = v || DEFAULTS.panicUrl; }
    else if (k === 'hosted') { const v = el.value.trim(); if (v && !isHttp(v)) { toast('The hosted proxy address must start with http(s)://', 'warn'); el.value = S.hosted; return; } S.hosted = v; }
    else if (k === 'glass') S.glass = +el.value;
    else S[k] = el.value;
    save(); applyAll();
    if (k === 'search') renderTiles();
  }));
  roots.forEach((root) => root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'histQ') { $('#histList').innerHTML = historyListHtml(el.value); return; }
    if (el.type === 'color' && el.dataset.key) { S[el.dataset.key] = el.value; applyAll(); save(); return; }
    if (el.dataset.key === 'glass') { S.glass = +el.value; document.documentElement.style.setProperty('--blur', S.glass + 'px'); $('#glassVal').textContent = S.glass + 'px'; save(); }
  }));
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });

  /* ═══════════════════════════ Proxy repair helpers ═══════════════════════════ */
  // A stylesheet the frame could not load itself → fetch it through a relay and hand the CSS back.
  async function fetchCss(t, href) {
    if (!isHttp(href) || !t.frame.contentWindow) return;
    try {
      const res = await fetchViaRelays(href, relayList('relay').filter((r) => !r.rendered && !r.archive));
      if (res.binary || !t.frame.contentWindow) return;
      const abs = (u) => { u = u.trim(); if (/^(data:|#|blob:)/i.test(u)) return u; try { return new URL(u, href).href; } catch { return u; } };
      const css = res.text
        .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => `url("${abs(u)}")`)
        .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => `@import "${abs(u)}"`);
      t.frame.contentWindow.postMessage({ wavey: 1, type: 'css-data', href, css }, '*');
    } catch { /* style stays missing — nothing else to try */ }
  }

  // The loaded page is still empty: simplified copy → Reader (server-rendered) → hosted proxy.
  async function handleBlank(t) {
    const R = t.raw;
    if (!R || R.busy || !t.url) return;
    R.busy = true;
    const token = t.nav;
    const toHosted = () => {
      if (S.hosted && S.hostedAuto && R.stage < 3) { R.stage = 3; toast('Still blank — opening it with the hosted proxy', 'info', 3600); loadHosted(t, R.url, token); return true; }
      return false;
    };
    try {
      if (R.stage === 0 && R.staticLen >= 250) {
        R.stage = 1;
        toast('That page rendered blank — showing a simplified copy', 'info', 3200);
        setFrameDoc(t, prepareDocument(R.res.text, R.res.ct, R.url, R.res.relay, { static: true }).html);
        return;
      }
      const reader = RELAYS.find((r) => r.id === 'reader');
      if (R.stage < 2 && reader && !S.disabledRelays.includes('reader')) {
        R.stage = 2;
        toast('Blank page — asking the Reader relay to render it…', 'info', 3600);
        const res = await fetchViaRelays(R.url, [reader], t.abort && t.abort.signal);
        if (token !== t.nav) return;
        const doc = prepareDocument(res.text, res.ct, R.url, res.relay, { static: true });
        if (doc.redirect) return;
        R.res = res; R.staticLen = doc.staticLen;
        t.relay = res.relay.name;
        setFrameDoc(t, doc.html);
        refresh();
        return;
      }
      if (!toHosted()) toast('This site needs a full browser engine to draw. Try the Hosted engine in Settings.', 'warn', 6000);
    } catch (e) {
      if (e.name === 'AbortError' || token !== t.nav) return;
      if (!toHosted()) toast('This page is blank and could not be repaired.', 'warn', 5000);
    } finally { R.busy = false; }
  }

  /* ═══════════════════════════ Frame messages ═══════════════════════════ */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.wavey !== 1) return;
    const t = tabs.find((x) => x.frame && x.frame.contentWindow === ev.source);
    if (!t) return;
    switch (d.type) {
      case 'nav':
        if (typeof d.url !== 'string') return;
        if (d.newTab) openTab({ url: d.url }); else navigate(t, { url: d.url });
        break;
      case 'meta':
        if (typeof d.title === 'string' && d.title.trim() && t.url) { t.title = d.title.trim().slice(0, 200); updateHistoryTitle(t.url, t.title); refresh(); }
        break;
      case 'key': handleKey(d, true); break;
      case 'ready': if (t.pending) { t.pending = 0; finishLoad(t); } break;
      case 'css': if (typeof d.href === 'string') fetchCss(t, d.href); break;
      case 'blank': handleBlank(t); break;
      case 'blocked': toast('Sign-in forms are blocked in Relay mode — a public relay could read your password.', 'warn', 5200); break;
    }
  });

  /* ═══════════════════════════ Keyboard ═══════════════════════════ */
  function panic() {
    let u = S.panicUrl;
    if (!isHttp(u)) u = DEFAULTS.panicUrl;
    location.replace(u);
  }

  function handleKey(k) {
    const mod = k.ctrl || k.meta;
    if (k.key === 'Escape') {
      if (authOpen()) return true; else if (dlgOpen()) closeDlg(); else if (menuOpen()) closeMenu(); else if (creditsOpen()) toggleCredits(false); else if (settingsOpen()) toggleSettings(false); else if (panelName) closePanel(); else if (suggestOpen()) closeSuggest();
      return true;
    }
    if (k.alt && !mod) {
      switch (k.code) {
        case 'KeyT': openTab(); return true;
        case 'KeyW': closeTab(activeId); return true;
        case 'KeyR': reload(); return true;
        case 'KeyH': goHome(tab()); return true;
        case 'KeyL': focusOmni(); return true;
        case 'ArrowLeft': step(-1); return true;
        case 'ArrowRight': step(1); return true;
        default:
          if (/^Digit[1-9]$/.test(k.code || '')) {
            const n = +k.code.slice(5) - 1;
            const target = k.code === 'Digit9' ? tabs[tabs.length - 1] : tabs[n];
            if (target) activateTab(target.id);
            return true;
          }
      }
    }
    if (mod && !k.alt && k.code === 'KeyK') { focusOmni(); return true; }
    if (!k.alt && !mod && S.panicKey && k.key === S.panicKey) { panic(); return true; }
    if (!k.alt && !mod && k.key === '/') { focusOmni(); return true; }
    return false;
  }

  window.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (inField && !(e.altKey || e.ctrlKey || e.metaKey) && e.key !== 'Escape') return;
    if (handleKey({ key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey })) e.preventDefault();
  });

  /* ═══════════════════════════ UI wiring ═══════════════════════════ */
  $('#newTabBtn').addEventListener('click', () => openTab());
  $('#backBtn').addEventListener('click', () => step(-1));
  $('#forwardBtn').addEventListener('click', () => step(1));
  $('#reloadBtn').addEventListener('click', reload);
  $('#homeBtn').addEventListener('click', () => { setPage('browser'); goHome(tab()); });
  $('#brand').addEventListener('click', () => { setPage('browser'); goHome(tab()); });
  $('#starBtn').addEventListener('click', toggleBookmark);
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menuOpen() ? closeMenu() : openMenu(); });
  $('#panelClose').addEventListener('click', closePanel);
  scrim.addEventListener('click', closePanel);
  document.addEventListener('click', (e) => { if (menuOpen() && !e.target.closest('#menu')) closeMenu(); });
  window.addEventListener('blur', () => { if (menuOpen()) closeMenu(); });

  $('#fsBtn').addEventListener('click', toggleFullscreen);
  function toggleFullscreen() {
    closeMenu();
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { toast('Fullscreen isn’t available here', 'warn'); }
  }

  $('#enginePill').addEventListener('click', () => {
    S.engine = S.engine === 'direct' ? 'relay' : 'direct';
    save();
    toast(S.engine === 'direct' ? 'Direct frame — only embeddable sites will load' : 'Relay engine on');
    syncNav();
    if (settingsOpen()) renderSettings(true);
    reload();
  });

  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    closeMenu();
    switch (b.dataset.act) {
      case 'new-tab': openTab(); break;
      case 'bookmarks': case 'history': case 'about': openPanel(b.dataset.act); break;
      case 'external': { const t = tab(); if (t && t.url) window.open(t.url, '_blank', 'noopener'); else toast('Open a page first', 'warn'); break; }
      case 'fullscreen': toggleFullscreen(); break;
    }
  });

  tabsEl.addEventListener('click', (e) => {
    const el = e.target.closest('.tab');
    if (!el) return;
    if (e.target.closest('[data-close]')) closeTab(el.dataset.id); else activateTab(el.dataset.id);
  });
  tabsEl.addEventListener('auxclick', (e) => { const el = e.target.closest('.tab'); if (el && e.button === 1) { e.preventDefault(); closeTab(el.dataset.id); } });
  tabsEl.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

  let dragId = null;
  tabsEl.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.tab');
    if (!el) return;
    dragId = el.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* noop */ }
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  tabsEl.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const over = e.target.closest('.tab');
    $$('.tab.over', tabsEl).forEach((x) => x.classList.remove('over'));
    if (over && over.dataset.id !== dragId) over.classList.add('over');
  });
  tabsEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const over = e.target.closest('.tab');
    if (over && dragId) {
      const from = tabs.findIndex((t) => t.id === dragId), to = tabs.findIndex((t) => t.id === over.dataset.id);
      if (from > -1 && to > -1 && from !== to) { const [m] = tabs.splice(from, 1); tabs.splice(to, 0, m); persistSession(); }
    }
    dragId = null; renderTabs();
  });
  tabsEl.addEventListener('dragend', () => { dragId = null; renderTabs(); });

  // Home
  $('#homeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#homeInput').value;
    if (!v.trim()) return;
    $('#homeInput').value = '';
    navigate(tab(), v);
  });
  $('#homeEngine').addEventListener('click', () => {
    const keys = Object.keys(SEARCH);
    S.search = keys[(keys.indexOf(S.search) + 1) % keys.length];
    save(); applyAll();
    toast('Searching with ' + SEARCH[S.search].name);
  });
  $('#editTiles').addEventListener('click', () => {
    const on = $('#tiles').classList.toggle('edit');
    $('#editTiles').textContent = on ? 'Done' : 'Edit';
  });
  $('#tiles').addEventListener('click', (e) => {
    const a = e.target.closest('.tile');
    if (!a) return;
    e.preventDefault();
    if (e.target.closest('[data-rm]')) {
      if (a.dataset.pin) { data.pinned = data.pinned.filter((x) => x.url !== a.dataset.url); save(); renderTiles(); return; }
      const o = a.dataset.origin;
      if (!data.hidden.includes(o)) data.hidden.push(o);
      delete data.visits[o];
      save(); renderTiles();
      return;
    }
    if ($('#tiles').classList.contains('edit')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) openTab({ url: a.dataset.url }, { activate: false }); else navigate(tab(), { url: a.dataset.url });
  });

  // Error view
  $('#errRetry').addEventListener('click', reload);
  $('#errDirect').addEventListener('click', () => { const t = tab(); if (t && t.error) navigate(t, { url: t.error.url }, { push: false, forceMode: 'direct' }); });
  $('#errExternal').addEventListener('click', () => { const t = tab(); if (t && t.error) window.open(t.error.url, '_blank', 'noopener'); });
  $('#errSettings').addEventListener('click', () => toggleSettings(true));

  /* ═══════════════════════════ Hosted proxy (fallback engine) ═══════════════════════════ */
  function b64url(s) {
    let bin = '';
    new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Ultraviolet's default "xor" codec, for proxies whose URLs look like /service/<encoded>
  function uvEncode(s) {
    return encodeURIComponent(String(s).split('').map((c, i) => (i % 2 ? String.fromCharCode(c.charCodeAt(0) ^ 2) : c)).join(''));
  }
  const hostedHasSlot = (t) => /\{(enc|raw|b64|uv)\}/.test(t);
  function hostedUrl(url) {
    const t = String(S.hosted || '').trim();
    if (!isHttp(t)) return '';
    if (!hostedHasSlot(t)) return t;
    return t.replace('{enc}', () => encodeURIComponent(url)).replace('{raw}', () => url)
      .replace('{b64}', () => b64url(url)).replace('{uv}', () => uvEncode(url));
  }
  function loadHosted(t, url, token) {
    const h = hostedUrl(url);
    if (!h) throw new Error('No hosted proxy is set. Add one in Settings → Browsing.');
    if (token !== t.nav) return;
    t.relay = 'Hosted';
    t.title = hostOf(url);
    t.hostedFront = !hostedHasSlot(S.hosted);
    setFrameSrc(t, h, true);
    if (t.hostedFront) {
      try { navigator.clipboard.writeText(url).catch(() => {}); } catch { /* noop */ }
    }
    refresh();
  }
  $('#hostCopy').addEventListener('click', () => { const t = tab(); if (t && t.url) copyText(t.url); });
  $('#hostClose').addEventListener('click', () => { const t = tab(); if (t) { t.hostedFront = false; updateView(); } });

  /* ═══════════════════════════ Settings frame (gear) ═══════════════════════════ */
  const sframe = $('#sframe'), sframeBody = $('#sframeBody'), gearBtn = $('#gearBtn');
  const settingsOpen = () => sframe.classList.contains('open');
  function renderSettings(keep) {
    const st = keep ? sframeBody.scrollTop : 0;
    sframeBody.innerHTML = settingsHtml();
    sframeBody.scrollTop = st;
  }
  function toggleSettings(force) {
    const on = typeof force === 'boolean' ? force : !settingsOpen();
    if (on) { closeMenu(); toggleCredits(false); renderSettings(); }
    sframe.classList.toggle('open', on);
    sframe.setAttribute('aria-hidden', String(!on));
    gearBtn.classList.toggle('on', on);
    gearBtn.setAttribute('aria-expanded', String(on));
  }
  gearBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); });

  /* ═══════════════════════════ Sections (Browser / Games / Tools / Apps / Partners) ═══════════════════════════ */
  const PAGES = ['browser', 'games', 'tools', 'apps', 'partners'];
  let page = 'browser';
  const viewportEl = $('#viewport');

  function setPage(p) {
    if (!PAGES.includes(p)) p = 'browser';
    page = p;
    viewportEl.dataset.page = p;
    $$('#pagenav .pn').forEach((b) => b.setAttribute('aria-current', b.dataset.page === p ? 'page' : 'false'));
    if (p !== 'tools') closeTool();
    if (p === 'games') showGames();
    else if (p === 'tools') renderTools();
    else if (p === 'apps') renderApps();
    else updateView();
    const sc = $('#page-' + p);
    if (sc && p !== 'games') sc.scrollTop = 0;
  }
  $('#pagenav').addEventListener('click', (e) => { const b = e.target.closest('.pn'); if (b) setPage(b.dataset.page); });

  /* ───────── Games: your games site, framed ─────────
     • sandbox WITHOUT allow-top-navigation, so a page can never frame-bust (top.location = …)
     • no-referrer, and no CSP on this page, so nothing here blocks the frame
     • "Compatibility mode" fetches the page (GitHub Pages is CORS-open) and renders it from srcdoc,
       which sidesteps X-Frame-Options / frame-ancestors if the host ever adds them.            */
  const GAMES_URL = 'https://levelzproxy.github.io/test/';
  const GAMES_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation';
  let gamesInit = false, gamesTimer = 0;

  function mountGames(compat) {
    const wrap = $('#gWrap');
    const old = $('#gFrame');
    if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'gFrame'; f.className = 'gframe'; f.title = 'Games';
    f.setAttribute('sandbox', compat ? GAMES_SANDBOX.replace(' allow-same-origin', '') : GAMES_SANDBOX);
    f.setAttribute('allow', 'fullscreen; autoplay; gamepad; clipboard-write; encrypted-media');
    f.setAttribute('referrerpolicy', 'no-referrer');
    const msg = $('#gLoadMsg'), ov = $('#gLoad');
    ov.hidden = false;
    msg.textContent = compat ? 'Loading in compatibility mode…' : 'Loading games…';
    f.addEventListener('load', () => { clearTimeout(gamesTimer); ov.hidden = true; });
    wrap.appendChild(f);
    clearTimeout(gamesTimer);
    gamesTimer = setTimeout(() => { if (!ov.hidden) msg.textContent = 'Still loading… try Compatibility mode, or open it in a new tab.'; }, 9000);
    if (compat) {
      fetch(GAMES_URL, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then((html) => {
          const base = '<base href="' + GAMES_URL + '">';
          f.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
        })
        .catch((e) => { msg.textContent = 'Compatibility mode couldn’t fetch the page (' + (e.message || 'network error') + ').'; });
    } else f.src = GAMES_URL;
  }
  function showGames() { if (!gamesInit) { gamesInit = true; mountGames(false); } }
  $('#gReload').addEventListener('click', () => mountGames(false));
  $('#gCompat').addEventListener('click', () => mountGames(true));
  $('#gNew').addEventListener('click', () => window.open(GAMES_URL, '_blank', 'noopener'));
  $('#gFull').addEventListener('click', () => {
    try { const w = $('#gWrap'); if (document.fullscreenElement) document.exitFullscreen(); else w.requestFullscreen(); } catch { toast('Fullscreen isn’t available here', 'warn'); }
  });

  /* ═══════════════════════════ Tools ═══════════════════════════ */
  let toolCleanup = null;
  const kb = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
  const rnd = (n) => { const lim = Math.floor(0x100000000 / n) * n; const a = new Uint32Array(1); do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; };

  function toolImage(box) {
    box.innerHTML = `
      <label class="drop" id="tDrop"><strong>Drop images here</strong><span>or click to choose · PNG, JPG, WebP, GIF, BMP</span><input id="tFile" type="file" accept="image/*" multiple hidden></label>
      <div class="trow">
        <label>Convert to<select id="tFmt"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label>Quality <b id="tQv" style="color:var(--text)">85%</b><input id="tQ" type="range" min="10" max="100" value="85"></label>
        <label>Max width (px)<input id="tW" type="number" min="1" placeholder="original size"></label>
      </div>
      <p class="tmsg">Quality applies to JPG and WebP. Everything happens on your device.</p>
      <div class="tlist" id="tOut"></div>`;
    const drop = $('#tDrop', box), file = $('#tFile', box), fmt = $('#tFmt', box), Q = $('#tQ', box), W = $('#tW', box), out = $('#tOut', box);
    let files = [], urls = [], seq = 0;
    const loadBitmap = async (f) => {
      try { return await createImageBitmap(f); } catch {
        return new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(f); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('unsupported image')); }; i.src = u; });
      }
    };
    async function run() {
      const my = ++seq;
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
      out.innerHTML = '';
      $('#tQv', box).textContent = Q.value + '%';
      Q.disabled = fmt.value === 'image/png';
      for (const f of files) {
        const row = document.createElement('div'); row.className = 'trow2'; out.appendChild(row);
        try {
          const bmp = await loadBitmap(f);
          if (my !== seq) return;
          let w = bmp.width, h = bmp.height; const mw = +W.value;
          if (mw > 0 && w > mw) { h = Math.max(1, Math.round(h * mw / w)); w = mw; }
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d');
          if (fmt.value === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
          x.drawImage(bmp, 0, 0, w, h);
          const blob = await new Promise((res) => c.toBlob(res, fmt.value, +Q.value / 100));
          if (my !== seq) return;
          if (!blob || blob.type !== fmt.value) throw new Error('this browser can’t encode ' + fmt.options[fmt.selectedIndex].text);
          const u = URL.createObjectURL(blob); urls.push(u);
          const ext = fmt.value === 'image/jpeg' ? 'jpg' : fmt.value === 'image/png' ? 'png' : 'webp';
          const name = f.name.replace(/\.[^.]+$/, '') + '.' + ext;
          row.innerHTML = `<img src="${u}" alt=""><div class="tx"><b>${esc(name)}</b><small>${kb(f.size)} → ${kb(blob.size)} · ${w}×${h}</small></div><a class="btn sm primary" href="${u}" download="${esc(name)}">${icon('download')}Save</a>`;
        } catch (e) {
          row.innerHTML = `<div class="tx"><b>${esc(f.name)}</b><small>Couldn’t convert: ${esc(e.message || 'unsupported file')}</small></div>`;
        }
      }
    }
    const take = (list) => { files = Array.from(list).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name)); run(); };
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => take(e.dataTransfer.files));
    file.addEventListener('change', () => take(file.files));
    [fmt, Q, W].forEach((el) => el.addEventListener('input', () => { if (files.length) run(); else { $('#tQv', box).textContent = Q.value + '%'; Q.disabled = fmt.value === 'image/png'; } }));
    return () => { seq++; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }

  function toolPass(box) {
    box.innerHTML = `
      <div class="tout" id="pOut"></div>
      <div class="meter"><i id="pM"></i></div><div class="tmsg" id="pS"></div>
      <label>Length <b id="pLv" style="color:var(--text)">20</b><input id="pL" type="range" min="8" max="64" value="20"></label>
      <div class="checks">
        <label><input type="checkbox" id="pLo" checked>a–z</label><label><input type="checkbox" id="pUp" checked>A–Z</label>
        <label><input type="checkbox" id="pDi" checked>0–9</label><label><input type="checkbox" id="pSy" checked>Symbols</label>
        <label><input type="checkbox" id="pAm">Avoid look-alikes (I l 1 O 0)</label>
      </div>
      <div class="btnrow" style="margin-top:0"><button class="btn primary" id="pGen">Generate</button><button class="btn" id="pCopy">${icon('copy')}Copy</button></div>`;
    const out = $('#pOut', box);
    function gen() {
      const am = $('#pAm', box).checked;
      const sets = [['pLo', 'abcdefghijklmnopqrstuvwxyz'], ['pUp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['pDi', '0123456789'], ['pSy', '!@#$%^&*()-_=+[]{};:,.?/']]
        .filter(([id]) => $('#' + id, box).checked).map(([, s]) => (am ? s.replace(/[Il1O0o]/g, '') : s));
      const len = +$('#pL', box).value;
      $('#pLv', box).textContent = len;
      if (!sets.length) { out.textContent = 'Pick at least one character type'; $('#pM', box).style.width = '0'; $('#pS', box).textContent = ''; return; }
      const pool = sets.join('');
      const chars = sets.map((s) => s[rnd(s.length)]);
      while (chars.length < len) chars.push(pool[rnd(pool.length)]);
      for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
      out.textContent = chars.slice(0, len).join('');
      const bits = Math.round(len * Math.log2(pool.length));
      $('#pM', box).style.width = Math.min(100, bits / 1.4) + '%';
      $('#pS', box).textContent = `${bits} bits · ${bits < 40 ? 'weak' : bits < 64 ? 'fair' : bits < 90 ? 'good' : 'excellent'}`;
    }
    $$('input', box).forEach((i) => i.addEventListener('input', gen));
    $('#pGen', box).addEventListener('click', gen);
    $('#pCopy', box).addEventListener('click', () => copyText(out.textContent));
    gen();
  }

  function toolCount(box) {
    box.innerHTML = '<textarea id="cT" rows="9" placeholder="Type or paste text…"></textarea><div class="stats" id="cS"></div>';
    const t = $('#cT', box), s = $('#cS', box);
    const upd = () => {
      const v = t.value, words = (v.trim().match(/\S+/g) || []).length;
      const sent = (v.match(/[^.!?]+[.!?]+(\s|$)/g) || []).length || (v.trim() ? 1 : 0);
      const paras = v.split(/\n\s*\n/).filter((x) => x.trim()).length;
      const secs = Math.round(words / 200 * 60);
      s.innerHTML = [['Words', words], ['Characters', v.length], ['No spaces', v.replace(/\s/g, '').length], ['Sentences', sent], ['Paragraphs', paras], ['Reading time', secs < 60 ? secs + ' sec' : Math.round(secs / 60) + ' min']]
        .map(([k, n]) => `<div><b>${n}</b><span>${k}</span></div>`).join('');
    };
    t.addEventListener('input', upd); upd();
  }

  function toolJson(box) {
    box.innerHTML = `<textarea id="jI" rows="9" spellcheck="false" placeholder='{"paste":"JSON here"}'></textarea>
      <div class="btnrow" style="margin-top:0"><button class="btn primary" id="jF">Format</button><button class="btn" id="jM">Minify</button><button class="btn" id="jC">${icon('copy')}Copy result</button></div>
      <div class="tmsg" id="jS"></div><textarea id="jO" rows="9" readonly spellcheck="false"></textarea>`;
    const i = $('#jI', box), o = $('#jO', box), s = $('#jS', box);
    const go = (min) => {
      try { const v = JSON.parse(i.value); o.value = JSON.stringify(v, null, min ? 0 : 2); s.textContent = '✓ Valid JSON'; s.className = 'tmsg ok'; }
      catch (e) { o.value = ''; s.textContent = e.message; s.className = 'tmsg bad'; }
    };
    $('#jF', box).addEventListener('click', () => go(false));
    $('#jM', box).addEventListener('click', () => go(true));
    $('#jC', box).addEventListener('click', () => copyText(o.value));
  }

  function toolEncode(box) {
    box.innerHTML = `<label>Type<select id="eM"><option value="b64">Base64</option><option value="url">URL (percent-encoding)</option><option value="html">HTML entities</option></select></label>
      <textarea id="eI" rows="6" placeholder="Input"></textarea>
      <div class="btnrow" style="margin-top:0"><button class="btn primary" id="eE">Encode</button><button class="btn" id="eD">Decode</button><button class="btn" id="eC">${icon('copy')}Copy output</button></div>
      <div class="tmsg" id="eS"></div><textarea id="eO" rows="6" readonly placeholder="Output"></textarea>`;
    const m = $('#eM', box), i = $('#eI', box), o = $('#eO', box), s = $('#eS', box);
    const enc = {
      b64: (v) => { let b = ''; new TextEncoder().encode(v).forEach((x) => { b += String.fromCharCode(x); }); return btoa(b); },
      url: encodeURIComponent,
      html: (v) => esc(v)
    };
    const dec = {
      b64: (v) => new TextDecoder().decode(Uint8Array.from(atob(v.trim()), (c) => c.charCodeAt(0))),
      url: decodeURIComponent,
      html: (v) => { const t = document.createElement('textarea'); t.innerHTML = v; return t.value; }
    };
    const go = (d) => { try { o.value = (d ? dec : enc)[m.value](i.value); s.textContent = ''; } catch (e) { o.value = ''; s.textContent = 'Can’t ' + (d ? 'decode' : 'encode') + ' that input.'; s.className = 'tmsg bad'; } };
    $('#eE', box).addEventListener('click', () => go(false));
    $('#eD', box).addEventListener('click', () => go(true));
    $('#eC', box).addEventListener('click', () => copyText(o.value));
  }

  function toolColor(box) {
    box.innerHTML = `<div class="trow"><label>Pick a colour<input type="color" id="kP" value="#a78bfa"></label><label>HEX<input type="text" id="kH" value="#a78bfa" spellcheck="false"></label></div>
      <div class="swatch-big" id="kS"></div><div class="stats" id="kO"></div><p class="tmsg">Click a value to copy it.</p>`;
    const P = $('#kP', box), H = $('#kH', box), S2 = $('#kS', box), O = $('#kO', box);
    const toRgb = (h) => { h = h.replace('#', '').trim(); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); if (!/^[0-9a-f]{6}$/i.test(h)) return null; const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const toHsl = ([r, g, b]) => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
      let h = 0, s = 0;
      if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
      return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
    };
    const show = (hex) => {
      const rgb = toRgb(hex); if (!rgb) return;
      const hx = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
      const hsl = toHsl(rgb);
      S2.style.background = hx; P.value = hx;
      O.innerHTML = [['HEX', hx.toUpperCase()], ['RGB', `rgb(${rgb.join(', ')})`], ['HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`]]
        .map(([k, v]) => `<button type="button" data-copy="${esc(v)}"><b>${esc(v)}</b><span>${k}</span></button>`).join('');
    };
    P.addEventListener('input', () => { H.value = P.value; show(P.value); });
    H.addEventListener('input', () => show(H.value));
    O.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
    show(P.value);
  }

  function toolCase(box) {
    box.innerHTML = `<textarea id="sI" rows="7" placeholder="Type or paste text…"></textarea>
      <div class="btnrow" style="margin-top:0" id="sB"></div><div class="btnrow" style="margin-top:0"><button class="btn" id="sC">${icon('copy')}Copy</button></div>`;
    const t = $('#sI', box);
    const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
    const ops = {
      'UPPERCASE': (s) => s.toUpperCase(), 'lowercase': (s) => s.toLowerCase(),
      'Title Case': (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()),
      'Sentence case': (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()),
      'camelCase': (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''),
      'snake_case': (s) => words(s).join('_'), 'kebab-case': (s) => words(s).join('-')
    };
    $('#sB', box).innerHTML = Object.keys(ops).map((k) => `<button class="btn sm" data-op="${esc(k)}">${esc(k)}</button>`).join('');
    $('#sB', box).addEventListener('click', (e) => { const b = e.target.closest('[data-op]'); if (b) t.value = ops[b.dataset.op](t.value); });
    $('#sC', box).addEventListener('click', () => copyText(t.value));
  }

  function toolHash(box) {
    box.innerHTML = '<textarea id="hI" rows="5" placeholder="Text to hash…"></textarea><div class="tlist" id="hO"></div><p class="tmsg">Click a hash to copy it.</p>';
    const i = $('#hI', box), o = $('#hO', box);
    let seq = 0;
    if (!(window.crypto && crypto.subtle)) { o.innerHTML = '<p class="tmsg bad">Hashing needs a secure (https) page.</p>'; return; }
    const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    const upd = async () => {
      const my = ++seq, bytes = new TextEncoder().encode(i.value);
      const res = await Promise.all(algos.map(async (a) => [a, Array.from(new Uint8Array(await crypto.subtle.digest(a, bytes))).map((b) => b.toString(16).padStart(2, '0')).join('')]));
      if (my !== seq) return;
      o.innerHTML = res.map(([a, h]) => `<button class="trow2" type="button" data-copy="${h}" style="text-align:left"><div class="tx"><small>${a}</small><b style="white-space:normal;word-break:break-all;font:12px ui-monospace,monospace">${h}</b></div></button>`).join('');
    };
    i.addEventListener('input', upd);
    o.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
    upd();
  }

  function toolUnits(box) {
    const U = {
      Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
      Mass: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125 },
      Volume: { L: 1, mL: 0.001, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365, 'fl oz': 0.0295735295625 },
      Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444 },
      Data: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 },
      Temperature: { '°C': 1, '°F': 1, K: 1 }
    };
    box.innerHTML = `<label>Category<select id="uC">${Object.keys(U).map((k) => `<option>${k}</option>`).join('')}</select></label>
      <div class="trow"><label>Value<input type="number" id="uV" value="1" step="any"></label><label>From<select id="uF"></select></label><label>To<select id="uT"></select></label></div>
      <div class="tout" id="uO"></div>`;
    const C = $('#uC', box), V = $('#uV', box), F = $('#uF', box), T = $('#uT', box), O = $('#uO', box);
    const fill = () => { const ks = Object.keys(U[C.value]); F.innerHTML = ks.map((k) => `<option>${k}</option>`).join(''); T.innerHTML = F.innerHTML; T.selectedIndex = Math.min(1, ks.length - 1); calc(); };
    const toC = (v, u) => (u === '°C' ? v : u === '°F' ? (v - 32) * 5 / 9 : v - 273.15);
    const fromC = (v, u) => (u === '°C' ? v : u === '°F' ? v * 9 / 5 + 32 : v + 273.15);
    function calc() {
      const v = parseFloat(V.value);
      if (!isFinite(v)) { O.textContent = '—'; return; }
      const r = C.value === 'Temperature' ? fromC(toC(v, F.value), T.value) : v * U[C.value][F.value] / U[C.value][T.value];
      O.textContent = `${+r.toPrecision(10)} ${T.value}`;
    }
    C.addEventListener('input', fill); [V, F, T].forEach((e) => e.addEventListener('input', calc));
    fill();
  }

  function toolTimer(box) {
    box.innerHTML = `<div class="tsplit">
      <div class="tpanel"><h3>Stopwatch</h3><div class="bigclock" id="swT">00:00.00</div>
        <div class="btnrow" style="margin-top:0"><button class="btn primary" id="swS">Start</button><button class="btn" id="swL">Lap</button><button class="btn" id="swR">Reset</button></div><div class="laps" id="swLaps"></div></div>
      <div class="tpanel"><h3>Countdown</h3><div class="bigclock" id="cdT">05:00</div>
        <div class="trow"><label>Minutes<input type="number" id="cdM" min="0" value="5"></label><label>Seconds<input type="number" id="cdS" min="0" max="59" value="0"></label></div>
        <div class="btnrow" style="margin-top:0"><button class="btn primary" id="cdG">Start</button><button class="btn" id="cdR">Reset</button></div></div></div>`;
    const fmt = (ms, cs) => { const t = Math.max(0, Math.floor(ms / (cs ? 10 : 1000))); const s = cs ? Math.floor(t / 100) : t; const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + (cs ? '.' + String(t % 100).padStart(2, '0') : ''); };
    let swRun = false, swBase = 0, swAt = 0, laps = [], cdRun = false, cdEnd = 0, cdLeft = 0;
    const swNow = () => (swRun ? swBase + performance.now() - swAt : swBase);
    const iv = setInterval(() => {
      $('#swT', box).textContent = fmt(swNow(), true);
      if (cdRun) { cdLeft = cdEnd - performance.now(); if (cdLeft <= 0) { cdRun = false; cdLeft = 0; $('#cdG', box).textContent = 'Start'; beep(); toast('Time’s up!'); } $('#cdT', box).textContent = fmt(cdLeft + 999); }
    }, 40);
    const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); g.gain.value = 0.15; o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.6); } catch { /* noop */ } };
    $('#swS', box).addEventListener('click', () => { if (swRun) { swBase = swNow(); swRun = false; $('#swS', box).textContent = 'Start'; } else { swAt = performance.now(); swRun = true; $('#swS', box).textContent = 'Stop'; } });
    $('#swL', box).addEventListener('click', () => { if (!swRun) return; laps.unshift(fmt(swNow(), true)); $('#swLaps', box).innerHTML = laps.map((l, i) => `<div>Lap ${laps.length - i} — ${l}</div>`).join(''); });
    $('#swR', box).addEventListener('click', () => { swRun = false; swBase = 0; laps = []; $('#swS', box).textContent = 'Start'; $('#swLaps', box).innerHTML = ''; });
    const setCd = () => { cdLeft = ((+$('#cdM', box).value || 0) * 60 + (+$('#cdS', box).value || 0)) * 1000; $('#cdT', box).textContent = fmt(cdLeft); };
    $('#cdG', box).addEventListener('click', () => { if (cdRun) { cdRun = false; $('#cdG', box).textContent = 'Resume'; return; } if (cdLeft <= 0) setCd(); if (cdLeft <= 0) return; cdEnd = performance.now() + cdLeft; cdRun = true; $('#cdG', box).textContent = 'Pause'; });
    $('#cdR', box).addEventListener('click', () => { cdRun = false; $('#cdG', box).textContent = 'Start'; setCd(); });
    ['#cdM', '#cdS'].forEach((s) => $(s, box).addEventListener('input', () => { if (!cdRun) setCd(); }));
    setCd();
    return () => clearInterval(iv);
  }

  function toolPercent(box) {
    box.innerHTML = `<div class="tpanel"><h3>What is X% of Y?</h3><div class="trow"><label>X (%)<input type="number" id="p1a" step="any"></label><label>Y<input type="number" id="p1b" step="any"></label></div><div class="tout" id="p1o">—</div></div>
      <div class="tpanel"><h3>X is what % of Y?</h3><div class="trow"><label>X<input type="number" id="p2a" step="any"></label><label>Y<input type="number" id="p2b" step="any"></label></div><div class="tout" id="p2o">—</div></div>
      <div class="tpanel"><h3>Percent change from X to Y</h3><div class="trow"><label>From X<input type="number" id="p3a" step="any"></label><label>To Y<input type="number" id="p3b" step="any"></label></div><div class="tout" id="p3o">—</div></div>`;
    const n = (id) => parseFloat($('#' + id, box).value);
    const show = (id, v, suf = '') => { $('#' + id, box).textContent = isFinite(v) ? +v.toFixed(6) + suf : '—'; };
    const upd = () => { show('p1o', n('p1a') / 100 * n('p1b')); show('p2o', n('p2a') / n('p2b') * 100, '%'); show('p3o', (n('p3b') - n('p3a')) / Math.abs(n('p3a')) * 100, '%'); };
    $$('input', box).forEach((i) => i.addEventListener('input', upd));
  }

  function toolTime(box) {
    box.innerHTML = `<div class="tpanel"><h3>Unix timestamp → date</h3><div class="trow"><label>Timestamp (seconds or milliseconds)<input type="text" id="tsI" placeholder="1730000000"></label><button class="btn" id="tsN">Now</button></div><div class="stats" id="tsO"></div></div>
      <div class="tpanel"><h3>Date → Unix timestamp</h3><label>Local date &amp; time<input type="datetime-local" id="dtI"></label><div class="stats" id="dtO"></div></div>`;
    const cell = (k, v) => `<button type="button" data-copy="${esc(v)}"><b style="font-size:14px">${esc(v)}</b><span>${k}</span></button>`;
    const fromTs = () => {
      const raw = $('#tsI', box).value.trim(); const o = $('#tsO', box);
      if (!/^-?\d+(\.\d+)?$/.test(raw)) { o.innerHTML = ''; return; }
      let n = parseFloat(raw); if (Math.abs(n) < 1e11) n *= 1000;
      const d = new Date(n);
      o.innerHTML = isNaN(d) ? '' : cell('Local', d.toLocaleString()) + cell('UTC', d.toUTCString()) + cell('ISO 8601', d.toISOString());
    };
    const fromDt = () => { const v = $('#dtI', box).value, o = $('#dtO', box); const d = v ? new Date(v) : null; o.innerHTML = d && !isNaN(d) ? cell('Seconds', String(Math.floor(d / 1000))) + cell('Milliseconds', String(d.getTime())) : ''; };
    $('#tsI', box).addEventListener('input', fromTs); $('#dtI', box).addEventListener('input', fromDt);
    $('#tsN', box).addEventListener('click', () => { $('#tsI', box).value = Math.floor(Date.now() / 1000); fromTs(); });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
  }

  function toolNotes(box) {
    box.innerHTML = `<textarea id="nT" rows="14" placeholder="Jot something down — it saves automatically on this device."></textarea>
      <div class="btnrow" style="margin-top:0"><button class="btn" id="nD">${icon('download')}Download .txt</button><button class="btn danger" id="nX">${icon('trash')}Clear</button></div><div class="tmsg" id="nS"></div>`;
    const t = $('#nT', box), s = $('#nS', box);
    t.value = ls.get('wavey.notes') || '';
    const sv = debounce(() => { ls.set('wavey.notes', t.value); s.textContent = 'Saved'; }, 400);
    t.addEventListener('input', () => { s.textContent = 'Saving…'; sv(); });
    $('#nD', box).addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t.value], { type: 'text/plain' })); a.download = 'notes.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    $('#nX', box).addEventListener('click', () => { if (!t.value || confirm('Clear all notes?')) { t.value = ''; ls.set('wavey.notes', ''); s.textContent = 'Cleared'; } });
  }

  const TOOLS = [
    { id: 'img', em: '🖼️', name: 'Image converter', desc: 'PNG ⇄ JPG ⇄ WebP, plus resize and compress', fn: toolImage },
    { id: 'pass', em: '🔐', name: 'Password generator', desc: 'Strong random passwords with a strength meter', fn: toolPass },
    { id: 'count', em: '📝', name: 'Word counter', desc: 'Words, characters, sentences, reading time', fn: toolCount },
    { id: 'json', em: '🧩', name: 'JSON formatter', desc: 'Validate, pretty-print and minify JSON', fn: toolJson },
    { id: 'enc', em: '🔁', name: 'Encoder / decoder', desc: 'Base64, URL and HTML entities', fn: toolEncode },
    { id: 'color', em: '🎨', name: 'Colour converter', desc: 'Picker with HEX, RGB and HSL values', fn: toolColor },
    { id: 'case', em: '🔤', name: 'Text case converter', desc: 'UPPER, Title, camelCase, snake_case…', fn: toolCase },
    { id: 'hash', em: '#️⃣', name: 'Hash generator', desc: 'SHA-1, SHA-256, SHA-384 and SHA-512', fn: toolHash },
    { id: 'units', em: '📏', name: 'Unit converter', desc: 'Length, mass, volume, speed, data, temperature', fn: toolUnits },
    { id: 'timer', em: '⏱️', name: 'Stopwatch & timer', desc: 'Stopwatch with laps and a countdown', fn: toolTimer },
    { id: 'pct', em: '％', name: 'Percentage calculator', desc: 'Percent of, percent of total, percent change', fn: toolPercent },
    { id: 'time', em: '🕒', name: 'Timestamp converter', desc: 'Unix time ⇄ readable dates', fn: toolTime },
    { id: 'notes', em: '🗒️', name: 'Notepad', desc: 'Auto-saving notes that stay on this device', fn: toolNotes }
  ];

  function closeTool() { if (toolCleanup) { try { toolCleanup(); } catch { /* noop */ } toolCleanup = null; } }
  function renderTools() {
    closeTool();
    $('#page-tools').innerHTML = `<div class="wrap"><div class="ph"><h1>Tools</h1><p>Handy utilities that run entirely in your browser — nothing is uploaded.</p></div>
      <div class="cards">${TOOLS.map((t) => `<button class="tcard" type="button" data-tool="${t.id}"><span class="em">${t.em}</span><span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span></button>`).join('')}</div></div>`;
  }
  function openTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) return;
    closeTool();
    const root = $('#page-tools');
    root.innerHTML = `<div class="wrap"><div class="tool-head"><button class="btn sm" type="button" data-tool-back>${icon('back')}All tools</button><h2>${esc(t.em + ' ' + t.name)}</h2></div><div class="tbody" id="tBody"></div></div>`;
    root.scrollTop = 0;
    toolCleanup = t.fn($('#tBody', root)) || null;
  }
  $('#page-tools').addEventListener('click', (e) => {
    const c = e.target.closest('[data-tool]');
    if (c) return openTool(c.dataset.tool);
    if (e.target.closest('[data-tool-back]')) renderTools();
  });

 /* ═══════════════════════════ Apps ═══════════════════════════ */
  // Free, legitimate services only (free-with-ads streaming, official free anime channels, study and creative tools).
  const APPS = [
    ['Play', 'now.gg', 'https://now.gg/', 'Mobile games streamed from the cloud'],
    ['Play', 'Poki', 'https://poki.com/', 'Free browser games'],
    ['Play', 'CrazyGames', 'https://www.crazygames.com/', 'Free browser games'],
    ['Play', 'itch.io (browser games)', 'https://itch.io/games/html5', 'Indie games that run in the browser'],
    ['Play', 'Newgrounds', 'https://www.newgrounds.com/games', 'Classic and new community games'],
    ['Movies & TV', 'dulo', 'https://dulo.mov/', 'Free movies and shows'],
    ['Movies & TV', 'hivex', 'https://hivex.stream/', 'Free movies and shows'],
    ['Movies & TV', 'vuflix', 'https://vuflix.co/', 'Free movies and shows (Has ads so not recomended)'],
    ['Movies & TV', 'novera', 'https://novera.tv/', 'Free movies and shows'],
    ['Movies & TV', 'kofi', 'https://kofi.mov/', 'Free movies and shows'],
    ['Movies & TV', 'nxsha', 'https://web.nxsha.app/', 'Free movies and shows'],
    ['Anime', 'LuffyTV', 'https://luffytv.live/', 'Free anime'],
    ['Anime', 'Senshi', 'https://senshi.to/', 'Free anime'],
    ['Anime', 'Enma', 'https://www.enma.lol/', 'Free anime'],
    ['Anime', 'LunarX', 'https://lunarx.to/', 'Free anime'],
    ['Anime', 'Kazora', 'https://kazora.cc/', 'Free anime'],
    ['Music', 'audiomack', 'https://audiomack.com/', 'Free music streaming'],
    ['Music', 'tidal', 'https://tidal.odskyler.com/', 'Free music streaming'],
    ['Music', 'deezer', 'https://www.deezer.com/', 'Free music streaming'],
    ['Music', 'audio.com', 'https://audio.com/', 'Free music streaming (This is the best one)'],
    ['Study & create', 'Desmos', 'https://www.desmos.com/calculator', 'Graphing calculator'],
    ['Study & create', 'Khan Academy', 'https://www.khanacademy.org/', 'Free lessons and practice'],
    ['Study & create', 'Wikipedia', 'https://www.wikipedia.org/', 'The free encyclopedia'],
    ['Study & create', 'Quizlet', 'https://quizlet.com/', 'Flashcards and study sets'],
    ['Study & create', 'Wolfram Alpha', 'https://www.wolframalpha.com/', 'Computational answers'],
    ['Study & create', 'Project Gutenberg', 'https://www.gutenberg.org/', 'Free public-domain books'],
    ['Study & create', 'Photopea', 'https://www.photopea.com/', 'Photoshop-style image editor'],
    ['Study & create', 'Excalidraw', 'https://excalidraw.com/', 'Whiteboard and diagrams'],
    ['Study & create', 'Squoosh', 'https://squoosh.app/', 'Image compression'],
    ['Study & create', 'Canva', 'https://www.canva.com/', 'Design anything'],
    ['Search & AI', 'DuckDuckGo', 'https://duckduckgo.com/', 'Private web search'],
    ['Search & AI', 'Brave Search', 'https://search.brave.com/', 'Independent web search'],
    ['Search & AI', 'Claude', 'https://claude.ai/', 'AI assistant'],
    ['Search & AI', 'ChatGPT', 'https://chatgpt.com/', 'AI assistant'],
    ['Search & AI', 'Gemini', 'https://gemini.google.com/', 'AI assistant'],
    ['Social & news', 'YouTube', 'https://www.youtube.com/', 'Videos'],
    ['Social & news', 'Reddit', 'https://old.reddit.com/', 'Communities'],
    ['Social & news', 'Twitch', 'https://www.twitch.tv/', 'Live streams'],
    ['Social & news', 'Discord', 'https://discord.com/app', 'Chat with friends'],
    ['Social & news', 'Hacker News', 'https://news.ycombinator.com/', 'Tech news'],
    ['Social & news', 'BBC News', 'https://www.bbc.com/news', 'World news'],
    ['Code', 'GitHub', 'https://github.com/', 'Code hosting'],
    ['Code', 'CodePen', 'https://codepen.io/', 'Front-end playground'],
    ['Code', 'Stack Overflow', 'https://stackoverflow.com/', 'Programming Q&A'],
    ['Code', 'MDN Web Docs', 'https://developer.mozilla.org/', 'Web platform reference']
  ];
  
  function openApp(url, mode) {
    if (mode === 'ext') { window.open(url, '_blank', 'noopener'); return; }
    const t = tab();
    setPage('browser');
    if (mode === 'new' || (t && t.url)) openTab({ url }); else navigate(t, { url });
  }

  function appCard(a, custom) {
    const h = hostOf(a.url);
    return `<div class="acard"><button type="button" class="main" data-open="${esc(a.url)}"><span class="av" style="background:${avatarBg(h)}">${esc((a.name[0] || '?').toUpperCase())}</span>
      <span class="tx"><b>${esc(a.name)}</b><small>${esc(a.desc || h)}</small></span></button>
      <span class="side">${custom ? `<button type="button" class="icon-btn sm" data-rm-app="${esc(a.url)}" aria-label="Remove ${esc(a.name)}" title="Remove">${icon('trash')}</button>` : ''}<button type="button" class="icon-btn sm" data-ext="${esc(a.url)}" aria-label="Open ${esc(a.name)} in a real tab" title="Open in a real tab">${icon('external')}</button></span></div>`;
  }

  function fillApps() {
    const q = ($('#aQ') ? $('#aQ').value : '').trim().toLowerCase();
    const match = (a) => !q || a.name.toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q) || a.url.toLowerCase().includes(q);
    const groups = new Map();
    const mine = data.apps.filter(match);
    if (mine.length) groups.set('Your apps', mine.map((a) => appCard(a, true)));
    APPS.forEach(([cat, name, url, desc]) => { const a = { name, url, desc }; if (!match(a)) return; if (!groups.has(cat)) groups.set(cat, []); groups.get(cat).push(appCard(a, false)); });
    $('#aGrid').innerHTML = groups.size ? Array.from(groups, ([cat, items]) => `<h2 class="sec">${esc(cat)}</h2><div class="cards">${items.join('')}</div>`).join('') : '<p class="blank">No apps match that search.</p>';
  }

  function renderApps() {
    const root = $('#page-apps');
    if ($('#aGrid', root)) { fillApps(); return; }
    root.innerHTML = `<div class="wrap"><div class="ph"><h1>Apps</h1><p>Open sites inside Wavey. Click ↗ on a card to open it in a real tab instead.</p></div>
      <p class="note">Heavy web apps (YouTube, Discord, now.gg, streaming sites) often need the <b>Hosted</b> engine in Settings, or a real tab — a plain relay can’t run everything.</p>
      <div class="apps-top"><input class="search-in" id="aQ" type="text" placeholder="Search apps" aria-label="Search apps"></div>
      <form class="addapp" id="aForm" autocomplete="off"><input id="aName" type="text" placeholder="Name (optional)" aria-label="App name"><input id="aUrl" type="text" placeholder="Add your own app — paste a link" aria-label="App link"><button class="btn primary" type="submit">${icon('plus')}Add</button></form>
      <div id="aGrid"></div></div>`;
    $('#aQ', root).addEventListener('input', fillApps);
    $('#aForm', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const r = resolveInput($('#aUrl', root).value);
      if (!r || !r.url || r.query) { toast('Paste a valid link, like example.com', 'warn'); return; }
      const url = r.url;
      if (!data.apps.some((a) => a.url === url)) data.apps.unshift({ name: $('#aName', root).value.trim() || hostOf(url), url, desc: hostOf(url) });
      $('#aName', root).value = ''; $('#aUrl', root).value = '';
      save(); fillApps(); toast('App added');
    });
    root.addEventListener('click', (e) => {
      const o = e.target.closest('[data-open]');
      if (o) return openApp(o.dataset.open, e.ctrlKey || e.metaKey || e.shiftKey ? 'new' : '');
      const x = e.target.closest('[data-ext]');
      if (x) return openApp(x.dataset.ext, 'ext');
      const r = e.target.closest('[data-rm-app]');
      if (r) { data.apps = data.apps.filter((a) => a.url !== r.dataset.rmApp); save(); fillApps(); }
    });
    fillApps();
  }

  /* ═══════════════════════════ v1.02 — Footer: version & credits ═══════════════════════════ */
  $('#footNote').textContent = `Wavey chps v.${VERSION}`;
  const cframe = $('#cframe'), cBody = $('#cframeBody'), creditsBtn = $('#creditsBtn');
  const creditsOpen = () => cframe.classList.contains('open');
  function renderCredits() {
    const rows = CREDITS.map((c) => {
      const nm = c.url && isHttp(c.url) ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>` : esc(c.name);
      return `<div class="credit"><span class="av" style="background:${avatarBg(c.name)}">${esc((c.name[0] || '?').toUpperCase())}</span><div class="tx"><b>${nm}</b><small>${esc(c.role || '')}</small></div></div>`;
    }).join('');
    cBody.innerHTML = (CREDITS_INTRO ? `<p class="credit-intro">${esc(CREDITS_INTRO)}</p>` : '') + `<div class="credit-list">${rows || '<div class="panel-empty">No credits yet.</div>'}</div>`;
  }
  function toggleCredits(force) {
    const on = typeof force === 'boolean' ? force : !creditsOpen();
    if (on) { closeMenu(); toggleSettings(false); renderCredits(); }
    cframe.classList.toggle('open', on);
    cframe.setAttribute('aria-hidden', String(!on));
    creditsBtn.classList.toggle('on', on);
    creditsBtn.setAttribute('aria-expanded', String(on));
  }
  creditsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCredits(); });

  /* ═══════════════════════════ v1.02 — Dialog + "Add site" ═══════════════════════════ */
  const dlg = $('#dlg'), dlgCard = $('#dlgCard');
  const dlgOpen = () => dlg.classList.contains('open');
  function setBackgroundInert(on) { try { $('#app').inert = on; } catch { /* old browsers */ } }
  function openDlg(html) {
    dlgCard.innerHTML = html;
    dlg.classList.add('open');
    dlg.setAttribute('aria-hidden', 'false');
    setBackgroundInert(true);
  }
  function closeDlg() {
    dlg.classList.remove('open');
    dlg.setAttribute('aria-hidden', 'true');
    if (!authOpen()) setBackgroundInert(false);
  }
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeDlg(); });

  function normalizeSite(v) {
    v = String(v || '').trim();
    if (!v || /\s/.test(v)) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) return '';
      if (!(u.hostname.includes('.') || u.hostname === 'localhost')) return '';
      return u.href;
    } catch { return ''; }
  }

  function openAddSite() {
    openDlg(`<form id="asForm" novalidate>
      <h2 id="dlgTitle">Add a site</h2>
      <p class="sub">Pin a website to <b>Most visited</b>. Enter its address and, if you like, a name — then press Save.</p>
      <label class="fld"><span>Site name <i>(optional)</i></span><input id="asName" type="text" maxlength="40" placeholder="e.g. YouTube" autocomplete="off"></label>
      <label class="fld"><span>Website address</span><input id="asUrl" type="text" inputmode="url" placeholder="example.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="err" id="asErr" role="alert"></p>
      <div class="dlg-actions"><button type="button" class="btn" data-dlg="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
    </form>`);
    setTimeout(() => $('#asUrl').focus(), 60);
  }
  dlgCard.addEventListener('click', (e) => { if (e.target.closest('[data-dlg="cancel"]')) closeDlg(); });
  dlgCard.addEventListener('submit', (e) => {
    if (e.target.id !== 'asForm') return;
    e.preventDefault();
    const url = normalizeSite($('#asUrl').value);
    if (!url) { $('#asErr').textContent = 'Enter a valid website address, like example.com'; $('#asUrl').focus(); return; }
    if (data.pinned.some((p) => p.url === url)) { $('#asErr').textContent = 'That site is already pinned.'; return; }
    if (data.pinned.length >= 24) { $('#asErr').textContent = 'You can pin up to 24 sites.'; return; }
    const name = $('#asName').value.trim() || hostOf(url);
    data.pinned.push({ title: name.slice(0, 40), url });
    data.hidden = data.hidden.filter((o) => o !== originOf(url));
    save(); renderTiles(); closeDlg();
    toast(`Added ${name}`);
  });

  $('#tiles').addEventListener('click', (e) => {
    const add = e.target.closest('.tile.add');
    if (add) { e.preventDefault(); e.stopImmediatePropagation(); if (!$('#tiles').classList.contains('edit')) openAddSite(); }
  }, true);

  /* ═══════════════════════════ v1.02 — Users online ═══════════════════════════ */
  const onlineEl = $('#online'), onlineN = $('#onlineN'), onlineLbl = $('#onlineLbl');
  let pid = ls.get('wavey.pid');
  if (!pid) { pid = uid() + uid() + uid(); ls.set('wavey.pid', pid); }
  function setOnline(n, live) {
    n = Math.max(1, n | 0);
    onlineN.textContent = n;
    onlineLbl.textContent = n === 1 ? 'User Online' : 'Users Online';
    onlineEl.classList.toggle('live', !!live);
    onlineEl.title = live ? 'People on this site right now' : 'Live count unavailable — showing this device only';
  }
  const presenceMode = () => (PRESENCE.firebaseDbUrl ? 'firebase' : PRESENCE.ntfyTopic ? 'ntfy' : 'off');
  const fbBase = () => PRESENCE.firebaseDbUrl.replace(/\/+$/, '');
  const NTFY = () => 'https://ntfy.sh/' + encodeURIComponent(PRESENCE.ntfyTopic);
  let lastBeat = 0, presTimer = 0;

  async function presenceTick() {
    clearTimeout(presTimer);
    if (document.hidden) return;
    const mode = presenceMode();
    try {
      if (mode === 'firebase') {
        const r = await fetch(`${fbBase()}/presence/${pid}.json`, { method: 'PUT', body: JSON.stringify({ t: { '.sv': 'timestamp' } }) });
        if (!r.ok) throw new Error('beat');
        const now = ((await r.json()) || {}).t || Date.now();
        const c = await fetch(`${fbBase()}/presence.json?orderBy=%22t%22&startAt=${now - 55000}`);
        if (!c.ok) throw new Error('count');
        const j = await c.json();
        setOnline(j ? Object.keys(j).length : 1, true);
        if (Math.random() < 0.05) { // tidy up very old entries now and then
          const o = await (await fetch(`${fbBase()}/presence.json?orderBy=%22t%22&endAt=${now - 864e5}&limitToFirst=25`)).json();
          if (o && Object.keys(o).length) { const patch = {}; Object.keys(o).forEach((k) => { patch[k] = null; }); fetch(`${fbBase()}/presence.json`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {}); }
        }
        presTimer = setTimeout(presenceTick, 20000);
      } else if (mode === 'ntfy') {
        if (Date.now() - lastBeat > 280000) { lastBeat = Date.now(); await fetch(NTFY(), { method: 'POST', body: pid, cache: 'no-store' }); }
        const r = await fetch(`${NTFY()}/json?poll=1&since=8m`, { cache: 'no-store' });
        if (!r.ok) throw new Error('poll');
        const seen = new Map(), cutoff = Date.now() / 1000 - 420;
        (await r.text()).split('\n').forEach((ln) => {
          if (!ln) return;
          try { const ev = JSON.parse(ln); if (ev.event === 'message' && ev.time >= cutoff && typeof ev.message === 'string') seen.set(ev.message.replace(/^bye:/, ''), !/^bye:/.test(ev.message)); } catch { /* skip */ }
        });
        seen.set(pid, true);
        setOnline([...seen.values()].filter(Boolean).length, true);
        presTimer = setTimeout(presenceTick, 40000);
      } else { setOnline(1, false); }
    } catch {
      setOnline(1, false);
      presTimer = setTimeout(presenceTick, 60000);
    }
  }
  function startPresence() {
    setOnline(1, false);
    if (presenceMode() === 'off') return;
    presenceTick();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) presenceTick(); });
    window.addEventListener('pagehide', () => {
      try {
        if (presenceMode() === 'firebase') fetch(`${fbBase()}/presence/${pid}.json`, { method: 'DELETE', keepalive: true });
        else if (presenceMode() === 'ntfy') fetch(NTFY(), { method: 'POST', body: 'bye:' + pid, keepalive: true });
      } catch { /* noop */ }
    });
  }

  /* ═══════════════════════════ v1.02 — Interactive background (canvas) ═══════════════════════════ */
  const fxCv = $('#fx'), fxc = fxCv.getContext('2d');
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let fw = 0, fh = 0, fdpr = 1, mx = -9999, my = -9999, fxMode = 'off', fxRaf = 0, fxLast = 0, fxShown = false, fxCol = ['167,139,250', '236,72,153'];
  let fxP = [], fxRip = [], fxTrail = [], fxRipT = 0;
  const frnd = (a, b) => a + Math.random() * (b - a);
  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789';

  function fxColors() {
    const cs = getComputedStyle(document.documentElement);
    const a = (cs.getPropertyValue('--accent-rgb') || '167,139,250').trim().replace(/\s+/g, '');
    let b = (cs.getPropertyValue('--accent2') || '#ec4899').trim();
    try { b = hexRgb(b).join(','); } catch { b = '236,72,153'; }
    fxCol = [a, b];
  }
  function fxResize() {
    fdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    fw = window.innerWidth; fh = window.innerHeight;
    fxCv.width = Math.round(fw * fdpr); fxCv.height = Math.round(fh * fdpr);
    fxc.setTransform(fdpr, 0, 0, fdpr, 0, 0);
    fxSeed();
  }
  function fxSeed() {
    const area = fw * fh;
    fxP = []; fxRip = []; fxTrail = [];
    fxc.clearRect(0, 0, fw, fh);
    if (fxMode === 'stars') for (let i = 0, n = Math.min(240, area / 8000); i < n; i++) fxP.push({ x: frnd(0, fw), y: frnd(0, fh), z: frnd(0.2, 1), p: frnd(0, 6.28) });
    else if (fxMode === 'constellation') for (let i = 0, n = Math.min(120, area / 15000); i < n; i++) fxP.push({ x: frnd(0, fw), y: frnd(0, fh), vx: frnd(-0.25, 0.25), vy: frnd(-0.25, 0.25) });
    else if (fxMode === 'rain') { const cols = Math.ceil(fw / 18); for (let i = 0; i < cols; i++) fxP.push({ x: i * 18 + 9, y: frnd(-fh, 0), v: frnd(2.2, 5.2) }); }
    else if (fxMode === 'fireflies') for (let i = 0, n = Math.min(46, area / 26000); i < n; i++) fxP.push({ x: frnd(0, fw), y: frnd(0, fh), a: frnd(0, 6.28), s: frnd(0.2, 0.6), p: frnd(0, 6.28), r: frnd(2, 4.5) });
    else if (fxMode === 'bubbles') for (let i = 0, n = Math.min(34, area / 40000); i < n; i++) fxP.push(fxBubble(true));
  }
  const fxBubble = (anywhere) => ({ x: frnd(0, fw), y: anywhere ? frnd(0, fh) : fh + 30, r: frnd(8, 34), v: frnd(0.25, 0.8), p: frnd(0, 6.28), pop: 0 });

  function fxActive() {
    if (fxMode === 'off' || !S.motion || document.hidden || reducedMotion.matches) return false;
    const t = tab();
    return !(page === 'browser' && t && t.url && !t.error); // a loaded site covers the backdrop
  }
  const DRAW = {
    stars(dt) {
      fxc.clearRect(0, 0, fw, fh);
      const ox = (mx - fw / 2) * 0.04, oy = (my - fh / 2) * 0.04;
      fxP.forEach((s) => {
        s.x -= (0.03 + s.z * 0.18) * dt * 0.06; if (s.x < -5) s.x = fw + 5;
        s.p += dt * 0.002 * (1 + s.z);
        const a = 0.25 + 0.65 * s.z * (0.55 + 0.45 * Math.sin(s.p));
        const x = s.x - ox * s.z * 3, y = s.y - oy * s.z * 3;
        fxc.fillStyle = `rgba(${s.z > 0.7 ? fxCol[1] : '255,255,255'},${a})`;
        fxc.beginPath(); fxc.arc(x, y, 0.5 + s.z * 1.5, 0, 6.283); fxc.fill();
      });
    },
    constellation(dt) {
      fxc.clearRect(0, 0, fw, fh);
      const k = dt / 16;
      fxP.forEach((p) => {
        p.x += p.vx * k; p.y += p.vy * k;
        if (p.x < 0 || p.x > fw) p.vx *= -1; if (p.y < 0 || p.y > fh) p.vy *= -1;
        const dx = mx - p.x, dy = my - p.y, d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) { p.x += dx / d * 0.35 * k; p.y += dy / d * 0.35 * k; }
      });
      for (let i = 0; i < fxP.length; i++) {
        const a = fxP[i];
        for (let j = i + 1; j < fxP.length; j++) {
          const b = fxP[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 130) { fxc.strokeStyle = `rgba(${fxCol[0]},${(1 - d / 130) * 0.35})`; fxc.lineWidth = 1; fxc.beginPath(); fxc.moveTo(a.x, a.y); fxc.lineTo(b.x, b.y); fxc.stroke(); }
        }
        const dm = Math.hypot(a.x - mx, a.y - my);
        if (dm < 190) { fxc.strokeStyle = `rgba(${fxCol[1]},${(1 - dm / 190) * 0.55})`; fxc.beginPath(); fxc.moveTo(a.x, a.y); fxc.lineTo(mx, my); fxc.stroke(); }
        fxc.fillStyle = `rgba(${fxCol[0]},0.75)`; fxc.beginPath(); fxc.arc(a.x, a.y, 1.8, 0, 6.283); fxc.fill();
      }
    },
    ripples(dt) {
      fxc.clearRect(0, 0, fw, fh);
      fxRipT -= dt;
      if (fxRipT <= 0) { fxRip.push({ x: frnd(0, fw), y: frnd(0, fh), r: 0, a: 0.35 }); fxRipT = frnd(1800, 3200); }
      fxRip = fxRip.filter((r) => r.a > 0.01);
      fxRip.forEach((r) => {
        r.r += dt * 0.09; r.a *= Math.pow(0.9965, dt);
        fxc.strokeStyle = `rgba(${fxCol[r.hue ? 1 : 0]},${r.a})`; fxc.lineWidth = 1.6;
        fxc.beginPath(); fxc.arc(r.x, r.y, r.r, 0, 6.283); fxc.stroke();
        fxc.strokeStyle = `rgba(${fxCol[1]},${r.a * 0.5})`; fxc.beginPath(); fxc.arc(r.x, r.y, r.r * 0.62, 0, 6.283); fxc.stroke();
      });
    },
    rain(dt) {
      fxc.globalCompositeOperation = 'destination-out';
      fxc.fillStyle = 'rgba(0,0,0,0.13)'; fxc.fillRect(0, 0, fw, fh);
      fxc.globalCompositeOperation = 'source-over';
      fxc.font = '15px ui-monospace, monospace';
      const k = dt / 16;
      fxP.forEach((c) => {
        const near = Math.abs(c.x - mx) < 70 ? 1 : 0;
        c.y += c.v * k * (1 + near * 0.8);
        if (c.y > fh + 20) { c.y = frnd(-200, 0); c.v = frnd(2.2, 5.2); }
        fxc.fillStyle = `rgba(${fxCol[0]},${near ? 0.95 : 0.6})`;
        fxc.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x - 6, c.y);
        fxc.fillStyle = 'rgba(220,255,230,0.9)';
        if (Math.random() < 0.04) fxc.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x - 6, c.y + 15);
      });
    },
    fireflies(dt) {
      fxc.clearRect(0, 0, fw, fh);
      const k = dt / 16;
      fxP.forEach((f) => {
        f.a += frnd(-0.12, 0.12) * k; f.p += dt * 0.003;
        const dx = mx - f.x, dy = my - f.y, d = Math.hypot(dx, dy);
        if (d < 260 && d > 30) { f.x += dx / d * 0.5 * k; f.y += dy / d * 0.5 * k; }
        f.x += Math.cos(f.a) * f.s * k; f.y += Math.sin(f.a) * f.s * k;
        if (f.x < -20) f.x = fw + 20; if (f.x > fw + 20) f.x = -20; if (f.y < -20) f.y = fh + 20; if (f.y > fh + 20) f.y = -20;
        const al = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(f.p)), g = fxc.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 7);
        g.addColorStop(0, `rgba(${fxCol[0]},${al})`); g.addColorStop(1, `rgba(${fxCol[0]},0)`);
        fxc.fillStyle = g; fxc.beginPath(); fxc.arc(f.x, f.y, f.r * 7, 0, 6.283); fxc.fill();
        fxc.fillStyle = `rgba(255,255,255,${al})`; fxc.beginPath(); fxc.arc(f.x, f.y, f.r * 0.5, 0, 6.283); fxc.fill();
      });
    },
    bubbles(dt) {
      fxc.clearRect(0, 0, fw, fh);
      const k = dt / 16;
      fxP.forEach((b, i) => {
        if (b.pop) { b.pop += dt; b.r += dt * 0.05; if (b.pop > 220) { fxP[i] = fxBubble(false); return; } }
        else {
          b.y -= b.v * k; b.p += dt * 0.0016; b.x += Math.sin(b.p) * 0.35 * k;
          if (b.y < -50) { fxP[i] = fxBubble(false); return; }
          if (Math.hypot(mx - b.x, my - b.y) < b.r * 0.9) b.pop = 1;
        }
        const al = b.pop ? Math.max(0, 0.5 * (1 - b.pop / 220)) : 0.4;
        fxc.strokeStyle = `rgba(${fxCol[0]},${al})`; fxc.lineWidth = 1.4;
        fxc.beginPath(); fxc.arc(b.x, b.y, b.r, 0, 6.283); fxc.stroke();
        if (!b.pop) {
          fxc.fillStyle = `rgba(${fxCol[0]},0.05)`; fxc.fill();
          fxc.strokeStyle = 'rgba(255,255,255,0.35)'; fxc.beginPath(); fxc.arc(b.x, b.y, b.r * 0.72, 3.5, 4.4); fxc.stroke();
        }
      });
    },
    trail(dt) {
      fxc.clearRect(0, 0, fw, fh);
      fxTrail = fxTrail.filter((p) => p.l > 0);
      fxTrail.forEach((p) => {
        p.l -= dt; p.x += p.vx; p.y += p.vy;
        const a = Math.max(0, p.l / p.max);
        const g = fxc.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 3);
        g.addColorStop(0, `rgba(${fxCol[p.h]},${a * 0.8})`); g.addColorStop(1, `rgba(${fxCol[p.h]},0)`);
        fxc.fillStyle = g; fxc.beginPath(); fxc.arc(p.x, p.y, p.s * 3, 0, 6.283); fxc.fill();
      });
    }
  };
  function fxLoop(t) {
    fxRaf = requestAnimationFrame(fxLoop);
    if (!fxActive()) { if (fxShown) { fxc.clearRect(0, 0, fw, fh); fxShown = false; } return; }
    const dt = Math.min(48, t - fxLast || 16);
    fxLast = t; fxShown = true;
    const d = DRAW[fxMode]; if (d) d(dt);
  }
  function setFx(mode) {
    if (!DRAW[mode]) mode = 'off';
    const changed = mode !== fxMode;
    fxMode = mode;
    fxColors();
    if (changed || !fw) { fxResize(); }
    if (fxMode === 'off') { cancelAnimationFrame(fxRaf); fxRaf = 0; fxc.clearRect(0, 0, fw, fh); }
    else if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
  }
  window.addEventListener('resize', debounce(() => { if (fxMode !== 'off') fxResize(); }, 150));

  let glowRaf = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (fxMode === 'trail' && fxActive()) fxTrail.push({ x: mx, y: my, vx: frnd(-0.3, 0.3), vy: frnd(-0.3, 0.3), s: frnd(3, 7), l: 650, max: 650, h: Math.random() < 0.5 ? 0 : 1 });
    if (fxMode === 'ripples' && fxActive() && Date.now() - fxRipT > 0 && Math.random() < 0.03) fxRip.push({ x: mx, y: my, r: 0, a: 0.3 });
    if (!glowRaf) glowRaf = requestAnimationFrame(() => {
      glowRaf = 0;
      document.documentElement.style.setProperty('--mx', mx + 'px'); document.documentElement.style.setProperty('--my', my + 'px');
    });
    const c = e.target && e.target.closest ? e.target.closest('.tile, .acard, .tcard, .pcard') : null;
    if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--px', (e.clientX - r.left) + 'px'); c.style.setProperty('--py', (e.clientY - r.top) + 'px'); }
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (fxMode === 'ripples' && fxActive()) fxRip.push({ x: e.clientX, y: e.clientY, r: 0, a: 0.55 });
    if (fxMode === 'bubbles' && fxActive()) fxP.forEach((b) => { if (!b.pop && Math.hypot(e.clientX - b.x, e.clientY - b.y) < b.r + 40) b.pop = 1; });
  }, { passive: true });
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) { mx = -9999; my = -9999; } });

  /* ═══════════════════════════ v1.02 — Accounts (Firebase / Google / this-device) ═══════════════════════════ */
  const SESS_KEY = 'wavey.auth.session', USERS_KEY = 'wavey.auth.users', SKIP_KEY = 'wavey.auth.skip', SKIPU_KEY = 'wavey.auth.skipUser';
  const FB_VER = '10.14.0';
  const A = { user: null, mode: AUTH.firebase && AUTH.firebase.apiKey ? 'firebase' : 'local', fb: null, fbReady: null, tab: 'in', busy: false };
  const googleMode = () => (A.mode === 'firebase' ? 'firebase' : AUTH.googleClientId ? 'gis' : 'none');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readSession() {
    try { const s = JSON.parse(ls.get(SESS_KEY) || 'null'); if (s && s.email) A.user = s; } catch { /* ignore */ }
  }
  function setUser(u) {
    A.user = u;
    if (u && A.mode !== 'firebase') ls.set(SESS_KEY, JSON.stringify(u));
    else if (!u) ls.remove(SESS_KEY);
    renderAccount();
  }
  function renderAccount() {
    const u = A.user;
    const b = $('#acctBtn');
    b.textContent = u ? (u.name || u.email).slice(0, 18) : 'Sign in';
    b.title = u ? 'Signed in as ' + u.email : 'Sign in or create an account';
    if (settingsOpen()) renderSettings(true);
  }
  function accountHtml() {
    const u = A.user;
    if (!u) return `<div class="group"><h3>Account</h3>
      <div class="acct"><span class="av" style="background:${avatarBg('guest')}">?</span><div class="tx"><b>Browsing as guest</b><small>Sign in to keep your name on this device</small></div></div>
      <div class="btnrow"><button class="btn sm primary" data-act="sign-in" data-val="in">Sign in</button><button class="btn sm" data-act="sign-in" data-val="up">Create account</button></div></div>`;
    const av = u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : esc(((u.name || u.email)[0] || '?').toUpperCase());
    return `<div class="group"><h3>Account</h3>
      <div class="acct"><span class="av" style="background:${avatarBg(u.email)}">${av}</span><div class="tx"><b>${esc(u.name || u.email)}</b><small>${esc(u.email)} · ${u.provider === 'google' ? 'Google' : 'Email'}</small></div></div>
      <div class="btnrow"><button class="btn sm" data-act="sign-out">Sign out</button></div></div>`;
  }

  /* — Firebase (loaded only when AUTH.firebase is filled in) — */
  function loadFirebase() {
    if (A.fbReady) return A.fbReady;
    A.fbReady = (async () => {
      const [app, auth] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`)
      ]);
      const inst = app.initializeApp(AUTH.firebase);
      const a = auth.getAuth(inst);
      A.fb = { auth: a, api: auth };
      await new Promise((res) => {
        auth.onAuthStateChanged(a, (fu) => {
          A.user = fu ? fbUser(fu) : null;
          renderAccount();
          res();
        });
      });
    })();
    A.fbReady.catch(() => { A.fbReady = null; });
    return A.fbReady;
  }
  const fbUser = (fu) => ({ provider: (fu.providerData && fu.providerData[0] && fu.providerData[0].providerId === 'google.com') ? 'google' : 'email', email: fu.email || '', name: fu.displayName || (fu.email || '').split('@')[0], picture: fu.photoURL || '' });
  const FB_ERR = {
    'auth/invalid-credential': 'Incorrect email or password.', 'auth/wrong-password': 'Incorrect email or password.', 'auth/user-not-found': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with that email already exists — try signing in.', 'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
    'auth/invalid-email': 'That email address doesn’t look right.', 'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Couldn’t reach the sign-in service. Check your connection.', 'auth/popup-closed-by-user': 'The Google window was closed before finishing.',
    'auth/cancelled-popup-request': 'The Google window was closed before finishing.', 'auth/popup-blocked': 'Your browser blocked the Google pop-up. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This website’s address hasn’t been added to Firebase “Authorized domains” yet.', 'auth/operation-not-allowed': 'That sign-in method isn’t switched on in Firebase yet.'
  };
  const fbMsg = (e) => FB_ERR[e && e.code] || ((e && e.message) || 'Something went wrong.').replace(/^Firebase: /, '');

  /* — This-device accounts (no server): PBKDF2-SHA256 hashed passwords in localStorage — */
  const b64e = (u8) => btoa(String.fromCharCode(...u8));
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function hashPw(pw, salt) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Secure sign-in needs HTTPS. Open the site over https:// and try again.');
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64e(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, k, 256)));
  }
  const readUsers = () => { try { return JSON.parse(ls.get(USERS_KEY) || '{}') || {}; } catch { return {}; } };

  async function emailSignUp(name, email, pw) {
    if (A.mode === 'firebase') {
      await loadFirebase();
      const { auth, api } = A.fb;
      const cred = await api.createUserWithEmailAndPassword(auth, email, pw);
      if (name) { try { await api.updateProfile(cred.user, { displayName: name }); } catch { /* optional */ } }
      A.user = fbUser(cred.user); if (name) A.user.name = name;
      return;
    }
    const users = readUsers(), key = email.toLowerCase();
    if (users[key]) throw new Error('An account with that email already exists on this device — try signing in.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    users[key] = { name: name || email.split('@')[0], salt: b64e(salt), hash: await hashPw(pw, salt), t: Date.now() };
    ls.set(USERS_KEY, JSON.stringify(users));
    setUser({ provider: 'email', email: key, name: users[key].name, picture: '' });
  }
  async function emailSignIn(email, pw) {
    if (A.mode === 'firebase') {
      await loadFirebase();
      const { auth, api } = A.fb;
      A.user = fbUser((await api.signInWithEmailAndPassword(auth, email, pw)).user);
      return;
    }
    const u = readUsers()[email.toLowerCase()];
    if (!u) throw new Error('Incorrect email or password.');
    const h = await hashPw(pw, b64d(u.salt));
    let diff = h.length ^ u.hash.length;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (u.hash.charCodeAt(i) || 0);
    if (diff) throw new Error('Incorrect email or password.');
    setUser({ provider: 'email', email: email.toLowerCase(), name: u.name, picture: '' });
  }
  async function resetPassword(email) {
    if (A.mode !== 'firebase') throw new Error('Passwords for this-device accounts can’t be reset — create a new account instead.');
    await loadFirebase();
    await A.fb.api.sendPasswordResetEmail(A.fb.auth, email);
  }

  /* — Google — */
  function jwtPayload(tok) {
    const p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  }
  let gisLoad = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (gisLoad) return gisLoad;
    gisLoad = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = res; s.onerror = () => { gisLoad = null; rej(new Error('Couldn’t load Google sign-in.')); };
      document.head.appendChild(s);
    });
    return gisLoad;
  }
  async function renderGoogleButton() {
    const slot = $('#gSlot');
    if (!slot || googleMode() !== 'gis') return;
    try {
      await loadGis();
      google.accounts.id.initialize({
        client_id: AUTH.googleClientId,
        callback: (resp) => {
          try {
            const p = jwtPayload(resp.credential);
            setUser({ provider: 'google', email: p.email, name: p.name || p.given_name || p.email, picture: p.picture || '' });
            authDone();
          } catch { showAuthErr('Google sign-in failed. Try again.'); }
        }
      });
      google.accounts.id.renderButton(slot, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: 330 });
      $('#gBtn').hidden = true;
    } catch { /* the custom button stays and explains */ }
  }
  async function googleClick() {
    const m = googleMode();
    if (m === 'firebase') {
      busy(true);
      try {
        await loadFirebase();
        const { auth, api } = A.fb;
        A.user = fbUser((await api.signInWithPopup(auth, new api.GoogleAuthProvider())).user);
        authDone();
      } catch (e) { showAuthErr(fbMsg(e)); } finally { busy(false); }
    } else if (m === 'gis') showAuthErr('Google sign-in is still loading — if no Google button appears, check your connection or ad-blocker.');
    else showAuthErr('Google sign-in isn’t set up on this copy of the site yet. Might add in future update but lowk kinda hard so maybe not');
  }

  async function signOut(quiet) {
    try { if (A.mode === 'firebase') { await loadFirebase(); await A.fb.api.signOut(A.fb.auth); } } catch { /* ignore */ }
    A.user = null;
    ls.remove(SESS_KEY);
    // "Don't show again" that was set while signing in ends with the sign-out.
    if (ls.get(SKIPU_KEY) === '1') { ls.remove(SKIP_KEY); ls.remove(SKIPU_KEY); }
    renderAccount();
    if (!quiet) toast('Signed out');
  }

  /* — Dialog UI — */
  const authEl = $('#auth'), authCard = $('#authCard');
  const authOpen = () => authEl.classList.contains('open');
  const GICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function authHtml() {
    const up = A.tab === 'up', skip = ls.get(SKIP_KEY) === '1';
    const note = A.mode === 'firebase' ? 'Accounts are handled by Firebase Authentication.' : 'Accounts are saved only in this browser, on this device.';
    return `<form id="authForm" novalidate>
      <div class="auth-top"><img src="${esc(LOGO)}" alt=""><h2 id="authTitle">${up ? 'Create your account' : 'Welcome back'}</h2><p>${up ? 'Sign up to personalise Wavey chps.' : 'Sign in to Wavey chps.'}</p></div>
      <div class="atabs" role="tablist"><button type="button" role="tab" data-atab="in" class="${up ? '' : 'on'}" aria-selected="${!up}">Sign in</button><button type="button" role="tab" data-atab="up" class="${up ? 'on' : ''}" aria-selected="${up}">Sign up</button></div>
      <button type="button" class="gbtn" id="gBtn" data-aact="google">${GICON}${up ? 'Sign up with Google' : 'Sign in with Google'}</button>
      <div class="gslot" id="gSlot" ${googleMode() === 'gis' ? '' : 'hidden'}></div>
      <div class="or">or use email</div>
      ${up ? '<label class="fld"><span>Name <i>(optional)</i></span><input id="aName" type="text" maxlength="40" autocomplete="name"></label>' : ''}
      <label class="fld"><span>Email</span><input id="aEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required></label>
      <label class="fld"><span>Password</span><div class="pwrap"><input id="aPw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required minlength="8"><button type="button" data-aact="showpw" aria-label="Show password">Show</button></div></label>
      <p class="err" id="authErr" role="alert"></p>
      <button type="submit" class="btn primary auth-submit" id="authGo">${up ? 'Create account' : 'Sign in'}</button>
      <div class="arow"><label class="chk"><input type="checkbox" id="authSkip" ${skip ? 'checked' : ''}>Don’t show this again</label>${up ? '' : '<button type="button" class="linkbtn" data-aact="forgot">Forgot password?</button>'}</div>
      <button type="button" class="guest" data-aact="guest">continue as guest</button>
      <p class="auth-note">${note}</p>
    </form>`;
  }
  function openAuth(tabName) {
    if (tabName) A.tab = tabName;
    authCard.innerHTML = authHtml();
    authEl.classList.add('open');
    authEl.setAttribute('aria-hidden', 'false');
    setBackgroundInert(true);
    renderGoogleButton();
    setTimeout(() => { const f = $('#aEmail'); if (f) f.focus({ preventScroll: true }); }, 80);
  }
  function closeAuth() {
    authEl.classList.remove('open');
    authEl.setAttribute('aria-hidden', 'true');
    if (!dlgOpen()) setBackgroundInert(false);
  }
  function showAuthErr(m) { const e = $('#authErr'); if (e) e.textContent = m || ''; }
  function busy(on) { A.busy = on; const b = $('#authGo'); if (b) b.disabled = on; }
  function rememberSkip(signedIn) {
    const box = $('#authSkip');
    if (box && box.checked) { ls.set(SKIP_KEY, '1'); if (signedIn) ls.set(SKIPU_KEY, '1'); }
    else { ls.remove(SKIP_KEY); ls.remove(SKIPU_KEY); }
  }
  function authDone() {
    rememberSkip(true);
    renderAccount();
    closeAuth();
    toast('Welcome, ' + ((A.user && (A.user.name || A.user.email)) || 'friend') + '!');
  }

  authCard.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-atab], [data-aact]');
    if (!t) return;
    if (t.dataset.atab) { A.tab = t.dataset.atab; const sk = $('#authSkip') ? $('#authSkip').checked : false; openAuth(); $('#authSkip').checked = sk; return; }
    switch (t.dataset.aact) {
      case 'guest': rememberSkip(false); closeAuth(); break;
      case 'google': googleClick(); break;
      case 'showpw': { const i = $('#aPw'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; t.textContent = show ? 'Hide' : 'Show'; break; }
      case 'forgot': {
        const em = $('#aEmail').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) { showAuthErr('Type your email above first, then press “Forgot password?”.'); break; }
        try { await resetPassword(em); showAuthErr(''); toast('If that account exists, a reset email is on its way.'); } catch (er) { showAuthErr(er.code ? fbMsg(er) : er.message); }
        break;
      }
    }
  });
  authCard.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (A.busy) return;
    const up = A.tab === 'up';
    const email = $('#aEmail').value.trim(), pw = $('#aPw').value, name = up ? $('#aName').value.trim() : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return showAuthErr('Enter a valid email address.');
    if (up && pw.length < 8) return showAuthErr('Use at least 8 characters for your password.');
    if (!pw) return showAuthErr('Enter your password.');
    showAuthErr(''); busy(true);
    try {
      if (up) await emailSignUp(name, email, pw); else await emailSignIn(email, pw);
      authDone();
    } catch (er) { showAuthErr(er.code ? fbMsg(er) : er.message || 'Something went wrong.'); }
    finally { busy(false); }
  });
  authEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('button:not([hidden]):not([disabled]), input, [href]', authCard).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  $('#acctBtn').addEventListener('click', (e) => { e.stopPropagation(); if (A.user) { toggleSettings(true); sframeBody.scrollTop = 0; } else openAuth(); });

  async function authStartup() {
    readSession();
    renderAccount();
    if (A.mode === 'firebase') { try { await Promise.race([loadFirebase(), sleep(4000)]); } catch { /* offline: fall through */ } }
    if (A.user) return;                      // already signed in → never show
    if (ls.get(SKIP_KEY) === '1') return;    // "Don't show this again"
    openAuth('in');
  }


  /* ═══════════════════════════ Session ═══════════════════════════ */
  const persistSession = debounce(() => {
    data.session = tabs.map((t) => t.url || null);
    save();
  }, 400);

  /* ═══════════════════════════ Init ═══════════════════════════ */
  function preconnectRelays() {
    try {
      relayList('relay').slice(0, 4).forEach((r) => {
        const o = originOf(relayUrl(r, 'https://example.com/'));
        if (!o) return;
        const l = document.createElement('link');
        l.rel = 'preconnect'; l.href = o; l.crossOrigin = 'anonymous';
        document.head.appendChild(l);
      });
    } catch { /* hints only */ }
  }

  function init() {
    load();
    $('#favicon').dataset.def = $('#favicon').href;
    LOGO = $('#brandLogo').src;
    $('#heroLogo').src = LOGO;
    applyAll();
    renderTiles();
    renderAccount();
    preconnectRelays();
    tickClock();
    setInterval(tickClock, 20000);

    let restored = false;
    if (S.restore && data.session.length) {
      data.session.slice(0, 12).forEach((u, i) => {
        const t = createTab();
        if (i === 0) activeId = t.id;
        if (u && isHttp(u)) { t.url = u; t.lazyUrl = u; t.title = hostOf(u); t.hist = [{ url: u }]; }
        restored = true;
      });
      refresh();
      activateTab(activeId); // only the visible tab loads now; the rest load when opened
    }
    if (!restored) openTab();
    startPresence();
    authStartup();
    window.addEventListener('beforeunload', () => { if (window.__wipe) return; data.session = tabs.map((t) => t.url || null); ls.set(KEY, JSON.stringify(data)); });
  }

  if (window.__WAVEY_TEST__) window.__wavey = { A, setFx, applyAll, openAuth, openAddSite, presenceTick, handleBlank, testRelays, badReason, looksTruncated, decodeBody, resolveInput, prepareDocument, unwrapRedirect, relayUrl, relayList, fetchViaRelays, tabs, navigate, openTab, data, S, bridge };

  init();
})();

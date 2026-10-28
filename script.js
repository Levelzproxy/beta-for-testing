/*!
 * Wavey chps — script.js
 * A browser-style web portal: real tabs, themes, relay-based page loading,
 * bookmarks, history, most-visited sites. Single file, no dependencies.
 */
(() => {
  'use strict';

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
  const displayUrl = (u) => { try { const x = new URL(u); return x.host.replace(/^www\./, '') + (x.pathname + x.search + x.hash).replace(/\/$/, ''); } catch { return u; } };

  /* ═══════════════════════════ Constants ═══════════════════════════ */
  const VERSION = '1.1.0';
  const HOSTED_DEFAULT = 'https://zaka.foo.ng/study.html';
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
  const RELAYS = [
    { id: 'allorigins', name: 'AllOrigins',        tpl: 'https://api.allorigins.win/raw?url={enc}' },
    { id: 'aojson',     name: 'AllOrigins (JSON)', tpl: 'https://api.allorigins.win/get?url={enc}', json: true },
    { id: 'corsproxy',  name: 'corsproxy.io',      tpl: 'https://corsproxy.io/?url={enc}' },
    { id: 'euorg',      name: 'cors.eu.org',       tpl: 'https://cors.eu.org/{raw}' },
    { id: 'thingproxy', name: 'ThingProxy',        tpl: 'https://thingproxy.freeboard.io/fetch/{raw}' },
    // Renders the page in a real browser on the server, so it often succeeds where plain relays are refused.
    { id: 'reader',     name: 'Reader',            tpl: 'https://r.jina.ai/{raw}', headers: { 'X-Respond-With': 'html' }, rendered: true }
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

  const THEMES = {
    violet:   { name: 'Violet',   a: '#a78bfa', b: '#ec4899', bg: '#0b0613' },
    ocean:    { name: 'Ocean',    a: '#38bdf8', b: '#6366f1', bg: '#050d1a' },
    sunset:   { name: 'Sunset',   a: '#fb923c', b: '#f43f5e', bg: '#140a08' },
    emerald:  { name: 'Emerald',  a: '#34d399', b: '#22d3ee', bg: '#04120e' },
    rose:     { name: 'Rose',     a: '#f472b6', b: '#c084fc', bg: '#13060f' },
    graphite: { name: 'Graphite', a: '#e5e7eb', b: '#94a3b8', bg: '#0a0a0c' }
  };

  const SANDBOX_DOC = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation';
  const SANDBOX_DIRECT = SANDBOX_DOC + ' allow-same-origin';
  const FRAME_ALLOW = 'fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture';
  const STAGGER = 1800;
  const RELAY_TIMEOUT = 15000;

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
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } }
  };

  const DEFAULTS = {
    theme: 'violet', engine: 'relay', search: 'ddg', glass: 22, motion: true, restore: true,
    customRelay: '', disabledRelays: [], lastRelay: '', hosted: HOSTED_DEFAULT, hostedAuto: true,
    cloakTitle: '', cloakIcon: '', panicKey: '`', panicUrl: 'https://www.wikipedia.org/'
  };
  const data = { settings: { ...DEFAULTS }, bookmarks: [], history: [], visits: {}, hidden: [], session: [], apps: [] };
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

  function relayList(mode) {
    const custom = customRelays();
    if (mode === 'custom') return custom;
    const builtin = RELAYS.filter((r) => !S.disabledRelays.includes(r.id));
    builtin.sort((a, b) => (b.id === S.lastRelay) - (a.id === S.lastRelay));
    return [...custom, ...builtin];
  }

  // Races relays with a staggered start; first good response wins.
  function fetchViaRelays(url, relays, outer) {
    return new Promise((resolve, reject) => {
      let done = false, failed = 0;
      const started = new Set(), timers = [], ctrls = [], errs = [];
      const abortErr = () => new DOMException('Aborted', 'AbortError');
      const finish = (fn, v) => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        ctrls.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
        fn(v);
      };
      if (outer) {
        if (outer.aborted) return reject(abortErr());
        outer.addEventListener('abort', () => finish(reject, abortErr()), { once: true });
      }
      function fail(r, msg) {
        if (done) return;
        errs.push(`${r.name}: ${msg}`);
        if (++failed >= relays.length) finish(reject, new Error(errs.join('  ·  ')));
        else start(started.size);
      }
      async function run(r) {
        const c = new AbortController();
        ctrls.push(c);
        const to = setTimeout(() => c.abort(), RELAY_TIMEOUT);
        try {
          const resp = await fetch(relayUrl(r, url), { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: r.headers || {} });
          if (done) return;
          if (!resp.ok) return fail(r, 'HTTP ' + resp.status);
          const ct = (resp.headers.get('content-type') || '').toLowerCase();
          if (/^(image|audio|video)\/|application\/(pdf|zip|octet-stream)/.test(ct)) {
            try { if (resp.body) resp.body.cancel(); } catch { /* noop */ }
            return finish(resolve, { binary: true, ct, relay: r });
          }
          let text = await resp.text(), ctype = ct;
          if (r.json) { try { const j = JSON.parse(text); text = typeof j.contents === 'string' ? j.contents : ''; ctype = (j.status && j.status.content_type) || 'text/html'; } catch { text = ''; } }
          if (done) return;
          if (!text || text.trim().length < 15) return fail(r, 'empty response');
          if (text.length < 400 && /(has been blocked|can't be proxied|rate limit|too many requests|access denied)/i.test(text)) return fail(r, 'blocked by relay');
          finish(resolve, { text, ct: ctype, relay: r });
        } catch (e) {
          if (done) return;
          fail(r, e.name === 'AbortError' ? 'timed out' : (e.message || 'network error'));
        } finally { clearTimeout(to); }
      }
      function start(i) {
        if (done || i >= relays.length || started.has(i)) return;
        started.add(i);
        timers.push(setTimeout(() => start(started.size), STAGGER));
        run(relays[i]);
      }
      start(0);
    });
  }

  /* Runs INSIDE the proxied page (serialised via toString). Plain ES5 on purpose. */
  function bridge(BASE, RELAY) {
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

    document.addEventListener('keydown', function (e) {
      var mod = e.altKey || e.ctrlKey || e.metaKey;
      if (!e.key) return;
      if (inField(e.target) && !mod) return;
      if (!(mod || e.key === 'Escape' || e.key.length === 1)) return;
      send({ type: 'key', key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
    }, true);
  }

  const looksHtml = (s) => /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(s) || /<(html|body|head|div|p|a|table|section)[\s>]/i.test(s.slice(0, 4000));

  function prepareDocument(text, ct, url, relay) {
    if (!(/html/.test(ct) || looksHtml(text))) {
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(hostOf(url))}</title><style>body{margin:0;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#1b1b1f;background:#fff;white-space:pre-wrap;word-break:break-word}</style><body>${esc(text)}</body>`;
      return { html, title: hostOf(url) };
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    if (relay && relay.rendered) $$('script, noscript', doc).forEach((n) => n.remove());

    const mr = doc.querySelector('meta[http-equiv="refresh" i]');
    if (mr) {
      const m = /^\s*(\d+(?:\.\d+)?)\s*[;,]\s*(?:url\s*=\s*)?['"]?([^'"]+)/i.exec(mr.getAttribute('content') || '');
      if (m && parseFloat(m[1]) <= 5) { try { return { redirect: new URL(m[2].trim(), url).href }; } catch { /* ignore */ } }
    }
    $$('meta[http-equiv]', doc).forEach((m) => {
      const v = (m.getAttribute('http-equiv') || '').toLowerCase();
      if (v === 'content-security-policy' || v === 'refresh' || v === 'x-frame-options') m.remove();
    });
    $$('script[integrity], link[integrity]', doc).forEach((n) => n.removeAttribute('integrity'));
    $$('script[crossorigin], link[crossorigin]', doc).forEach((n) => n.removeAttribute('crossorigin'));

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
    const nodes = [
      mk('meta', { charset: 'utf-8' }),
      mk('meta', { 'http-equiv': 'Content-Security-Policy', content: 'upgrade-insecure-requests' }),
      mk('base', { href: base }),
      mk('script', {}, `(${bridge.toString()})(${safeJSON(base)}, ${safeJSON(relay && !relay.rendered && !relay.json ? relay.tpl : '')});`)
    ];
    for (let i = nodes.length - 1; i >= 0; i--) head.insertBefore(nodes[i], head.firstChild);
    return { html: '<!DOCTYPE html>' + doc.documentElement.outerHTML, title: (doc.title || '').trim() };
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
    t.url = null; t.error = null; t.loading = false; t.title = 'New Tab'; t.relay = ''; t.hostedFront = false;
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
    t.error = null; t.url = url; t.loading = true; t.title = hostOf(url); t.relay = ''; t.hostedFront = false; t.counted = false; t.directMode = mode === 'direct';
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
    const mine = Object.entries(data.visits).filter(([o]) => !hidden.has(o)).sort((a, b) => b[1].count - a[1].count).slice(0, 8)
      .map(([o, v]) => ({ title: (DEFAULT_SITES.find((d) => originOf(d.url) === o) || {}).title || hostOf(o), url: v.url || o + '/', origin: o, meta: v.count + (v.count === 1 ? ' visit' : ' visits') }));
    const seen = new Set(mine.map((m) => m.origin));
    const fill = DEFAULT_SITES.filter((d) => !seen.has(originOf(d.url)) && !hidden.has(originOf(d.url)))
      .map((d) => ({ title: d.title, url: d.url, origin: originOf(d.url), meta: 'Suggested' }));
    return [...mine, ...fill].slice(0, 8);
  }

  function renderTiles() {
    const items = topSites();
    $('#tiles').innerHTML = items.length ? items.map((s) => `
      <a class="tile" href="${esc(s.url)}" data-url="${esc(s.url)}" data-origin="${esc(s.origin)}">
        <span class="av" style="background:${avatarBg(hostOf(s.url))}">${esc((s.title[0] || '?').toUpperCase())}</span>
        <span class="nm">${esc(s.title)}</span><span class="mt">${esc(s.meta)}</span>
        <span class="rm" data-rm role="button" aria-label="Remove ${esc(s.title)}">${icon('close')}</span>
      </a>`).join('') : '<div class="empty">No shortcuts yet — they appear as you browse.</div>';
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
    const themes = Object.entries(THEMES).map(([k, v]) => `<button class="swatch ${S.theme === k ? 'on' : ''}" data-act="theme" data-val="${k}" style="--a:${v.a};--b:${v.b}" aria-label="${v.name}" title="${v.name}"><span></span></button>`).join('');
    const engines = [['relay', 'Relay'], ['direct', 'Direct'], ['hosted', 'Hosted'], ['custom', 'My Worker']];
    const engDesc = {
      hosted: 'Always opens your hosted proxy (below) inside Wavey.',
      relay: 'Fetches pages through public relays (auto-fallback), rewrites links and forms, and keeps you inside Wavey.',
      direct: 'Loads the site in a plain frame. Fast, but any site that forbids embedding will show blank.',
      custom: 'Uses only the relay URLs you list below — your own Cloudflare Worker is the most reliable option.'
    };
    const relays = RELAYS.map((r) => `
      <div class="relay"><div class="nfo"><b>${esc(r.name)}</b><small>${esc(hostOf(r.tpl))}</small></div>
        <span class="rstat" data-rs="${r.id}"></span>
        <label class="switch"><input type="checkbox" data-relay="${r.id}" ${S.disabledRelays.includes(r.id) ? '' : 'checked'}><i></i></label></div>`).join('');
    const search = Object.entries(SEARCH).map(([k, v]) => `<option value="${k}" ${S.search === k ? 'selected' : ''}>${v.name}</option>`).join('');
    return `
      <div class="group"><h3>Appearance</h3>
        <div class="field"><div class="lbl">Theme</div><div class="swatches">${themes}</div></div>
        <div class="field"><div class="lbl"><span>Glass blur</span><span id="glassVal">${S.glass}px</span></div><input type="range" min="0" max="40" value="${S.glass}" data-key="glass" aria-label="Glass blur"></div>
        ${sw('motion', 'Animated background', 'Drifting colour glow and shimmer. Turn off to save battery.', S.motion)}
      </div>
      <div class="group"><h3>Browsing</h3>
        <div class="field"><div class="lbl">Proxy engine</div>
          <div class="seg">${engines.map(([k, n]) => `<button class="${S.engine === k ? 'on' : ''}" data-act="engine" data-val="${k}">${n}</button>`).join('')}</div>
          <small>${engDesc[S.engine]}</small></div>
        <div class="field"><div class="lbl">Search engine</div><select data-key="search" aria-label="Search engine">${search}</select>
          <small>Google often refuses relays. DuckDuckGo and Brave are the safest bets.</small></div>
        <div class="field"><div class="lbl"><span>Public relays</span><button class="btn sm" data-act="test-relays">Test all</button></div>
          <small>Tried in parallel — the first to answer wins.</small>${relays}</div>
        <div class="field"><div class="lbl">Your own relay URLs</div>
          <textarea data-key="customRelay" spellcheck="false" placeholder="https://my-relay.workers.dev/?url=">${esc(S.customRelay)}</textarea>
          <small>One per line. Use <code>{enc}</code> or <code>{raw}</code> where the page address goes; if omitted, it is appended URL-encoded. See About for a 20-line Worker.</small></div>
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
      <p><b style="color:var(--text)">Wavey chps</b> v${VERSION} — a glassy, browser-style portal that lives entirely in three static files.</p>
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

  async function testRelays() {
    const list = [...RELAYS, ...customRelays()];
    $$('[data-rs]').forEach((el) => { el.className = 'rstat'; el.textContent = 'testing…'; });
    await Promise.all(RELAYS.map(async (r) => {
      const el = $(`[data-rs="${r.id}"]`);
      const t0 = performance.now(), c = new AbortController(), to = setTimeout(() => c.abort(), 9000);
      try {
        const resp = await fetch(relayUrl(r, 'https://example.com/'), { signal: c.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: r.headers || {} });
        const txt = await resp.text();
        if (!resp.ok || txt.length < 50) throw new Error('HTTP ' + resp.status);
        if (el) { el.className = 'rstat ok'; el.textContent = '✓ ' + Math.round(performance.now() - t0) + ' ms'; }
      } catch (e) {
        if (el) { el.className = 'rstat bad'; el.textContent = '✕ ' + (e.name === 'AbortError' ? 'timeout' : 'failed'); }
      } finally { clearTimeout(to); }
    }));
    toast(list.length ? 'Relay test finished' : 'No relays to test');
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
        ls.set(KEY, JSON.stringify({ settings: { ...S, ...(d.settings || {}) }, bookmarks: d.bookmarks || [], history: d.history || [], visits: d.visits || {}, hidden: d.hidden || [], apps: d.apps || [], session: [] }));
        location.reload();
      } catch { toast('That file isn’t a valid Wavey backup', 'warn'); }
    };
    rd.readAsText(file);
  }

  function applyAll() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.style.setProperty('--blur', S.glass + 'px');
    document.documentElement.classList.toggle('no-motion', !S.motion);
    const m = $('meta[name="theme-color"]');
    if (m) m.content = THEMES[S.theme].bg;
    $('#homeEngine').textContent = SEARCH[S.search].name;
    applyCloak();
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
      case 'theme': S.theme = val; applyAll(); save(); renderSettings(true); break;
      case 'engine': S.engine = val; save(); syncNav(); renderSettings(true); break;
      case 'test-relays': testRelays(); break;
      case 'clear-history': data.history = []; save(); toast('History cleared'); break;
      case 'reset-tiles': data.visits = {}; data.hidden = []; save(); renderTiles(); toast('Most visited reset'); break;
      case 'reset-all':
        if (confirm('Erase all Wavey data on this device (settings, bookmarks, history)?')) {
          try { localStorage.removeItem(KEY); } catch { /* noop */ }
          delete mem[KEY];
          location.reload();
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
    if (el.dataset.key === 'glass') { S.glass = +el.value; document.documentElement.style.setProperty('--blur', S.glass + 'px'); $('#glassVal').textContent = S.glass + 'px'; save(); }
  }));
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });

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
      if (menuOpen()) closeMenu(); else if (settingsOpen()) toggleSettings(false); else if (panelName) closePanel(); else if (suggestOpen()) closeSuggest();
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
    if (on) { closeMenu(); renderSettings(); }
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
    ['Movies & TV', 'Tubi', 'https://tubitv.com/', 'Free movies and shows, ad-supported'],
    ['Movies & TV', 'Pluto TV', 'https://pluto.tv/', 'Live channels and on-demand, no sign-up'],
    ['Movies & TV', 'Plex', 'https://watch.plex.tv/', 'Free movies, shows and live TV'],
    ['Movies & TV', 'The Roku Channel', 'https://therokuchannel.roku.com/', 'Free movies and live TV'],
    ['Movies & TV', 'Crackle', 'https://www.crackle.com/', 'Free ad-supported movies'],
    ['Movies & TV', 'Internet Archive Movies', 'https://archive.org/details/movies', 'Public-domain films and classics'],
    ['Anime', 'Tubi — Anime', 'https://tubitv.com/category/anime', 'Free anime, ad-supported'],
    ['Anime', 'RetroCrush', 'https://www.retrocrush.tv/', 'Classic anime, free with ads'],
    ['Anime', 'Muse Asia (YouTube)', 'https://www.youtube.com/@MuseAsia', 'Official free anime episodes'],
    ['Anime', 'Ani-One Asia (YouTube)', 'https://www.youtube.com/@AniOneAsia', 'Official free anime episodes'],
    ['Anime', 'Pluto TV — Anime', 'https://pluto.tv/', 'Always-on anime channels'],
    ['Music', 'YouTube Music', 'https://music.youtube.com/', 'Streaming music and videos'],
    ['Music', 'SoundCloud', 'https://soundcloud.com/', 'Independent artists and remixes'],
    ['Music', 'Spotify Web Player', 'https://open.spotify.com/', 'Music and podcasts'],
    ['Music', 'Bandcamp', 'https://bandcamp.com/', 'Discover and support artists'],
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

  /* ═══════════════════════════ Session ═══════════════════════════ */
  const persistSession = debounce(() => {
    data.session = tabs.map((t) => t.url || null);
    save();
  }, 400);

  /* ═══════════════════════════ Init ═══════════════════════════ */
  function init() {
    load();
    $('#favicon').dataset.def = $('#favicon').href;
    LOGO = $('#brandLogo').src;
    $('#heroLogo').src = LOGO;
    applyAll();
    renderTiles();
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
    window.addEventListener('beforeunload', () => { data.session = tabs.map((t) => t.url || null); ls.set(KEY, JSON.stringify(data)); });
  }

  if (window.__WAVEY_TEST__) window.__wavey = { resolveInput, prepareDocument, unwrapRedirect, relayUrl, relayList, fetchViaRelays, tabs, navigate, openTab, data, S, bridge };

  init();
})();

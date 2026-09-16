/*
 * SplitJapan analytics — GA4 loader + AI referral attribution v2.
 *
 * TO SWITCH MEASUREMENT ON: put the GA4 measurement ID in GA_ID below. That is the only edit.
 * While GA_ID is empty this file does nothing at all: no requests, no cookies, no storage.
 *
 * Why this exists: AI search (ChatGPT, Perplexity, Copilot) sends visitors who do not convert
 * on the spot. They come back later, direct, and the sale gets credited to "direct" — so the
 * channel that actually introduced them looks worthless. This records the visitor's FIRST
 * touch and attaches it to every later event, which is the only way to compare "AI-introduced"
 * against "search-introduced" honestly.
 *
 * Ordinary search (google.com, bing.com, duckduckgo.com) is NOT counted as AI. A bing.com
 * referrer is overwhelmingly plain Bing search, not Copilot.
 *
 * See AI_MEASUREMENT.md for the GA4 custom dimensions this needs, and for what it cannot measure
 * (Google AI Overviews keeps a google.com referrer and is invisible here by design).
 */
(function () {
  var GA_ID = ''; // <-- e.g. 'G-XXXXXXXXXX'
  var KEY = 'sj_ft';
  var SENT = 'sj_ai_sent';

  if (!GA_ID) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());

  // AI assistants and answer engines. Anything not listed falls through to "referral".
  var AI = [
    ['chatgpt',    ['chatgpt.com', 'chat.openai.com', 'openai.com']],
    ['perplexity', ['perplexity.ai']],
    ['copilot',    ['copilot.microsoft.com', 'copilot.cloud.microsoft', 'edgeservices.bing.com']],
    ['gemini',     ['gemini.google.com', 'bard.google.com', 'aistudio.google.com', 'notebooklm.google.com']],
    ['claude',     ['claude.ai']],
    ['grok',       ['grok.com', 'x.ai']],
    ['deepseek',   ['deepseek.com']],
    ['mistral',    ['mistral.ai']],
    ['you',        ['you.com']],
    ['poe',        ['poe.com']],
    ['phind',      ['phind.com']],
    ['felo',       ['felo.ai']],
    ['genspark',   ['genspark.ai']],
    ['andi',       ['andisearch.com']],
    ['komo',       ['komo.ai']],
    ['iask',       ['iask.ai']],
    ['liner',      ['liner.com', 'getliner.com']],
    ['monica',     ['monica.im']],
    ['sider',      ['sider.ai']],
    ['arc-search', ['arc.net']],
    ['kimi',       ['kimi.com', 'moonshot.cn']],
    ['doubao',     ['doubao.com']],
    ['yuanbao',    ['yuanbao.tencent.com']],
    ['qwen',       ['qwen.ai', 'tongyi.aliyun.com']],
    ['metaso',     ['metaso.cn']],
    ['zhipu',      ['chatglm.cn', 'z.ai']]
  ];

  // Third-party mention routes — where other people are talking about this site.
  var COMMUNITY = [
    'reddit.com', 'quora.com', 'news.ycombinator.com', 'facebook.com', 'instagram.com',
    'x.com', 'twitter.com', 't.co', 'youtube.com', 'pinterest.com', 'threads.net',
    'tripadvisor.com', 'lonelyplanet.com', 'japan-guide.com', 'flyertalk.com',
    'producthunt.com', 'github.com'
  ];

  var SEARCH = [
    'google.com', 'google.co.jp', 'google.co.uk', 'google.ca', 'google.com.au',
    'bing.com', 'duckduckgo.com', 'yahoo.com', 'yahoo.co.jp', 'search.brave.com',
    'ecosia.org', 'startpage.com', 'baidu.com', 'naver.com', 'yandex.com'
  ];

  function suffix(host, d) {
    return host === d || host.slice(-(d.length + 1)) === '.' + d;
  }
  function inList(host, list) {
    for (var i = 0; i < list.length; i++) if (suffix(host, list[i])) return true;
    return false;
  }
  function aiFromHost(host) {
    for (var i = 0; i < AI.length; i++) {
      for (var j = 0; j < AI[i][1].length; j++) {
        if (suffix(host, AI[i][1][j])) return AI[i][0];
      }
    }
    return null;
  }
  // ChatGPT appends ?utm_source=chatgpt.com to links it hands out; others do similar.
  function aiFromParam(v) {
    if (!v) return null;
    v = String(v).toLowerCase();
    for (var i = 0; i < AI.length; i++) {
      if (v.indexOf(AI[i][0]) > -1) return AI[i][0];
      for (var j = 0; j < AI[i][1].length; j++) {
        if (v.indexOf(AI[i][1][j]) > -1) return AI[i][0];
      }
    }
    return null;
  }

  function classify() {
    var q, host = '';
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    var tagged = q && (aiFromParam(q.get('utm_source')) || aiFromParam(q.get('ref')) || aiFromParam(q.get('source')));
    if (tagged) return { c: 'ai', s: tagged };

    var r = document.referrer || '';
    if (r) { try { host = new URL(r).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { host = ''; } }
    if (!host) return { c: 'direct', s: 'none' };
    if (host === location.hostname.toLowerCase().replace(/^www\./, '')) return { c: 'internal', s: 'none' };

    var ai = aiFromHost(host);
    if (ai) return { c: 'ai', s: ai };
    if (inList(host, COMMUNITY)) return { c: 'community', s: host };
    if (inList(host, SEARCH)) return { c: 'search', s: host };
    return { c: 'referral', s: host };
  }

  var cur = { c: 'direct', s: 'none' };
  var ft = null, isNewFt = false;
  try { cur = classify(); } catch (e) {}
  try {
    ft = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!ft && cur.c !== 'internal') {
      ft = { c: cur.c, s: cur.s, t: new Date().toISOString().slice(0, 10), p: location.pathname };
      localStorage.setItem(KEY, JSON.stringify(ft));
      isNewFt = true;
    }
  } catch (e) {}
  if (!ft) ft = { c: cur.c, s: cur.s };

  gtag('set', 'user_properties', { first_touch_channel: ft.c, first_touch_source: ft.s });
  gtag('config', GA_ID, {
    session_channel: cur.c,
    ai_source: cur.c === 'ai' ? cur.s : 'none',
    first_touch_channel: ft.c,
    first_touch_source: ft.s,
    first_touch_page: ft.p || '(unset)'
  });

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  try {
    if (cur.c === 'ai') {
      var once = false;
      try { once = sessionStorage.getItem(SENT) === '1'; sessionStorage.setItem(SENT, '1'); } catch (e) {}
      if (!once) gtag('event', 'ai_referral', { ai_source: cur.s, page: location.pathname });
      if (isNewFt) gtag('event', 'ai_first_visit', { ai_source: cur.s, landing: location.pathname });
    } else if (cur.c === 'community') {
      gtag('event', 'forum_referral', { referrer_host: cur.s, page: location.pathname });
    }
  } catch (e) {}

  // Conversion-ish events for a tool with no signup: starting a trip is the real one.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('button, a');
    if (!el) return;
    var id = el.id || '';
    if (id === 'start-trip') gtag('event', 'trip_start', { page: location.pathname });
    else if (id === 'add-member') gtag('event', 'member_add', { page: location.pathname });
    else if (/share/i.test(id)) gtag('event', 'share_link', { page: location.pathname });
    else if (el.tagName === 'A' && /^https?:/.test(el.getAttribute('href') || '')) {
      gtag('event', 'outbound', { url: el.getAttribute('href'), page: location.pathname });
    }
  });
})();

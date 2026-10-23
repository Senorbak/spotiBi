'use strict';
/* senorbak 1.2 · reproductor de música (app web instalable) */

const VERSION = '1.2.3';
const APP = 'senorbak';
const AUDIUS = ['https://api.audius.co', 'https://discoveryprovider.audius.co'];
let audiusBase = AUDIUS[0];

/* ================= inyección de textos y estilos v1.2 ================= */
if (typeof I18N !== 'undefined') {
  Object.assign(I18N.es, {
    secYouTube: 'YouTube (completas y descargables)',
    secYouTubeH: 'Reproduce o descarga el audio completo directamente en la app.',
    dlFromYT: 'Descargar completa (vía YouTube)',
    ytFetching: 'Obteniendo audio de YouTube…',
    secCatalog: 'Catálogo mundial (Deezer)',
    secCatalogH: 'Avances de 30 s o descárgalas completas vía YouTube con el icono de descarga.',
    secFree: 'Artistas independientes (Audius)',
    secFreeH: 'Canciones completas y gratuitas subidas por sus autores.',
    showMore: 'Mostrar más',
    searchYouTube: 'Buscar «{q}» en YouTube',
  });
  Object.assign(I18N.eu, {
    secYouTube: 'YouTube (osorik eta deskargagarriak)',
    secYouTubeH: 'Erreproduzitu edo deskargatu audio osoa zuzenean aplikazioan.',
    dlFromYT: 'Deskargatu osorik (YouTube bidez)',
    ytFetching: 'YouTube-tik audioa lortzen…',
    secCatalog: 'Munduko katalogoa (Deezer)',
    secCatalogH: '30 s-ko aurrebistak edo deskargatu osorik YouTube bidez.',
    secFree: 'Artista independenteak (Audius)',
    secFreeH: 'Egileek igotako abesti osoak eta doakoak.',
    showMore: 'Erakutsi gehiago',
    searchYouTube: 'Bilatu «{q}» YouTube-n',
  });
}
(() => {
  const st = document.createElement('style');
  st.textContent = `
    .sec-sub { color: var(--muted); font-size: 12.5px; margin: -6px 0 10px; }
    .more-btn { margin: 8px 0 18px; }
    button.yt-row { width: 100%; text-align: left; cursor: pointer; }
  `;
  document.head.appendChild(st);
})();

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtBytes(b) {
  if (!b) return '0 MB';
  if (b < 1048576) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
function hashNum(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const TINTS = ['#7f90a5', '#8b9b87', '#a28d76', '#94869f', '#7f9c9b', '#a68989', '#909179', '#7b889a'];
const tintFor = (s) => TINTS[hashNum(s) % TINTS.length];
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'cancion';
function extFor(type, fallback = 'mp3') {
  const t = String(type || '').toLowerCase();
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('flac')) return 'flac';
  if (t.includes('wav')) return 'wav';
  if (t.includes('ogg') || t.includes('opus') || t.includes('webm')) return 'ogg';
  return fallback;
}

/* ================= idioma ================= */
let LANG = 'es';
function t(key, vars) {
  let s = I18N[LANG]?.[key] ?? I18N.es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
const gLabel = (g) => GENRE_LABEL[LANG]?.[g] || g;
const songsCount = (n) => (n === 1 ? t('song1') : t('songsN', { n }));
function ago(ts) {
  const d = (Date.now() - ts) / 60000;
  if (d < 1) return t('justNow');
  if (d < 60) return t('minAgo', { n: Math.round(d) });
  if (d < 1440) return t('hAgo', { n: Math.round(d / 60) });
  return t('dAgo', { n: Math.round(d / 1440) });
}
function whenLabel(ts) {
  if (!ts) return t('never');
  const d = new Date(ts), now = new Date();
  const hm = d.toLocaleTimeString(LANG === 'eu' ? 'eu-ES' : 'es-ES', { hour: '2-digit', minute: '2-digit' });
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= day0) return `${t('today')} ${hm}`;
  if (ts >= day0 - 86400000) return `${t('yesterday')} ${hm}`;
  return `${d.toLocaleDateString(LANG === 'eu' ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'short' })} ${hm}`;
}

/* ================= almacenamiento ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('sb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sb.' + k, JSON.stringify(v)); return true; } catch { toast(t('storageFull')); return false; } },
  del(k) { try { localStorage.removeItem('sb.' + k); } catch { /* nada */ } },
};

const IDB = {
  db: null,
  open() {
    return new Promise((res) => {
      if (!('indexedDB' in window)) return res(null);
      const rq = indexedDB.open('senorbak', 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
        if (!d.objectStoreNames.contains('covers')) d.createObjectStore('covers');
      };
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => res(null);
    });
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!this.db) return rej(new Error('no-db'));
      const tx = this.db.transaction(store, mode);
      const rq = fn(tx.objectStore(store));
      let out;
      if (rq) rq.onsuccess = () => { out = rq.result; };
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  get(store, key) { return this.run(store, 'readonly', (s) => s.get(key)).catch(() => undefined); },
  put(store, key, val) { return this.run(store, 'readwrite', (s) => s.put(val, key)); },
  del(store, key) { return this.run(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined); },
};

/* ================= estado ================= */
const S = { users: [], me: null, lib: null, settings: {}, chart: null, screen: 'boot' };
const TRACKS = new Map();   // key -> canción
const LISTS = new Map();    // contexto -> [canciones]
const COVERS = new Map();   // key -> objectURL de carátula guardada
const DL = new Map();       // key -> % de descarga en curso
const HOME_CACHE = new Map();
const UI = {
  tab: 'home', stack: [], libTab: 'favs', scroll: {},
  search: { q: '', onlyDl: false, genre: '', results: null, allCat: false, loading: false, error: false, lastLogged: '' },
  admin: { type: 'all', user: '', unlockedAt: 0 },
};
let deferredInstall = null;

const DEFAULT_SETTINGS = { lang: '', chartHours: 6, jamendoId: '', ytApi: '', hideMixes: true };
const saveSettings = () => LS.set('settings', S.settings);
const saveUsers = () => LS.set('users', S.users);
const saveLib = () => S.me && LS.set('lib.' + S.me.id, S.lib);
const emptyLib = () => ({ tracks: {}, favs: [], downloads: [], own: [], playlists: [], history: [], recent: [] });
function loadLib(id) { return Object.assign(emptyLib(), LS.get('lib.' + id, {})); }

/* ================= registro de actividad ================= */
function logEvent(type, detail = '', user = S.me) {
  if (!user) return;
  const log = LS.get('log', []);
  log.push({ ts: Date.now(), u: user.id, n: user.name, type, d: String(detail).slice(0, 200) });
  if (log.length > 5000) log.splice(0, log.length - 5000);
  LS.set('log', log);
}

/* ================= URL DEL SERVIDOR YT-DLP ================= */
// Si configuraste un servidor remoto en Ajustes, usará ése. Si no, intenta conectarse al localhost.
const backendUrl = () => {
  let url = S.settings.ytApi || 'http://localhost:3000';
  return url.replace(/\/+$/, '');
};

/* ================= catálogo ================= */
const GENRES = ['Pop', 'Electronic', 'Hip-Hop/Rap', 'Latin', 'Rock', 'R&B/Soul', 'Alternative', 'House', 'Techno', 'Lo-Fi',
  'Reggae', 'Jazz', 'Classical', 'Metal', 'Punk', 'Folk', 'Acoustic', 'Drum & Bass', 'Dubstep', 'Trap', 'Ambient',
  'Funk', 'Blues', 'Country', 'Soundtrack', 'World', 'Experimental'];
const GENRE_KW = { 'Hip-Hop/Rap': 'hip hop', 'R&B/Soul': 'rnb', 'Drum & Bass': 'drum and bass', 'Lo-Fi': 'lofi', Classical: 'piano', World: 'world', Soundtrack: 'cinematic' };
const genreKw = (g) => GENRE_KW[g] || String(g || 'music').toLowerCase();
const USES = ['study', 'work', 'gym', 'party', 'relax', 'sleep', 'drive'];
const USE_KW = { study: 'study', work: 'focus', gym: 'workout', party: 'party', relax: 'chill', sleep: 'sleep', drive: 'road trip' };
const ENERGY_MOOD = { calm: 'Peaceful', mid: 'Easygoing', high: 'Energizing' };
const NON_SONG_GENRES = new Set(['Podcasts', 'Audiobooks', 'Spoken Word', 'Comedy']);
const NON_SONG_RE = /\b(podcast|episod(e|io)|audiobook|audiolibro|sample pack|drum kit|loop kit|sound kit|interview|entrevista)\b/i;

function isSong(m) {
  if (!m || !m.title) return false;
  if (NON_SONG_GENRES.has(m.genre)) return false;
  if (NON_SONG_RE.test(m.title)) return false;
  if (S.settings.hideMixes && m.duration && (m.duration < 45 || m.duration > 900)) return false;
  return true;
}

function fromAudius(x) {
  const art = x.artwork || {};
  return {
    key: 'au:' + x.id, src: 'audius', id: x.id, title: x.title || '', artist: x.user?.name || '',
    art: art['480x480'] || art['150x150'] || '', duration: x.duration || 0, genre: x.genre || '', mood: x.mood || '',
    downloadable: !!x.is_downloadable && !x.is_download_gated, dl: x.download?.url || '',
    license: x.license || '', link: x.permalink ? 'https://audius.co' + x.permalink : 'https://audius.co',
    streamable: x.is_streamable !== false && !x.is_stream_gated,
  };
}
function fromJamendo(x) {
  return {
    key: 'jm:' + x.id, src: 'jamendo', id: x.id, title: x.name || '', artist: x.artist_name || '',
    art: x.album_image || x.image || '', duration: Number(x.duration) || 0, genre: '', stream: x.audio || '',
    downloadable: !!(x.audiodownload_allowed && x.audiodownload), dl: x.audiodownload || '',
    license: x.license_ccurl || '', link: x.shareurl || 'https://www.jamendo.com', streamable: !!x.audio,
  };
}
function fromDeezer(x, i) {
  return {
    key: 'dz:' + x.id, src: 'deezer', id: x.id, title: x.title_short || x.title || '', artist: x.artist?.name || '',
    art: x.album?.cover_medium || x.album?.cover || '', duration: 30, full: Number(x.duration) || 0, genre: '', preview: x.preview || '',
    downloadable: false, link: x.link || 'https://www.deezer.com', rank: x.position || i + 1, streamable: !!x.preview,
  };
}
function fromYouTube(x, id) {
  return {
    key: 'yt:' + id, src: 'youtube', id: id,
    title: x.title || '', artist: (x.uploaderName || x.uploader || x.author || 'YouTube').replace(/\s*-\s*Topic$/i, ''),
    art: x.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: Number(x.duration) || 0,
    genre: '', downloadable: true, streamable: true,
    link: `https://www.youtube.com/watch?v=${id}`, ext: 'm4a'
  };
}
const reg = (list) => { list.forEach((m) => TRACKS.set(m.key, m)); return list; };
const mapAudius = (list) => reg((list || []).map(fromAudius).filter((m) => m.streamable && isSong(m)));

async function fetchJSON(url, ms = 12000) {
  const c = new AbortController();
  const tm = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}
async function audius(path, params = {}) {
  const qs = new URLSearchParams({ ...params, app_name: APP }).toString();
  let err;
  for (const base of [audiusBase, ...AUDIUS.filter((b) => b !== audiusBase)]) {
    try {
      const j = await fetchJSON(`${base}/v1${path}?${qs}`);
      audiusBase = base;
      return j.data || [];
    } catch (e) { err = e; }
  }
  throw err || new Error('audius');
}
function jsonp(url, ms = 12000) {
  return new Promise((res, rej) => {
    const cb = 'sbjp' + Date.now().toString(36) + Math.floor(Math.random() * 1e6);
    const s = document.createElement('script');
    const done = () => { clearTimeout(tm); delete window[cb]; s.remove(); };
    const tm = setTimeout(() => { done(); rej(new Error('timeout')); }, ms);
    window[cb] = (d) => { done(); res(d); };
    s.onerror = () => { done(); rej(new Error('jsonp')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    document.head.appendChild(s);
  });
}

/* ================= buscador de catálogo (Deezer) y YouTube ================= */
async function searchCatalog(q) {
  const j = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=25`);
  return reg((j?.data || []).map(fromDeezer).filter((m) => m.preview));
}

function extractYtId(q) {
  const m = String(q).match(/(?:(?:music\.)?youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function searchYouTubeAPI(q) {
  const base = backendUrl();
  const directId = extractYtId(q);
  if (directId) {
    try {
      const info = await fetchJSON(`${base}/api/stream?id=${encodeURIComponent(directId)}`, 15000);
      return reg([fromYouTube({ title: info.title || 'YouTube', uploaderName: info.uploader || 'YouTube', duration: info.duration }, directId)]);
    } catch (err) { throw err; }
  }
  try {
    const data = await fetchJSON(`${base}/api/search?q=${encodeURIComponent(q)}`, 20000);
    return reg((Array.isArray(data) ? data : []).filter((x) => x.id).slice(0, 15).map((x) => fromYouTube(x, x.id)));
  } catch (err) {
    console.warn('No se pudo conectar con el servidor yt-dlp en ' + base, err);
    throw err;
  }
}

async function getYouTubeAudioUrl(videoId) {
  // Pide al servidor proxy que nos descargue el audio directamente, saltándose las protecciones de IP
  return { url: `${backendUrl()}/api/proxy?id=${videoId}`, urls: [`${backendUrl()}/api/proxy?id=${videoId}`], ext: 'm4a' };
}

async function searchSongs(q, { onlyDl = false, genre = '' } = {}) {
  const tasks = [];
  const p = { query: q, limit: 40 };
  if (onlyDl) p.has_downloads = 'true';
  if (genre) p.genre = genre;
  tasks.push(audius('/tracks/search', p).then(mapAudius));
  if (S.settings.jamendoId && !genre) {
    const u = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(S.settings.jamendoId)}&format=json&limit=25&search=${encodeURIComponent(q)}&audioformat=mp32&audiodlformat=mp32&imagesize=300`;
    tasks.push(fetchJSON(u).then((j) => reg((j.results || []).map(fromJamendo).filter(isSong))));
  }
  const res = await Promise.allSettled(tasks);
  if (res.every((r) => r.status === 'rejected')) throw res[0].reason;
  const out = [], seen = new Set();
  const lists = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) for (const l of lists) if (l[i] && !seen.has(l[i].key)) { seen.add(l[i].key); out.push(l[i]); }
  return onlyDl ? out.filter((m) => m.downloadable) : out;
}

/* top mundial */
async function refreshChart(force = false) {
  const c = S.chart;
  const maxAge = (S.settings.chartHours || 6) * 3600000;
  if (!force && c && Date.now() - c.ts < maxAge) return c;
  if (!navigator.onLine) return c;
  try {
    const j = await jsonp('https://api.deezer.com/chart/0/tracks?limit=50');
    const items = (j.data || []).map(fromDeezer).filter((m) => m.preview);
    if (!items.length) throw new Error('empty');
    S.chart = { ts: Date.now(), src: 'deezer', items };
  } catch {
    try {
      const items = mapAudius(await audius('/tracks/trending', { time: 'week', limit: 50 }));
      S.chart = { ts: Date.now(), src: 'audius', items };
    } catch { return S.chart; }
  }
  LS.set('chart', S.chart);
  reg(S.chart.items);
  return S.chart;
}

/* ================= biblioteca ================= */
const isFav = (k) => S.lib?.favs.includes(k);
const isLocal = (k) => !!S.lib && (S.lib.downloads.includes(k) || S.lib.own.includes(k));
const getTrack = (k) => TRACKS.get(k) || S.lib?.tracks[k];
function keepMeta(m) { if (m && S.lib) S.lib.tracks[m.key] = m; }
const canDownload = (m) => !!m && ((m.src === 'audius' || m.src === 'jamendo' || m.src === 'youtube') && m.downloadable || m.src === 'deezer');

function toggleFav(k) {
  const m = getTrack(k); if (!m) return;
  const i = S.lib.favs.indexOf(k);
  if (i >= 0) S.lib.favs.splice(i, 1); else { S.lib.favs.unshift(k); keepMeta(m); }
  saveLib();
  toast(i >= 0 ? t('removeFav') : t('addFav'));
  refreshAfterLibChange();
}
function addHistory(m) {
  keepMeta(m);
  const h = S.lib.history.filter((x) => x !== m.key);
  h.unshift(m.key);
  S.lib.history = h.slice(0, 60);
  saveLib();
}
function libList(keys) { return keys.map((k) => getTrack(k)).filter(Boolean); }

function keyInOtherProfiles(k) {
  return S.users.some((u) => {
    if (u.id === S.me.id) return false;
    const l = LS.get('lib.' + u.id, null);
    return l && ((l.downloads || []).includes(k) || (l.own || []).includes(k));
  });
}
async function dropBlobIfUnused(k) {
  if (isLocal(k) || keyInOtherProfiles(k)) return;
  await IDB.del('blobs', k); await IDB.del('covers', k);
  if (COVERS.has(k)) { URL.revokeObjectURL(COVERS.get(k)); COVERS.delete(k); }
}
async function hydrateCovers() {
  const keys = [...new Set([...S.lib.own, ...S.lib.downloads])];
  for (const k of keys) {
    if (COVERS.has(k)) continue;
    const b = await IDB.get('covers', k);
    if (b) COVERS.set(k, URL.createObjectURL(b));
  }
}
async function storageUsed() {
  let total = 0;
  for (const k of new Set([...S.lib.own, ...S.lib.downloads])) { const b = await IDB.get('blobs', k); if (b) total += b.size; }
  return total;
}

/* descargas */
async function fetchBlob(url, onProgress) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !total) { const b = await r.blob(); if (b.size < 1024) throw new Error('small'); return b; }
  const reader = r.body.getReader();
  const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onProgress?.(Math.round((got / total) * 100));
  }
  const b = new Blob(parts, { type: r.headers.get('content-type') || 'audio/mpeg' });
  if (b.size < 1024) throw new Error('small');
  return b;
}

async function downloadTrack(k) {
  const m = getTrack(k);
  if (!m) return;
  if (m.src === 'deezer') return downloadDeezerViaYT(k);
  if (isLocal(k)) return toast(t('downloaded'));
  if (!canDownload(m)) return toast(t('notDownloadable'));
  if (!navigator.onLine) return toast(t('needOnline'));
  if (DL.has(k)) return;
  DL.set(k, 0); refreshDlUI(k);
  let urls = [];
  if (m.src === 'youtube') {
    toast(t('ytFetching'));
    try {
      const yt = await getYouTubeAudioUrl(m.id);
      m.ext = yt.ext;
      urls = yt.urls || [yt.url];
    } catch { DL.delete(k); refreshDlUI(k); return toast(t('dlFailed')); }
  } else if (m.src === 'audius') {
    urls = [m.dl, `${audiusBase}/v1/tracks/${m.id}/download?app_name=${APP}`, `${audiusBase}/v1/tracks/${m.id}/stream?app_name=${APP}`].filter(Boolean);
  } else {
    urls = [m.dl].filter(Boolean);
  }
  let blob = null;
  for (const u of urls) {
    try { blob = await fetchBlob(u, (p) => { DL.set(k, p); refreshDlUI(k); }); break; } catch { /* siguiente */ }
  }
  if (!blob) {
    DL.delete(k); refreshDlUI(k);
    if (urls[0]) {
      const a = document.createElement('a'); a.href = urls[0]; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      logEvent('download', `${m.title} — ${m.artist}`);
      return toast(t('dlBrowser'));
    }
    return toast(t('dlFailed'));
  }
  try {
    await IDB.put('blobs', k, blob);
    if (m.art) {
      try { const c = await fetch(m.art, { mode: 'cors' }); if (c.ok) { const cb = await c.blob(); await IDB.put('covers', k, cb); COVERS.set(k, URL.createObjectURL(cb)); } } catch { /* sin carátula */ }
    }
  } catch { DL.delete(k); refreshDlUI(k); return toast(t('storageFull')); }
  DL.delete(k);
  keepMeta(m);
  if (!S.lib.downloads.includes(k)) S.lib.downloads.unshift(k);
  saveLib();
  logEvent('download', `${m.title} — ${m.artist}`);
  navigator.storage?.persist?.();
  toast(t('dlDone', { title: m.title }));
  refreshDlUI(k);
  refreshAfterLibChange();
}

async function downloadDeezerViaYT(k) {
  const m = getTrack(k);
  if (!m) return;
  if (isLocal(k)) return toast(t('downloaded'));
  if (!navigator.onLine) return toast(t('needOnline'));
  if (DL.has(k)) return;
  DL.set(k, 0); refreshDlUI(k);
  toast(t('ytFetching'), 10000);
  try {
    const res = await searchYouTubeAPI(`${m.artist} ${m.title}`);
    if (!res.length) throw new Error('not-found');
    const yt = await getYouTubeAudioUrl(res[0].id);
    let blob = null;
    for (const u of (yt.urls || [yt.url])) {
      try { blob = await fetchBlob(u, (p) => { DL.set(k, p); refreshDlUI(k); }); break; } catch { /* siguiente */ }
    }
    if (!blob) throw new Error('no-blob');
    await IDB.put('blobs', k, blob);
    if (m.art) {
      try { const c = await fetch(m.art, { mode: 'cors' }); if (c.ok) { const cb = await c.blob(); await IDB.put('covers', k, cb); COVERS.set(k, URL.createObjectURL(cb)); } } catch { /* sin carátula */ }
    }
    DL.delete(k);
    m.duration = res[0].duration || m.full || m.duration;
    m.ext = yt.ext;
    keepMeta(m);
    if (!S.lib.downloads.includes(k)) S.lib.downloads.unshift(k);
    saveLib();
    logEvent('download', `${m.title} — ${m.artist} [YT]`);
    navigator.storage?.persist?.();
    toast(t('dlDone', { title: m.title }));
    refreshDlUI(k);
    refreshAfterLibChange();
  } catch {
    DL.delete(k); refreshDlUI(k);
    toast(t('dlFailed'));
  }
}

async function removeDownload(k) {
  S.lib.downloads = S.lib.downloads.filter((x) => x !== k);
  saveLib();
  await dropBlobIfUnused(k);
  refreshAfterLibChange();
}
async function saveToPhone(k) {
  const m = getTrack(k);
  const blob = await IDB.get('blobs', k);
  if (!m || !blob) return toast(t('dlFailed'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(m.artist ? `${m.artist} - ${m.title}` : m.title)}.${extFor(blob.type, m.ext || 'mp3')}`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  toast(t('savedPhone'));
}
async function shareFile(k) {
  const m = getTrack(k);
  const blob = await IDB.get('blobs', k);
  if (!m || !blob) return;
  const file = new File([blob], `${safeName(`${m.artist} - ${m.title}`)}.${extFor(blob.type, m.ext || 'mp3')}`, { type: blob.type || 'audio/mpeg' });
  try { await navigator.share({ files: [file], title: m.title }); } catch { /* cancelado */ }
}
const canShareFiles = () => !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.mp3', { type: 'audio/mpeg' })] }));

/* mi música: importar del móvil */
function syncsafe(b, o) { return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f); }
function decodeText(data) {
  if (!data.length) return '';
  const enc = data[0]; let body = data.subarray(1); let label = 'latin1';
  if (enc === 1) {
    if (body[0] === 0xfe && body[1] === 0xff) { label = 'utf-16be'; body = body.subarray(2); } else { label = 'utf-16le'; if (body[0] === 0xff && body[1] === 0xfe) body = body.subarray(2); }
  } else if (enc === 2) label = 'utf-16be';
  else if (enc === 3) label = 'utf-8';
  try { return new TextDecoder(label).decode(body).replace(/\u0000/g, ' ').trim(); } catch { return ''; }
}
function decodeAPIC(data) {
  try {
    const enc = data[0]; let p = 1;
    let mime = '';
    while (p < data.length && data[p] !== 0) mime += String.fromCharCode(data[p++]);
    p += 2; // fin del mime y tipo de imagen
    if (enc === 1 || enc === 2) { while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2; p += 2; } else { while (p < data.length && data[p] !== 0) p++; p += 1; }
    const img = data.slice(p);
    if (img.length < 100) return null;
    return new Blob([img], { type: mime.includes('/') ? mime : 'image/jpeg' });
  } catch { return null; }
}
async function readTags(file) {
  const out = {};
  try {
    const h = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return out;
    const ver = h[3];
    if (ver < 3) return out;
    const size = syncsafe(h, 6);
    const buf = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    let p = 0;
    if (h[5] & 0x40) p = ver === 4 ? syncsafe(buf, 0) : ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) + 4;
    while (p + 10 <= buf.length) {
      const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? syncsafe(buf, p + 4) : ((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0;
      if (!fs || p + 10 + fs > buf.length) break;
      const data = buf.subarray(p + 10, p + 10 + fs);
      if (id === 'TIT2') out.title = decodeText(data);
      else if (id === 'TPE1') out.artist = decodeText(data);
      else if (id === 'TALB') out.album = decodeText(data);
      else if (id === 'APIC' && !out.cover) out.cover = decodeAPIC(data);
      p += 10 + fs;
    }
  } catch { /* etiquetas ilegibles */ }
  return out;
}
function audioDuration(blob) {
  return new Promise((res) => {
    const a = new Audio(); const u = URL.createObjectURL(blob);
    const end = (v) => { URL.revokeObjectURL(u); res(v); };
    const tm = setTimeout(() => end(0), 6000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(tm); end(Number.isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => { clearTimeout(tm); end(0); };
    a.src = u;
  });
}
async function importFiles(files) {
  const list = Array.from(files || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus)$/i.test(f.name));
  if (!list.length) return;
  toast(t('importing', { n: list.length }), 60000);
  let n = 0;
  for (const f of list) {
    const tags = await readTags(f);
    const base = f.name.replace(/\.[^.]+$/, '');
    let title = tags.title, artist = tags.artist;
    if (!title) {
      const parts = base.split(' - ');
      if (parts.length >= 2) { artist = artist || parts[0].trim(); title = parts.slice(1).join(' - ').trim(); } else title = base;
    }
    const k = 'own:' + newId();
    try {
      await IDB.put('blobs', k, f);
      if (tags.cover) { await IDB.put('covers', k, tags.cover); COVERS.set(k, URL.createObjectURL(tags.cover)); }
    } catch { toast(t('storageFull')); break; }
    const m = { key: k, src: 'own', id: k, title, artist: artist || '', album: tags.album || '', art: '', duration: await audioDuration(f), genre: '', streamable: true, ext: (f.name.split('.').pop() || 'mp3').toLowerCase(), fileName: f.name };
    TRACKS.set(k, m); keepMeta(m); S.lib.own.unshift(k);
    logEvent('import', f.name);
    n++;
  }
  saveLib();
  navigator.storage?.persist?.();
  toast(t('imported', { n }));
  refreshAfterLibChange();
}
async function sendToProfile(k, uidTo) {
  const m = getTrack(k); const u = S.users.find((x) => x.id === uidTo);
  if (!m || !u) return;
  const lib = loadLib(u.id);
  const field = m.src === 'own' ? 'own' : 'downloads';
  if (lib[field].includes(k)) return toast(t('alreadyThere'));
  lib.tracks[k] = m; lib[field].unshift(k);
  LS.set('lib.' + u.id, lib);
  toast(t('sentTo', { name: u.name }));
}
async function deleteOwn(k) {
  S.lib.own = S.lib.own.filter((x) => x !== k);
  S.lib.downloads = S.lib.downloads.filter((x) => x !== k);
  S.lib.favs = S.lib.favs.filter((x) => x !== k);
  S.lib.playlists.forEach((p) => { p.keys = p.keys.filter((x) => x !== k); });
  saveLib();
  await dropBlobIfUnused(k);
  refreshAfterLibChange();
}

/* listas */
function createPlaylist(name) {
  const p = { id: newId(), name: name.trim().slice(0, 60), keys: [], createdAt: Date.now() };
  S.lib.playlists.unshift(p); saveLib();
  logEvent('playlist', p.name);
  return p;
}
function addToPlaylist(pid, k) {
  const p = S.lib.playlists.find((x) => x.id === pid); const m = getTrack(k);
  if (!p || !m) return;
  if (p.keys.includes(k)) return toast(t('alreadyPl', { name: p.name }));
  keepMeta(m); p.keys.push(k); saveLib();
  toast(t('addedPl', { name: p.name }));
  refreshAfterLibChange();
}

/* ================= reproductor ================= */
const P = {
  audio: new Audio(), queue: [], i: -1, original: null, shuffle: false, repeat: 'off',
  ctx: '', blobUrl: '', triedAlt: false, errors: 0, seeking: false,
  cur() { return this.queue[this.i] || null; },
};
P.audio.preload = 'auto';

function streamURL(m) {
  if (m.src === 'audius') return `${audiusBase}/v1/tracks/${m.id}/stream?app_name=${APP}`;
  if (m.src === 'jamendo') return m.stream;
  if (m.src === 'deezer') return m.preview;
  return '';
}
function startList(list, index = 0, { shuffle = null, ctx = '' } = {}) {
  if (!list.length) return;
  P.queue = list.slice(); P.i = clamp(index, 0, list.length - 1); P.original = null; P.ctx = ctx;
  if (shuffle !== null) P.shuffle = shuffle;
  if (P.shuffle) applyShuffle();
  loadAndPlay();
}
function applyShuffle() {
  const cur = P.cur(); if (!cur) return;
  P.original = P.queue.slice();
  const rest = P.queue.filter((_, j) => j !== P.i);
  P.queue = [cur, ...shuffleArr(rest)]; P.i = 0;
}
function toggleShuffle() {
  P.shuffle = !P.shuffle;
  if (P.shuffle) applyShuffle();
  else if (P.original) {
    const cur = P.cur();
    const extra = P.queue.filter((m) => !P.original.some((o) => o.key === m.key));
    P.queue = [...P.original, ...extra]; P.original = null;
    P.i = Math.max(0, P.queue.findIndex((m) => m.key === cur?.key));
  }
  toast(P.shuffle ? t('shuffleOn') : t('shuffleOff'));
  updatePlayerUI(); savePlayer(); if ($('#queue-sheet')) renderQueueSheet();
}
function cycleRepeat() {
  const order = ['off', 'once', 'one', 'all'];
  P.repeat = order[(order.indexOf(P.repeat) + 1) % order.length];
  toast(t('rep_' + P.repeat));
  updatePlayerUI(); savePlayer();
}
async function loadAndPlay(autoplay = true, startAt = 0) {
  const m = P.cur(); if (!m) return;
  if (P.blobUrl) { URL.revokeObjectURL(P.blobUrl); P.blobUrl = ''; }
  let url = '';
  if (m.src === 'own' || isLocal(m.key)) {
    const b = await IDB.get('blobs', m.key);
    if (b) { url = URL.createObjectURL(b); P.blobUrl = url; }
  }
  if (!url) {
    if (!navigator.onLine) { toast(t('needOnline')); updatePlayerUI(); return; }
    if (m.src === 'youtube') {
      updateMediaSession(m);
      updatePlayerUI();
      markPlaying();
      try {
        const yt = await getYouTubeAudioUrl(m.id);
        if (P.cur()?.key !== m.key) return;
        url = yt.url;
      } catch {
        toast(t('playError'));
        return;
      }
    } else {
      url = streamURL(m);
    }
  }
  P.triedAlt = false;
  P.audio.src = url;
  if (startAt) P.audio.addEventListener('loadedmetadata', () => { try { P.audio.currentTime = startAt; } catch { /* nada */ } }, { once: true });
  updateMediaSession(m);
  updatePlayerUI();
  markPlaying();
  if (autoplay) {
    try { await P.audio.play(); } catch { /* el navegador pide un toque */ }
    logEvent('play', `${m.title} — ${m.artist}`);
    addHistory(m);
  }
  savePlayer();
}
function togglePlay() {
  if (!P.cur()) return;
  if (!P.audio.src) { const at = P.resumeAt || 0; P.resumeAt = 0; return loadAndPlay(true, at); }
  if (P.audio.paused) P.audio.play().catch(() => {}); else P.audio.pause();
}
function nextTrack(auto = false) {
  if (!P.queue.length) return;
  if (auto && P.repeat === 'one') { P.audio.currentTime = 0; P.audio.play().catch(() => {}); return; }
  if (auto && P.repeat === 'once') { P.repeat = 'off'; P.audio.currentTime = 0; P.audio.play().catch(() => {}); updatePlayerUI(); return; }
  if (P.i + 1 >= P.queue.length) {
    if (auto && P.repeat !== 'all') { P.audio.pause(); P.audio.currentTime = 0; updatePlayerUI(); return; }
    P.i = 0;
  } else P.i++;
  loadAndPlay();
}
function prevTrack() {
  if (!P.queue.length) return;
  if (P.audio.currentTime > 3) { P.audio.currentTime = 0; return; }
  P.i = P.i > 0 ? P.i - 1 : (P.repeat === 'all' ? P.queue.length - 1 : 0);
  loadAndPlay();
}
function playNextInQueue(m) {
  if (!P.queue.length) return startList([m], 0, { ctx: t('queue') });
  P.queue.splice(P.i + 1, 0, m); P.original?.push(m);
  toast(t('addedNext')); savePlayer(); if ($('#queue-sheet')) renderQueueSheet();
}
function addToQueue(m) {
  if (!P.queue.length) return startList([m], 0, { ctx: t('queue') });
  P.queue.push(m); P.original?.push(m);
  toast(t('addedQueue')); savePlayer(); if ($('#queue-sheet')) renderQueueSheet();
}
function savePlayer() {
  if (!S.me) return;
  LS.set('player.' + S.me.id, { queue: P.queue.slice(0, 300), i: P.i, shuffle: P.shuffle, repeat: P.repeat, t: Math.floor(P.audio.currentTime || 0), ctx: P.ctx });
}
function restorePlayer() {
  const st = LS.get('player.' + S.me.id, null);
  P.audio.pause(); P.audio.removeAttribute('src'); P.audio.load();
  P.queue = []; P.i = -1; P.original = null; P.shuffle = false; P.repeat = 'off'; P.ctx = '';
  if (!st || !st.queue?.length) return;
  P.queue = st.queue; reg(P.queue); P.i = clamp(st.i, 0, st.queue.length - 1);
  P.shuffle = !!st.shuffle; P.repeat = st.repeat || 'off'; P.ctx = st.ctx || ''; P.resumeAt = st.t || 0;
}

P.audio.addEventListener('play', () => { document.body.classList.add('is-playing'); updatePlayButtons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
P.audio.addEventListener('pause', () => { document.body.classList.remove('is-playing'); updatePlayButtons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; savePlayer(); });
P.audio.addEventListener('ended', () => nextTrack(true));
P.audio.addEventListener('playing', () => { P.errors = 0; });
P.audio.addEventListener('loadedmetadata', () => { updateProgress(); setPositionState(); });
let lastSave = 0;
P.audio.addEventListener('timeupdate', () => {
  updateProgress();
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePlayer(); setPositionState(); }
});
P.audio.addEventListener('error', async () => {
  const m = P.cur(); if (!m || !P.audio.src) return;
  if (m.src === 'audius' && !P.triedAlt) {
    P.triedAlt = true;
    audiusBase = AUDIUS.find((b) => b !== audiusBase) || audiusBase;
    P.audio.src = streamURL(m); P.audio.play().catch(() => {});
    return;
  }
  if (m.src === 'deezer' && !P.triedAlt) {
    P.triedAlt = true;
    try { const j = await jsonp(`https://api.deezer.com/track/${m.id}`); if (j.preview) { m.preview = j.preview; P.audio.src = j.preview; P.audio.play().catch(() => {}); return; } } catch { /* nada */ }
  }
  if (m.src === 'youtube' && !P.triedAlt) {
    P.triedAlt = true;
    try { const yt = await getYouTubeAudioUrl(m.id); P.audio.src = yt.url; P.audio.play().catch(() => {}); return; } catch { /* nada */ }
  }
  P.errors++;
  toast(t('playError'));
  if (P.errors < 3 && P.queue.length > 1) setTimeout(() => nextTrack(true), 1200);
});

function updateMediaSession(m) {
  if (!('mediaSession' in navigator) || !m) return;
  const art = COVERS.get(m.key) || m.art;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.title, artist: m.artist || APP, album: m.album || (m.src === 'deezer' && !isLocal(m.key) ? t('previewOnly') : APP),
      artwork: art ? [{ src: art, sizes: '480x480', type: 'image/jpeg' }] : [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  } catch { /* nada */ }
}
function setPositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = P.audio.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: P.audio.playbackRate || 1, position: Math.min(P.audio.currentTime || 0, d) }); } catch { /* nada */ }
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* no soportado */ } };
  h('play', () => togglePlay());
  h('pause', () => P.audio.pause());
  h('previoustrack', () => prevTrack());
  h('nexttrack', () => nextTrack());
  h('seekbackward', (d) => { P.audio.currentTime = Math.max(0, P.audio.currentTime - (d.seekOffset || 10)); });
  h('seekforward', (d) => { P.audio.currentTime = Math.min(P.audio.duration || 0, P.audio.currentTime + (d.seekOffset || 10)); });
  h('seekto', (d) => { if (d.fastSeek && P.audio.fastSeek) P.audio.fastSeek(d.seekTime); else P.audio.currentTime = d.seekTime; setPositionState(); });
  h('stop', () => { P.audio.pause(); P.audio.currentTime = 0; });
}

/* ================= capas e historial (botón atrás) ================= */
const LAYERS = []; const LAYER_WAIT = [];
function pushLayer(closeFn) { LAYERS.push(closeFn); history.pushState({ sb: LAYERS.length }, ''); }
function closeTop() {
  return new Promise((res) => { if (!LAYERS.length) return res(); LAYER_WAIT.push(res); history.back(); });
}
window.addEventListener('popstate', () => {
  const fn = LAYERS.pop(); if (fn) fn();
  const w = LAYER_WAIT.shift(); if (w) w();
});

/* ================= avisos ================= */
let toastTm;
function toast(msg, ms = 2400) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTm); toastTm = setTimeout(() => el.classList.remove('show'), ms);
}

/* diálogo propio (sustituye a alert/confirm/prompt) */
function dialog({ title = '', message = '', input = null, ok = t('ok'), cancel = t('cancel'), danger = false }) {
  return new Promise((resolve) => {
    const root = $('#layers');
    const el = document.createElement('div');
    el.className = 'layer dialog-layer';
    el.innerHTML = `<div class="scrim" data-x="cancel"></div>
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        ${title ? `<h2 id="dlg-t">${esc(title)}</h2>` : ''}
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${input ? `<input id="dlg-in" class="input" type="${input.type || 'text'}" ${input.numeric ? 'inputmode="numeric" pattern="[0-9]*" autocomplete="off"' : ''} maxlength="${input.max || 60}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">
          <p class="field-err" id="dlg-err" hidden></p>` : ''}
        <div class="dialog-actions">
          ${cancel ? `<button type="button" class="btn btn-ghost" data-x="cancel">${esc(cancel)}</button>` : ''}
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-chrome'}">${esc(ok)}</button>
        </div>
      </form>`;
    root.appendChild(el);
    let result = null;
    const finish = () => { el.remove(); resolve(result); };
    pushLayer(finish);
    const inp = $('#dlg-in', el);
    setTimeout(() => (inp || $('button[type=submit]', el)).focus(), 60);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-x="cancel"]')) { result = null; closeTop(); } });
    $('form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      if (input) {
        const v = inp.value.trim();
        const err = input.validate?.(v);
        if (err) { const pe = $('#dlg-err', el); pe.textContent = err; pe.hidden = false; return; }
        result = v;
      } else result = true;
      closeTop();
    });
  });
}

/* ================= HTML reutilizable ================= */
function artHTML(m, cls = 'art') {
  const src = COVERS.get(m.key) || m.art;
  if (src) return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" data-tint="${tintFor(m.title)}" onerror="sbArtFail(this)">`;
  return `<span class="${cls} ph" style="--tint:${tintFor(m.title)}">${icon('note')}</span>`;
}
window.sbArtFail = (img) => {
  const s = document.createElement('span');
  s.className = img.className + ' ph'; s.style.setProperty('--tint', img.dataset.tint || TINTS[0]);
  s.innerHTML = icon('note'); img.replaceWith(s);
};
function dlState(m) {
  if (m.src === 'own') return '';
  if (isLocal(m.key)) return `<span class="dl-state ok" title="${esc(t('downloaded'))}">${icon('check')}</span>`;
  if (DL.has(m.key)) return `<span class="dl-state busy" style="--p:${DL.get(m.key)}" title="${esc(t('downloading', { p: DL.get(m.key) }))}"><span class="ring"></span></span>`;
  if (canDownload(m)) return `<button class="icon-btn dl-btn" data-act="dl" data-key="${esc(m.key)}" aria-label="${esc(m.src === 'deezer' ? t('dlFromYT') : t('download'))}">${icon('download')}</button>`;
  return '';
}
function rowHTML(m, ctx, i, opts = {}) {
  const playing = P.cur()?.key === m.key;
  const isPrev = m.src === 'deezer' && !isLocal(m.key);
  const sub = [m.artist, isPrev ? '' : (m.duration ? fmtTime(m.duration) : '')].filter(Boolean).join(' · ');
  return `<div class="row${playing ? ' is-current' : ''}" data-key="${esc(m.key)}">
    ${opts.rank ? `<span class="rank">${i + 1}</span>` : ''}
    <button class="row-main" data-act="play" data-ctx="${esc(ctx)}" data-i="${i}">
      ${artHTML(m)}
      <span class="meta"><b>${esc(m.title)}</b><span>${isPrev ? '<em class="badge">30 s</em>' : ''}${isFav(m.key) ? icon('heart-fill', 'mini-heart') : ''}${esc(sub)}</span></span>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    ${dlState(m)}
    <button class="icon-btn" data-act="menu" data-key="${esc(m.key)}" data-ctx="${esc(ctx)}" data-i="${i}" aria-label="${esc(t('more'))}">${icon('more')}</button>
  </div>`;
}
function listHTML(list, ctx, opts = {}) {
  LISTS.set(ctx, list);
  return `<div class="list">${list.map((m, i) => rowHTML(m, ctx, i, opts)).join('')}</div>`;
}
function section(id, name, sub, list, ctx) {
  if (!list.length) return '';
  const rows = listHTML(list, ctx);
  LISTS.set(ctx, list);
  return `<section class="src-sec" id="sec-${id}"><div class="sec-h"><h2><span class="src-tag">${esc(name)}</span></h2><span class="muted sm">${esc(songsCount(list.length))}</span></div>
    <p class="sec-sub">${esc(sub)}</p>${rows}</section>`;
}
function cardHTML(m, ctx, i) {
  return `<div class="card${P.cur()?.key === m.key ? ' is-current' : ''}" data-key="${esc(m.key)}">
    <button class="card-main" data-act="play" data-ctx="${esc(ctx)}" data-i="${i}">
      ${artHTML(m, 'art')}<b>${esc(m.title)}</b><span>${esc(m.artist)}</span>
    </button>
    <button class="card-more" data-act="menu" data-key="${esc(m.key)}" data-ctx="${esc(ctx)}" data-i="${i}" aria-label="${esc(t('more'))}">${icon('more')}</button>
  </div>`;
}
const skeletonCards = (n = 5) => Array.from({ length: n }, () => '<div class="card sk"><span class="art"></span><b></b><span></span></div>').join('');
const skeletonRows = (n = 6) => `<div class="list">${Array.from({ length: n }, () => '<div class="row sk"><span class="art"></span><span class="meta"><b></b><span></span></span></div>').join('')}</div>`;
const emptyHTML = (txt, extra = '') => `<div class="empty">${icon('note')}<p>${esc(txt)}</p>${extra}</div>`;
function avatarHTML(u, size = '') {
  return `<span class="avatar ${size}${u.isAdmin ? ' is-admin' : ''}" style="--tint:${u.tint || tintFor(u.name)}">${esc((u.name || '?').trim().charAt(0).toUpperCase())}${u.isAdmin ? `<span class="admin-dot">${icon('shield')}</span>` : ''}</span>`;
}

/* ================= pantallas de inicio ================= */
function setRoot(html) { $('#root').innerHTML = html; }
function langSwitch(cur) {
  return `<div class="seg" role="group" aria-label="${esc(t('chooseLang'))}">
    <button type="button" data-act="set-lang" data-lang="es" aria-pressed="${cur === 'es'}">Español</button>
    <button type="button" data-act="set-lang" data-lang="eu" aria-pressed="${cur === 'eu'}">Euskara</button>
  </div>`;
}
const logoHTML = (big = false) => `<div class="logo${big ? ' big' : ''}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
const validPin = (p) => /^\d{4,6}$/.test(p);
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (crypto.subtle) { const d = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  return String(hashNum(salt + pin));
}

function showWelcome() {
  S.screen = 'welcome';
  setRoot(`<div class="screen welcome">
    ${logoHTML(true)}
    <h1 class="wordmark big">senorbak</h1>
    <p class="tagline">${esc(t('tagline'))}</p>
    <form class="panel" id="f-admin" autocomplete="off">
      <label class="lbl">${esc(t('chooseLang'))}</label>
      ${langSwitch(LANG)}
      <h2>${esc(t('adminTitle'))}</h2>
      <p class="muted">${esc(t('adminNote'))}</p>
      <label class="lbl" for="w-name">${esc(t('name'))}</label>
      <input class="input" id="w-name" maxlength="30" autocomplete="nickname">
      <label class="lbl" for="w-pin">${esc(t('pin'))}</label>
      <input class="input" id="w-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password">
      <label class="lbl" for="w-pin2">${esc(t('pinRepeat'))}</label>
      <input class="input" id="w-pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password">
      <p class="field-err" id="w-err" hidden></p>
      <button class="btn btn-chrome wide" type="submit">${esc(t('start'))}</button>
    </form>
  </div>`);
  $('#f-admin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#w-name').value.trim(), pin = $('#w-pin').value.trim(), pin2 = $('#w-pin2').value.trim();
    const err = !name ? t('nameRequired') : !validPin(pin) ? t('pinInvalid') : pin !== pin2 ? t('pinMismatch') : '';
    if (err) { const el = $('#w-err'); el.textContent = err; el.hidden = false; return; }
    const salt = newId();
    const u = { id: newId(), name, isAdmin: true, salt, pin: await hashPin(pin, salt), lang: LANG, theme: 'dark', prefs: null, createdAt: Date.now(), lastLogin: 0, logins: 0, tint: TINTS[0] };
    S.users.push(u); saveUsers();
    S.settings.lang = LANG; saveSettings();
    logEvent('profile', u.name, u);
    showOnboard(u);
  });
}

function showLogin() {
  S.screen = 'login';
  document.documentElement.dataset.theme = S.users[0]?.theme || 'dark';
  setRoot(`<div class="screen login">
    <div class="login-top">${logoHTML()}<span class="wordmark">senorbak</span></div>
    <h1>${esc(t('whoListens'))}</h1>
    <div class="profiles">
      ${S.users.map((u) => `<button class="profile" data-act="pick-profile" data-uid="${u.id}">${avatarHTML(u, 'xl')}<span>${esc(u.name)}</span></button>`).join('')}
      <button class="profile add" data-act="new-profile"><span class="avatar xl add">${icon('plus')}</span><span>${esc(t('addProfile'))}</span></button>
    </div>
    <div class="login-lang">${langSwitch(LANG)}</div>
  </div>`);
}

async function pickProfile(uid) {
  const u = S.users.find((x) => x.id === uid); if (!u) return;
  if (u.pin) {
    const v = await dialog({
      title: t('enterPin', { name: u.name }), ok: t('enter'),
      input: { type: 'password', numeric: true, max: 6, validate: () => '' },
    });
    if (v == null) return;
    if ((await hashPin(v, u.salt)) !== u.pin) return toast(t('wrongPin'));
  }
  enterApp(u, true);
}

function showNewProfile() {
  S.screen = 'newprofile';
  setRoot(`<div class="screen welcome">
    <form class="panel" id="f-new" autocomplete="off">
      <button type="button" class="back-link" data-act="to-login">${icon('back')}${esc(t('back'))}</button>
      <h2>${esc(t('newProfile'))}</h2>
      <label class="lbl" for="n-name">${esc(t('name'))}</label>
      <input class="input" id="n-name" maxlength="30">
      <label class="lbl" for="n-pin">${esc(t('pinOptional'))}</label>
      <input class="input" id="n-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password">
      <div class="notice">${icon('shield')}<p>${esc(t('adminNotice'))}</p></div>
      <label class="check"><input type="checkbox" id="n-ok"><span>${esc(t('understood'))}</span></label>
      <p class="field-err" id="n-err" hidden></p>
      <button class="btn btn-chrome wide" type="submit">${esc(t('create'))}</button>
    </form>
  </div>`);
  $('#f-new').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#n-name').value.trim(), pin = $('#n-pin').value.trim();
    const err = !name ? t('nameRequired')
      : S.users.some((u) => u.name.toLowerCase() === name.toLowerCase()) ? t('nameTaken')
        : pin && !validPin(pin) ? t('pinInvalid')
          : !$('#n-ok').checked ? t('mustAccept') : '';
    if (err) { const el = $('#n-err'); el.textContent = err; el.hidden = false; return; }
    const salt = newId();
    const u = { id: newId(), name, isAdmin: false, salt, pin: pin ? await hashPin(pin, salt) : null, lang: LANG, theme: S.users[0]?.theme || 'dark', prefs: null, createdAt: Date.now(), lastLogin: 0, logins: 0, tint: TINTS[S.users.length % TINTS.length] };
    S.users.push(u); saveUsers();
    logEvent('profile', u.name, u);
    showOnboard(u);
  });
}

/* preguntas al crear el usuario */
function showOnboard(u, edit = false) {
  S.screen = 'onboard';
  const ans = Object.assign({ genres: [], uses: [], energy: 'mid', discover: 'both', artists: '' }, u.prefs || {});
  let step = 0;
  const steps = ['genres', 'uses', 'energy', 'discover', 'artists'];
  const draw = () => {
    const key = steps[step];
    let body = '';
    if (key === 'genres') body = `<p class="muted">${esc(t('q_genresH'))}</p><div class="chips wrap">${GENRES.map((g) => `<button type="button" class="chip" data-g="${esc(g)}" aria-pressed="${ans.genres.includes(g)}">${esc(gLabel(g))}</button>`).join('')}</div>`;
    if (key === 'uses') body = `<p class="muted">${esc(t('q_usesH'))}</p><div class="chips wrap">${USES.map((x) => `<button type="button" class="chip" data-u="${x}" aria-pressed="${ans.uses.includes(x)}">${esc(t('use_' + x))}</button>`).join('')}</div>`;
    if (key === 'energy') body = `<div class="choices">${['calm', 'mid', 'high'].map((x) => `<button type="button" class="choice" data-e="${x}" aria-pressed="${ans.energy === x}"><span class="lvl lvl-${x}"><i></i><i></i><i></i></span>${esc(t('energy_' + x))}</button>`).join('')}</div>`;
    if (key === 'discover') body = `<div class="choices">${[['new', 'disc_new'], ['popular', 'disc_pop'], ['both', 'disc_both']].map(([v, k]) => `<button type="button" class="choice" data-d="${v}" aria-pressed="${ans.discover === v}">${esc(t(k))}</button>`).join('')}</div>`;
    if (key === 'artists') body = `<p class="muted">${esc(t('q_artistsH'))}</p><input class="input" id="ob-art" maxlength="120" placeholder="${esc(t('artistsPh'))}" value="${esc(ans.artists)}">`;
    setRoot(`<div class="screen onboard">
      <div class="ob-top"><span class="ob-count">${step + 1} / ${steps.length}</span><div class="ob-bar"><span style="width:${((step + 1) / steps.length) * 100}%"></span></div></div>
      <p class="eyebrow">${esc(t('obTitle'))}</p>
      <h1>${esc(t('q_' + key))}</h1>
      ${body}
      <p class="field-err" id="ob-err" hidden></p>
      <div class="ob-actions">
        ${step > 0 ? `<button type="button" class="btn btn-ghost" id="ob-back">${esc(t('back'))}</button>` : '<span></span>'}
        <button type="button" class="btn btn-chrome" id="ob-next">${esc(step === steps.length - 1 ? t('finish') : t('next'))}</button>
      </div>
    </div>`);
    $('#root').onclick = (e) => {
      const c = e.target.closest('.chip, .choice'); if (!c) return;
      if (c.dataset.g) { const g = c.dataset.g; ans.genres = ans.genres.includes(g) ? ans.genres.filter((x) => x !== g) : [...ans.genres, g]; c.setAttribute('aria-pressed', ans.genres.includes(g)); }
      if (c.dataset.u) { const x = c.dataset.u; ans.uses = ans.uses.includes(x) ? ans.uses.filter((y) => y !== x) : [...ans.uses, x]; c.setAttribute('aria-pressed', ans.uses.includes(x)); }
      if (c.dataset.e) { ans.energy = c.dataset.e; $$('.choice', $('#root')).forEach((b) => b.setAttribute('aria-pressed', b === c)); }
      if (c.dataset.d) { ans.discover = c.dataset.d; $$('.choice', $('#root')).forEach((b) => b.setAttribute('aria-pressed', b === c)); }
    };
    $('#ob-back')?.addEventListener('click', () => { step--; draw(); });
    $('#ob-next').addEventListener('click', () => {
      if ((key === 'genres' && !ans.genres.length) || (key === 'uses' && !ans.uses.length)) { const el = $('#ob-err'); el.textContent = t('pickOne'); el.hidden = false; return; }
      if (key === 'artists') ans.artists = $('#ob-art').value.trim();
      if (step < steps.length - 1) { step++; draw(); return; }
      $('#root').onclick = null;
      u.prefs = ans; saveUsers();
      HOME_CACHE.clear();
      if (edit && S.me) { S.me = u; mountApp(); UI.tab = 'home'; UI.stack = []; renderView(); } else enterApp(u, !u.lastLogin);
    });
  };
  draw();
}

/* ================= entrar en la app ================= */
async function enterApp(u, explicit = false) {
  S.me = u; LANG = u.lang || S.settings.lang || 'es';
  document.documentElement.lang = LANG;
  document.documentElement.dataset.theme = u.theme || 'dark';
  S.lib = loadLib(u.id);
  Object.values(S.lib.tracks).forEach((m) => TRACKS.set(m.key, m));
  const now = Date.now();
  if (explicit || now - (u.lastLogin || 0) > 30 * 60000) { u.logins = (u.logins || 0) + 1; logEvent('login', explicit ? '' : 'auto'); }
  u.lastLogin = now; saveUsers();
  LS.set('session', u.id);
  if (!u.prefs) return showOnboard(u);
  await hydrateCovers();
  restorePlayer();
  UI.tab = 'home'; UI.stack = []; UI.search = { q: '', onlyDl: false, genre: '', results: null, loading: false, error: false, lastLogged: '' };
  HOME_CACHE.clear();
  mountApp();
  renderView();
  refreshChart().then(() => { if (UI.tab === 'top' && !UI.stack.length) renderView(); });
}
async function logout() {
  P.audio.pause(); savePlayer();
  while (LAYERS.length) await closeTop();
  LS.del('session'); S.me = null; S.lib = null; UI.admin = { type: 'all', user: '', unlockedAt: 0 };
  showLogin();
}

function mountApp() {
  S.screen = 'app';
  setRoot(`<div class="app">
    <header class="topbar">
      <button class="brand" data-act="tab" data-tab="home" aria-label="senorbak">${logoHTML()}<span class="wordmark">senorbak</span></button>
      <span class="top-title" id="top-title"></span>
      <button class="avatar-btn" data-act="open-settings" aria-label="${esc(t('settings'))}">${avatarHTML(S.me)}</button>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <div id="mini" class="mini" hidden>
      <button class="mini-main" data-act="open-player">
        <span id="mini-art"></span>
        <span class="meta"><b id="mini-t"></b><span id="mini-a"></span></span>
      </button>
      <button class="icon-btn" data-act="toggle" id="mini-play" aria-label="${esc(t('play'))}">${icon('play')}</button>
      <button class="icon-btn" data-act="next" aria-label="${esc(t('nextTrack'))}">${icon('next')}</button>
      <span class="mini-prog"><span id="mini-prog"></span></span>
    </div>
    <nav class="tabs" aria-label="senorbak">
      ${['home', 'search', 'top', 'library'].map((x) => `<button class="tab" data-act="tab" data-tab="${x}">${icon({ home: 'home', search: 'search', top: 'top', library: 'library' }[x])}<span>${esc(t('tab_' + x))}</span></button>`).join('')}
    </nav>
  </div>
  ${playerShellHTML()}`);
  $('#view').addEventListener('scroll', (e) => { UI.scroll[viewKey()] = e.currentTarget.scrollTop; }, { passive: true });
  updatePlayerUI();
}
const viewKey = () => (UI.stack.length ? JSON.stringify(UI.stack[UI.stack.length - 1]) : 'tab:' + UI.tab);

/* ================= vistas ================= */
function renderView(keepScroll = true) {
  if (S.screen !== 'app') return;
  const top = UI.stack[UI.stack.length - 1];
  const v = $('#view');
  if (top) v.innerHTML = renderPage(top);
  else v.innerHTML = { home: renderHome, search: renderSearch, top: renderTop, library: renderLibrary }[UI.tab]();
  $$('.tab').forEach((b) => b.setAttribute('aria-current', !top && b.dataset.tab === UI.tab ? 'page' : 'false'));
  v.scrollTop = keepScroll ? (UI.scroll[viewKey()] || 0) : 0;
  afterRender();
}
function afterRender() {
  if (UI.stack.length) return;
  if (UI.tab === 'home') loadHome();
  if (UI.tab === 'search') bindSearch();
  if (UI.tab === 'top' && (!S.chart || Date.now() - S.chart.ts > (S.settings.chartHours || 6) * 3600000)) {
    refreshChart().then(() => { if (UI.tab === 'top' && !UI.stack.length) renderView(); });
  }
  if (UI.tab === 'library' && UI.libTab === 'downloads') storageUsed().then((b) => { const el = $('#storage-used'); if (el) el.textContent = t('storageUsed', { size: fmtBytes(b) }); });
}
function refreshAfterLibChange() {
  if (S.screen !== 'app') return;
  const top = UI.stack[UI.stack.length - 1];
  if (top || UI.tab === 'library') renderView();
  else { $$('.row[data-key]').forEach(updateRowState); }
  updatePlayerUI();
}
function updateRowState(row) {
  const m = getTrack(row.dataset.key); if (!m) return;
  const old = row.querySelector('.dl-state, .dl-btn');
  const html = dlState(m);
  const menuBtn = row.querySelector('[data-act="menu"]');
  if (old) { if (html) old.outerHTML = html; else old.remove(); } else if (html && menuBtn) menuBtn.insertAdjacentHTML('beforebegin', html);
  const meta = row.querySelector('.meta > span');
  if (meta) {
    const has = !!meta.querySelector('.mini-heart');
    if (isFav(m.key) && !has) meta.insertAdjacentHTML('afterbegin', icon('heart-fill', 'mini-heart'));
    if (!isFav(m.key) && has) meta.querySelector('.mini-heart').remove();
    const badge = meta.querySelector('.badge');
    if (badge && isLocal(m.key)) badge.remove();
  }
}
function refreshDlUI(k) {
  $$(`.row[data-key="${CSS.escape(k)}"]`).forEach(updateRowState);
  if (P.cur()?.key === k) updatePlayerUI();
}
function markPlaying() {
  const k = P.cur()?.key;
  $$('.row[data-key], .card[data-key]').forEach((el) => el.classList.toggle('is-current', el.dataset.key === k));
}

/* --- inicio --- */
function installBannerHTML() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || LS.get('installHidden', false)) return '';
  return `<div class="banner install">${logoHTML()}<div class="banner-text"><b>${esc(t('installTitle'))}</b>${deferredInstall ? '' : `<span>${esc(t('installHow'))}</span>`}</div>
    ${deferredInstall ? `<button class="btn btn-chrome sm" data-act="install">${esc(t('installDo'))}</button>` : ''}
    <button class="icon-btn" data-act="hide-install" aria-label="${esc(t('close'))}">${icon('close')}</button></div>`;
}
function homeSections() {
  const p = S.me.prefs || {};
  const out = [];
  const hist = libList(S.lib.history).slice(0, 15);
  if (hist.length) out.push({ id: 'hist', title: t('continueListening'), load: async () => hist });
  out.push({ id: 'top', title: t('worldTop'), more: 'go-top', load: async () => ((await refreshChart())?.items || []).slice(0, 15) });
  const genres = (p.genres || []).slice(0, 3);
  const time = p.discover === 'new' ? 'month' : 'week';
  genres.forEach((g) => out.push({ id: 'g-' + g, title: t('trendingGenre', { genre: gLabel(g) }), load: () => audius('/tracks/trending', { genre: g, time, limit: 30 }).then(mapAudius) }));
  if (p.discover !== 'popular') out.push({ id: 'under', title: t('hiddenGems'), load: () => audius('/tracks/trending/underground', { limit: 30 }).then(mapAudius) });
  (p.uses || []).slice(0, 2).forEach((x) => out.push({ id: 'u-' + x, title: t('sec_' + x), load: () => audius('/tracks/search', { query: USE_KW[x], limit: 30 }).then(mapAudius) }));
  if (genres[0]) out.push({ id: 'mix', title: t('yourMix'), load: () => audius('/tracks/search', { query: genreKw(genres[0]), mood: ENERGY_MOOD[p.energy || 'mid'], limit: 30 }).then(mapAudius) });
  const artist = (p.artists || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  if (artist) out.push({ id: 'art', title: t('becauseLike', { name: artist }), load: () => audius('/tracks/search', { query: artist, limit: 30 }).then(mapAudius) });
  out.push({ id: 'free', title: t('freeDownloads'), load: () => audius('/tracks/search', { query: genreKw(genres[0]), has_downloads: 'true', limit: 30 }).then(mapAudius).then((l) => l.filter((m) => m.downloadable)) });
  return out;
}
let homeSecs = [];
function renderHome() {
  const h = new Date().getHours();
  const greet = h < 6 ? t('goodNight') : h < 13 ? t('goodMorning') : h < 21 ? t('goodAfternoon') : t('goodNight');
  homeSecs = homeSections();
  return `${!navigator.onLine ? `<div class="banner">${icon('cloud-off')}<div class="banner-text"><span>${esc(t('offlineBanner'))}</span></div></div>` : ''}
    ${installBannerHTML()}
    <h1 class="greet">${esc(greet)}, ${esc(S.me.name)}</h1>
    ${homeSecs.map((s) => {
      const c = HOME_CACHE.get(s.id);
      const fresh = c && Date.now() - c.ts < 30 * 60000;
      return `<section class="sec" id="sec-${esc(s.id)}"${fresh && !c.list.length ? ' hidden' : ''}>
        <div class="sec-h"><h2>${esc(s.title)}</h2>${s.more ? `<button class="link" data-act="${s.more}">${esc(t('seeAll'))}</button>` : ''}</div>
        <div class="scroller">${fresh ? c.list.map((m, i) => cardHTML(m, 'home:' + s.id, i)).join('') : skeletonCards()}</div>
      </section>`;
    }).join('')}
    <p class="fine">${esc(t('sourcesNote'))}</p>`;
}
function loadHome() {
  for (const s of homeSecs) {
    const c = HOME_CACHE.get(s.id);
    if (c && Date.now() - c.ts < 30 * 60000) { LISTS.set('home:' + s.id, c.list); continue; }
    if (!navigator.onLine && s.id !== 'hist') { const el = $(`#sec-${CSS.escape(s.id)}`); if (el) el.hidden = true; continue; }
    s.load().then((list) => {
      list = list.slice(0, 20);
      HOME_CACHE.set(s.id, { ts: Date.now(), list });
      fillSection(s.id, list);
    }).catch(() => {
      const el = $(`#sec-${CSS.escape(s.id)} .scroller`);
      if (el) el.innerHTML = `<div class="sec-err">${esc(t('loadError'))} <button class="link" data-act="retry-home">${esc(t('retry'))}</button></div>`;
    });
  }
}
function fillSection(id, list) {
  if (UI.tab !== 'home' || UI.stack.length) return;
  const sec = $(`#sec-${CSS.escape(id)}`); if (!sec) return;
  if (!list.length) { sec.hidden = true; return; }
  LISTS.set('home:' + id, list);
  $('.scroller', sec).innerHTML = list.map((m, i) => cardHTML(m, 'home:' + id, i)).join('');
}

/* --- buscar --- */
function renderSearch() {
  const s = UI.search;
  return `<div class="search-head">
      <label class="searchbar">${icon('search')}
        <input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(t('searchPh'))}" value="${esc(s.q)}" aria-label="${esc(t('tab_search'))}">
        <button class="icon-btn clear" data-act="clear-q" aria-label="${esc(t('close'))}" ${s.q ? '' : 'hidden'}>${icon('close')}</button>
      </label>
      <div class="chips scroll">
        <button class="chip" data-act="toggle-onlydl" aria-pressed="${s.onlyDl}">${icon('download')}${esc(t('onlyDl'))}</button>
        <button class="chip" data-act="genre" data-g="" aria-pressed="${!s.genre}">${esc(t('allGenres'))}</button>
        ${GENRES.map((g) => `<button class="chip" data-act="genre" data-g="${esc(g)}" aria-pressed="${s.genre === g}">${esc(gLabel(g))}</button>`).join('')}
      </div>
    </div>
    <div id="results">${searchResultsHTML()}</div>`;
}

function searchResultsHTML() {
  const s = UI.search;
  if (!s.q && !s.genre) {
    const recent = S.lib.recent || [];
    return `${recent.length ? `<div class="sec-h"><h2>${esc(t('recent'))}</h2><button class="link" data-act="clear-recent">${esc(t('clearRecent'))}</button></div>
      <div class="chips wrap">${recent.map((q) => `<button class="chip" data-act="recent-q" data-q="${esc(q)}">${icon('search')}${esc(q)}</button>`).join('')}</div>` : ''}
      <div class="sec-h"><h2>${esc(t('browse'))}</h2></div>
      <div class="tiles">${GENRES.map((g) => `<button class="tile" data-act="genre" data-g="${esc(g)}" style="--tint:${tintFor(g)}"><span>${esc(gLabel(g))}</span></button>`).join('')}</div>
      <p class="fine">${esc(t('sourcesNote'))}</p>`;
  }

  const q = s.q.trim();
  if (s.loading && !s.results) return `<p class="muted pad">${esc(t('searching'))}</p>${skeletonRows()}`;
  if (s.error) return `<div class="empty">${icon('cloud-off')}<p>${esc(navigator.onLine ? t('loadError') : t('needOnline'))}</p><button class="btn" data-act="retry-search">${esc(t('retry'))}</button></div>`;

  const auList = s.results?.free ? s.results.free.filter((m) => m.src === 'audius') : null;
  const jmList = s.results?.free ? s.results.free.filter((m) => m.src === 'jamendo') : null;
  const dzList = s.results?.catalog;
  
  const allDone = s.results?.yt !== null && s.results?.catalog !== null && s.results?.free !== null;
  const allEmpty = allDone && !(s.results?.yt?.length) && !(dzList?.length) && !(s.results?.free?.length);

  if (allEmpty && s.results?.yt !== false) {
    const ytExtLink = q ? `<section class="src-sec"><div class="sec-h"><h2><span class="src-tag">YouTube</span></h2></div>
      <p class="sec-sub">${esc(t('secYouTubeH'))}</p>
      <a class="yt-row" href="https://www.youtube.com/results?search_query=${encodeURIComponent(q)}" target="_blank" rel="noopener">${icon('external')}<span>${esc(t('searchYouTube', { q }))}</span>${icon('chevron-right')}</a></section>` : '';
    return `<div class="empty">${icon('search')}<p>${esc(t('noResults', { q: q || gLabel(s.genre) }))}</p><p class="muted">${esc(t('noResultsH'))}</p></div>${ytExtLink}`;
  }

  let ytHTML = '';
  if (s.results?.yt === false) {
    ytHTML = `<section class="src-sec"><div class="sec-h"><h2><span class="src-tag">YouTube</span></h2></div><p class="sec-sub">${esc(t('secYouTubeH'))}</p><div class="notice slim" style="margin-bottom:18px">${icon('cloud-off')}<span>No se ha podido conectar con el servidor yt-dlp en: <b>${esc(backendUrl())}</b>. Asegúrate de que está subido a la nube y configurado en los Ajustes de Administración.</span></div></section>`;
  } else if (s.results?.yt === null && !s.genre) {
    ytHTML = `<section class="src-sec"><div class="sec-h"><h2><span class="src-tag">YouTube</span></h2></div><p class="sec-sub">${esc(t('secYouTubeH'))}</p>${skeletonRows(3)}</section>`;
  } else if (s.results?.yt?.length) {
    ytHTML = section('yt', 'YouTube', t('secYouTubeH'), s.results.yt, 'search-yt');
  }

  const auHTML = section('au', 'Audius', q ? t('srcAudiusH') : t('trendingIn', { genre: gLabel(s.genre) }), auList || [], 'search');
  const dzHTML = section('dz', 'Deezer', t('srcDeezerH'), dzList || [], 'search-cat');
  const jmHTML = section('jm', 'Jamendo', t('srcJamendoH'), jmList || [], 'search-jm');

  return `${ytHTML}${auHTML}${dzHTML}${jmHTML}<p class="fine">${esc(t('sourcesNote'))}</p>`;
}

function bindSearch() {
  const inp = $('#q'); if (!inp) return;
  if (!UI.search.q && !UI.search.genre && !UI.searchFocused) { UI.searchFocused = true; }
  inp.addEventListener('input', () => {
    UI.search.q = inp.value;
    $('.clear', inp.parentElement).hidden = !inp.value;
    debouncedSearch();
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); runSearch(true); } });
}

const debouncedSearch = debounce(() => runSearch(false), 450);
let searchSeq = 0;
async function runSearch(commit) {
  const s = UI.search;
  const q = s.q.trim();
  const box = $('#results');
  if (!q && !s.genre) { s.results = null; s.error = false; s.loading = false; if (box) box.innerHTML = searchResultsHTML(); return; }
  if (q && q.length < 2 && !commit) return;
  const seq = ++searchSeq;
  s.loading = true; s.error = false; s.open = {};
  
  // Ponemos los 3 buscadores a nulo para que la interfaz sepa que están cargando
  s.results = { yt: null, catalog: null, free: null };
  if (box) box.innerHTML = searchResultsHTML();

  const refreshHTML = () => { if (seq === searchSeq && UI.tab === 'search' && !UI.stack.length && $('#results')) $('#results').innerHTML = searchResultsHTML(); };

  if (q) {
    // 1. Lanzamos YouTube por su lado (asíncrono puro)
    if (!s.genre) {
      searchYouTubeAPI(q).then(r => { if(seq===searchSeq) { s.results.yt = r || []; refreshHTML(); } })
        .catch(() => { if(seq===searchSeq) { s.results.yt = false; refreshHTML(); } });
    } else {
      s.results.yt = []; refreshHTML();
    }
    
    // 2. Lanzamos Deezer por su lado
    searchCatalog(q).then(r => { if(seq===searchSeq) { s.results.catalog = r || []; refreshHTML(); } })
      .catch(() => { if(seq===searchSeq) { s.results.catalog = []; refreshHTML(); } });
      
    // 3. Lanzamos Audius (Cuando responda, quitamos el loading general)
    searchSongs(q, { onlyDl: s.onlyDl, genre: s.genre }).then(r => {
       if(seq===searchSeq) {
         s.results.free = r || [];
         s.loading = false;
         refreshHTML();
         if (q.toLowerCase() !== s.lastLogged) {
           s.lastLogged = q.toLowerCase();
           logEvent('search', q + (s.genre ? ` [${s.genre}]` : '') + (s.onlyDl ? ' [dl]' : ''));
           S.lib.recent = [q, ...(S.lib.recent || []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10);
           saveLib();
         }
       }
    }).catch(() => { if(seq===searchSeq) { s.results.free = []; s.loading = false; s.error = true; refreshHTML(); } });

  } else {
    // Búsquedas de solo género (solo Audius)
    s.results.yt = []; s.results.catalog = [];
    audius('/tracks/trending', { genre: s.genre, time: 'week', limit: 50 }).then(list => {
      let mapped = mapAudius(list);
      if (s.onlyDl) mapped = mapped.filter((m) => m.downloadable);
      if(seq===searchSeq) { s.results.free = mapped; s.loading = false; refreshHTML(); }
    }).catch(() => { if(seq===searchSeq) { s.results.free = []; s.loading = false; s.error = true; refreshHTML(); } });
  }
}

/* --- top --- */
function renderTop() {
  const c = S.chart;
  const h = S.settings.chartHours || 6;
  if (!c) return `<h1 class="page-title">${esc(t('topTitle'))}</h1>${navigator.onLine ? skeletonRows(10) : emptyHTML(t('topEmpty'))}`;
  return `<div class="page-head">
      <h1 class="page-title">${esc(t('topTitle'))}</h1>
      <p class="muted sm">${esc(t('topMeta', { n: c.items.length, ago: ago(c.ts) }))} · ${esc(t('topEvery', { h }))}</p>
      <div class="actions">
        <button class="btn btn-chrome" data-act="play-list" data-ctx="top">${icon('play')}${esc(c.src === 'deezer' ? t('playPreviews') : t('playAll'))}</button>
        <button class="icon-btn outline" data-act="refresh-top" aria-label="${esc(t('refresh'))}">${icon('refresh')}</button>
      </div>
    </div>
    ${c.src === 'deezer' ? `<p class="notice slim">${icon('lock')}<span>${esc(t('topNote'))}</span></p>` : `<p class="notice slim">${esc(t('topFallback'))}</p>`}
    ${listHTML(c.items, 'top', { rank: true })}
    <p class="fine">${esc(c.src === 'deezer' ? t('topSource') : t('topSourceAudius'))}</p>`;
}

/* --- biblioteca --- */
function renderLibrary() {
  const L = S.lib;
  const tabs = [['favs', t('favorites'), L.favs.length], ['downloads', t('downloads'), L.downloads.length], ['own', t('myMusic'), L.own.length], ['playlists', t('playlists'), L.playlists.length]];
  let body = '';
  if (UI.libTab === 'favs') {
    const list = libList(L.favs);
    body = list.length ? `${playBar('favs')}${listHTML(list, 'favs')}` : emptyHTML(t('emptyFavs'));
  } else if (UI.libTab === 'downloads') {
    const list = libList(L.downloads);
    body = list.length ? `<p class="muted sm" id="storage-used">&nbsp;</p>${playBar('downloads')}${listHTML(list, 'downloads')}` : emptyHTML(t('emptyDownloads'));
  } else if (UI.libTab === 'own') {
    const list = libList(L.own);
    body = `<label class="upload">${icon('upload')}<span><b>${esc(t('addSongs'))}</b><small>${esc(t('addSongsH'))}</small></span>
        <input type="file" id="own-files" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus" multiple></label>
      ${list.length ? `${playBar('own')}${listHTML(list, 'own')}` : emptyHTML(t('emptyOwn'))}`;
  } else {
    body = `<button class="btn wide" data-act="new-playlist">${icon('plus')}${esc(t('newPlaylist'))}</button>
      ${L.playlists.length ? `<div class="pl-grid">${L.playlists.map((p) => playlistCardHTML(p)).join('')}</div>` : emptyHTML(t('emptyPlaylists'))}`;
  }
  return `<h1 class="page-title">${esc(t('tab_library'))}</h1>
    <div class="seg lib-seg" role="tablist">${tabs.map(([k, label, n]) => `<button role="tab" data-act="lib-tab" data-t="${k}" aria-selected="${UI.libTab === k}" aria-pressed="${UI.libTab === k}">${esc(label)}<small>${n}</small></button>`).join('')}</div>
    ${body}`;
}
function playBar(ctx) {
  return `<div class="actions"><button class="btn btn-chrome" data-act="play-list" data-ctx="${ctx}">${icon('play')}${esc(t('playAll'))}</button>
    <button class="btn" data-act="shuffle-list" data-ctx="${ctx}">${icon('shuffle')}${esc(t('shuffleAll'))}</button></div>`;
}
function mosaicHTML(keys) {
  const arts = libList(keys).slice(0, 4);
  if (!arts.length) return `<span class="mosaic empty">${icon('note')}</span>`;
  if (arts.length < 4) return `<span class="mosaic one">${artHTML(arts[0], 'm')}</span>`;
  return `<span class="mosaic">${arts.map((m) => artHTML(m, 'm')).join('')}</span>`;
}
function playlistCardHTML(p) {
  return `<button class="pl-card" data-act="open-playlist" data-id="${p.id}">${mosaicHTML(p.keys)}<b>${esc(p.name)}</b><span>${esc(songsCount(p.keys.length))}</span></button>`;
}

/* --- páginas apiladas --- */
function renderPage(pg) {
  if (pg.type === 'playlist') {
    const p = S.lib.playlists.find((x) => x.id === pg.id);
    if (!p) return emptyHTML(t('empty'));
    const list = libList(p.keys);
    return `${backBar()}
      <div class="pl-hero">${mosaicHTML(p.keys)}<div><p class="eyebrow">${esc(t('playlists'))}</p><h1 class="page-title">${esc(p.name)}</h1><p class="muted sm">${esc(songsCount(list.length))}</p></div></div>
      <div class="actions">${list.length ? `<button class="btn btn-chrome" data-act="play-list" data-ctx="pl:${p.id}">${icon('play')}${esc(t('playAll'))}</button><button class="icon-btn outline" data-act="shuffle-list" data-ctx="pl:${p.id}" aria-label="${esc(t('shuffleAll'))}">${icon('shuffle')}</button>` : ''}
        <button class="icon-btn outline" data-act="rename-playlist" data-id="${p.id}" aria-label="${esc(t('rename'))}">${icon('edit')}</button>
        <button class="icon-btn outline" data-act="delete-playlist" data-id="${p.id}" aria-label="${esc(t('del'))}">${icon('trash')}</button></div>
      ${list.length ? listHTML(list, 'pl:' + p.id) : emptyHTML(t('emptyPlaylist'))}`;
  }
  if (pg.type === 'settings') return renderSettings();
  if (pg.type === 'admin') return renderAdmin();
  return '';
}
const backBar = () => `<button class="back-link" data-act="back">${icon('back')}${esc(t('back'))}</button>`;
function openPage(pg) {
  UI.stack.push(pg);
  pushLayer(() => { UI.stack.pop(); renderView(); });
  renderView(false);
}

/* --- ajustes --- */
function renderSettings() {
  const u = S.me;
  const segBtn = (act, val, cur, label) => `<button data-act="${act}" data-v="${val}" aria-pressed="${cur === val}">${esc(label)}</button>`;
  return `${backBar()}
    <div class="me-card">${avatarHTML(u, 'lg')}<div><h1 class="page-title">${esc(u.name)}</h1><p class="muted sm">${esc(u.isAdmin ? t('admin') : t('profile'))}</p></div></div>
    <div class="group">
      <div class="set-row"><span>${esc(t('language'))}</span><div class="seg sm">${segBtn('set-lang', 'es', LANG, 'Español')}${segBtn('set-lang', 'eu', LANG, 'Euskara')}</div></div>
      <div class="set-row"><span>${esc(t('theme'))}</span><div class="seg sm">${['dark', 'light', 'system'].map((x) => segBtn('set-theme', x, u.theme || 'dark', t('theme_' + x))).join('')}</div></div>
      <label class="set-row"><span>${esc(t('hideMixes'))}<small>${esc(t('hideMixesH'))}</small></span><input type="checkbox" class="switch" id="set-hide" ${S.settings.hideMixes ? 'checked' : ''}></label>
    </div>
    <div class="group">
      <button class="set-row link-row" data-act="edit-tastes"><span>${esc(t('myTastes'))}<small>${esc((u.prefs?.genres || []).map(gLabel).join(', '))}</small></span>${icon('chevron-right')}</button>
      <button class="set-row link-row" data-act="change-pin"><span>${esc(u.pin ? t('changePin') : t('setPin'))}</span>${icon('chevron-right')}</button>
      ${u.pin && !u.isAdmin ? `<button class="set-row link-row" data-act="remove-pin"><span>${esc(t('removePin'))}</span>${icon('chevron-right')}</button>` : ''}
      ${deferredInstall ? `<button class="set-row link-row" data-act="install"><span>${esc(t('installTitle'))}</span>${icon('download')}</button>` : ''}
    </div>
    ${u.isAdmin ? `<h2 class="group-title">${esc(t('adminSection'))}</h2>
    <div class="group">
      <button class="set-row link-row" data-act="open-admin"><span>${icon('shield')}${esc(t('adminPanel'))}</span>${icon('chevron-right')}</button>
      <div class="set-row"><span>${esc(t('topInterval'))}</span><div class="seg sm">${[1, 6, 12, 24].map((h) => segBtn('set-chart-h', String(h), String(S.settings.chartHours), t('hours', { n: h }))).join('')}</div></div>
      <div class="set-col"><label for="set-jam">${esc(t('jamendo'))}</label><input class="input" id="set-jam" value="${esc(S.settings.jamendoId)}" autocomplete="off" spellcheck="false"><small class="muted">${esc(t('jamendoH'))}</small></div>
      <div class="set-col"><label for="set-ytapi">Servidor yt-dlp (URL del backend)</label><input class="input" id="set-ytapi" placeholder="http://localhost:3000" value="${esc(S.settings.ytApi)}" autocomplete="off" spellcheck="false"><small class="muted">Tu servidor donde alojas yt-dlp.</small></div>
    </div>` : ''}
    <div class="group">
      <button class="set-row link-row" data-act="switch-profile"><span>${esc(t('switchProfile'))}</span>${icon('user')}</button>
      <button class="set-row link-row" data-act="logout"><span>${esc(t('logout'))}</span>${icon('logout')}</button>
    </div>
    <p class="fine">${esc(t('about', { v: VERSION, j: S.settings.jamendoId ? ' + Jamendo' : '' }))}<br>${esc(t('localNote'))}</p>`;
}

/* --- panel de administración --- */
function renderAdmin() {
  if (!S.me?.isAdmin) return emptyHTML(t('adminOnly'));
  const log = LS.get('log', []);
  const since = Date.now() - 7 * 86400000;
  const recent = log.filter((e) => e.ts >= since);
  const count = (type) => recent.filter((e) => e.type === type).length;
  const A = UI.admin;
  const filtered = log.filter((e) => (A.type === 'all' || e.type === A.type) && (!A.user || e.u === A.user)).slice(-300).reverse();
  const ev = { login: 'user', search: 'search', download: 'download', play: 'play', import: 'upload', playlist: 'plus', profile: 'user' };
  const tops = {};
  log.filter((e) => e.type === 'search' && (!A.user || e.u === A.user)).forEach((e) => { const q = e.d.replace(/\s*\[.*?\]/g, '').toLowerCase(); tops[q] = (tops[q] || 0) + 1; });
  const topList = Object.entries(tops).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const userStats = (uid) => ({ s: log.filter((e) => e.u === uid && e.type === 'search').length, d: log.filter((e) => e.u === uid && e.type === 'download').length, p: log.filter((e) => e.u === uid && e.type === 'play').length });
  return `${backBar()}
    <p class="eyebrow">${icon('shield')}${esc(t('admin'))}</p>
    <h1 class="page-title">${esc(t('adminPanel'))}</h1>
    <p class="muted sm">${esc(t('last7'))}</p>
    <div class="stats">
      <div class="stat"><b>${S.users.length}</b><span>${esc(t('statProfiles'))}</span></div>
      <div class="stat"><b>${count('search')}</b><span>${esc(t('statSearches'))}</span></div>
      <div class="stat"><b>${count('download')}</b><span>${esc(t('statDownloads'))}</span></div>
      <div class="stat"><b>${count('play')}</b><span>${esc(t('statPlays'))}</span></div>
    </div>
    <h2 class="group-title">${esc(t('profilesH'))}</h2>
    <div class="group">
      ${S.users.map((u) => { const st = userStats(u.id); return `<div class="user-row${A.user === u.id ? ' sel' : ''}">
        <button class="user-main" data-act="admin-user" data-uid="${u.id}">${avatarHTML(u)}<span class="meta"><b>${esc(u.name)}${u.id === S.me.id ? ` <small>(${esc(t('you'))})</small>` : ''}</b>
          <span>${esc(t('lastSeen', { when: whenLabel(u.lastLogin) }))} · ${esc((u.logins || 0) === 1 ? t('login1') : t('loginsN', { n: u.logins || 0 }))}</span>
          <span class="nums">${icon('search')}${st.s} ${icon('download')}${st.d} ${icon('play')}${st.p}</span></span></button>
        ${u.id !== S.me.id ? `<button class="icon-btn" data-act="admin-user-menu" data-uid="${u.id}" aria-label="${esc(t('more'))}">${icon('more')}</button>` : ''}
      </div>`; }).join('')}
    </div>
    ${topList.length ? `<h2 class="group-title">${esc(t('topSearches'))}</h2><div class="chips wrap">${topList.map(([q, n]) => `<span class="chip static">${esc(q)}<small>${n}</small></span>`).join('')}</div>` : ''}
    <div class="sec-h"><h2>${esc(t('activity'))}</h2><span class="muted sm">${A.user ? esc(S.users.find((u) => u.id === A.user)?.name || '') : esc(t('allProfiles'))}</span></div>
    <div class="chips scroll">
      ${A.user ? `<button class="chip" data-act="admin-user" data-uid="">${icon('close')}${esc(t('allProfiles'))}</button>` : ''}
      ${['all', 'login', 'search', 'download', 'play', 'import'].map((x) => `<button class="chip" data-act="admin-type" data-v="${x}" aria-pressed="${A.type === x}">${esc(t('f_' + x))}</button>`).join('')}
    </div>
    <div class="feed">${filtered.length ? filtered.map((e) => `<div class="ev ev-${e.type}">${icon(ev[e.type] || 'note')}
      <span class="meta"><b>${esc(e.n)} <span>${esc(t('ev_' + e.type))}</span></b>${e.d && e.d !== 'auto' ? `<span>${esc(e.d)}</span>` : ''}</span>
      <time>${esc(whenLabel(e.ts))}</time></div>`).join('') : `<p class="muted pad">${esc(t('noActivity'))}</p>`}</div>
    <div class="actions">
      <button class="btn" data-act="export-csv">${icon('download')}${esc(t('exportCsv'))}</button>
      <button class="btn btn-danger-ghost" data-act="clear-log">${icon('trash')}${esc(t('clearLog'))}</button>
    </div>
    <p class="fine">${esc(t('localNote'))}</p>`;
}
async function openAdmin() {
  if (!S.me.isAdmin) return;
  if (Date.now() - UI.admin.unlockedAt > 5 * 60000) {
    const v = await dialog({ title: t('adminPinQ'), ok: t('enter'), input: { type: 'password', numeric: true, max: 6 } });
    if (v == null) return;
    if ((await hashPin(v, S.me.salt)) !== S.me.pin) return toast(t('wrongPin'));
    UI.admin.unlockedAt = Date.now();
  }
  openPage({ type: 'admin' });
}
function exportCsv() {
  const log = LS.get('log', []);
  const rows = [['fecha', 'perfil', 'tipo', 'detalle'], ...log.map((e) => [new Date(e.ts).toISOString(), e.n, e.type, e.d])];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  a.download = `senorbak-actividad-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ================= reproductor a pantalla completa ================= */
function playerShellHTML() {
  return `<section id="player" class="player" hidden aria-label="${esc(t('nowPlaying'))}">
    <div class="pl-bg" id="pl-bg"></div>
    <div class="pl-inner">
      <header class="pl-head">
        <button class="icon-btn" data-act="close-player" aria-label="${esc(t('close'))}">${icon('chevron-down')}</button>
        <div class="pl-ctx"><small>${esc(t('nowPlaying'))}</small><b id="pl-ctx"></b></div>
        <button class="icon-btn" data-act="open-queue" aria-label="${esc(t('queue'))}">${icon('queue')}</button>
      </header>
      <div class="pl-art" id="pl-art"></div>
      <div class="pl-title">
        <div class="meta"><b id="pl-t"></b><span id="pl-a"></span></div>
        <button class="icon-btn" data-act="pl-fav" id="pl-fav" aria-label="${esc(t('addFav'))}">${icon('heart')}</button>
        <span id="pl-dl"></span>
      </div>
      <div class="pl-full" id="pl-full" hidden></div>
      <div class="pl-seek">
        <input id="pl-range" type="range" min="0" max="1000" step="1" value="0" aria-label="${esc(t('nowPlaying'))}">
        <div class="pl-times"><span id="pl-cur">0:00</span><span id="pl-dur">0:00</span></div>
      </div>
      <div class="pl-ctrls">
        <button class="icon-btn" data-act="shuffle" id="pl-shuf" aria-label="${esc(t('shuffle'))}">${icon('shuffle')}</button>
        <button class="icon-btn lg" data-act="prev" aria-label="${esc(t('prev'))}">${icon('prev')}</button>
        <button class="play-big" data-act="toggle" id="pl-play" aria-label="${esc(t('play'))}">${icon('play')}</button>
        <button class="icon-btn lg" data-act="next" aria-label="${esc(t('nextTrack'))}">${icon('next')}</button>
        <button class="icon-btn" data-act="repeat" id="pl-rep" aria-label="${esc(t('repeat'))}">${icon('repeat')}<em id="pl-rep-badge"></em></button>
      </div>
      <div class="pl-foot"><span id="pl-rep-label"></span><button class="icon-btn" data-act="pl-menu" aria-label="${esc(t('more'))}">${icon('more')}</button></div>
    </div>
  </section>`;
}
function openPlayer() {
  const el = $('#player'); if (!el || !P.cur()) return;
  el.hidden = false; requestAnimationFrame(() => el.classList.add('open'));
  document.body.classList.add('player-open');
  pushLayer(() => { el.classList.remove('open'); document.body.classList.remove('player-open'); setTimeout(() => { el.hidden = true; }, 260); });
  updatePlayerUI();
}
function updatePlayButtons() {
  const playing = !P.audio.paused;
  const html = icon(playing ? 'pause' : 'play');
  const label = playing ? t('pause') : t('play');
  ['#mini-play', '#pl-play'].forEach((s) => { const b = $(s); if (b) { b.innerHTML = html; b.setAttribute('aria-label', label); } });
}
function updateProgress() {
  const d = P.audio.duration, c = P.audio.currentTime;
  const pct = Number.isFinite(d) && d > 0 ? c / d : 0;
  const mp = $('#mini-prog'); if (mp) mp.style.width = (pct * 100).toFixed(2) + '%';
  if (!P.seeking) {
    const r = $('#pl-range'); if (r) { r.value = Math.round(pct * 1000); r.style.setProperty('--p', (pct * 100).toFixed(2) + '%'); }
    const cu = $('#pl-cur'); if (cu) cu.textContent = fmtTime(c);
  }
  const du = $('#pl-dur'); if (du) du.textContent = Number.isFinite(d) && d > 0 ? fmtTime(d) : (P.cur()?.duration ? fmtTime(P.cur().duration) : '0:00');
}
function updatePlayerUI() {
  const m = P.cur();
  const mini = $('#mini'); if (!mini) return;
  mini.hidden = !m;
  document.body.classList.toggle('has-mini', !!m);
  if (!m) return;
  $('#mini-art').innerHTML = artHTML(m, 'art');
  $('#mini-t').textContent = m.title;
  $('#mini-a').textContent = m.src === 'deezer' ? `${m.artist} · ${t('previewOnly')}` : m.artist;
  $('#pl-art').innerHTML = artHTML(m, 'big-art');
  const bgSrc = COVERS.get(m.key) || m.art;
  $('#pl-bg').style.backgroundImage = bgSrc ? `url("${bgSrc.replace(/"/g, '%22')}")` : 'none';
  $('#pl-bg').style.setProperty('--tint', tintFor(m.title));
  $('#pl-t').textContent = m.title;
  $('#pl-a').textContent = m.src === 'deezer' ? `${m.artist} · ${t('previewOnly')}` : m.artist;
  $('#pl-ctx').textContent = P.ctx || '';
  const fav = isFav(m.key);
  const fb = $('#pl-fav'); fb.innerHTML = icon(fav ? 'heart-fill' : 'heart'); fb.classList.toggle('on', fav); fb.setAttribute('aria-label', fav ? t('removeFav') : t('addFav'));
  $('#pl-dl').innerHTML = m.src === 'own' ? '' : dlState(m);
  const full = $('#pl-full');
  full.hidden = m.src !== 'deezer';
  $('#pl-shuf').classList.toggle('on', P.shuffle);
  $('#pl-shuf').setAttribute('aria-pressed', P.shuffle);
  const rep = $('#pl-rep'); rep.classList.toggle('on', P.repeat !== 'off'); rep.setAttribute('aria-pressed', P.repeat !== 'off');
  $('#pl-rep-badge').textContent = { off: '', once: '1', one: '∞', all: '' }[P.repeat];
  $('#pl-rep-label').textContent = t('rep_' + P.repeat);
  updatePlayButtons(); updateProgress();
}

/* cola */
function renderQueueSheet() {
  const el = $('#queue-sheet'); if (!el) return;
  const cur = P.cur();
  const up = P.queue.slice(P.i + 1);
  LISTS.set('queue', P.queue);
  $('.sheet-body', el).innerHTML = `
    <div class="sheet-title"><h2>${esc(t('queue'))}</h2>${up.length ? `<button class="link" data-act="clear-queue">${esc(t('clearQueue'))}</button>` : ''}</div>
    ${cur ? `<p class="eyebrow">${esc(t('nowPlaying'))}</p><div class="list">${rowHTML(cur, 'queue', P.i)}</div>` : ''}
    <p class="eyebrow">${esc(t('upNext'))}</p>
    ${up.length ? `<div class="list">${up.map((m, j) => {
      const idx = P.i + 1 + j;
      return `<div class="row q-row" data-key="${esc(m.key)}">
        <button class="row-main" data-act="play" data-ctx="queue" data-i="${idx}">${artHTML(m)}<span class="meta"><b>${esc(m.title)}</b><span>${esc(m.artist)}</span></span></button>
        <button class="icon-btn" data-act="q-up" data-i="${idx}" aria-label="${esc(t('moveUp'))}" ${j === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
        <button class="icon-btn" data-act="q-down" data-i="${idx}" aria-label="${esc(t('moveDown'))}" ${j === up.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
        <button class="icon-btn" data-act="q-remove" data-i="${idx}" aria-label="${esc(t('del'))}">${icon('close')}</button>
      </div>`;
    }).join('')}</div>` : `<p class="muted pad">${esc(t('queueEmpty'))}</p>`}`;
}

/* hojas inferiores */
function openSheet(id, html) {
  const root = $('#layers');
  const el = document.createElement('div');
  el.className = 'layer'; el.id = id;
  el.innerHTML = `<div class="scrim" data-act="close-top"></div><div class="sheet" role="dialog" aria-modal="true"><span class="grab"></span><div class="sheet-body">${html}</div></div>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  pushLayer(() => { el.classList.remove('open'); setTimeout(() => el.remove(), 220); });
  return el;
}
function setSheet(id, html) { const el = $('#' + id); if (el) $('.sheet-body', el).innerHTML = html; }
function sheetHead(m) {
  return `<div class="sheet-head">${artHTML(m)}<span class="meta"><b>${esc(m.title)}</b><span>${esc(m.artist)}${m.src === 'deezer' ? ' · ' + esc(t('previewOnly')) : ''}</span></span></div>`;
}
const sheetBtn = (act, ic, label, extra = '') => `<button class="sheet-item" data-act="${act}" ${extra}>${icon(ic)}<span>${esc(label)}</span></button>`;

function openTrackMenu(k, ctx, i) {
  const m = getTrack(k); if (!m) return;
  const kk = `data-key="${esc(k)}"`;
  const items = [];
  items.push(sheetBtn('m-next', 'play-next', t('playNext'), kk));
  items.push(sheetBtn('m-queue', 'queue', t('addQueue'), kk));
  items.push(sheetBtn('m-fav', isFav(k) ? 'heart-fill' : 'heart', isFav(k) ? t('removeFav') : t('addFav'), kk));
  items.push(sheetBtn('m-pl', 'plus', t('addToPlaylist'), kk));
  if (m.src === 'own') {
    items.push(sheetBtn('m-move', 'folder', t('moveTo'), kk));
    items.push(sheetBtn('m-phone', 'phone', t('saveToPhone'), kk));
    if (canShareFiles()) items.push(sheetBtn('m-share', 'share', t('shareFile'), kk));
  } else if (isLocal(k)) {
    items.push(sheetBtn('m-phone', 'phone', t('saveToPhone'), kk));
    if (canShareFiles()) items.push(sheetBtn('m-share', 'share', t('shareFile'), kk));
    if (S.users.length > 1) items.push(sheetBtn('m-profile', 'user', t('toProfile'), kk));
    items.push(sheetBtn('m-undl', 'trash', t('removeDownload'), kk));
  } else if (canDownload(m)) {
    items.push(sheetBtn('m-dl', 'download', DL.has(k) ? t('downloading', { p: DL.get(k) }) : t('download'), kk));
  } else if (m.src !== 'deezer') {
    items.push(`<div class="sheet-item disabled">${icon('lock')}<span>${esc(t('notDownloadable'))}</span></div>`);
  }
  if (ctx && ctx.startsWith('pl:')) {
    const pid = ctx.slice(3);
    const extra = `${kk} data-pid="${pid}" data-i="${i}"`;
    items.push(sheetBtn('m-pl-up', 'arrow-up', t('moveUp'), extra));
    items.push(sheetBtn('m-pl-down', 'arrow-down', t('moveDown'), extra));
    items.push(sheetBtn('m-pl-remove', 'close', t('removeFromPlaylist'), extra));
  }
  if (m.src === 'deezer') items.push(sheetBtn('m-findfree', 'search', t('findFree'), kk));
  if (m.src === 'own') items.push(sheetBtn('m-delown', 'trash', t('deleteSong'), kk));
  if (m.link && m.src !== 'own' && m.src !== 'deezer') items.push(`<a class="sheet-item" href="${esc(m.link)}" target="_blank" rel="noopener">${icon('external')}<span>${esc(t('openIn', { src: { audius: 'Audius', deezer: 'Deezer', jamendo: 'Jamendo' }[m.src] || m.src }))}</span></a>`);
  openSheet('track-sheet', sheetHead(m) + items.join(''));
}
function playlistPicker(k) {
  const m = getTrack(k);
  return sheetHead(m) + `<p class="eyebrow">${esc(t('addToPlaylist'))}</p>` +
    sheetBtn('m-pl-new', 'plus', t('newPlaylist'), `data-key="${esc(k)}"`) +
    S.lib.playlists.map((p) => `<button class="sheet-item" data-act="m-pl-add" data-key="${esc(k)}" data-pid="${p.id}">${mosaicHTML(p.keys)}<span>${esc(p.name)}<small>${esc(songsCount(p.keys.length))}</small></span></button>`).join('');
}
function movePicker(k) {
  const m = getTrack(k);
  return sheetHead(m) + `<p class="eyebrow">${esc(t('moveTo'))}</p>` +
    sheetBtn('m-to-dl', 'download', t('toDownloads'), `data-key="${esc(k)}"`) +
    sheetBtn('m-pl', 'plus', t('addToPlaylist'), `data-key="${esc(k)}"`) +
    (S.users.length > 1 ? sheetBtn('m-profile', 'user', t('toProfile'), `data-key="${esc(k)}"`) : '') +
    sheetBtn('m-phone', 'phone', t('saveToPhone'), `data-key="${esc(k)}"`);
}
function profilePicker(k) {
  const m = getTrack(k);
  const others = S.users.filter((u) => u.id !== S.me.id);
  return sheetHead(m) + `<p class="eyebrow">${esc(t('toProfile'))}</p>` +
    (others.length ? others.map((u) => `<button class="sheet-item" data-act="m-send" data-key="${esc(k)}" data-uid="${u.id}">${avatarHTML(u)}<span>${esc(u.name)}</span></button>`).join('') : `<p class="muted pad">${esc(t('noProfiles'))}</p>`);
}

/* ================= acciones ================= */
const ACT = {
  tab: async (el) => {
    while (UI.stack.length && LAYERS.length) await closeTop();
    if (UI.tab === el.dataset.tab && el.dataset.tab !== 'home') { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
    UI.tab = el.dataset.tab; renderView();
    if (UI.tab === 'search' && !UI.search.q && !UI.search.genre) setTimeout(() => $('#q')?.focus(), 80);
  },
  'go-top': () => { UI.tab = 'top'; renderView(); },
  back: () => closeTop(),
  'close-top': () => closeTop(),
  play: (el) => {
    const ctx = el.dataset.ctx, i = Number(el.dataset.i);
    const list = LISTS.get(ctx); if (!list || !list[i]) return;
    if (ctx === 'queue') { P.i = i; loadAndPlay(); renderQueueSheet(); return; }
    const cur = P.cur();
    if (cur && cur.key === list[i].key && P.ctx === ctxLabel(ctx)) return togglePlay();
    startList(list, i, { ctx: ctxLabel(ctx) });
  },
  'play-list': (el) => { const l = LISTS.get(el.dataset.ctx) || []; if (l.length) startList(l, 0, { shuffle: false, ctx: ctxLabel(el.dataset.ctx) }); },
  'shuffle-list': (el) => { const l = LISTS.get(el.dataset.ctx) || []; if (l.length) startList(l, Math.floor(Math.random() * l.length), { shuffle: true, ctx: ctxLabel(el.dataset.ctx) }); },
  toggle: () => togglePlay(),
  next: () => nextTrack(),
  prev: () => prevTrack(),
  shuffle: () => toggleShuffle(),
  repeat: () => cycleRepeat(),
  'open-player': () => openPlayer(),
  'close-player': () => closeTop(),
  'open-queue': () => { const el = openSheet('queue-sheet', ''); el.classList.add('tall'); renderQueueSheet(); },
  'clear-queue': () => { P.queue = P.queue.slice(0, P.i + 1); P.original = null; savePlayer(); renderQueueSheet(); },
  'q-up': (el) => { const i = Number(el.dataset.i); if (i - 1 > P.i) { [P.queue[i - 1], P.queue[i]] = [P.queue[i], P.queue[i - 1]]; savePlayer(); renderQueueSheet(); } },
  'q-down': (el) => { const i = Number(el.dataset.i); if (i + 1 < P.queue.length) { [P.queue[i + 1], P.queue[i]] = [P.queue[i], P.queue[i + 1]]; savePlayer(); renderQueueSheet(); } },
  'q-remove': (el) => { const i = Number(el.dataset.i); if (i > P.i) { P.queue.splice(i, 1); savePlayer(); renderQueueSheet(); } },
  'pl-fav': () => { const m = P.cur(); if (m) toggleFav(m.key); },
  'pl-menu': () => { const m = P.cur(); if (m) openTrackMenu(m.key, '', -1); },
  dl: (el) => downloadTrack(el.dataset.key),
  menu: (el) => openTrackMenu(el.dataset.key, el.dataset.ctx, Number(el.dataset.i)),
  'm-next': async (el) => { const m = getTrack(el.dataset.key); await closeTop(); playNextInQueue(m); },
  'm-queue': async (el) => { const m = getTrack(el.dataset.key); await closeTop(); addToQueue(m); },
  'm-fav': async (el) => { await closeTop(); toggleFav(el.dataset.key); },
  'm-dl': async (el) => { await closeTop(); downloadTrack(el.dataset.key); },
  'm-dl-yt': async (el) => { await closeTop(); downloadDeezerViaYT(el.dataset.key); },
  'm-undl': async (el) => { await closeTop(); removeDownload(el.dataset.key); },
  'm-phone': async (el) => { await closeTop(); saveToPhone(el.dataset.key); },
  'm-share': async (el) => { await closeTop(); shareFile(el.dataset.key); },
  'm-pl': (el) => setSheet('track-sheet', playlistPicker(el.dataset.key)),
  'm-move': (el) => setSheet('track-sheet', movePicker(el.dataset.key)),
  'm-profile': (el) => setSheet('track-sheet', profilePicker(el.dataset.key)),
  'm-send': async (el) => { await closeTop(); sendToProfile(el.dataset.key, el.dataset.uid); },
  'm-to-dl': async (el) => {
    await closeTop();
    const k = el.dataset.key;
    if (S.lib.downloads.includes(k)) return toast(t('alreadyThere'));
    S.lib.downloads.unshift(k); saveLib(); toast(t('movedDownloads')); refreshAfterLibChange();
  },
  'm-pl-add': async (el) => { await closeTop(); addToPlaylist(el.dataset.pid, el.dataset.key); },
  'm-pl-new': async (el) => {
    const k = el.dataset.key;
    await closeTop();
    const name = await dialog({ title: t('newPlaylist'), ok: t('create'), input: { placeholder: t('playlistName'), validate: (v) => (v ? '' : t('nameRequired')) } });
    if (!name) return;
    const p = createPlaylist(name); addToPlaylist(p.id, k);
  },
  'm-pl-up': async (el) => { await closeTop(); movePlItem(el.dataset.pid, Number(el.dataset.i), -1); },
  'm-pl-down': async (el) => { await closeTop(); movePlItem(el.dataset.pid, Number(el.dataset.i), 1); },
  'm-pl-remove': async (el) => {
    await closeTop();
    const p = S.lib.playlists.find((x) => x.id === el.dataset.pid); if (!p) return;
    p.keys.splice(Number(el.dataset.i), 1); saveLib(); refreshAfterLibChange();
  },
  'm-findfree': async (el) => {
    const m = getTrack(el.dataset.key); await closeTop();
    while (UI.stack.length && LAYERS.length) await closeTop();
    if (!$('#player').hidden) await closeTop();
    UI.tab = 'search'; UI.search.q = `${m.title}`; UI.search.genre = ''; renderView(false); runSearch(true);
  },
  'm-delown': async (el) => {
    const m = getTrack(el.dataset.key); await closeTop();
    const ok = await dialog({ title: t('deleteSong'), message: t('deleteSongQ', { title: m.title }), ok: t('del'), danger: true });
    if (ok) deleteOwn(m.key);
  },
  'lib-tab': (el) => { UI.libTab = el.dataset.t; renderView(false); },
  'new-playlist': async () => {
    const name = await dialog({ title: t('newPlaylist'), ok: t('create'), input: { placeholder: t('playlistName'), validate: (v) => (v ? '' : t('nameRequired')) } });
    if (name) { createPlaylist(name); renderView(); }
  },
  'open-playlist': (el) => openPage({ type: 'playlist', id: el.dataset.id }),
  'rename-playlist': async (el) => {
    const p = S.lib.playlists.find((x) => x.id === el.dataset.id); if (!p) return;
    const name = await dialog({ title: t('rename'), ok: t('save'), input: { value: p.name, validate: (v) => (v ? '' : t('nameRequired')) } });
    if (name) { p.name = name.slice(0, 60); saveLib(); renderView(); }
  },
  'delete-playlist': async (el) => {
    const p = S.lib.playlists.find((x) => x.id === el.dataset.id); if (!p) return;
    const ok = await dialog({ title: t('del'), message: t('deletePlaylistQ', { name: p.name }), ok: t('del'), danger: true });
    if (!ok) return;
    S.lib.playlists = S.lib.playlists.filter((x) => x.id !== p.id); saveLib();
    await closeTop();
  },
  'toggle-onlydl': () => { UI.search.onlyDl = !UI.search.onlyDl; renderView(); runSearch(true); },
  genre: (el) => { UI.search.genre = el.dataset.g; if (UI.tab !== 'search') UI.tab = 'search'; renderView(false); runSearch(true); },
  'clear-q': () => { UI.search.q = ''; UI.search.results = null; renderView(); $('#q')?.focus(); runSearch(true); },
  'recent-q': (el) => { UI.search.q = el.dataset.q; renderView(); runSearch(true); },
  'clear-recent': () => { S.lib.recent = []; saveLib(); renderView(); },
  'retry-search': () => runSearch(true),
  'more-src': (el) => { UI.search.open = { ...(UI.search.open || {}), [el.dataset.id]: true }; const b = $('#results'); if (b) b.innerHTML = searchResultsHTML(); },
  'retry-home': () => { renderView(); },
  'refresh-top': async (el) => { el.classList.add('spin'); await refreshChart(true); renderView(); },
  'open-settings': () => { if (UI.stack[UI.stack.length - 1]?.type === 'settings') return; openPage({ type: 'settings' }); },
  'open-admin': () => openAdmin(),
  'set-lang': (el) => {
    LANG = el.dataset.lang || el.dataset.v;
    document.documentElement.lang = LANG;
    if (S.me) { S.me.lang = LANG; saveUsers(); mountApp(); renderView(); updatePlayerUI(); }
    else { S.settings.lang = LANG; saveSettings(); if (S.screen === 'welcome') showWelcome(); else if (S.screen === 'login') showLogin(); }
  },
  'set-theme': (el) => { S.me.theme = el.dataset.v; saveUsers(); document.documentElement.dataset.theme = S.me.theme; renderView(); },
  'set-chart-h': async (el) => { S.settings.chartHours = Number(el.dataset.v); saveSettings(); renderView(); },
  'edit-tastes': async () => { while (LAYERS.length) await closeTop(); showOnboard(S.me, true); },
  'change-pin': async () => {
    const v = await dialog({ title: t('newPin'), ok: t('save'), input: { type: 'password', numeric: true, max: 6, validate: (x) => (validPin(x) ? '' : t('pinInvalid')) } });
    if (v == null) return;
    const v2 = await dialog({ title: t('pinRepeat'), ok: t('save'), input: { type: 'password', numeric: true, max: 6 } });
    if (v2 == null) return;
    if (v !== v2) return toast(t('pinMismatch'));
    S.me.salt = S.me.salt || newId(); S.me.pin = await hashPin(v, S.me.salt); saveUsers(); toast(t('pinSaved')); renderView();
  },
  'remove-pin': () => { S.me.pin = null; saveUsers(); toast(t('pinRemoved')); renderView(); },
  'switch-profile': () => logout(),
  logout: () => logout(),
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch { /* nada */ } deferredInstall = null; renderView(); },
  'hide-install': () => { LS.set('installHidden', true); renderView(); },
  'admin-user': (el) => { UI.admin.user = el.dataset.uid; renderView(); },
  'admin-type': (el) => { UI.admin.type = el.dataset.v; renderView(); },
  'admin-user-menu': (el) => {
    const u = S.users.find((x) => x.id === el.dataset.uid); if (!u) return;
    openSheet('user-sheet', `<div class="sheet-head">${avatarHTML(u)}<span class="meta"><b>${esc(u.name)}</b><span>${esc(t('lastSeen', { when: whenLabel(u.lastLogin) }))}</span></span></div>
      ${u.pin ? sheetBtn('admin-reset-pin', 'lock', t('resetPin'), `data-uid="${u.id}"`) : ''}
      ${sheetBtn('admin-del-user', 'trash', t('deleteProfile'), `data-uid="${u.id}"`)}`);
  },
  'admin-reset-pin': async (el) => { await closeTop(); const u = S.users.find((x) => x.id === el.dataset.uid); if (u) { u.pin = null; saveUsers(); toast(t('pinRemoved')); renderView(); } },
  'admin-del-user': async (el) => {
    await closeTop();
    const u = S.users.find((x) => x.id === el.dataset.uid); if (!u || u.isAdmin) return;
    const ok = await dialog({ title: t('deleteProfile'), message: t('deleteProfileQ', { name: u.name }), ok: t('del'), danger: true });
    if (!ok) return;
    const lib = loadLib(u.id);
    S.users = S.users.filter((x) => x.id !== u.id); saveUsers();
    LS.del('lib.' + u.id); LS.del('player.' + u.id);
    for (const k of new Set([...lib.downloads, ...lib.own])) await dropBlobIfUnused(k);
    if (UI.admin.user === u.id) UI.admin.user = '';
    renderView();
  },
  'export-csv': () => exportCsv(),
  'clear-log': async () => {
    const ok = await dialog({ title: t('clearLog'), message: t('clearLogQ'), ok: t('del'), danger: true });
    if (ok) { LS.set('log', []); renderView(); }
  },
  'pick-profile': (el) => pickProfile(el.dataset.uid),
  'new-profile': () => showNewProfile(),
  'to-login': () => showLogin(),
};
function movePlItem(pid, i, dir) {
  const p = S.lib.playlists.find((x) => x.id === pid); if (!p) return;
  const j = i + dir; if (j < 0 || j >= p.keys.length) return;
  [p.keys[i], p.keys[j]] = [p.keys[j], p.keys[i]]; saveLib(); refreshAfterLibChange();
}
function ctxLabel(ctx) {
  if (!ctx) return '';
  if (ctx.startsWith('home:')) { const s = homeSecs.find((x) => 'home:' + x.id === ctx); return s ? s.title : t('tab_home'); }
  if (ctx.startsWith('pl:')) return S.lib.playlists.find((p) => p.id === ctx.slice(3))?.name || t('playlists');
  if (ctx.startsWith('search')) return UI.search.q ? `«${UI.search.q}»` : t('tab_search');
  return { search: UI.search.q ? `«${UI.search.q}»` : t('tab_search'), top: t('topTitle'), favs: t('favorites'), downloads: t('downloads'), own: t('myMusic'), queue: t('queue') }[ctx] || '';
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'own-files') { importFiles(e.target.files); e.target.value = ''; }
  if (e.target.id === 'set-hide') { S.settings.hideMixes = e.target.checked; saveSettings(); HOME_CACHE.clear(); toast(t('saved')); }
  if (e.target.id === 'set-jam') { S.settings.jamendoId = e.target.value.trim(); saveSettings(); toast(t('saved')); }
  if (e.target.id === 'set-ytapi') { S.settings.ytApi = e.target.value.trim(); saveSettings(); toast(t('saved')); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'pl-range') {
    P.seeking = true;
    const d = P.audio.duration || P.cur()?.duration || 0;
    const v = Number(e.target.value) / 1000;
    e.target.style.setProperty('--p', (v * 100).toFixed(2) + '%');
    $('#pl-cur').textContent = fmtTime(v * d);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'pl-range') {
    const d = P.audio.duration;
    if (Number.isFinite(d) && d > 0) P.audio.currentTime = (Number(e.target.value) / 1000) * d;
    P.seeking = false; setPositionState();
  }
});

/* deslizar hacia abajo para cerrar el reproductor */
(() => {
  let y0 = null, x0 = 0;
  document.addEventListener('touchstart', (e) => {
    const pl = e.target.closest('#player .pl-head, #player .pl-art');
    y0 = pl ? e.touches[0].clientY : null; x0 = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0, dx = Math.abs(e.changedTouches[0].clientX - x0);
    if (dy > 90 && dx < 60 && !$('#player').hidden) closeTop();
    y0 = null;
  }, { passive: true });
})();

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (S.screen === 'app' && UI.tab === 'home' && !UI.stack.length) renderView(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; LS.set('installHidden', true); });
window.addEventListener('online', () => { if (S.screen === 'app' && UI.tab === 'home' && !UI.stack.length) { HOME_CACHE.clear(); renderView(); } refreshChart(); });
window.addEventListener('offline', () => { if (S.screen === 'app' && UI.tab === 'home' && !UI.stack.length) renderView(); });
window.addEventListener('pagehide', () => savePlayer());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me) refreshChart().then(() => { if (UI.tab === 'top' && !UI.stack.length) renderView(); }); });
setInterval(() => { if (S.me && document.visibilityState === 'visible') refreshChart(); }, 10 * 60000);

/* ================= arranque ================= */
async function boot() {
  S.settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {}));
  S.users = LS.get('users', []);
  S.chart = LS.get('chart', null);
  if (S.chart) reg(S.chart.items);
  LANG = S.settings.lang || ((navigator.language || '').toLowerCase().startsWith('eu') ? 'eu' : 'es');
  document.documentElement.lang = LANG;
  await IDB.open();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || (S.screen !== 'app' && S.screen !== 'login')) return;
      reloaded = true; savePlayer(); location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (!S.users.length) return showWelcome();
  const me = S.users.find((u) => u.id === LS.get('session', ''));
  if (me) return enterApp(me, false);
  showLogin();
}
boot();

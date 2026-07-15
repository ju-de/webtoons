const storageKey = 'toontrail-library-v1';
const library = document.querySelector('#library');
const template = document.querySelector('#toon-template');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#title-search');
let activeFilter = 'all';
let activeSort = 'updated-desc';
let filterText = '';

// ── GITHUB SYNC (ju-de/webtoons) ─────────────────────────────────────────────────
const GH_OWNER = 'ju-de', GH_REPO = 'webtoons', GH_PATH = 'library.json', GH_BRANCH = 'main';
let _toons = null, _ghSha = null, _ghTimer = null;

function getGHToken() { return localStorage.getItem('tu-n-token') || ''; }
function setGHToken(t) { localStorage.setItem('tu-n-token', t); }
function isReadOnly() { return !getGHToken(); }
function setGHStatus(s) { const el = document.querySelector('#gh-btn'); if (el) el.textContent = s; }

async function fetchFromGH() {
  setGHStatus('\u2193 sync\u2026');
  try {
    const token = getGHToken();
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`, { headers });
    if (!res.ok) { setGHStatus('\u25cb github'); return false; }
    const meta = await res.json();
    _ghSha = meta.sha;
    // Decode base64 → bytes → UTF-8 string (handles Korean/Japanese/Chinese)
    const binary = atob(meta.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(data) && data.length > 0) { _toons = data; localStorage.setItem(storageKey, JSON.stringify(data)); }
    setGHStatus('\u2713 github'); return true;
  } catch (e) { setGHStatus('\u2297 github'); return false; }
}

async function pushToGH(isRetry = false) {
  const token = getGHToken(); if (!token) return;
  setGHStatus('\u2191 sync\u2026');
  // Always re-fetch SHA on retry; fetch if we don't have one yet
  if (!_ghSha || isRetry) {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
      });
      if (r.ok) { const d = await r.json(); _ghSha = d.sha; }
      else _ghSha = null;
    } catch (e) { console.warn('SHA fetch:', e); }
  }
  // Encode JSON to base64 properly (handles Korean/Japanese/Chinese characters)
  const json = JSON.stringify(getToons(), null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b));
  const content = btoa(binary);
  const body = { message: 'update library', content, branch: GH_BRANCH };
  if (_ghSha) body.sha = _ghSha;
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (res.status === 409 && !isRetry) { return pushToGH(true); } // stale SHA — retry once with fresh SHA
    if (!res.ok) { console.error('GitHub push error:', d); setGHStatus('\u2297 ' + (d.message || 'error')); return; }
    if (d.content?.sha) _ghSha = d.content.sha;
    clearDirty();
    setGHStatus('\u2713 github');
  } catch (e) { console.error('Push failed:', e); setGHStatus('\u2297 ' + e.message); }
}

function scheduleGHPush() { clearTimeout(_ghTimer); _ghTimer = setTimeout(pushToGH, 500); }

function markDirty()  { localStorage.setItem('tu-n-dirty', '1'); }
function clearDirty() { localStorage.removeItem('tu-n-dirty'); }
function isDirty()    { return !!localStorage.getItem('tu-n-dirty'); }

async function initGHSync() {
  // Push any local changes that didn't make it before the last reload
  if (isDirty() && getGHToken()) { await pushToGH(); }
  await fetchFromGH();
}

function getSorted(toons) {
  const s = [...toons];
  if (activeSort === 'alpha-asc') return s.sort((a, b) => a.title.localeCompare(b.title));
  if (activeSort === 'alpha-desc') return s.sort((a, b) => b.title.localeCompare(a.title));
  if (activeSort === 'updated-asc') return s.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0) || b.title.localeCompare(a.title));
  return s.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title));
}


function getToons() {
  if (_toons === null) {
    try { _toons = JSON.parse(localStorage.getItem(storageKey)) || []; }
    catch { _toons = []; }
  }
  return _toons;
}
function saveToons(toons) {
  _toons = toons;
  localStorage.setItem(storageKey, JSON.stringify(toons));
  markDirty();
  scheduleGHPush();
}
// migrate legacy "finished" status to "complete"
(function migrate() {
  const toons = getToons();
  const needsMigration = toons.some(t => t.status === 'finished');
  if (needsMigration) saveToons(toons.map(t => t.status === 'finished' ? { ...t, status: 'complete' } : t));
})();
function searchUrl(title, source = 'web') {
  const query = encodeURIComponent(title.trim());
  const sites = {
    web: `https://www.bing.com/search?q=${query}%20manga`,
    'anime-planet': `https://www.anime-planet.com/manga/all?name=${query}`,
    'manga-updates': `https://www.mangaupdates.com/site/search/result?search=${query.replace(/%20/g,'+')}`,
    atsu: `https://atsu.moe/explore?search=${query}`,
    kagane: `https://kagane.to/search?q=${query}`,
    comix: `https://comix.to/browse?q=${query}&sort=relevance%3Adesc`
  };
  return sites[source];
}
function openSearch(title, source = 'web') {
  if (title.trim()) window.open(searchUrl(title, source), '_blank', 'noopener,noreferrer');
}
function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = 60000, h = 3600000, d = 86400000;
  if (diff < m) return 'just now';
  if (diff < h) return `${Math.floor(diff/m)}m ago`;
  if (diff < d) return `${Math.floor(diff/h)}h ago`;
  if (diff < 7*d) return `${Math.floor(diff/d)}d ago`;
  return new Date(ts).toLocaleDateString('en-US', {month:'short', day:'numeric'});
}
function updateDashboard(toons) {
  const counts = ['reading', 'queue', 'complete'].reduce((acc, status) => {
    acc[status] = toons.filter(t => t.status === status).length; return acc;
  }, {});
  document.querySelector('#all-total').textContent = toons.length;
  document.querySelector('#reading-total').textContent = counts.reading;
  document.querySelector('#queue-total').textContent = counts.queue;
  document.querySelector('#complete-total').textContent = counts.complete;
}
function renderFavorites() {
  const el = document.querySelector('#favorites-list');
  if (!el) return;
  const favs = getToons().filter(t => t.favorite).sort((a, b) => (a.favOrder || 0) - (b.favOrder || 0));
  el.innerHTML = '';
  if (!favs.length) {
    const p = document.createElement('p'); p.className = 'favorites-empty'; p.textContent = 'star a webtoon to pin it here';
    el.appendChild(p); return;
  }
  let dragSrc = null;
  favs.forEach(t => {
    const item = document.createElement('div');
    item.className = 'fav-item'; item.draggable = !isReadOnly(); item.dataset.id = t.id;
    const handle = document.createElement('span'); handle.className = 'fav-drag-handle'; handle.textContent = '⠿';
    const ts = document.createElement('span'); ts.className = 'fav-title'; ts.textContent = t.title;
    const ms = document.createElement('span'); ms.className = 'fav-meta'; ms.textContent = `${t.status} · ch ${t.chapter || 0}`;
    item.appendChild(handle); item.appendChild(ts); item.appendChild(ms);
    if (!isReadOnly()) item.addEventListener('dragstart', e => { dragSrc = item; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => item.classList.add('dragging'), 0); });
    if (!isReadOnly()) item.addEventListener('dragend', () => { item.classList.remove('dragging'); el.querySelectorAll('.fav-item').forEach(i => i.classList.remove('drag-over')); dragSrc = null; });
    if (!isReadOnly()) item.addEventListener('dragover', e => { e.preventDefault(); if (item !== dragSrc) item.classList.add('drag-over'); });
    if (!isReadOnly()) item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    if (!isReadOnly()) item.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === item) return;
      item.classList.remove('drag-over');
      const items = [...el.querySelectorAll('.fav-item')];
      const srcIdx = items.indexOf(dragSrc);
      const ids = items.map(i => i.dataset.id);
      ids.splice(srcIdx, 1);
      ids.splice(ids.indexOf(item.dataset.id), 0, dragSrc.dataset.id);
      const all = getToons();
      ids.forEach((id, i) => { const ti = all.findIndex(t => t.id === id); if (ti >= 0) all[ti].favOrder = i; });
      saveToons(all); renderFavorites();
    });
    item.addEventListener('click', () => window.open(searchUrl(t.title, 'anime-planet'), '_blank', 'noopener,noreferrer'));
    el.appendChild(item);
  });
}
function render() {
  document.body.classList.toggle('read-only', isReadOnly());
  const toons = getToons();
  updateDashboard(toons);
  renderFavorites();
  const shown = activeFilter === 'all' ? toons : toons.filter(t => t.status === activeFilter);
  const filtered = filterText ? shown.filter(t => t.title.toLowerCase().includes(filterText)) : shown;
  const sorted = getSorted(filtered);
  library.innerHTML = '';
  if (!sorted.length) {
    library.innerHTML = `<div class="empty">${filterText ? 'No matches.' : toons.length ? 'Nothing in this part of the shelf yet.' : 'Your shelf is blank. Add a webtoon to start your trail.'}</div>`;
    return;
  }
  sorted.forEach(toon => {
    const card = template.content.cloneNode(true);
    card.querySelector('.title-h3').textContent = toon.title;
    if (toon.verified) card.querySelector('.verified-badge').hidden = false;
    card.querySelector('.toon-updated').textContent = relativeTime(toon.updatedAt);
    const article = card.querySelector('.toon-card');
    const status = card.querySelector('.status-select'); status.value = toon.status;
    const chapter = card.querySelector('.chapter-input'); chapter.value = toon.chapter || 0;
    chapter.disabled = toon.status === 'complete';
    if (toon.status === 'complete') article.classList.add('is-complete');
    if (toon.status === 'reading') article.classList.add('is-reading');
    status.addEventListener('change', () => {
      const isComplete = status.value === 'complete';
      chapter.disabled = isComplete;
      article.classList.toggle('is-complete', isComplete);
      article.classList.toggle('is-reading', status.value === 'reading');
      updateToon(toon.id, { status: status.value });
    });
    chapter.addEventListener('change', () => updateToon(toon.id, { chapter: Math.max(0, Number(chapter.value) || 0) }));
    const notesDiv = card.querySelector('.toon-notes');
    const notesTA = card.querySelector('.notes-input');
    notesTA.value = toon.notes || '';
    const titleH3 = card.querySelector('.title-h3');
    article.addEventListener('click', e => {
      if (e.target.closest('.status-select, .chapter-input, .chapter-label, .delete, .notes-input, .fav-btn, .alt-input, .alt-add-btn, .alt-tag')) return;
      if (e.target.closest('.title-h3') && !notesDiv.hidden) return;
      const expanding = notesDiv.hidden;
      notesDiv.hidden = !expanding;
      titleH3.contentEditable = (expanding && !isReadOnly()) ? 'true' : 'false';
      if (expanding) {
        const clickedTitle = !!e.target.closest('.title-h3');
        setTimeout(() => (clickedTitle ? titleH3 : notesTA).focus(), 10);
      }
    });
    notesTA.addEventListener('input', () => {
      const all = getToons();
      const idx = all.findIndex(t => t.id === toon.id);
      if (idx >= 0) { all[idx].notes = notesTA.value; saveToons(all); }
    });
    const altsLine = card.querySelector('.toon-alts-line');
    if (toon.alts && toon.alts.length) altsLine.textContent = toon.alts.join(' · ');
    titleH3.addEventListener('input', () => {
      const val = titleH3.textContent.replace(/[\r\n]/g, '').trim();
      const all = getToons(); const idx = all.findIndex(t => t.id === toon.id);
      if (idx >= 0) { all[idx].title = val; toon.title = val; saveToons(all); }
    });
    titleH3.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); notesTA.focus(); } });
    titleH3.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    const altsTags = card.querySelector('.alts-tags');
    const altInput = card.querySelector('.alt-input');
    const altAddBtn = card.querySelector('.alt-add-btn');
    function refreshAltTags() {
      altsTags.innerHTML = '';
      (toon.alts || []).forEach((alt, i) => {
        const tag = document.createElement('span'); tag.className = 'alt-tag';
        const txt = document.createElement('span'); txt.textContent = alt;
        const btn = document.createElement('button'); btn.textContent = '×'; btn.type = 'button';
        btn.addEventListener('click', () => {
          const all = getToons(); const idx = all.findIndex(t => t.id === toon.id);
          if (idx >= 0) { all[idx].alts = (all[idx].alts || []).filter((_, j) => j !== i); toon.alts = all[idx].alts; saveToons(all); }
          refreshAltTags(); altsLine.textContent = (toon.alts || []).join(' · ');
        });
        tag.appendChild(txt); tag.appendChild(btn); altsTags.appendChild(tag);
      });
    }
    refreshAltTags();
    altAddBtn.addEventListener('click', () => {
      const val = altInput.value.trim(); if (!val) return;
      const all = getToons(); const idx = all.findIndex(t => t.id === toon.id);
      if (idx >= 0) { if (!all[idx].alts) all[idx].alts = []; all[idx].alts.push(val); toon.alts = all[idx].alts; saveToons(all); }
      refreshAltTags(); altsLine.textContent = (toon.alts || []).join(' · '); altInput.value = '';
    });
    altInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); altAddBtn.click(); } });
    const favBtn = card.querySelector('.fav-btn');
    favBtn.textContent = toon.favorite ? '★' : '☆';
    if (toon.favorite) favBtn.classList.add('is-fav');
    favBtn.addEventListener('click', e => {
      e.stopPropagation();
      const all = getToons(); const idx = all.findIndex(t => t.id === toon.id);
      if (idx >= 0) { const nowFav = !all[idx].favorite; all[idx].favorite = nowFav; if (nowFav) all[idx].favOrder = Date.now(); saveToons(all); }
      render();
    });
    card.querySelector('.delete').addEventListener('click', e => { e.stopPropagation(); if (!confirm(`Remove "${toon.title}"?`)) return; saveToons(getToons().filter(t => t.id !== toon.id)); render(); });
    if (isReadOnly()) {
      article.querySelectorAll('.status-select, .chapter-input, .alt-input, .alt-add-btn, .fav-btn, .notes-input').forEach(el => { el.disabled = true; });
      article.querySelectorAll('.alt-tag button').forEach(b => { b.disabled = true; });
    }
    library.appendChild(card);
  });
}
function updateToon(id, changes) { saveToons(getToons().map(t => t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t)); render(); }

searchForm.addEventListener('submit', e => e.preventDefault());
const _srcs = [
  { key: 'anime-planet', label: 'Anime-Planet', home: 'https://www.anime-planet.com/manga' },
  { key: 'manga-updates',label: 'MangaUpdates', home: 'https://www.mangaupdates.com' },
  { key: 'atsu',         label: 'atsu.moe',     home: 'https://atsu.moe' },
  { key: 'kagane',       label: 'kagane.to',    home: 'https://kagane.to' },
  { key: 'comix',        label: 'comix.to',     home: 'https://comix.to' },
];
function updateSearchPills() {
  const query = searchInput.value.trim();
  const resultsDiv = document.querySelector('#search-results');
  resultsDiv.innerHTML = _srcs.map(s =>
    query
      ? `<a class="result-pill" href="${searchUrl(query, s.key)}" target="_blank" rel="noopener noreferrer">${s.label}</a>`
      : `<a class="result-pill" href="${s.home}" target="_blank" rel="noopener noreferrer">${s.label}</a>`
  ).join('');
  resultsDiv.hidden = false;
}
searchInput.addEventListener('input', updateSearchPills);
searchInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = searchInput.value.trim();
  if (q) window.open(searchUrl(q, 'web'), '_blank', 'noopener,noreferrer');
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === button)); render();
}));
document.querySelector('#sort-select').addEventListener('change', e => {
  activeSort = e.target.value;
  render();
});
document.querySelector('#library-search').addEventListener('input', e => {
  filterText = e.target.value.trim().toLowerCase();
  render();
});
function titleFromUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  const CATS = new Set(['manga', 'manhwa', 'manhua', 'webtoon', 'comic', 'comics', 'series']);
  const parts = url.pathname.split('/').filter(p =>
    p && !/^(chapter|ch|ep|vol|read)[-_]?\d/i.test(p) && !/^\d+$/.test(p)
  );
  let slug = null;
  if (host === 'mangaupdates.com') {
    // /series/hash/title-slug — skip the hash, take the last segment
    const idx = parts.indexOf('series');
    if (idx >= 0) { const rest = parts.slice(idx + 1); slug = rest.length >= 2 ? rest[rest.length - 1] : rest[0]; }
  } else {
    // Generic: find the first category segment, title is the one right after it
    const catIdx = parts.findIndex(p => CATS.has(p.toLowerCase()));
    if (catIdx >= 0 && parts[catIdx + 1]) {
      slug = parts[catIdx + 1];
    } else {
      // No known category — take the last non-category segment
      const nonCat = parts.filter(p => !CATS.has(p.toLowerCase()));
      slug = nonCat[nonCat.length - 1] || null;
    }
  }
  if (!slug) return null;
  return slug.replace(/[-_]/g, ' ').replace(/(?:^|\s)\S/g, c => c.toUpperCase()).trim();
}

document.querySelector('#library-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (isReadOnly()) return;
  const raw = document.querySelector('#library-search').value.trim();
  if (!raw) return;
  let title = raw;
  const wasUrl = /^https?:\/\//i.test(raw);
  if (wasUrl) {
    title = titleFromUrl(raw);
    if (!title) return;
  }
  const toons = getToons();
  const titled = title.replace(/(?:^|\s+)\S/g, c => c.toUpperCase());
  const isDupe = !!toons.find(t => t.title.toLowerCase() === title.toLowerCase());
  if (!isDupe) {
    toons.unshift({ id: crypto.randomUUID(), title: titled, status: 'reading', chapter: 0, updatedAt: Date.now() });
    saveToons(toons);
  }
  if (wasUrl) {
    filterText = titled.toLowerCase();
    document.querySelector('#library-search').value = titled;
  } else if (!isDupe) {
    filterText = '';
    document.querySelector('#library-search').value = '';
  }
  render();
});
document.querySelector('#import-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      const statusMap = { 'reading': 'reading', 'read': 'complete', 'stalled': 'queue', 'want to read': 'queue' };
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
      const parseDate = s => { if (!s) return 0; const t = new Date(s.replace(' ','T').replace(/\+0+$/,'Z')).getTime(); return isNaN(t) ? 0 : t; };
      // Build normalized title → best timestamp map from anime-planet data
      const apTimestamps = new Map();
      const apStatus = new Map();
      for (const e of (data.entries || [])) {
        const ts = parseDate(e.completed) || parseDate(e.started);
        const key = norm(e.name);
        if (ts > 0) apTimestamps.set(key, ts);
        if (statusMap[e.status]) apStatus.set(key, statusMap[e.status]);
      }
      const existing = getToons();
      // Restore timestamps for existing entries via fuzzy match
      const restored = existing.map(t => {
        const key = norm(t.title);
        const ts = apTimestamps.get(key);
        if (ts) return { ...t, updatedAt: ts };
        if (apStatus.has(key)) return { ...t, updatedAt: 0 }; // in AP but no date
        return t;
      });
      // Add new entries not already in the library
      const restoredKeys = new Set(restored.map(t => norm(t.title)));
      const newEntries = (data.entries || [])
        .filter(entry => statusMap[entry.status] && !restoredKeys.has(norm(entry.name)))
        .map(entry => ({ id: crypto.randomUUID(), title: entry.name, status: statusMap[entry.status], chapter: entry.ch || 0, updatedAt: parseDate(entry.completed) || parseDate(entry.started) || Date.now() }));
      saveToons([...restored, ...newEntries]);
      render();
    } catch { /* invalid file */ }
    e.target.value = '';
  };
  reader.readAsText(file);
});
document.querySelector('#export-btn').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(getToons(), null, 2)], {type:'application/json'})),
    download: '兔n-library.json'
  });
  a.click(); URL.revokeObjectURL(a.href);
});
const _pdf = [
  ["a capable maid",59,"r"],["a child who looks like me",50,"r"],["a stepmother's marchen",137,"r"],["agatha",117,"r"],["bride of obsidian",81,"r"],["can i bite you?",54,"r"],["childhood friend complex",81,"r"],["codename anastasia",61,"r"],["college student empress",85,"r"],["cry, even better if you beg",24,"r"],["daytime in the bunker",20,"r"],["dear villainous husband the one to be obsessed with is over there",63,"r"],["dororo to hyakkimaru den",44,"r"],["double agent",0,"r"],["emerald midnight's lover",27,"r"],["failed to abandon the villain",44,"r"],["fall in love or die",68,"r"],["farewell",20,"r"],["fly me to the moon",72,"r"],["for my derelict beloved",20,"r"],["for your perfect ending",33,"r"],["frieren",147,"r"],["god of blackfield",0,"r"],["hero killer",0,"r"],["high society",87,"r"],["hotaru no yomeiri",31,"r"],["how to change the genre from angst to heartwarming",47,"r"],["how to fight",0,"r"],["how to get my husband on my side",137,"r"],["i became the duke's male servant",51,"r"],["i'm stanning the duke",0,"r"],["imprisoned by the mad dog i raised",19,"r"],["in between",55,"r"],["inso's law",137,"r"],["it's just business",39,"r"],["jinx",72,"r"],["lee seob's love",55,"r"],["like wind on a dry branch",164,"r"],["lookalike daughter",97,"r"],["love in session",25,"r"],["marriage of convenience",0,"r"],["men of the harem",85,"r"],["miss pendleton",0,"r"],["my beloved oppressor",62,"r"],["my fiance is in love with my little sister",24,"r"],["my mom entered a contract marriage",75,"r"],["no longer allowed in another world",52,"r"],["now come and regret",20,"r"],["odd girl out",374,"r"],["omniscient reader's viewpoint",0,"r"],["once it was love",115,"r"],["one punch man",211,"r"],["pendleton revolution",46,"r"],["powerful confession",46,"r"],["princess wars",0,"r"],["proof of dignity",0,"r"],["proposed to by a villain",49,"r"],["pure love operation",89,"r"],["queen cecia's shorts",121,"r"],["really truly getting divorced",34,"r"],["red fox",132,"r"],["remarried empress",144,"r"],["roxana",43,"r"],["run away from me",75,"r"],["sakamoto days",204,"r"],["seabird and the wolf",72,"r"],["seasons of blossom",0,"r"],["secret lady",123,"r"],["selfish romance",51,"r"],["skip beat",310,"r"],["spoil of war duchess",0,"r"],["tears on a withered flower",110,"r"],["the beast within",14,"r"],["the broken ring",71,"r"],["the player with a hidden past",31,"r"],["the price is your everything",47,"r"],["the swan's grave",19,"r"],["the warrior returns",0,"r"],["the world without my sister who everyone loved",80,"r"],["tower of god",63,"r"],["tutorial tower of the advanced player",82,"r"],["your ryan",44,"r"],["your throne",187,"r"],
  ["10 ways to get rejected by the tyrant",22,"c"],["100% perfect girl",0,"c"],["a beast tamed by the villainess",48,"c"],["a close call romance",0,"c"],["a happy ending for villains",88,"c"],["age of arrogance",93,"c"],["anystories",56,"c"],["betrayal of dignity",0,"c"],["between seasons",0,"c"],["beware the villainess",92,"c"],["beyond yearning and obsession",0,"c"],["bitter sweetheart",0,"c"],["blue blood vampire",0,"c"],["bride of the demon i was sealed as his prey",9,"c"],["can i cancel the confession?",68,"c"],["captive in dreamland",0,"c"],["children of orbit",85,"c"],["complying with imperial edict",47,"c"],["couple how far can you go",35,"c"],["crown princess scandal",0,"c"],["degree of love",0,"c"],["depths of malice",0,"c"],["dine with a vampire",0,"c"],["duke that man is my real brother",0,"c"],["earl of nottingham",91,"c"],["elena evoy observation diary",101,"c"],["elixir of the sun",119,"c"],["finding camelia",131,"c"],["flash behavior",35,"c"],["flowers of evil",0,"c"],["for your murder",0,"c"],["from knight to lady",178,"c"],["from today on i'm a boy",77,"c"],["garden of the dead flowers",0,"c"],["golden forest",97,"c"],["greatest estate developer",0,"c"],["guardians of the lamb",0,"c"],["gyeongseong mermaid",0,"c"],["hadashi de bara wo fume",0,"c"],["hocus pocus",0,"c"],["how about cosmic horror",26,"c"],["how raeliana ended up at the duke's residence",158,"c"],["how to break up well",79,"c"],["how to prey on your master",100,"c"],["how to use an angel",0,"c"],["i became the hero's rival",0,"c"],["i reincarnated as the little sister of a death game manga's murder mastermind and failed",25,"c"],["i stole the male lead's first night",0,"c"],["i'm divorcing my tyrant husband",39,"c"],["i'm the male lead's ex",96,"c"],["i'm the soldier's ex girlfriend",91,"c"],["i'm the tyrant's secretary",110,"c"],["irregular empress",105,"c"],["just leave me be",120,"c"],["just twilight",0,"c"],["kataomoi ga tsurakute shissou shitara yandere-ka shita otto ni tsukamarimashita",0,"c"],["kill the villainess",0,"c"],["kimi wo hitori ni shite agenai",8,"c"],["koi to shinzou",0,"c"],["lady baby",239,"c"],["lady crystal is a man",67,"c"],["let me die in peace",0,"c"],["let's hide my little brother",0,"c"],["light and shadow",103,"c"],["love song for illusion",0,"c"],["marked by king bs",0,"c"],["mashle",0,"c"],["miss not so sidekick",0,"c"],["mr delivery knight",39,"c"],["muse on fame",0,"c"],["my deepest secret",103,"c"],["my life as a loser",0,"c"],["my princess charming",40,"c"],["my sister's private life",0,"c"],["my teacher has chosen my husband candidates",0,"c"],["mystic prince",116,"c"],["naisho no stalker san",0,"c"],["olgami",191,"c"],["once a hero",0,"c"],["one half of a married couple",0,"c"],["one of a kind romance",0,"c"],["please kill my husband",83,"c"],["proud to be the villainess i'm doomed after stealing my half sister's fiance and having her banished",7,"c"],["red fox heul redam",24,"c"],["rta 24h record with one day left i'll break all the death flags",0,"c"],["rumor has it",64,"c"],["second life of a trash princess",0,"c"],["secret alliance",45,"c"],["senpai is an otokonoko",0,"c"],["stairway of time",115,"c"],["starting over with the dead you",0,"c"],["surviving as an obsessive servant",70,"c"],["surviving romance",76,"c"],["tenants from another world",0,"c"],["that wasn't my plan",80,"c"],["the abandoned empress",0,"c"],["the blood of madame giselle",0,"c"],["the maid and the vampire",76,"c"],["the makeup remover",0,"c"],["the male lead is a murderer",51,"c"],["the pale horse",284,"c"],["the portrait of the late prince",0,"c"],["the price of breaking up",0,"c"],["the red knight needs no reward",120,"c"],["the second male lead is a girl",80,"c"],["the spark in your eyes",0,"c"],["the stalker is trapped",0,"c"],["the tainted half",40,"c"],["the villain's savior",60,"c"],["the villainess lives again",230,"c"],["the villainess turns the hourglass",0,"c"],["the wicked wife of a scheming ceo",37,"c"],["this time i will find happiness",0,"c"],["to melt your frozen heart",51,"c"]
];
(function applyPDFNotes() {
  if (localStorage.getItem('toonn-pdf-v2')) return;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const toons = getToons().map(t => ({...t}));
  for (const [title, ch, st] of _pdf) {
    const status = st === 'r' ? 'reading' : 'complete';
    const nTitle = norm(title);
    const idx = toons.findIndex(t => norm(t.title) === nTitle);
    if (idx >= 0) {
      toons[idx].status = status;
      if (ch > 0) toons[idx].chapter = ch;
      // preserve existing updatedAt — do not overwrite with Date.now()
    } else {
      toons.push({ id: crypto.randomUUID(), title, status, chapter: ch || 0, updatedAt: 0 });
    }
  }
  saveToons(toons);
  localStorage.setItem('toonn-pdf-v2', '1');
})();
(function deduplicateLibrary() {
  if (localStorage.getItem('toonn-dedup-v2')) return;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const statusRank = { reading: 3, queue: 2, complete: 1 };
  const toons = getToons();
  const groups = new Map();
  for (const t of toons) {
    const key = norm(t.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const deduped = [];
  for (const [, group] of groups) {
    if (group.length === 1) { deduped.push(group[0]); continue; }
    const canonical = group.find(t => t.title !== t.title.toLowerCase()) || group[0];
    const merged = group.reduce((acc, t) => ({
      ...acc,
      chapter: Math.max(acc.chapter || 0, t.chapter || 0),
      status: (statusRank[t.status] || 0) > (statusRank[acc.status] || 0) ? t.status : acc.status,
      updatedAt: Math.max(acc.updatedAt || 0, t.updatedAt || 0)
    }), {...canonical});
    deduped.push(merged);
  }
  for (const t of deduped) {
    if (t.title === t.title.toLowerCase()) {
      t.title = t.title.replace(/(?:^|\s+)\S/g, c => c.toUpperCase());
    }
  }
  saveToons(deduped);
  localStorage.setItem('toonn-dedup-v2', '1');
})();
const _pdfNotes = {
  "double agent": "fl is kinda pathetic\nlike i get it i guess but it's pretty grating because she keeps flipping between fake ferociousness but then doing the most stupid inane shit\nshe's just kinda cringe\nart is pretty inconsistent but the guy is p interesting",
  "farewell": "her dad has a whole other main family and he's like a mob boss so he treats them like dirt but he treats her and her mom really nicely\nso his son from the other family finds her and starts a relationship w her to get back w him but in a psychopathic way where he just (as a stranger) comes over and stares at her and then they somehow hook up\nhe makes out w her in a restaurant knowing their dad is coming and he sees\nthen he kidnaps her and keeps her locked up\nbut it ends w him releasing her and then time skip they never meet again but it turns out he's not blood related to her",
  "for your perfect ending": "the premise was so cool but why did it just become a slice of life school drama\nand then her niece/nephew get randomly kidnapped by some mafia guys and youre telling me the 2ml whos a hs student is able to get him out after mc brings the judo team over??",
  "like wind on a dry branch": "goes off the rails a bit after all the stuff about demons and her heritage..",
  "marriage of convenience": "lowkey runs purely on misunderstandings bc people wont talk to each other\nlike her dad didnt talk to her for 9 years cause he felt like he would immediately ask her to come back? and forced her brother to not send her any letters??\nalso the count is so much older than her she's a child when shes sent to marry him\nprince jacob is the villain but y im kinda eating it up tho",
  "my beloved oppressor": "holy misdirected anger\nthe dad tortures and trains orphans to be foreign spies and ml climbs his way up to the point he lets him marry his beloved daughter?\nand then after he leads the revolution he drives her to suicide\nrest of the story follows her as a nurse in the war",
  "once it was love": "ml orchestrates everything and hypnotized(?) her husband into not being able to see her so she could shee him cheating and he could manipulate her to get with him instead or smth",
  "run away from me": "escape me if you can\ndaphne used to be the king's beloved princess but he found out that they're not related (mistress cheated on him and hid her eye color w a magic pendant) and turns her into a maid but she's not paid and can't leave\nprince asharad and his mom used to be mistreated by the king because of daphne and her mom\nhe pretends to be a good older bro to her and acts nice to her while she's a maid but is actually making her life harder and treating her like a dog\ndaphne tries to run away w a knight who fell in love w her but ashrad thwarts their plan and captures the knight\nhe blackmails daphne to sleep w him to save the knight",
  "a deal with my fake husband": "everything is.. so literal\nthe writing is really bad and nothing is left unsaid\nat least the art is decent but im so bored\nand they're setting up the met in childhood trope so cliche",
  "a flower blooms on the wall": "looked interesting but art was actually not as good as it seemed on the thumbnail and the writing really sucks\nher childhood friend is a world famous super model and she's his first love but she doesn't like the concept cause her first love stalked her or smth",
  "a happy ending for villains": "poor art but ok story overall\nliterally all the guys in it fall for her at first sight for some reason, but the revenge planning and payoff works alright, and the fl is smart and manipulative\nsome plotholes and weak character characterizations but can be overlooked\nsasha, the daughter of a nanny, is like a sister to the three young masters of the duke serpente family\ntheir relatives lock them up in a tower after the duke and duchess die and keep them in there for 2 years before they manage to escape\nbut the little sister dies because of her untreated pnemonia",
  "a villainess for the tyrant": "fl pretends to be spoiled so she doesnt get assassinated and the emperor instantly takes a liking to her",
  "age of arrogance": "manhwa and novel",
  "akuyaku reijou wa ringoku no outaishi ni dekiai sareru": "pretty generic and the main plot already resolved but we're still only halfway through?",
  "anyone can become a villainess": "mc is named nivea, she's good with a bow bc she was an olympic archer in her past life\nshe runs away from the temple because she knows she's going to just be used by her family when she becomes the saintess and tries to make the journey back to her duchy with a stranger who is secretly the crown prince\nshe befriends her aunt who was a war hero/commander but had cut off her family since she blamed nivea's dad for letting her sister (nivea's mom) get poisoned by her supposed best friend, who's now her stepmom\nher stepmom has been poisoning her father and younger sister too and he's not rly lucid most of the time but nivea comes home and reveals it\nml and ex fiance are simps, art is not good, and none of the characters are likeable",
  "beatrice": "mc is stupid as hell and her ex husband looks like a dumbass toad with a powdered wig it takes you right out\nalso she looks like a literal child even though she's 25\ncharacters are unbearable after they get together and their actions or 'redemptions' really don't make sense\nart is sometimes like mother's contract marriage but like worse",
  "bella poupee s engagement": "pathetic puppy dog ml and dom loli fl not my thing",
  "betrayal of dignity": "chloe verdier is the daughter of a count and has a bad leg because of a childhood illness so she has to walk w a cane\nthe duke takes shelter in the count's region during the war w his men and she helps tend to the injured\nafter the war the count is in financial trouble and needs to marry off her sister but she runs away w her lover who they think is a bum but turns out to be the king of the neighboring country\nshe's framed for poisoning his rumored lover - it's a plot by the royal family and scumbag prince but he saw her coming back from staying the night at her childhood friend's place in the stables so he plants the evidence in her room instead so he can save her after\nshe finds out he orchestrated everything since they first met (her father's bankruptcy, her murder accusation) through a safe in his office\nchloe who was pregnant catches an illness but refuses to take medicine cause it'll harm the baby, but damian feeds it to her and she miscarries\nhe wouldn't let her leave so she fakes her death in a burning cabin and starts a new life as a family's governess in a small town far away",
  "between seasons": "complete but quickly scrolled through most of the second season\nit's just smut, basically marry my husband minus\nand then suddenly changes into 50 shades\ngirl is always into it for some reason it just doesn't make sense",
  "beyond yearning and obsession": "writing is bad and everyone knows everything or guesses exactly what happened\njulia is super abused by everyone bc sir camille who acts nice to her manipulates everyone else into bullying her\nalso she can't speak or remember anything from her childhood\nshe gets kicked out and picked up by sir glen, a duke\nturns out to be an illegitimate princess btwn the king's dad and his lover who was forced",
  "black chain": "this girl bipolar i s2g she despises him one sec and then protects him and gives up her lifespan for\nhe wanted to beat his fate as a dragon emperor and be free so he purposefully ignored her and took on a different queen but then regretted it when she killed herself\nand then he just groveled the whole time and then she forgives him it's just so shallow\nand now she shares part of his heart so she can feel his pain and love bro...\nidk they just add so many things to it and see what sticks\nthe story isn't really cohesive and it's such a slog to get through",
  "can i cancel the confession": "can i take it back?\nseries cancelled due to plagiarism",
  "can we become family": "started kinda interesting but goes so off the rails\nshe is the reincarnation of a god and her dad is basically a demigod\nshes an orphan brought as a temp replacement for duke agnes daughter set to marry the crown prince\nhis actual daughter suffers from too much mana sickness and her teacher cures her in her past life\nshe has lived 7 lives and always resets to the same time and has a countdown tattoo only she can see\nthis time she manipulates her adoptive bro into kidnapping her to the ethelred duchy and begs duke ethelred to let her stay for a year\nhe's also a regressor but hasn't seen her before and turns out he's her actual father",
  "can t get enough of you": "p shallow story ripe w secrets and misunderstandings that were dragged on for so long but had no payoff bc everyone forgives each other so easily\nreminds me of iseops romance and to you who swallowed a star\neverything is a lil pretty sometimes but very stiff\nsubverted some tropes at the beginning so i thought it might actually be good but then it gives up and just becomes so generic\nhe barely bullies her so the plot description was really misleading\nlmao they rly just introduced a new ml 100 ch in",
  "captive in dreamland": "wtf was that",
  "cheating men must die": "bad translations and art manhua",
  "children of orbit": "mtl 1/3/2025\nung's big sis bin got kidnapped as a kid so their family dynamics are weird and he pretends to confess to the girl she likes youngbin but then actually falls in love",
  "dame in shining armor": "awkward art and bad writing\nshe's about to be executed but gets fed the herb of time orchestrated by edward bailey since his family is guarding it secretly\nhe also goes back in time so both of them have their memories\nhe's trying to prevent his parents from being murdered in a 'carriage accident'\nshe bumps into her husband in her original life on the streets and he puts her under house arrest until they verify her identity bc she's supposedly dead already",
  "degree of love": "subverts a lot of tropes refreshingly\nyejin/gugu (lol) is so hamster, and hyeon has yandere tendencies + soulless eyes\nthey both grew up poor and now live in seoul becoming a researcher and a taekwondo champion respectively",
  "demon king s confession": "demon king is a girl, fmc wants to be a paladin but has dark powers instead",
  "depths of malice": "side story is au where second ml wins\nfml family ruined and dying, steals body of suicidal rich girl, takes revenge on count who did it\npersonality is kinda bad tbh, smut",
  "dine with a vampire": "yaoi",
  "divorce plan with husband failed": "boring, tries to be too wholesome\nfailed to divorce the tyrant",
  "don t pick up what you threw away": "dropped for novel instead",
  "dreaming freedom": "former kpop trainee can murder in dreams\nhe becomes kinda a wimp and reverses yandere role with fmc",
  "duke richard s haven": "i generally like the characters in the beginning but man i wish it wasn't a reincarnation story\nand i wish the writing wasnt so cliche\nbad actor for characters voicing all their reasoning as they do it and it makes little sense even with that\n2ml is pathetic to an annoying degree like he gives up his entire career to chase her\nactually the characters are kinda frustrating why can't she just say things instead of just turning around and walking away",
  "duke that man is my real brother": "cringe\nastel and duke anais the wolf shape shifter who thinks her brother is her bf and her nephew is her son",
  "earl of nottingham": "what the fuck is the genre\nit's second chance life oi that turns into.. her being arrested and then moving to america where she is loved by a mafia boss and then gets shot and meets a deity who had accidentally sent her back in time too far the first time\ntheir son is deaf and they named him after the guy she got jaled for hiding",
  "ekikoi": "station attendant and rich girl, didn't care for love contract trope",
  "elissa s whirlwind marriage": "didn't make it past the beginning where they're children\nso boring and the fl is so annoying, ml is classic tsundere",
  "elixir of the sun": "should've dropped it way earlier\nbayan the black haired siyo and dhan\nreads pretty cringe m",
  "finding camelia": "camellia and her mom live on the streets of louver, but her father duke bale scoops her up so they could strengthen their family while her brother kieran was sick\nher brother's friend duke ihar is scary to her at first when she's little, and prince ian sergio is her first friend, but she ends up with duke ihar\ndrags a lot at the end, was better when she was still disguised as a boy",
  "finding camellia": "camellia and her mom live on the streets of louver, but her father duke bale scoops her up so they could strengthen their family while her brother kieran was sick\nher brother's friend duke ihar is scary to her at first when she's little, and prince ian sergio is her first friend, but she ends up with duke ihar\ndrags a lot at the end, was better when she was still disguised as a boy",
  "for better or for worse": "characters are so so over the top\n90s shojo art in a bad way",
  "for the third time": "can't take stand the art\ntime keeps rewinding back to the day they hook up or smth and only they know abt it",
  "for those of you for whom regret is a luxury": "revenge already happened and now kinda boring\naria is a composer but her brother stole all her compositions and her fiance is cheating on her with her sister, she comes back to life and exposes them and then gets credit back after marrying a duke who turns out knows her but she doesnt rmb",
  "for your murder": "mann i wish this had romance\nmc starts as such a doormat that it was rly frustrating at first but it's to build her up\nreally wish they did more with the ending but there's not too many paths the story could have gone from there\nif anything his plotting was very obvious and it's a wonder he hadnt been caught sooner",
  "from knight to lady": "surprisingly refreshing artist and writing\ngreat character depth and subtle visual symbolism, although the main romance is a bit boring, the rest of the plot makes up for it\nersha's commander estelle is betrayed by her close friend and second in command khalid, and they lose the war\nshe wakes up 3 years later as lucifella, who threw herself into the icy lake after being spurned by the toxic crown prince temir\nshe and duke heint are engaged by her father's plan, but he's the enemy commander who killed all her comrades, though they eventually fall in love\nkhalid wanted to protect her from the truth that she was being used and sacrificed, and since she was being sent to die anyway he couldn't think of any other way",
  "from today on i m a boy": "cute in some parts but story is pretty basic and the pacing is kinda off\nmany times it seems like the plot will lead somewhere but doesnt really do anything w it\ni like the mc shes stoic and cool\nthey didn't really do anything with the romance and a lot of times it just really tries to be deep but it falls flat\nart is a bit wonky but cute at times",
  "garden of the dead flowers": "mila is sent back in time and sees her grandpa killing a woman but it's actually his secret twin",
  "golden forest": "hit all the tropes i like so i was rly into it while reading but ending w kun didn't really do it for me\nreniae and kun/gizzida",
  "hadashi de bara wo fume": "rly poor girl takes care of four small children that her older gambling addict brother keeps picking up\none day she gets picked up off the street and contract marries soichiro bc he has to get married to inherit his granpa's company\ninitially he's tryna set her up w his friend nozoku who is like a prince to her\nml turns out to just be tsundere and his friend turns out to be a huge yandere obssessed with her\nshe turns out to be his sister, which they tease rly heavily early on",
  "hot black tea": "only kept reading cause i thought this one was complete\ngirl is the daughter of a house keeper who looks exactly like the young master who gets into a car accident\nthe mom pays her to pretend to be him at his school\nshe is not convincing as a guy and they all immediately figure her out pretty much",
  "how far are you ok with": "not super interesting\na sunbae returns to school and at some point, she saved the ml who was going to off himself by offering him free coffee when she was working there\nhe goes to same school to meet her again, and he gets together with her\nshe likes being tied up and blindfolded and cosplay stuff so they try it together",
  "how far can we go": "kinda boring and everything's too easy\nrich family found their lost daughter at an orphanage but she was switched out with fl instead\nlater real daughter comes back and they start mistreating fl\nml has prosopagnosia except he can see fls face for some reason",
  "how raeliana ended up at the duke s residence": "meh\nraeliana and beatrice switched souls or smth",
  "how to break up well": "the art kinda sucks and they do that creepy face thing 8D which is so unnatural and really takes you out of it\nalso they keep rehashing panels over and over so they can show you a different perspective but it ends up being so repetitive and unnecessary\nshe becomes a youtube livestreamer halfway through\nhe's obsessed with being a writer and keeps referencing it like it's some grand skill cringe\nit's kinda whiplash cause they pepper in sex scenes like it's a smut but it's generally a mystery drama around one big crime ring",
  "how to hide the emperor s child": "pretty repetitive and really chugs along once she becomes empress again\nthe emperor never even has a good reason to divorce her in the first place if he's just going to be nice to her immediately\ntbh none of the characters really have good motivations for things so the pacing is so weird sometimes",
  "how to prey on your master": "completed but honestly shouldve dropped bc it was so boring\ndame elle gets an assistant who is the mad dog duke theo, who calls her master and is a huge simp. turns out to be a regressor who watched her get framed for the murder of the princess by his uncle. everyone loves her and she has a fanclub and she's the princess's guardian knight in this life\ndidnt read side stories",
  "how to survive as a maid in a horror game": "mc is cringe and game system is very in ur face",
  "how to use an angel": "yoon kiom is captured by demons as a sacrifice and is saved by an angel who was sent there to take her soul\nshe's an archdemon who sealed herself in a human body to be near a human she loved (who is now her younger 'brother' after his older brother/her friend died)\nthe writing just wasnt that good man\nexposition by characters just explaining things and then plot reveals that aren't really that interesting\ncharacter motivations seem very shallow\nthe art was cute at least",
  "i became the hero s rival": "complete but should have dropped\neveryone loves mc who's like a hamster, especially claudia (fl of the original novel) and her brother felix\nthen the brother suddenly gets a demon put into him by the three original novel mls (the crown prince, duke, and priest) and loses part of his soul\nhe leaves to protect the mc and disappears and then reappears as a different person who's now a war hero and the demon ate his feelings\nturns from pale skin white hair w glasses to tan black hair dude rofl",
  "i dont love you anymore": "discount remarried empress\nnew ml immediately falls in love with fl despite her proposing a contract marriage and declaring she'll never love anyone again and her ex immediately regrets it once she leaves",
  "i got pregnant with the tyrant s child": "could have been interesting but the writing is so bad\nall the characters are stupid and all the mls like her before the story even starts\nthe emperor also links w her in her dreams through a spell\nand of course she has twins",
  "i mistook the identity of the hidden submale lead": "dropped and also it stopped updating anyway\ngirl who used to stalk the duke suddenly remembers the novel and becomes a maid at the palace\nshe has to the power to amplify or calm down powers and she fixes the royal family and everyone loves her",
  "i reincarnated as the little sister of a death game manga s murder mastermind and failed": "mai acts goofy to surprise him so he doesn't get bored and kill everyone\nweird step sibling dynamic and they get married...",
  "i stole the male lead s first night": "ripley and the duke\nso cute, and ripley is a fun fl",
  "i tamed a tyrant and ran away": "should've way earlier but hoped it would get better\ncharlise was turned into a magic sword in her past life and goes back in time\nleaves her uncaring family and becomes the 13th prince dylans swordsmanship teacher so she can get revenge on the empire\nhe's neglected bc his mom is a concubine\nhe calls her master the entire story",
  "i tamed my exhusbands mad dog": "revenge plot doesnt rly make sense and then the mistress kills the ex husband and then herself\nmale lead is illegitimate son of the emperor and also regressed from their last life and then he just simps over her from childhood\nart is kinda jank, reminds me of Your Throne",
  "i thought it was a common isekai": "they make it like a game where there's some hooded figure tryna mess her up but she keeps clearing conditions\ndon't really like that",
  "i thought my time was up": "ml is too puppy dog\nasrahan and lariette who was going to die in three months because of a mana overload\ndoha the high priest pretending to be a regular clergy member and heals lariette",
  "i was the acting empress": "he just immediately loves her for no reason (they each have fire and ice magic so they balance each other's temperatures out or smth), also he's then pressured to take mistresses",
  "i wasn t the cinderella": "should've a long time ago\nher lover was cheating on her and gets engaged to a princess but her father finds her and her mother and it turns out he's a duke\nshe trains as his successor then comes back to her revenge by getting engaged to her lover's brother, who's mute and in a wheelchair\nexcept he's not even related to the marquis family, he's royal lineage and can walk and talk and has the power to speak anything into existence...",
  "i will surrender the position as empress": "was an ok read at the beginning to pass the time but really no substance and drags on, doubly so near the end\nshe allows herself to be wedded to a neighbouring kingdom to not threaten her lil brothers position, and actually she's a super strong magician swordfighter who gets rid of all the monster towers that keep dropping\ntakes a duke as her 'advisor' aka concubine and he's the mc. emperor she married is cartoon evil against her and then loves her when he realizes she's indifferent towards him and then they kill him and his sister takes over as empress",
  "i m the male lead s ex": "everyone just loves erica, it's almost a reverse harem but they really push her with the magic tower grand mage zionne while the original ml and fl r just sidelined and barely have any screentime\nzionne has a diary that his future self sent to him, then saved the crown prince from being poisoned and disguises him as his sister juliana and sends him to work as erica's maid\nidk the art is inconsistent and they keep adding frivolous plot points that really don't go anywhere",
  "i m the soldier s ex girlfriend": "was an interesting premise with the demon king befriending her pretending to be a normal civil servant and creating an entire fake palace facade for her so she could become an official, but turned into slop\neverything was just generic and boring fluff after all\nthere's a plot twist where the mc maise isn't really an isekaid south korean girl, but has been the mc in the book this whole time\nshe was just confused bc she accidentally had memories from the author yoon sooah who she met in a previous life",
  "i m the tyrant s secretary": "main couple have good chemistry and mc is quite capable\nsome cliches, and the chapter ordering was a bit odd at the beginning (nsfw endgame scenes ch 2 and 3 immediately) but if you ignore that it's fine otherwise\nschemes weren't that deep and resolved pretty fast but enjoyable read overall",
  "if you so desire my despair": "it's so bad\nshe becomes an orphan and lives on the streets until her extended family marries her off to the new duke\nhe hates her family and all the servents bully her\nshe meets one of the duke's knights and they become lovers so the duke sends him to war and he dies\nthe fl is rly cringe and nothing makes sense",
  "irregular empress": "estella arthur genderbend knight who has a witch seed",
  "it s mine": "kept reading cause i wanted to know the answer to the mystery but they're just half brothers who were locked in isolated rooms as kids by their shared dad as an experiment\nyohan is just not the type of ml i enjoy (pathetic stalker)",
  "iyashi no otonari san ni wa himitsu ga aru": "nishina and fujiko\nneighbor who moved next door is secretly obssessed with her bc she saved him from jumping when he was younger and also he's rich and good looking\nshe finds out he's been stalking her when accidentally going into his house but she forgives him and they marry each other immediately",
  "just leave me be": "green hair mc decoding ancient pillars realizes she's a direct descendent of the hero who sealed herself off in the fairy forest",
  "just twilight": "the dawn to come",
  "kanojo ni haru hi another": "very manga tropey\nguy turns into a girl overnight but tries to hide it",
  "kill the villainess": "everyone is obsessed over the fl for no reason wtf is even happening the story is trying to b so deep but it's dumb ass\nml is anakin",
  "kimi wo hitori ni shite agenai": "guy is a complete simp and the story is so bland and predictable\neveryone is just playing a part",
  "lady baby": "her family gets slowly picked off and framed in a scheme but a random woman sends her back to when she was a baby because she wanted to hear her sing and fix the world\neveryone loves her and she becomes a model and idol who sings secular songs alongside a famous piano prodigy, which is taboo, and the major church is evil and the ones who worked with the emperor to dismantle her family last time\nthe crown prince remembers their past live and is the ml, and tries to secretly help her in the beginning but didn't want to reveal himself to put a target on her\nthe emperor pretends to favor him over his own son because he's not supposed to be holding the throne, and also he's using the fountain of atei to live forever",
  "let me die in peace": "started off strong but they kept skipping past important resolutions, and the ending was so rushed and unsatisfying\na switch flipped and she suddenly became so flustered and the priest became so lovey dovey\ni wish they would have kept the angst and fear of her insane ex\nthey really could have done without the head of the mage tower character (lady didier) and the monster barrier\nalso the guy he hired to kill her (nau) stopped showing up or even being mentioned by the end\nfrom the start her plan to die painlessly didnt rly make sense since as far as she knew she wouldve kept reviving",
  "let s hide my little brother": "it's ok i guess\nmc kyla is not that likable to me personally\nand ml is puppy yandere type though there are a couple of good moments\nthe magic system in this is not that interesting (magic and spirits that talk to him and tell him what others are thinking)\nalso they never really resolve the b plot where she regrets how she ignored her little brother in her previous world/life\nart is the hand style i don't really like but they draw hands rly well lol",
  "light and shadow": "mc secretly raised as prince but escapes and becomes maid, marries duke in place of the lords daughter",
  "lips on the tip of a knife": "very poorly written\none of those where the characters actions within their thoughts while doing them and it's the most convoluted thing\nit's so unserious but not actually funny\nmc is such a mary sue and her personality changes to whatever is convenient\nshe's a tomboy supposedly but is all blushy and feminine to be nice to people\nactual quote by a villain: 'hahaha i cast a spell on those bars so you cannot break them unless you're a swordmaster'\nwhy is every single character living their whole lives for her\nthe entire military went on strike just because she left?",
  "love at first bite": "when she was little she was so hungry she took a bite out of a fruit on the ground that turned out to be a dragons heart\nworking as a maid later, the dragon shows up again as lord calyx searching for the person who ate his core so he can kill her\nshe cures his insomnia cause she has his core so he keeps her near\nstupid ass fluff so boring\nclassic he's mean to everyone except her and then she says he's scary so suddenly he's less mean to everyone else",
  "love song for illusion": "love the storytelling method of events unfolding and the narration showing what was historically recorded\ndoes make u vry sad knowing what led up to everything when the pieces fall tgthr\nreminds me of the red fox",
  "lucia": "ugly art and boring story/characters",
  "marked by king bs": "whitewashed names (annie, ashton)",
  "marriage and sword": "art isn't that good and they like each other immediately, pacing is also so off and everything is so unnatural and in your face\nelze joined the army as a male mercenary to earn money for her brother's tuition and fought alongside shan, and they have a political marriage by decree of the crown prince",
  "marry my husband": "manhua bs",
  "miss not so sidekick": "pretty refreshing; can be funny and entertaining at times\nhumor and art can miss a bit but generally enjoyable, eg calling the mls fishies was a bit overplayed and the visual gags were whatever\nthe more serious setups fall flat and come out of nowhere\nmc is goofy and gets straight to the point, which is quite endearing she really grows on you and doesn't flounder around once she realizes she likes arwin and vice versa\nthe ml and wizard tower cast are a lot of fun and some great gags/pop culture references to classic anime ips",
  "mr delivery knight": "man this was really funny and sweet\nkinda like greatest estate dev but with much better art",
  "muse on fame": "fl is an aspiring actress but her career hasn't taken off so she has to work as a part time cleaner\nher college sweetheart is a director and is working with her hubae who's now a famous actress and has always been jealous of her so tries to homewreck\nshe stumbles into a posthumous photography exhibit where she's the subject in all the photos, taken from when she used to be a young and happy up-and-comer. the photographer took them all secretly but an agency convinces her to pretend she was good friends w him\nshe becomes rly successful and her hubae booms her career after problems w alcohol and then eventually kills herself\nat the end, it turns out her manager's brother was the photographer and his sister in law is the ceo of the agency\nthe ceo reveals in another exhibit that the whole story was a lie and her husband was obssessed w beauty bc he was born disfigured on one eye and eventually died young to a genetic disease\nthe brother found all his secret photos and journal hidden in the ceiling during a suicide attempt and she found out that he never really loved her\ntheir mother was a famous actress and the movie she starred in is the fl and manager's fav and they both star in the remake before he dies of his disease",
  "my blood curdling campus life": "premise sounded interesting but it's really just fluffy slice of life and boring\nshe gets into a prestigious university as the only human in the vampire class bc her blood is energizing or smth",
  "my crush got possessed by the duke": "reverse isekai where sooah's childhood friend yuseong gets possessed by the cold duke of the north of a novel she read\nshe eventually helps him go back to his world by falling in love w him and then he begs a dragon to send him back to her world but this time as himself\nsooah has no memories of him and then her friend asks sooah to set her up with him so there's conflict",
  "my ex boyfriends fell in love with me": "dialogue is cringe and stupid shojo tropes in manhwa somehow",
  "my husband was stolen twice": "writing is straight ass\nstarts in modern world where her friend hands her a wedding invite but the groom is her own husband\nthen she dies when the building collapses three years later and wakes up as rose in a dark romance world\nshe's married to count eric who cheats on her with everyone, and finds out that her friend has woken up as one of her maids, and she immediately seduces the count\nthe friend is so cartoonishly evil and stupid, and ultimately doesnt even show up in the plot",
  "my inlaws are obsessed with me": "girl immune to duke family's poison blood",
  "my sister s private life": "chaotic and fun, haemi and haesu swap places but she has amnesia",
  "naisho no stalker san": "oneshot of office worker who comes home to his apt where his stalker cleaned and cooked for him and then comes and fks him at night\nit turns out to be his junior at work",
  "not knowing the betrayal of that day": "ugly art and boring\norphan girl married off to old duke and tricked into selling her friend to slavery then he overthrows the duchy",
  "nullitas": "cringe dialogue",
  "observation log of my fiancee who calls herself the villainess": "not my thing, she's just out with it immediately to him about being from japan and this being an otome game, and she's so deluded into setting up everyone and following the storyline\nboring boring boring",
  "oh dear nemesis": "she was a tomboy tyrant and betrayed then killed by her lover, reincarnates after and goes to her nemesis\nfind out later that he also keeps reincarnating and she's always doing smth different in each different loop of his life\nidk mc is just not likable",
  "olgami": "park yeon soo and han chae ah with a side of geurim",
  "once a hero": "weirdly turns into a magic girl show structure in the middle\nok great and it was marked completed but it was actually cancelled so it just cuts off",
  "one half of a married couple": "nibun no ichi fuufu\nshe thinks her husband's cheating but he's getting blackmailed by her friend who drugged him and took photos",
  "one of a kind romance": "ml is an actor w a fear of people taking sneak pics and he misunderstands fl as a stalker fan but they eventually fall in love\na celebrity chef is the 2ml and tries to get revenge on ml since he unknowingly caused the car accident that killed his mom",
  "perfect secret wife the bad new wife is a little sweet": "classic cringe manhua",
  "perfectly fine on my own so my fiance can twist in the wind": "hinges on dumb misunderstandings\nlike it would b interesting if her fiance actually likes the princess and neglected her bc of that but he's just a clueless guy who's awkward w girls? nahh\nthe entire class gets involved blocking her fiance cause they think he's abusive but when they clear it up they still gate his access to her? and weren't they gossiping and making fun of her at the start",
  "please kill my husband": "they end up as a thruple pretty weird\nwriting kinda blows",
  "princess in the attic": "she's literally explaining every single thing in her thoughts\nthis is the most egregious example so far by a mile\nher inner monologue sounds like a badly written first-person werewolf fanfic\nAND she has a mascot she talks to",
  "proud to be the villainess i m doomed after stealing my half sister s fiance and having her banished": "surprisingly refreshing, wellmy pretends to abuse her sister iori to save her but uno reverse all the main characters caught on\nher sister marries the disguised crown prince and she marries the lord of magic she was trying to set her up with\nand her teacher turns out to be her real father",
  "put me to sleep": "not that into the trope in the first place where a character can finally sleep well/not have headaches by having contact with another character\nand she just kind of goes out and creates scandal and sleeps w a masked mystery man meh while hiding her headaches and just pretending she's promiscuous\nthen something about her being a chosen one i don't remember",
  "reason why the twin lady crossdresses": "should've way earlier\nreads like manhua tbh, pacing is all out of whack, dialogue is cringe, and art really isn't that good",
  "rebirth of a tyrannical empress": "was boring and everyone came around so fast to her\nthey dropped all the explanations in one chapter instead of letting u find out the mystery\nand it turns out the tyrant empress was just drugged before and now everyone likes her again",
  "red fox heul redam": "sequel to red fox w better art",
  "revenge movie queen": "classic cringe manhua",
  "revenge on the real one": "drags on so much for the B plots and the focus is on her magic artefact business solemio instead of anything actually interesting\nit was good when she was younger, even though her entire family were pretty much cartoon characters and everything is so insanely one dimensional\nher secretly being a great magician is so random and really adds nothing when she's already also an insane business leader at 14",
  "rumor has it": "hyejin moves to her own apartment for college and her next door neighbor is her ex haejun\nshe broke up cause her friends kept pressuring her and now she has dating trauma and always keeps things in\nthey both still like each other but she's super awkward\nthere's a problematic senior who ends up spreading rumors but she exposes him and gets payback",
  "sacrificial princess": "boring\nthey try to sacrifice her and summon killian but apparently she already paid the price cause she kept being sacrificed in past lives",
  "second life of a trash princess": "man, the story is really carried by the art, which is not that consistent in the first place\neveryone princess legina knows is killed by her fiance herman and his 'paramour' sorcerer annette who led a revolt\nannette can use hypnosis magic and is actually lady evaldine, a witch/mage who was betrayed by the first emperor after he used her to climb to his position so she wants to get revenge by killing his entire bloodline\nbut legina uses an ancient necklace by sacrificing her life to make a wish to save her younger brother who was a spoiled brat but who she loved\nshe goes back in time and tries to act like a bigger brat than him but really she doesn't, her personality just changes and she becomes more outspoken\nher dad hated and kept turning her away for her entire childhood bc he wasn't allowed to see the empress on her deathbed after giving birth to theore but suddenly he's chasing after her in this one?\nthe ml is so bland, he's just a pretty face with no personality\nstarted strong and she began as an itachi like char but really didn't go anywhere",
  "secret alliance": "chae yul pretends to be chae yuri but sian ends up w hyujin the chef",
  "secret of house francezca": "can't place it exactly but this is the kind of webtoon i really dislike\nfake deep and stiff cliche characters\nshe and her brother were turned into puppets with dark magic and stabbed each other\nshe returns to her fathers funeral in the past and fakes her death and uses an amulet to pretend to be her brother so she can become head of the house",
  "secretary undercover": "awful ceo manhwa writing",
  "seduce the villain s father": "mc too bubble, mc boring, heal through touch trope from divine energy bc her body cant stand magic",
  "shadow queen": "didn't read but its cancelled at 60 since the artist was underpaid",
  "she s the older sister of the obsessive male lead": "super fluffy style i dislike\nstarts from when they're children and yurenia becomes a saintess while her brother and their friend go to knight school\nshe gets this black panther from god sidekick\nher brother killed her in the past",
  "sister i m the queen in this life": "all characters annoying - ariadne, al, isabella, cesare",
  "solitary lady": "meh saw a bunch of hype around this so i thought itd be stepmother marchen/secret lady tier but it's not good at all\nur telling me she started her 7th life with a completely different personality?\nthere's really nothing interesting about this story, it's just stupid tropes that we've seen a million times in magic oi slop that's even more poorly executed\nok and then it turns out she's the incarnation of one of the original 4 founders or smth and she goes on a hunt for items with the king's breath so she can die",
  "stairway of time": "skimmed",
  "starting over with the dead you": "they make it really obvious from ep 1 that the ml from childhood was twins that switched lol\nunexpected yandere ml out of nowhere which was cool tension at the beginning\nbut then once you figure it out and they get together (which is pretty early) it gets kinda boring and he's pretty controlling\neverything is very surface level and convenient idk\nAND THEN SHE TELLS HIM SHE'LL FORGIVE HIM IF HE WAITS 10 YEARS AND SHE'LL KILL HERSELF IF HE SHOWS UP IN FRONT OF HER BEFORE THEN\nBEFORE SKIPPING 9 YRS AHEAD INTO GERMANY",
  "surviving as an obsessive servant": "completed but it never got better\nlobelia pretends to be a man so she can become the mae servant of edric the duke's illegitimate son who has the same disease as her\nshe gets better by touching him so she acts like a weirdo creep to the 12yo\nboth of the turn out to be a fairy race called diffs\nnothing in this story makes sense\nall the action reactions are ??? and they really skip forward through everything\nextraordinarily bad for something with ok art",
  "tenants from another world": "characters are all really stupid and annoying\ntries to be a comedy but also tries to be too serious\nchapters end abruptly and start somewhere completely incongruent so it keeps jumping around\nstory is just as incoherent\nwhat the fuck is that pacing",
  "that wasn t my plan": "she was bullied in her first life as a manager of the big name actor siyun and dies after getting struck by a car\nshe finds herself back in time with a younger siyun before he debuted and his personality is way different, shy and respectful\nshe decides to get revenge and sabotage his career so he never becomes famous in this life\nbut then she realizes he turned out that way because of the constant stalkers and paparazzi, and he mistakenly thought she was one of them\nin this life, that bond and end up liking each other, but when he confesses, his previous life memories suddenly flood his mind and he apologizes profusely",
  "the abandoned empress": "kinda has 80s manga style\nred/green/blue hair love interests, she ends up with the blue hair prince who treated her badly the first time for the sk girl jieun",
  "the blood of madame giselle": "wtf was that ending\ngiselle kills isaac cause he was the killer",
  "the duchess has a death wish": "i'm the villainess, can i die?",
  "the evil lady s hero": "stopped reading a while ago cause she ended up on some swamp expedition and it was just dragging on\nher name is yunifer and she's like some healer along with the original mc lol",
  "the flower dances and the wind sings": "weird art and writing\nshe dies and goes back in time 3 years and suddenly has a completely different personality and wants to be a good mom to her 15yo son",
  "the maid and the vampire": "wtf was the pacing\nso weird",
  "the male lead is a murderer": "meh\n2ml resembles real life person who actually had crush on author before she died",
  "the portrait of the late prince": "painter held captive to paint the late prince since she painted him before but he's actually the captor under a new name",
  "the price of breaking up": "very average, beginning and middle were enjoyable and art was decent\nplot is predictable and shallow, kinda the same premise as remarried empress, except mc is very much a mary sue\nml is rly pretty and kept me guessing if he was a yandere villain at first but then turned out to just be just a boring green flag\nsia is engaged to the crown prince since childhood bc she has pink hair and is the chosen one from the prophecy so the royal family claims her\nemperor is cartoon evil and doesn't let her leave the palace except once a year to see her family and gives her a ton of work\nwhen she's older the temple announces that she's not the lady of the prophecy and this other pink haired girl is so the crown prince breaks if off with her and then goes through the whole sovieshu imprison her in the palace and then regret it and be jealous and grovel for the rest of the story\nml is the pope and met mc in childhood and fell in love cause she saved him from the other priest kids who were bullying him\nending was exceptionally boring and a crawl to get through",
  "the red knight needs no reward": "nice art and had promising plot points but they really disneyfied everything which made it kind of sickenly sweet boring and unbearable\ndidn't explore any angst or trauma more than just mentioning it and then resolving it with 'oh well that was the old silly me'\njudith was a rogue turned black knight who only cared about money bc of debt, assassinated a bunch of people for her captain jeromell who stabbed her to silence her after she killed the third prince\nshe got the stigma of time which brought her back to the selection exam and she chose the red knights instead, where she and the captain immediately fall in love\nand then there's no buildup or prep for anything, just all the events start happening earlier and they get through it with sheer willpower\nand suddenly she's rich and the hero of the empire\nlike... everything is just too easy",
  "the second male lead is a girl": "ml enok is hella annoying sadist puppy yandere the artist changes halfway through\na girl is reborn as a side character in a novel who turns out to be the daughter of duke estella. rosa is found by her father the duke who can't have any more children and doesnt have a successor and made to live as a male using magical devices (a ring)\nshe befriends the original villainess (vivian) and mc (crown prince theodore) who all three become close friends, and both of them fall in love w her\nher dad turns out to be alive and working with the church to get revenge on the royal family by.... casting an ice meteor spell to destroy the empire",
  "the spark in your eyes": "complete and it's peak need a hardcopy immediately\nand the epilogue stories are actually good wtff",
  "the stalker is trapped": "smut where fl is stalking her colleague but he turns out to know everything and forces her to strip",
  "the villain s savior": "fl is simp crybaby",
  "the villainess lives again": "very political so sometimes slow but pays off really well\ntia put her brother laurence on the throne and her schemes were morally dubious, but laurence betrayed her and got all her limbs cut off\nshe promises cedric to make him the emperor and creates a magic circle to turn back time",
  "the villainess needs her tyrant": "another case of she becomes a completely different person when she revives into the past\nshe's just suddenly crafty and manipulative and dangerous just like that when she's been a pushover her whole life?\nhow is it possible that the tyrant emperor who kills everyone for no reason immediately falls in love with her when she suddenly kisses him in front of everyone and then wants to make her empress\nand then of course he's also a regressor and they were married in their prev life\nAND THE AIDE HAS CLAIRVOYANCE R U SRS\nnone of the actions or reactions of any of the characters make any sense\nthe way the artist draws hair is so nice but there's really no substance",
  "the villainess turns the hourglass": "mid\nmielle too easy for aria to manipulate and aria turns out to be a long lost royal",
  "the wicked wife of a scheming ceo": "dumb as hell what is pacing or dialogue",
  "this time i will find happiness": "louisa remembers her past lives where her childhood friend always gets selected as the hero and leaves her for someone else\nbut it turns out the demon king is the first hero who swallowed the demon king's soul after the kingdom killed her\nnow she keeps reincarnating and the demon king has been absorbing the previous heroes and they had to erase their memories of her to protect her and that's why they never came back",
  "to melt your frozen heart": "warrior cold duke of the north fl x puppy ml\ncute for what it is but teeters way too sweet sometimes, he goes around throwing 'my darling' around so much"
};
(function importPDFNotes() {
  if (localStorage.getItem('toonn-notes-v1')) return;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const toons = getToons().map(t => ({...t}));
  for (const t of toons) {
    if (!t.notes) {
      const note = _pdfNotes[norm(t.title)];
      if (note) t.notes = note;
    }
  }
  saveToons(toons);
  localStorage.setItem('toonn-notes-v1', '1');
})();
(function cleanStaleTimestamps() {
  if (localStorage.getItem('toonn-ts-clean-v1')) return;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const safeRecent = Date.now() - 7200000; // keep anything updated within last 2h
  const toons = getToons().map(t =>
    (t.updatedAt > midnight.getTime() && t.updatedAt < safeRecent)
      ? { ...t, updatedAt: 0 }
      : t
  );
  saveToons(toons);
  localStorage.setItem('toonn-ts-clean-v1', '1');
})();
const _altTitles = {
  // ── Japanese ──────────────────────────────────────────────────────────────
  "naruto": ["ナルト"],
  "one punch man": ["ワンパンマン"],
  "skip beat": ["スキップ・ビート！"],
  "sakamoto days": ["坂本デイズ"],
  "frieren beyond journey s end": ["葬送のフリーレン","Sousou no Frieren"],
  "frieren": ["葬送のフリーレン","Sousou no Frieren"],
  "mashle magic and muscles": ["マッシュル-MASHLE-"],
  "demon slayer kimetsu no yaiba": ["鬼滅の刃","Kimetsu no Yaiba"],
  "chainsaw man": ["チェンソーマン"],
  "fullmetal alchemist": ["鋼の錬金術師","Hagane no Renkinjutsushi"],
  "goodnight punpun": ["おやすみプンプン","Oyasumi Punpun"],
  "land of the lustrous": ["宝石の国","Houseki no Kuni"],
  "look back": ["ルックバック"],
  "delicious in dungeon": ["ダンジョン飯","Dungeon Meshi"],
  "mushishi": ["蟲師"],
  "the apothecary diaries": ["薬屋のひとりごと","Kusuriya no Hitorigoto"],
  "yona of the dawn": ["暁のヨナ","Akatsuki no Yona"],
  "the girl from the other side siuil a run": ["とつくにの少女","Totsukuni no Shoujo"],
  "witch hat atelier": ["とんがり帽子のアトリエ","Tongari Boushi no Atelier"],
  "the ancient magus bride": ["魔法使いの嫁","Mahoutsukai no Yome"],
  "the morose mononokean": ["不機嫌なモノノケ庵","Fukigen na Mononokean"],
  "monster": ["モンスター"],
  "the legend of dororo and hyakkimaru": ["どろろ","Dororo"],
  "dororo re verse": ["どろろ Re:Verse"],
  "hell s paradise jigokuraku": ["地獄楽","Jigokuraku"],
  "jujutsu kaisen": ["呪術廻戦"],
  "jujutsu kaisen 0": ["呪術廻戦 0"],
  "to your eternity": ["不滅のあなたへ","Fumetsu no Anata e"],
  "mob psycho 100": ["モブサイコ100"],
  "flowers of evil": ["惡の華","Aku no Hana"],
  "senpai is an otokonoko": ["センパイはオトコのコ"],
  "the witch and the beast": ["魔女と野獣","Majo to Yajuu"],
  "kemono jihen": ["怪物事変"],
  "natsume s book of friends": ["夏目友人帳","Natsume Yuujinchou"],
  "saiki kusuo no nan": ["斉木楠雄のΨ難","The Disastrous Life of Saiki K."],
  "maria no danzai": ["マリアの断罪"],
  "boys over flowers": ["花より男子","꽃보다 남자","Hana Yori Dango","Boys Before Flowers"],
  // ── Chinese ───────────────────────────────────────────────────────────────
  "chang ge xing": ["長歌行","Song of the Long March"],
  "1 2 prince": ["½王子"],
  // ── Korean ────────────────────────────────────────────────────────────────
  "omniscient reader s viewpoint": ["전지적 독자 시점"],
  "tower of god": ["신의 탑"],
  "true beauty": ["여신강림","Goddess Descent"],
  "the remarried empress": ["재혼 황후"],
  "your throne": ["그대의 옥좌"],
  "odd girl out": ["아웃사이더"],
  "lookism": ["외모지상주의"],
  "viral hit": ["싸움독학","How to Fight"],
  "how to fight": ["싸움독학","Viral Hit"],
  "the villainess lives again": ["악녀는 두 번 산다"],
  "lady baby": ["레이디 베이비"],
  "doom breaker": ["절대검감"],
  "gosu": ["고수"],
  "weak hero": ["약한영웅"],
  "cheese in the trap": ["치즈인더트랩"],
  "the boxer": ["더 복서"],
  "god of blackfield": ["검은 땅의 지배자"],
  "sss class revival hunter": ["SSS급 죽어야 사는 헌터"],
  "return of the blossoming blade": ["화산귀환"],
  "see you in my 19th life": ["나의 19번째 삶"],
  "iseop s romance": ["이솝이야기 로맨스","Inso's Law"],
  "the sound of magic annarasumanara": ["안나라수마나라"],
  // ── Korean (extended) ─────────────────────────────────────────────────────
  "a stepmother s marchen": ["어느 날 공주가 되어버렸다"],
  "all of us are dead": ["지금 우리 학교는"],
  "our beloved summer": ["그해 우리는"],
  "beware the villainess": ["그 악녀를 조심하세요!"],
  "the villainess turns the hourglass": ["악녀는 모래시계를 되돌린다"],
  "cry or better yet beg": ["울어, 아니 차라리 빌어"],
  "jinx": ["징크스"],
  "roxana": ["록사나"],
  "light and shadow": ["빛과 그림자"],
  "spirit fingers": ["스피릿 핑거스"],
  "the abandoned empress": ["버림받은 황비"],
  "kill the villainess": ["악녀를 죽여라"],
  "surviving romance": ["로맨스 생존기"],
  "unholy blood": ["불경한 피"],
  "the crown princess scandal": ["황태자비 납치사건"],
  "the pale horse": ["창백한 말"],
  "the broken ring": ["깨진 반지"],
  "tears on a withered flower": ["시든 꽃에 눈물을"],
  "secret lady": ["비밀의 레이디"],
  "my deepest secret": ["나의 가장 깊은 비밀"],
  "lady crystal is a man": ["크리스탈 레이디는 남자다"],
  "the maid and the vampire": ["메이드와 뱀파이어"],
  "guardians of the lamb": ["어린 양을 지키는 자들"],
  "miss not so sidekick": ["사이드킥이 아니고요!"],
  "from knight to lady": ["기사에서 숙녀로"],
  "this time i will find happiness": ["이번엔 행복을 찾을게"],
  "the villainess needs her tyrant": ["악녀는 폭군이 필요해"],
  "for my derelict favorite": ["내 방치된 최애를 위해"],
  "ghost teller": ["귀담아 들어봐"],
  "the world without my sister who everyone loved": ["모두가 사랑했던 내 동생이 없는 세상"],
  "lost in translation": ["번역가 무뢰한"],
  "your eternal lies": ["영원한 거짓말"],
  "the spark in your eyes": ["그 눈빛을 마주치면"],
  "marry my husband": ["남편을 바꿔치기해라"],
  "the villainess tames the beast": ["악녀가 야수를 길들이다"],
  "the remarried empress": ["재혼 황후"],
  "lady baby": ["레이디 베이비"],
  "the s classes that i raised": ["내가 키운 S급들"],
  "the greatest estate developer": ["황무지 개척기"],
  "golden forest": ["황금 숲"],
  "the golden forest": ["황금 숲"],
  "where the sun rises": ["태양이 뜨는 곳"],
  "gyeongseong mermaid": ["경성 인어공주"],
  "whale star the gyeongseong mermaid": ["경성 인어공주"],
  "the black dawn": ["검은 여명"],
  "the dawn to come": ["여명이 오기까지"],
  "children of orbit": ["궤도의 아이들"],
  "the tainted half": ["오염된 절반"],
  "how to win my husband over": ["남편을 내 편으로 만드는 법"],
  "the remarried empress": ["재혼 황후"],
  "omniscient reader s viewpoint": ["전지적 독자 시점"],
  "a mark against thee": ["그대에게 낙인을"],
  "purple hyacinth": ["퍼플 히아신스"],
  "my sister s private life": ["내 언니의 사생활"],
  "no longer a heroine": ["난 여주인공이 아니야!"],
  "the elixir of the sun": ["태양의 영약"],
  "the blood of madame giselle": ["마담 지젤의 피"],
  "for your murder": ["너의 살인을 위하여"],
  "black winter": ["검은 겨울"],
  "the rabbit hole": ["토끼굴"],
  "mystic prince": ["비술 왕자"],
  "finding camellia": ["카멜리아를 찾아서"],
  "finding camelia": ["카멜리아를 찾아서"],
  "the first night with the duke": ["공작님과의 첫날 밤"],
  "who made me a princess": ["어느 날 공주가 되어버렸다"],
  "the villainess lives again": ["악녀는 두 번 산다"],
  "the villainess savior": ["악녀의 구원자"],
  "the villain s savior": ["악녀의 구원자"],
  "a villainess for the tyrant": ["폭군을 위한 악녀"],
  "the abandoned empress": ["버림받은 황비"],
  "the duchess has a death wish": ["공작부인의 죽음 소원"],
  "surviving as an obsessive servant": ["집착 하인으로 살아남기"],
  "i m the tyrant s secretary": ["나는 폭군의 비서입니다"],
  "i m the soldier s ex girlfriend": ["나는 군인의 전 여자친구입니다"],
  "i m the male lead s ex": ["나는 남주인공의 전 여자친구입니다"],
  "how to get my husband on my side": ["남편의 편을 얻는 방법"],
  "for the remarried empress": ["재혼 황후를 위해"],
  "mr delivery knight": ["배달 기사"],
  "the second male lead is a girl": ["두 번째 남주인공은 여자다"],
  "the red knight seeks no reward": ["붉은 기사는 보상을 원하지 않는다"],
  "the red knight needs no reward": ["붉은 기사는 보상을 원하지 않는다"],
  "a happy ending for villains": ["악당들의 해피엔딩"],
  "second life of a trash princess": ["쓰레기 공주의 두 번째 삶"],
  "miss not so sidekick": ["사이드킥이 아니고요!"],
  "let s hide my little brother": ["내 남동생을 숨겨라"],
  "the male lead is a murderer": ["남주인공은 살인마입니다"],
  "lady crystal is a man": ["크리스탈 레이디는 남자다"],
  "from today on i m a boy": ["오늘부터 나는 소년입니다"],
  "the stalker is trapped": ["스토커가 갇혔다"],
  "secretly a maid": ["비밀리에 하녀"],
  "even monsters like fairytales": ["괴물도 동화를 좋아해"],
  "on the way to meet mom": ["엄마를 만나러 가는 길"],
  "homeless": ["홈리스"],
  "muse on fame": ["명성을 향한 뮤즈"],
  "degree of love": ["사랑의 정도"],
  "our beloved summer": ["그해 우리는"],
  "from a knight to a lady": ["기사에서 숙녀로"],
  "the sparrow and the wolf": [],
  "black chains": ["검은 사슬"],
  "once it was love": ["한때는 사랑이었다"],
  "the pale horse": ["창백한 말"],
  "the broken ring": ["깨진 반지"],
  "even when i m dead": ["죽어서도"],
  "the tyrant s comfort doll": ["폭군의 위안 인형"],
  "the redemption of earl nottingham": ["노팅엄 백작의 구원"],
  "run away from me": ["도망쳐봐"],
  "between seasons": ["계절과 계절 사이"],
  "between yearning and obsession": ["갈망과 집착 사이"],
  "betrayal of dignity": ["품위의 배신"],
  "love and heart": ["사랑과 마음"],
  "let me die in peace": ["편안하게 죽게 해줘"],
  "golden forest": ["황금 숲"],
  "the age of arrogance": ["오만의 시대"],
  "the tainted half": ["오염된 절반"],
  "black winter": ["검은 겨울"],
  "secret alliance": ["비밀 동맹"],
  "the blood of madame giselle": ["마담 지젤의 피"],
  "crown princess scandal": ["황태자비 납치사건"],
  "rumor has it": ["소문이 있다"],
  "depths of malice": ["악의의 깊이"],
  "the crown princess scandal": ["황태자비 납치사건"],
  "one of a kind romance": ["유일무이한 로맨스"],
  "trapped": ["올가미"],
  "just leave me be": ["그냥 내버려 둬"],
  "what remains in the damaged place": ["손상된 곳에 남은 것들"],
  "a flower blooms on the wall": ["벽에 꽃이 피다"],
  // ── Japanese (extended) ──────────────────────────────────────────────────
  "hotaru no yomeiri": ["螢の嫁入り"],
  "dokuhime": ["毒姫"],
  "no longer allowed in another world": ["他の世界では通用しない","Shikkaku Isekai"],
  "kimi wo hitori ni shite agenai": ["君を一人にしてあげない"],
  "bokura no koi wa shi ni itaru yamai no you de": ["僕らの恋は死に至る病のようで"],
  "naisho no stalker san": ["内緒のストーカーさん"],
  "koori no koutei no torikago no naka de": ["氷の皇帝の鳥籠の中で"],
  "umarekawatte mo mata watashi to kekkon shite kuremasu ka": ["生まれ変わってもまた、私と結婚してくれますか？"],
  "watashi to kowareta kyuuketsuki": ["私と壊れた吸血鬼"],
  "kataomoi ga tsurakute shissou shitara yandere ka shita otto ni tsukamarimashita": ["片思いが辛くて失走したら、ヤンデレ化した夫に捕まりました"],
  "5 kaime no seiryaku kon wa watashi wo nikumu anata to": ["5回目の政略婚は、私を憎むあなたと"],
  "joou no rakuin horobi no kuni no yotogi miko": ["女王の烙印：滅びの国の夜伽巫女"],
  "kiraware seijo desu ga shindara shinu hodo aisarete": ["嫌われ聖女ですが、死んだら死ぬほど愛されて"],
  "koisuru psycho no shirayuki kun": ["恋するサイコのシラユキくん"],
  "akuyaku reijou wa ringoku no outaishi ni dekiai sareru": ["悪役令嬢は隣国の王太子に溺愛される"],
  "akuyaku reijou desu ga shiawase ni natte misemasu wa anthology comic": ["悪役令嬢ですが、幸せになってみせますわ！"],
  "ekikoi the young miss falls for the station attendant": ["駅恋"],
  "iyashi no otonari san ni wa himitsu ga aru": ["癒しのお隣さんには秘密がある"],
  "senpai is an otokonoko": ["センパイはオトコのコ"],
  "the witch and the beast": ["魔女と野獣"],
  "kemono jihen": ["怪物事変"],
  // ── Korean (comprehensive fill-in) ────────────────────────────────────────
  "villains are destined to die": ["악당은 멸망하게 되어 있다"],
  "like wind on a dry branch": ["마른 나뭇가지에 바람처럼"],
  "seasons of blossom": ["꽃이 피는 시절"],
  "a capable maid": ["유능한 하녀"],
  "a child who looks like me": ["나를 닮은 아이"],
  "agatha": ["아가사"],
  "bride of obsidian": ["흑요석의 신부"],
  "can i bite you": ["물어도 돼요?"],
  "childhood friend complex": ["소꿉친구 콤플렉스"],
  "codename anastasia": ["코드명: 아나스타샤"],
  "college student empress": ["대학생 황후"],
  "daytime in the bunker": ["낮의 벙커"],
  "dear villainous husband the one to be obsessed with is over there": ["사랑하는 악당 남편, 집착 대상이 잘못됐습니다"],
  "emerald midnight s lover": ["绿光午夜的恋人"],
  "failed to abandon the villain": ["악당을 포기하지 못했다"],
  "fall in love or die": ["사랑하거나 죽거나"],
  "for your perfect ending": ["최선의 결말을 위하여"],
  "hero killer": ["영웅을 죽이는 방법"],
  "high society": ["상류사회"],
  "how to change the genre from angst to heartwarming": ["장르를 바꿔라!"],
  "i became the duke s male servant": ["공작의 남자 하인이 되었다"],
  "i m stanning the duke": ["공작님을 덕질하는 법"],
  "imprisoned by the mad dog i raised": ["내가 기른 미친개에게 갇혔다"],
  "in between": ["사이"],
  "it s just business": ["그냥 비즈니스"],
  "lookalike daughter": ["닮은꼴 딸"],
  "love in session": ["사랑중"],
  "love bullet": ["러브 불릿"],
  "marriage of convenience": ["편의 결혼"],
  "men of the harem": ["하렘의 남자들"],
  "miss pendleton": ["미스 펜들턴"],
  "my beloved oppressor": ["나의 사랑스러운 폭군"],
  "my fiance is in love with my little sister": ["내 약혼자가 내 여동생을 좋아해"],
  "my mom entered a contract marriage": ["엄마가 계약 결혼을 했어요"],
  "now come and regret": ["이제 와서 후회해"],
  "once it was love": ["한때는 사랑이었다"],
  "pendleton revolution": ["펜들턴 혁명"],
  "powerful confession": ["강렬한 고백"],
  "princess wars": ["공주들의 전쟁"],
  "proposed to by a villain": ["악당한테 프로포즈받다"],
  "pure love operation": ["순애작전"],
  "queen cecia s shorts": ["세실리아 황후의 반바지"],
  "really truly getting divorced": ["진짜로 이혼하게 됐다"],
  "red fox": ["붉은 여우"],
  "run away from me": ["도망쳐봐"],
  "seabird and the wolf": ["물새와 늑대"],
  "seabird and wolf": ["물새와 늑대"],
  "selfish romance": ["이기적 로맨스"],
  "spoil of war duchess": ["전리품 공작부인"],
  "tears on a withered flower": ["시든 꽃에 눈물을"],
  "the marquis meitner s funeral": ["마이트너 후작의 장례식"],
  "the player hides his past": ["플레이어를 숨겨라"],
  "the player with a hidden past": ["플레이어를 숨겨라"],
  "the warrior returns": ["전사가 돌아온다"],
  "tutorial tower of the advanced player": ["고수의 튜토리얼 탑"],
  "the advanced player of the tutorial tower": ["고수의 튜토리얼 탑"],
  "your ryan": ["당신의 라이언"],
  "fly me to the moon": ["월에 키스를", "月にキスを"],
  "farewell": ["이별"],
  "muse on fame": ["명성을 향한 뮤즈"],
  "my mom entered a contract marriage": ["엄마가 계약 결혼을 했어요"],
  "for my derelict favorite": ["내 방치된 최애를 위해"],
  "on the way to meet mom": ["엄마를 만나러 가는 길"],
  "my princess charming": ["나의 공주 차밍"],
  "how to get my husband on my side": ["남편의 편을 얻는 방법"],
  "the broken ring": ["깨진 반지"],
  "proof of dignity": ["품위의 증거"],
  "the swan s grave": ["백조의 무덤"],
  "secret lady": ["비밀의 레이디"],
  "my deepest secret": ["나의 가장 깊은 비밀"],
  "lady crystal is a man": ["크리스탈 레이디는 남자다"],
  "the maid and the vampire": ["메이드와 뱀파이어"],
  "guardians of the lamb": ["어린 양을 지키는 자들"],
  "miss not so sidekick": ["사이드킥이 아니고요!"],
  "from knight to lady": ["기사에서 숙녀로"],
  "from a knight to a lady": ["기사에서 숙녀로"],
  "this time i will find happiness": ["이번엔 행복을 찾을게"],
  "the villainess needs her tyrant": ["악녀는 폭군이 필요해"],
  "the maid and the vampire": ["메이드와 뱀파이어"],
  "ghost teller": ["귀담아 들어봐"],
  "the world without my sister who everyone loved": ["모두가 사랑했던 내 동생이 없는 세상"],
  "lost in translation": ["번역가 무뢰한"],
  "your eternal lies": ["영원한 거짓말"],
  "the spark in your eyes": ["그 눈빛을 마주치면"],
  "survive as the hero s wife": ["용사 아내로 살아남기"],
  "lookalike daughter": ["닮은꼴 딸"],
  "how to win my husband over": ["남편을 내 편으로 만드는 법"],
  "children of orbit": ["궤도의 아이들"],
  "a good day to be a dog": ["오늘도 사랑스럽개"],
  "gyeongseong mermaid": ["경성 인어공주"],
  "whale star the gyeongseong mermaid": ["경성 인어공주"],
  "the elixir of the sun": ["태양의 영약"],
  "the blood of madame giselle": ["마담 지젤의 피"],
  "for your murder": ["너의 살인을 위하여"],
  "black winter": ["검은 겨울"],
  "the rabbit hole": ["토끼굴"],
  "mystic prince": ["비술 왕자"],
  "the first night with the duke": ["공작님과의 첫날 밤"],
  "finding camelia": ["카멜리아를 찾아서"],
  "finding camellia": ["카멜리아를 찾아서"],
  "the villainess lives again": ["악녀는 두 번 산다"],
  "the abandoned empress": ["버림받은 황비"],
  "beware the villainess": ["그 악녀를 조심하세요!"],
  "the villainess turns the hourglass": ["악녀는 모래시계를 되돌린다"],
  "light and shadow": ["빛과 그림자"],
  "spirit fingers": ["스피릿 핑거스"],
  "kill the villainess": ["악녀를 죽여라"],
  "surviving romance": ["로맨스 생존기"],
  "unholy blood": ["불경한 피"],
  "the crown princess scandal": ["황태자비 납치사건"],
  "the pale horse": ["창백한 말"],
  "the maid and the vampire": ["메이드와 뱀파이어"],
  "all of us are dead": ["지금 우리 학교는"],
  "our beloved summer": ["그해 우리는"],
  "a stepmother s marchen": ["어느 날 공주가 되어버렸다"],
  "cry or better yet beg": ["울어, 아니 차라리 빌어"],
  "jinx": ["징크스"],
  "roxana": ["록사나"],
  "second life of a trash princess": ["쓰레기 공주의 두 번째 삶"],
  "the age of arrogance": ["오만의 시대"],
  "the tainted half": ["오염된 절반"],
  "secret alliance": ["비밀 동맹"],
  "one of a kind romance": ["유일무이한 로맨스"],
  "trapped": ["올가미"],
  "just leave me be": ["그냥 내버려 둬"],
  "your throne": ["그대의 옥좌"],
  "the remarried empress": ["재혼 황후"],
  "odd girl out": ["아웃사이더"],
  "lookism": ["외모지상주의"],
  "viral hit": ["싸움독학","How to Fight"],
  "how to fight": ["싸움독학","Viral Hit"],
  "the villainess needs her tyrant": ["악녀는 폭군이 필요해"],
  "lady baby": ["레이디 베이비"],
  "doom breaker": ["절대검감"],
  "gosu": ["고수"],
  "weak hero": ["약한영웅"],
  "cheese in the trap": ["치즈인더트랩"],
  "the boxer": ["더 복서"],
  "god of blackfield": ["검은 땅의 지배자"],
  "sss class revival hunter": ["SSS급 죽어야 사는 헌터"],
  "return of the blossoming blade": ["화산귀환"],
  "see you in my 19th life": ["나의 19번째 삶"],
  "iseop s romance": ["이솝이야기 로맨스","Inso's Law"],
  "the sound of magic annarasumanara": ["안나라수마나라"],
};
(function importAltTitles() {
  if (localStorage.getItem('toonn-alts-v2')) return;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const toons = getToons().map(t => ({...t}));
  for (const t of toons) {
    if (!t.alts || !t.alts.length) {
      const alts = _altTitles[norm(t.title)];
      if (alts) t.alts = [...alts];
    }
  }
  saveToons(toons);
  localStorage.setItem('toonn-alts-v2', '1');
})();
(function setVerifiedBadges() {
  if (localStorage.getItem('toonn-verified-v1')) return;
  const toons = getToons().map(t => ({ ...t, verified: true }));
  saveToons(toons);
  localStorage.setItem('toonn-verified-v1', '1');
})();
document.querySelector('#gh-btn').addEventListener('click', async () => {
  if (!getGHToken()) {
    const row = document.querySelector('#gh-token-row');
    row.hidden = !row.hidden;
    if (!row.hidden) document.querySelector('#gh-token-input').focus();
    return;
  }
  await fetchFromGH(); render();
});
document.querySelector('#gh-token-save').addEventListener('click', async () => {
  const t = document.querySelector('#gh-token-input').value.trim();
  if (!t) return;
  setGHToken(t);
  document.querySelector('#gh-token-row').hidden = true;
  document.querySelector('#gh-token-input').value = '';
  await pushToGH();
  render();
});
document.querySelector('#gh-token-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.querySelector('#gh-token-save').click();
});
(async () => { await initGHSync(); updateSearchPills(); render(); })();

const storageKey = 'toontrail-library-v1';
const library = document.querySelector('#library');
const template = document.querySelector('#toon-template');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#title-search');
let activeFilter = 'all';
let activeSort = 'updated-desc';
let filterText = '';
function getSorted(toons) {
  const s = [...toons];
  if (activeSort === 'alpha-asc') return s.sort((a, b) => a.title.localeCompare(b.title));
  if (activeSort === 'alpha-desc') return s.sort((a, b) => b.title.localeCompare(a.title));
  if (activeSort === 'updated-asc') return s.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0) || b.title.localeCompare(a.title));
  return s.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title));
}

const suggestions = [
  { title: 'The Greatest Estate Developer', note: 'Chaotic fantasy comedy with a clever, very determined lead.' },
  { title: 'Omniscient Reader’s Viewpoint', note: 'A reader’s knowledge becomes the survival guide in a ruined world.' },
  { title: 'The S-Classes That I Raised', note: 'Found-family energy, regressors, and a monster-filled second chance.' },
  { title: 'The Apothecary Prince', note: 'A cozy fantasy detour for when you want wit over constant battles.' }
];

function getToons() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
  catch { return []; }
}
function saveToons(toons) { localStorage.setItem(storageKey, JSON.stringify(toons)); }
// migrate legacy "finished" status to "complete"
(function migrate() {
  const toons = getToons();
  const needsMigration = toons.some(t => t.status === 'finished');
  if (needsMigration) saveToons(toons.map(t => t.status === 'finished' ? { ...t, status: 'complete' } : t));
})();
function searchUrl(title, source = 'web') {
  const query = encodeURIComponent(title.trim());
  const sites = {
    web: `https://www.google.com/search?q=${query}+webtoon`,
    'anime-planet': `https://www.google.com/search?q=site%3Aanime-planet.com%2Fmanga+${query}`,
    atsu: `https://www.google.com/search?q=site%3Aatsu.moe+${query}`,
    kagane: `https://www.google.com/search?q=site%3Akagane.to+${query}`,
    comix: `https://www.google.com/search?q=site%3Acomix.to+${query}`
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
  document.querySelector('#reading-count').textContent = counts.reading;
  document.querySelector('#queue-count').textContent = counts.queue;
  document.querySelector('#done-count').textContent = counts.complete;
  document.querySelector('#all-total').textContent = toons.length;
  document.querySelector('#reading-total').textContent = counts.reading;
  document.querySelector('#queue-total').textContent = counts.queue;
  document.querySelector('#complete-total').textContent = counts.complete;
  const next = toons.find(t => t.status === 'reading') || toons.find(t => t.status === 'queue');
  const nextTitle = document.querySelector('#next-title');
  const nextMeta = document.querySelector('#next-meta');
  const continueButton = document.querySelector('#continue-reading');
  if (next) {
    nextTitle.textContent = next.title;
    nextMeta.textContent = `${next.status === 'reading' ? 'Currently reading' : 'First up in your queue'} · Ch. ${next.chapter || 0}`;
    continueButton.disabled = false;
    continueButton.onclick = () => openSearch(next.title, 'web');
  } else {
    nextTitle.textContent = 'Your queue is waiting'; nextMeta.textContent = 'Add a title below and it will appear here.'; continueButton.disabled = true;
  }
}
function render() {
  const toons = getToons();
  updateDashboard(toons);
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
    card.querySelector('h3').textContent = toon.title;
    card.querySelector('.toon-updated').textContent = relativeTime(toon.updatedAt);
    const article = card.querySelector('.toon-card');
    const status = card.querySelector('.status-select'); status.value = toon.status;
    const chapter = card.querySelector('.chapter-input'); chapter.value = toon.chapter || 0;
    chapter.disabled = toon.status === 'complete';
    if (toon.status === 'complete') article.classList.add('is-complete');
    status.addEventListener('change', () => {
      const isComplete = status.value === 'complete';
      chapter.disabled = isComplete;
      article.classList.toggle('is-complete', isComplete);
      updateToon(toon.id, { status: status.value });
    });
    chapter.addEventListener('change', () => updateToon(toon.id, { chapter: Math.max(0, Number(chapter.value) || 0) }));
    article.addEventListener('click', e => {
      if (e.target.closest('.status-select, .chapter-input, .chapter-label, .delete')) return;
      if (toon.status === 'complete') {
        window.open(searchUrl(toon.title, 'anime-planet'), '_blank', 'noopener,noreferrer');
      } else {
        navigator.clipboard.writeText(toon.title).catch(() => {});
        article.classList.add('copied');
        setTimeout(() => article.classList.remove('copied'), 600);
      }
    });
    article.title = toon.status === 'complete' ? 'Open on Anime-Planet' : 'Copy title';
    card.querySelector('.delete').addEventListener('click', () => { saveToons(getToons().filter(t => t.id !== toon.id)); render(); });
    library.appendChild(card);
  });
}
function updateToon(id, changes) { saveToons(getToons().map(t => t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t)); render(); }

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const sources = [
    { key: 'web',          label: 'Web Search' },
    { key: 'anime-planet', label: 'Anime-Planet' },
    { key: 'atsu',         label: 'atsu.moe' },
    { key: 'kagane',       label: 'kagane.to' },
    { key: 'comix',        label: 'comix.to' },
  ];
  const resultsDiv = document.querySelector('#search-results');
  resultsDiv.innerHTML = sources.map(s =>
    `<a class="result-pill" href="${searchUrl(query, s.key)}" target="_blank" rel="noopener noreferrer">${s.label}</a>`
  ).join('');
  resultsDiv.hidden = false;
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
document.querySelector('#library-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const title = document.querySelector('#library-search').value.trim();
  if (!title) return;
  const toons = getToons();
  if (toons.find(t => t.title.toLowerCase() === title.toLowerCase())) return;
  const titled = title.replace(/(?:^|\s+)\S/g, c => c.toUpperCase());
  toons.unshift({ id: crypto.randomUUID(), title: titled, status: 'reading', chapter: 0, updatedAt: Date.now() });
  saveToons(toons);
  filterText = '';
  document.querySelector('#library-search').value = '';
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
      const parseDate = s => { if (!s) return 0; const t = new Date(s.replace(' ','T').replace(/\+0+$/,'Z')).getTime(); return isNaN(t) ? 0 : t; };
      const existing = getToons();
      // Restore timestamps for existing entries that match by title
      const restored = existing.map(t => {
        const match = (data.entries || []).find(e => e.name.toLowerCase() === t.title.toLowerCase());
        if (!match) return t;
        const ts = parseDate(match.completed) || parseDate(match.started);
        return ts ? { ...t, updatedAt: ts } : t;
      });
      // Add new entries not already in the library
      const restoredTitles = new Set(restored.map(t => t.title.toLowerCase()));
      const newEntries = (data.entries || [])
        .filter(entry => statusMap[entry.status] && !restoredTitles.has(entry.name.toLowerCase()))
        .map(entry => ({ id: crypto.randomUUID(), title: entry.name, status: statusMap[entry.status], chapter: entry.ch || 0, updatedAt: parseDate(entry.completed) || parseDate(entry.started) || Date.now() }));
      saveToons([...restored, ...newEntries]);
      render();
    } catch { /* invalid file */ }
    e.target.value = '';
  };
  reader.readAsText(file);
});
const recs = document.querySelector('#recommendations');
suggestions.forEach(rec => {
  const article = document.createElement('article'); article.className = 'rec';
  article.innerHTML = `<h3>${rec.title}</h3><p>${rec.note}</p><button type="button">Search it</button>`;
  article.querySelector('button').addEventListener('click', () => openSearch(rec.title)); recs.appendChild(article);
});
document.querySelector('#export-btn').addEventListener('click', () => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(getToons(), null, 2)], {type:'application/json'})),
    download: 'toonn-library.json'
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
render();

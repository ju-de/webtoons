const storageKey = 'toontrail-library-v1';
const library = document.querySelector('#library');
const template = document.querySelector('#toon-template');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#title-search');
const addForm = document.querySelector('#add-form');
let activeSource = 'web';
let activeFilter = 'all';

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
function openSearch(title, source = activeSource) {
  if (title.trim()) window.open(searchUrl(title, source), '_blank', 'noopener,noreferrer');
}
function updateDashboard(toons) {
  const counts = ['reading', 'queue', 'finished'].reduce((acc, status) => {
    acc[status] = toons.filter(t => t.status === status).length; return acc;
  }, {});
  document.querySelector('#reading-count').textContent = counts.reading;
  document.querySelector('#queue-count').textContent = counts.queue;
  document.querySelector('#done-count').textContent = counts.finished;
  document.querySelector('#all-total').textContent = toons.length;
  const next = toons.find(t => t.status === 'reading') || toons.find(t => t.status === 'queue');
  const nextTitle = document.querySelector('#next-title');
  const nextMeta = document.querySelector('#next-meta');
  const continueButton = document.querySelector('#continue-reading');
  if (next) {
    nextTitle.textContent = next.title;
    nextMeta.textContent = `${next.status === 'reading' ? 'Currently reading' : 'First up in your queue'} · Chapter ${next.chapter || 0} · ${next.mood}`;
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
  library.innerHTML = '';
  if (!shown.length) {
    library.innerHTML = `<div class="empty">${toons.length ? 'Nothing in this part of the shelf yet.' : 'Your shelf is blank. Add a webtoon to start your trail.'}</div>`;
    return;
  }
  shown.forEach(toon => {
    const card = template.content.cloneNode(true);
    card.querySelector('h3').textContent = toon.title;
    card.querySelector('.toon-subtitle').textContent = toon.mood;
    const status = card.querySelector('.status-select'); status.value = toon.status;
    const chapter = card.querySelector('.chapter-input'); chapter.value = toon.chapter || 0;
    status.addEventListener('change', () => updateToon(toon.id, { status: status.value }));
    chapter.addEventListener('change', () => updateToon(toon.id, { chapter: Math.max(0, Number(chapter.value) || 0) }));
    card.querySelector('.open-search').addEventListener('click', () => openSearch(toon.title));
    card.querySelector('.delete').addEventListener('click', () => { saveToons(getToons().filter(t => t.id !== toon.id)); render(); });
    library.appendChild(card);
  });
}
function updateToon(id, changes) { saveToons(getToons().map(t => t.id === id ? { ...t, ...changes } : t)); render(); }

document.querySelectorAll('.source').forEach(button => button.addEventListener('click', () => {
  activeSource = button.dataset.source;
  document.querySelectorAll('.source').forEach(b => b.classList.toggle('active', b === button));
}));
searchForm.addEventListener('submit', event => { event.preventDefault(); openSearch(searchInput.value); });
document.querySelector('#show-add').addEventListener('click', () => {
  addForm.hidden = !addForm.hidden;
  if (!addForm.hidden) document.querySelector('#toon-title').focus();
});
addForm.addEventListener('submit', event => {
  event.preventDefault();
  const title = document.querySelector('#toon-title').value.trim();
  if (!title) return;
  const toons = getToons();
  toons.unshift({ id: crypto.randomUUID(), title, status: document.querySelector('#toon-status').value, chapter: Number(document.querySelector('#toon-progress').value) || 0, mood: document.querySelector('#toon-mood').value });
  saveToons(toons); addForm.reset(); document.querySelector('#toon-progress').value = 0; addForm.hidden = true; render();
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === button)); render();
}));
const recs = document.querySelector('#recommendations');
suggestions.forEach(rec => {
  const article = document.createElement('article'); article.className = 'rec';
  article.innerHTML = `<h3>${rec.title}</h3><p>${rec.note}</p><button type="button">Search it ↗</button>`;
  article.querySelector('button').addEventListener('click', () => openSearch(rec.title)); recs.appendChild(article);
});
render();

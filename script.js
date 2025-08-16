// Config base
const API = 'https://pokeapi.co/api/v2';
const MAX = 700; // cantidad a cargar inicialmente
const PER_PAGE = 20; // pokémon por página

// Estado
const state = {
  all: [],
  shown: [],
  filters: {
    name: '',
    types: new Set(),
    gen: '',
    sortBy: 'id',
    showFavs: false
  },
  cache: new Map(),
  favs: new Set(JSON.parse(localStorage.getItem('favs') || '[]')),
  currentPage: 1
};

// Elementos del DOM
const grid = document.getElementById('grid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const search = document.getElementById('search');
const typeFilters = document.getElementById('typeFilters');
const generation = document.getElementById('generation');
const sortBy = document.getElementById('sortBy');
const resetBtn = document.getElementById('resetBtn');
const favBtn = document.getElementById('favBtn');
const loadedCount = document.getElementById('loadedCount');
const shownCount = document.getElementById('shownCount');
const pokemonModal = document.getElementById('pokemonModal');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const closeModal = document.getElementById('closeModal');
// Paginación
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

// Colores por tipo
const typeColors = {
  normal: 'bg-slate-500', fire: 'bg-red-500', water: 'bg-blue-500', electric: 'bg-yellow-500 text-black',
  grass: 'bg-green-600', ice: 'bg-cyan-400 text-black', fighting: 'bg-red-700', poison: 'bg-purple-600',
  ground: 'bg-yellow-700', flying: 'bg-indigo-400', psychic: 'bg-pink-500', bug: 'bg-lime-600',
  rock: 'bg-amber-800', ghost: 'bg-violet-700', dragon: 'bg-indigo-700', dark: 'bg-slate-800',
  steel: 'bg-slate-400 text-black', fairy: 'bg-pink-400 text-black'
};
const generations = {
  1: { start: 1, end: 151 }, 2: { start: 152, end: 251 }, 3: { start: 252, end: 386 },
  4: { start: 387, end: 493 }, 5: { start: 494, end: 649 }, 6: { start: 650, end: 721 },
  7: { start: 722, end: 809 }, 8: { start: 810, end: 898 }, 9: { start: 899, end: 1010 }
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  setupSearch();
  setupTypeFilters();
  setupEvents();
  setupPaginationEvents();
  showLoading(true);
  await loadInitial();
  showLoading(false);
  computeAndRender();
});

// Carga inicial
async function loadInitial() {
  const listRes = await fetch(`${API}/pokemon?limit=${MAX}`);
  const list = await listRes.json();
  const urls = list.results.map(r => r.url);

  const BATCH = 20;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const details = await Promise.all(slice.map(u => getWithCache(u)));
    state.all.push(...details.filter(Boolean).map(p => normalizePokemon(p)));
    loadedCount.textContent = state.all.length;
  }
}

// Normalizar datos
function normalizePokemon(p) {
  return {
    id: p.id,
    name: p.name,
    height: p.height / 10,
    weight: p.weight / 10,
    types: p.types.map(t => t.type.name),
    img: p.sprites.other['official-artwork'].front_default || p.sprites.front_default || '',
    abilities: p.abilities.map(a => a.ability.name),
    stats: p.stats.map(s => ({name: s.stat.name, value: s.base_stat}))
  };
}

async function getWithCache(url) {
  if (state.cache.has(url)) return state.cache.get(url);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  state.cache.set(url, data);
  return data;
}

// Filtros
function setupSearch() {
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.filters.name = search.value.trim().toLowerCase();
      state.currentPage = 1;
      computeAndRender();
    }, 300);
  });
}
function setupTypeFilters() {
  const allTypes = Object.keys(typeColors);
  allTypes.forEach(type => {
    const btn = document.createElement('button');
    btn.className = `badge ${typeColors[type]} hover:opacity-90`;
    btn.textContent = type;
    btn.addEventListener('click', () => {
      if (state.filters.types.has(type)) state.filters.types.delete(type);
      else state.filters.types.add(type);
      btn.classList.toggle('ring-2');
      state.currentPage = 1;
      computeAndRender();
    });
    typeFilters.appendChild(btn);
  });
}

// Eventos
function setupEvents() {
  generation.addEventListener('change', () => { state.filters.gen = generation.value; state.currentPage = 1; computeAndRender(); });
  sortBy.addEventListener('change', () => { state.filters.sortBy = sortBy.value; state.currentPage = 1; computeAndRender(); });
  resetBtn.addEventListener('click', () => {
    search.value = '';
    generation.value = '';
    sortBy.value = 'id';
    state.filters = { name: '', types: new Set(), gen: '', sortBy: 'id', showFavs: false };
    [...typeFilters.children].forEach(b => b.classList.remove('ring-2'));
    state.currentPage = 1;
    computeAndRender();
  });
  favBtn.addEventListener('click', () => { state.filters.showFavs = !state.filters.showFavs; favBtn.classList.toggle('ring-2'); state.currentPage = 1; computeAndRender(); });
  closeModal.addEventListener('click', hideModal);
  pokemonModal.addEventListener('click', (e) => { if (e.target === pokemonModal) hideModal(); });
}

// Paginación
function setupPaginationEvents() {
  prevBtn.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderGrid();
    }
  });
  nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(state.shown.length / PER_PAGE);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderGrid();
    }
  });
}

function updatePaginationControls() {
  const totalPages = Math.ceil(state.shown.length / PER_PAGE) || 1;
  pageInfo.textContent = `Página ${state.currentPage} de ${totalPages}`;
  prevBtn.disabled = state.currentPage === 1;
  nextBtn.disabled = state.currentPage === totalPages;
}

// Render + filtrado
function computeAndRender() {
  let list = [...state.all];
  if (state.filters.name) list = list.filter(p => p.name.includes(state.filters.name));
  if (state.filters.types.size) list = list.filter(p => [...state.filters.types].every(t => p.types.includes(t)));
  if (state.filters.gen) {
    const { start, end } = generations[state.filters.gen];
    list = list.filter(p => p.id >= start && p.id <= end);
  }
  if (state.filters.showFavs) list = list.filter(p => state.favs.has(p.id));
  switch (state.filters.sortBy) {
    case 'name': list.sort((a,b)=>a.name.localeCompare(b.name)); break;
    case 'height': list.sort((a,b)=>a.height - b.height); break;
    case 'weight': list.sort((a,b)=>a.weight - b.weight); break;
    default: list.sort((a,b)=>a.id - b.id);
  }
  state.shown = list;
  shownCount.textContent = state.shown.length;
  state.currentPage = 1;
  renderGrid();
}
function renderGrid() {
  grid.innerHTML = '';
  emptyState.classList.toggle('hidden', state.shown.length !== 0);

  const start = (state.currentPage - 1) * PER_PAGE;
  const end = start + PER_PAGE;
  const pageItems = state.shown.slice(start, end);

  pageItems.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const favActive = state.favs.has(p.id) ? 'opacity-100' : 'opacity-40';
    const types = p.types.map(t => `<span class="badge ${typeColors[t]}">${t}</span>`).join(' ');
    card.innerHTML = `
      <div class="flex items-start justify-between">
        <h3 class="font-bold capitalize">#${p.id} ${p.name}</h3>
        <button class="btn-secondary !px-2 !py-1 text-xs fav ${favActive}" data-id="${p.id}">⭐</button>
      </div>
      <img class="w-full h-40 object-contain my-2" src="${p.img}" alt="${p.name}">
      <div class="flex flex-wrap gap-1">${types}</div>
      <div class="mt-2 flex items-center justify-between">
        <button class="btn !px-3 !py-1 text-sm more" data-id="${p.id}">Ver detalle</button>
        <span class="text-xs text-slate-400">${p.height} m · ${p.weight} kg</span>
      </div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.more').forEach(btn => { btn.addEventListener('click', () => openDetail(parseInt(btn.dataset.id,10))); });
  grid.querySelectorAll('.fav').forEach(btn => { btn.addEventListener('click', () => toggleFav(parseInt(btn.dataset.id,10), btn)); });

  updatePaginationControls();
}

// Fav + modal (igual que antes) ...
function toggleFav(id, el) {
  if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
  el.classList.toggle('opacity-100'); el.classList.toggle('opacity-40');
  localStorage.setItem('favs', JSON.stringify([...state.favs]));
}
function hideModal(){ pokemonModal.classList.add('hidden'); pokemonModal.classList.remove('flex'); }
async function openDetail(id) {
  const data = state.all.find(p => p.id === id);
  if (!data) return;
  modalTitle.textContent = `#${data.id} ${capitalize(data.name)}`;
  modalContent.innerHTML = `
    <div class="text-center"><img class="w-40 h-40 object-contain mx-auto" src="${data.img}"></div>
    <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
      <div><span class="text-slate-400">Altura:</span> ${data.height} m</div>
      <div><span class="text-slate-400">Peso:</span> ${data.weight} kg</div>
      <div class="col-span-2"><span class="text-slate-400">Tipos:</span> ${data.types.map(t=>`<span class="badge ${typeColors[t]} ml-1">${t}</span>`).join('')}</div>
      <div class="col-span-2"><h4 class="font-semibold mt-1">Habilidades</h4><ul class="list-disc list-inside capitalize">${data.abilities.map(a=>`<li>${a.replace('-', ' ')}</li>`).join('')}</ul></div>
      <div class="col-span-2"><h4 class="font-semibold mt-1">Estadísticas</h4>${statsBars(data.stats)}</div>
    </div>`;
  pokemonModal.classList.remove('hidden'); pokemonModal.classList.add('flex');
}
function statsBars(stats) {
  return stats.map(s => {
    const pct = Math.min(100, (s.value/200)*100);
    return `<div class="mb-2"><div class="flex justify-between text-xs"><span>${s.name.replace('-', ' ')}</span><span>${s.value}</span></div><div class="w-full bg-slate-700 rounded-full h-2"><div class="h-2 rounded-full bg-indigo-500" style="width:${pct}%"></div></div></div>`;
  }).join('');
}
function showLoading(show){ loadingState.classList.toggle('hidden', !show); }
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

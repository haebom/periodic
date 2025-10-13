/**
 * Periodic Table - Vanilla JS interactive periodic table
 * Data: Bowserinator/Periodic-Table-JSON (embedded locally)
 * Accessibility: buttons as cells, tooltip, dialog
 */

/** @typedef {import('./types').ElementData} ElementData */

const state = {
  elements: [],
  filtered: [],
  categorySet: new Set(),
  funMode: false,
  theme: 'dark',
  heatKey: '',
  // dialog focus trap
  prevFocus: /** @type {HTMLElement|null} */(null),
  // language (default Korean)
  lang: /** @type {'ko'|'en'} */('ko'),
};

/** Element data cache (session-persistent) */
const elementCache = new Map();

/** Get data URL for element JSON (supports GitHub Pages subpath) */
function dataUrlFor(symbol) {
  return new URL(`data/${symbol}.json`, window.location.href).toString();
}

/** Local overrides for special elements (e.g., #119 Ununennium) */
const OVERRIDES = /** @type {Record<string, { symbol: string; koName: string; enName: string; koSummary: string; wiki: string }>} */({
  '119': {
    symbol: 'Uue',
    koName: '우눈넨늄',
    enName: 'Ununennium',
    koSummary:
      '국제순수·응용화학연합(IUPAC)의 임시 체계명으로 불리는 119번 초중원소입니다. 아직 공식 합성 및 명명 확정 단계가 아니며, 물리적/화학적 성질은 이론 계산에 기반해 추정됩니다.',
    wiki: 'https://ko.wikipedia.org/wiki/우눈넨늄',
  },
});

/** Uses mapping for selected elements */
const USES = /** @type {Record<string, string[]>} */ ({
  H: ['🚀 Rocket fuel (LH2)', '🧪 Ammonia production (Haber)'],
  He: ['❄️ Cryogenics', '🎈 Balloon lifting gas'],
  Li: ['🔋 Rechargeable batteries', '🏺 Ceramics/Glass'],
  C: ['🏗️ Steel making', '🧱 Graphite/Composites'],
  N: ['🌱 Fertilizers', '🛡️ Inert atmosphere'],
  O: ['🏥 Medical oxygen', '🔥 Combustion'],
  Na: ['🧂 Table salt (NaCl)', '💡 Street lamps (Na vapor)'],
  Al: ['✈️ Aerospace alloys', '📦 Packaging foil'],
  Si: ['💻 Semiconductors', '🔆 Solar cells'],
  P: ['🌾 Fertilizers', '🔥 Matches'],
  S: ['🔧 Vulcanization', '🏭 Sulfuric acid'],
  Cl: ['🏗️ PVC production', '💧 Water disinfection'],
  Fe: ['🏗️ Construction steel', '🛠️ Tools'],
  Cu: ['🔌 Electrical wiring', '🚰 Plumbing'],
  Ag: ['📸 Photography', '🔧 Electronics'],
  Au: ['💍 Jewelry', '🔧 Electronics'],
  Hg: ['🌡️ Thermometers (legacy)', '🥇 Gold extraction (amalgams, legacy)'],
  Pb: ['🔋 Lead-acid batteries', '🛡️ Radiation shielding'],
  U: ['⚛️ Nuclear fuel', '⏱️ Radiometric dating (U-series)'],
});

/** Fetch data once and init */
async function init() {
  cacheRefs();
  initTheme();
  setupThemeControl();
  setupLangControl();
  // 안내: 파일을 직접 열면(fetch, file://) 데이터 로드가 차단될 수 있음
  if (location.protocol === 'file:') {
    showStartupNotice(
      state.lang === 'ko'
        ? '데이터 파일을 불러오려면 로컬 서버로 실행하세요. 터미널에서 "python3 -m http.server 5173" 후 http://localhost:5173 열기'
        : 'Please run a local server to load data. In terminal: "python3 -m http.server 5173" then open http://localhost:5173'
    );
  }
  // load persisted lang
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'ko' || stored === 'en') setLang(stored, { silent: true });
  } catch {}
  let json;
  try {
    const res = await fetch('./assets/PeriodicTableJSON.json');
    if (!res.ok) throw new Error(String(res.status));
    json = await res.json();
  } catch (e) {
    showStartupError(
      state.lang === 'ko'
        ? '데이터 로드에 실패했습니다. 로컬 서버에서 다시 열어주세요.'
        : 'Failed to load data. Please open the site via a local server.'
    );
    return;
  }
  const elements = json.elements;
  // Load Korean names map
  let koMap = {};
  try {
    const koRes = await fetch('./assets/element_names_ko.json');
    koMap = await koRes.json();
  } catch (e) {
    // If failed, proceed with English names only
  }
  // Load wiki titles (Korean) map
  /** @type {Record<string,string>} */
  let wikiTitlesKo = {};
  try {
    const wtRes = await fetch('./assets/wiki_titles_ko.json');
    wikiTitlesKo = await wtRes.json();
  } catch (e) {
    // Fallback to empty; will use KONAMES or English name
  }
  // Merge Korean names and set display fields
  for (const el of elements) {
    // Preserve original English name
    /** @type {string} */
    // @ts-ignore
    el.nameEn = el.name;
    const ko = /** @type {Record<string,string>} */(koMap)[el.symbol];
    // Uue override for display name
    const isUue = String(el.number) === '119';
    const koOverride = isUue && OVERRIDES['119'] ? OVERRIDES['119'].koName : undefined;
    if ((ko && typeof ko === 'string') || koOverride) {
      // @ts-ignore
      el.koName = koOverride ?? ko;
      // @ts-ignore
      el.name = el.koName; // unified display uses Korean
    } else {
      // @ts-ignore
      el.koName = el.nameEn;
    }
    // Attach wiki title override (ko)
    // @ts-ignore
    el._wikiTitleKo = wikiTitlesKo[el.symbol] || undefined;
  }
  state.elements = elements;
  state.filtered = elements;
  for (const el of elements) state.categorySet.add(el.category);
  buildLegend();
  buildFilters();
  renderGrid(elements);
  attachGlobalEvents();
}

function attachGlobalEvents() {
  const dlg = refs.dialog ?? document.getElementById('elementDialog');
  if (dlg instanceof HTMLDialogElement) {
    const closeBtn = dlg.querySelector('.dialog-close');
    closeBtn?.addEventListener('click', () => { dlg.close(); hideTooltip(); releaseFocusTrap(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); hideTooltip(); releaseFocusTrap(); });
    dlg.addEventListener('close', () => { hideTooltip(); releaseFocusTrap(); });
  }
  const onMove = throttle((ev) => {
    const t = refs.tooltip ?? document.getElementById('tooltip');
    if (t && t.getAttribute('aria-hidden') === 'false') moveTooltip(ev);
  }, CFG.throttleMouseMs);
  document.addEventListener('mousemove', onMove);
}

/** Build legend chips */
function buildLegend() {
  const legend = document.querySelector('.legend');
  if (!legend) return;
  const cats = [...state.categorySet].sort();
  legend.innerHTML = '';
  for (const c of cats) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'legend-item';
    chip.setAttribute('data-cat', c);
    chip.setAttribute('aria-pressed', 'false');
    chip.innerHTML = `<span class="dot" style="background: var(--cat-${toToken(c)}, var(--cat-unknown))"></span><span>${tCategory(c)}</span><span class="selected-icon" aria-hidden="true">✓</span>`;
    // 분류 툴팁 설명
    chip.setAttribute('title', tCategoryDesc(c));
    chip.addEventListener('click', () => {
      const sel = document.getElementById('filter-category');
      if (sel && sel instanceof HTMLSelectElement) {
        const current = sel.value;
        sel.value = current === c ? '' : c; // 이미 선택된 경우 전체 카테고리로 토글
        applyFilters();
      }
    });
    legend.appendChild(chip);
  }
}

/** Build filter selects */
const CFG = {
  debounceSearchMs: 150,
  throttleMouseMs: 16,
  longPressMs: 350,
  heatKeys: ['atomic_mass', 'electronegativity_pauling', 'melt', 'boil', 'density'],
  tooltipPad: 12,
  followMaxPx: 6,
};

let heatCache = { key: '', values: [], max: 0 };

// Cached refs to minimize DOM queries
const refs = {
  grid: /** @type {HTMLElement|null} */(null),
  tooltip: /** @type {HTMLElement|null} */(null),
  dialog: /** @type {HTMLDialogElement|null} */(null),
  wikiLink: /** @type {HTMLAnchorElement|null} */(null),
  minibar: /** @type {HTMLElement|null} */(null),
  noticeHost: /** @type {HTMLElement|null} */(null),
  themeControl: /** @type {HTMLElement|null} */(null),
  themeBadge: /** @type {HTMLElement|null} */(null),
  langControl: /** @type {HTMLElement|null} */(null),
};
function cacheRefs() {
  refs.grid = document.getElementById('grid');
  refs.tooltip = document.getElementById('tooltip');
  refs.dialog = /** @type {HTMLDialogElement|null} */(document.getElementById('elementDialog'));
  refs.wikiLink = /** @type {HTMLAnchorElement|null} */(document.getElementById('wikiLink'));
  refs.minibar = document.getElementById('minibar');
  refs.noticeHost = document.querySelector('.legend') || document.body;
  refs.themeControl = document.getElementById('themeControl');
  refs.themeBadge = /** @type {HTMLElement|null} */(document.getElementById('themeBadge'));
  refs.langControl = document.getElementById('langControl');
}

function debounce(fn, wait) {
  let t = /** @type {number | undefined} */ (undefined);
  return (...args) => { clearTimeout(t); t = window.setTimeout(() => fn(...args), wait); };
}
function throttle(fn, wait) {
  let last = 0; let timer = /** @type {number | undefined} */ (undefined);
  return (...args) => {
    const now = performance.now();
    if (now - last >= wait) { last = now; fn(...args); }
    else if (!timer) { timer = window.setTimeout(() => { last = performance.now(); timer = undefined; fn(...args); }, wait - (now - last)); }
  };
}

function buildFilters() {
  const L = I18N[state.lang];
  const catSelect = document.getElementById('filter-category');
  if (catSelect) {
    // 기존 선택값 보존
    const prevCat = catSelect instanceof HTMLSelectElement ? catSelect.value : '';
    catSelect.innerHTML = `<option value="">${L.all_categories}</option>` +
      [...state.categorySet].sort().map((c) => `<option value="${c}" title="${tCategoryDesc(c)}">${tCategory(c)}</option>`).join('');
    // 재생성 후 복원 (옵션 존재 시)
    if (catSelect instanceof HTMLSelectElement) {
      if ([...state.categorySet].includes(prevCat)) {
        catSelect.value = prevCat;
      }
      // 중복 바인딩 방지
      const sel = catSelect;
      if (!sel.dataset.bound) {
        sel.addEventListener('change', applyFilters);
        sel.dataset.bound = '1';
      }
    }
  }
  const phase = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-phase'));
  if (phase) {
    const optAny = phase.querySelector('option[value=""]');
    const optS = phase.querySelector('option[value="solid"]');
    const optL = phase.querySelector('option[value="liquid"]');
    const optG = phase.querySelector('option[value="gas"]');
    if (optAny) optAny.textContent = L.all_phases;
    if (optS) optS.textContent = L.phaseMap.solid;
    if (optL) optL.textContent = L.phaseMap.liquid;
    if (optG) optG.textContent = L.phaseMap.gas;
    if (!phase.dataset.bound) { phase.addEventListener('change', applyFilters); phase.dataset.bound = '1'; }
  }
  const block = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-block'));
  if (block) {
    const optAny = block.querySelector('option[value=""]');
    if (optAny) optAny.textContent = L.all_blocks;
    if (!block.dataset.bound) { block.addEventListener('change', applyFilters); block.dataset.bound = '1'; }
  }

  const search = document.getElementById('search');
  const debounced = debounce(applyFilters, CFG.debounceSearchMs);
  if (search) {
    (search).placeholder = L.search_placeholder;
    if (!search.dataset.bound) { search.addEventListener('input', debounced); search.dataset.bound = '1'; }
  }

  const heat = /** @type {HTMLSelectElement|null} */(document.getElementById('heatmap'));
  if (heat) {
    const optOff = heat.querySelector('option[value=""]');
    if (optOff) optOff.textContent = L.heatmap_off;
    if (!heat.dataset.bound) {
      heat.addEventListener('change', (e) => {
        const sel = e.target;
        if (sel && sel instanceof HTMLSelectElement) {
          state.heatKey = sel.value;
          recomputeHeatCache();
          updateHeatmap();
          updateMinibar();
        }
      });
      heat.dataset.bound = '1';
    }
  }

  const rand = document.getElementById('btn-random');
  rand?.addEventListener('click', openDialogRandomProxy);

  const fun = document.getElementById('btn-fun');
  fun?.addEventListener('click', () => {
    state.funMode = !state.funMode;
    fun.setAttribute('aria-pressed', String(state.funMode));
    updateMinibar();
  });

  // Theme control handled separately
  // Removed legacy language select handler (now using segmented control)

  updateMinibar();
}

// Helper to open random via existing openDialog
function openDialogRandomProxy() { openRandom(); }

/**
 * Apply theme by setting data-theme on root, update state and UI.
 * @param {"light"|"dark"|"high-contrast"} key
 * @param {{ silent?: boolean }} [opts]
 */
function setTheme(key, opts = { silent: false }) {
  const root = document.documentElement;
  root.setAttribute('data-theme', key);
  document.body.setAttribute('data-theme', key);
  state.theme = key;
  try { localStorage.setItem('theme', key); } catch {}
  syncSegmentedSelection(key);
  updateThemeBadge();
  if (!opts.silent) updateMinibar();
}

/**
 * Sync segmented control aria-checked with current theme.
 * @param {string} key
 */
function syncSegmentedSelection(key) {
  const cont = refs.themeControl ?? document.getElementById('themeControl');
  if (!cont) return;
  const btns = cont.querySelectorAll('[data-theme]');
  btns.forEach((b) => {
    if (b instanceof HTMLButtonElement) {
      b.setAttribute('aria-checked', String(b.dataset.theme === key));
    }
  });
}

/**
 * Get persisted theme safely.
 * @returns {""|"light"|"dark"|"high-contrast"}
 */
function safeGetLocalTheme() {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' || v === 'high-contrast' ? v : '';
  } catch {
    return '';
  }
}

/** Initialize theme from storage -> system -> default dark */
function initTheme() {
  const stored = safeGetLocalTheme();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const key = stored || (prefersDark ? 'dark' : 'light') || 'dark';
  setTheme(key, { silent: true });
}

/**
 * Setup segmented control interactions (click + arrow keys).
 */
function setupThemeControl() {
  const cont = refs.themeControl ?? document.getElementById('themeControl');
  if (!cont) return;
  cont.addEventListener('click', (ev) => {
    const target = ev.target;
    const btn = target instanceof HTMLElement ? target.closest('.seg-btn') : null;
    if (btn && btn instanceof HTMLButtonElement) {
      const themeKey = btn.dataset.theme ?? '';
      if (themeKey) setTheme(/** @type {"light"|"dark"|"high-contrast"} */(themeKey));
    }
  });
  cont.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const btns = Array.from(cont.querySelectorAll('.seg-btn')).filter((b) => b instanceof HTMLButtonElement);
    const currentIndex = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const len = btns.length;
    const nextIdx = ev.key === 'ArrowRight' ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
    const targetBtn = /** @type {HTMLButtonElement} */(btns[nextIdx]);
    targetBtn.focus();
    const key = targetBtn.dataset.theme ?? '';
    if (key) setTheme(/** @type {"light"|"dark"|"high-contrast"} */(key));
  });
  // initial sync
  syncSegmentedSelection(state.theme);
}

/**
 * Map theme key to localized label.
 * @param {string} key
 * @returns {string}
 */
function themeLabel(key) {
  if (state.lang === 'en') {
    const M = { light: 'Light', dark: 'Dark', 'high-contrast': 'High Contrast' };
    return M[key] ?? key;
  }
  const M = { light: '라이트', dark: '다크', 'high-contrast': '고대비' };
  return M[key] ?? key;
}

/** Update header badge with current theme */
function updateThemeBadge() {
  const badge = refs.themeBadge ?? document.getElementById('themeBadge');
  if (!badge) return;
  // 이모지 전용 배지(텍스트 제거)
  badge.innerHTML = `<span class="icon">🎨</span>`;
}

function updateMinibar() {
  const mb = refs.minibar ?? document.getElementById('minibar');
  if (!mb) return;
  const L = I18N[state.lang];
  const q = /** @type {HTMLInputElement|null} */(document.getElementById('search'))?.value.trim() ?? '';
  const cat = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-category'))?.value ?? '';
  const phase = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-phase'))?.value ?? '';
  const block = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-block'))?.value ?? '';
  const heat = /** @type {HTMLSelectElement|null} */(document.getElementById('heatmap'))?.value ?? '';

  const items = [];
  if (q) items.push(`<span class="badge"><span class="icon">🔎</span>${q}</span>`);
  if (cat) items.push(`<span class="badge"><span class="dot" style="width:10px;height:10px;border-radius:50%;background: var(--cat-${toToken(cat)}, var(--accent))"></span>${tCategory(cat)}</span>`);
  if (phase) items.push(`<span class="badge"><span class="icon">${phase === 'solid' ? '🧊' : phase === 'liquid' ? '💧' : '🌬️'}</span>${tPhase(phase)}</span>`);
  if (block) items.push(`<span class="badge"><span class="icon">🔤</span>${block}</span>`);
  if (heat) items.push(`<span class="badge"><span class="icon">📊</span>${heat}</span>`);
  items.push(`<span class="badge"><span class="icon">🎨</span>${themeLabel(state.theme)}</span>`);
  items.push(`<span class="badge"><span class="icon">🌐</span>${state.lang}</span>`);
  if (state.funMode) items.push(`<span class="badge"><span class="icon">🎉</span>fun</span>`);

  mb.innerHTML = items.join('');
}

/** Simple i18n for labels used in tooltip and dialog */
const I18N = {
  ko: {
    uses: '🎯 용도',
    source: '원본: Wikipedia 요약 (ko→en 폴백)',
    ai_summary_badge: 'AI 생성 요약(학습용)',
    search_placeholder: '번호 · 심볼 · 이름 검색',
    atomic_mass: '원자량',
    electronegativity_pauling: '친전자도(파울링)',
    melt: '녹는점(K)',
    boil: '끓는점(K)',
    density: '밀도(g/cm³)',
    electron_configuration: '전자배치',
    discovered_by: '발견자',
    all_categories: '전체 카테고리',
    all_phases: '전체 상온 상태',
    all_blocks: '전체 블록',
    heatmap_off: '히트맵: 끄기',
    phaseMap: { solid: '고체', liquid: '액체', gas: '기체' },
    categoryMap: {
      'diatomic nonmetal': '이원자 비금속',
      'polyatomic nonmetal': '다원자 비금속',
      'noble gas': '비활성 기체',
      'alkali metal': '알칼리 금속',
      'alkaline earth metal': '알칼리 토금속',
      metalloid: '준금속',
      'post-transition metal': '후전이 금속',
      'transition metal': '전이 금속',
      lanthanide: '란타넘족',
      actinide: '악티늄족',
      halogen: '할로젠',
      unknown: '미분류',
    },
    // Category descriptions (tooltip)
    categoryDesc: {
      'diatomic nonmetal': '주로 이원자 분자로 존재하는 비금속(예: H2, N2, O2).',
      'polyatomic nonmetal': '다원자 구조로 존재하는 비금속(예: S8 등).',
      'noble gas': '화학적으로 매우 안정한 비활성 기체.',
      'alkali metal': '1족 금속, 반응성이 매우 큼.',
      'alkaline earth metal': '2족 금속, 알칼리 금속보다는 덜 반응성.',
      metalloid: '금속과 비금속의 중간 성질.',
      'post-transition metal': '전이 금속 이후의 비교적 부드러운 금속.',
      'transition metal': '부분적으로 채워진 d오비탈을 가진 금속.',
      lanthanide: '란타넘족 원소(4f 전자).',
      actinide: '악티늄족 원소(방사능, 5f 전자).',
      halogen: '7족 비금속, 높은 반응성의 할로젠.',
      unknown: '분류가 불명확하거나 논란.',
    },
    room_temp: '상온',
    en_summary_badge: '영문 요약',
  },
  en: {
    uses: 'Uses',
    source: 'Source: Wikipedia summary (ko→en fallback)',
    ai_summary_badge: 'AI-generated summary (educational)',
    search_placeholder: 'Search number · symbol · name',
    atomic_mass: 'Atomic mass',
    electronegativity_pauling: 'Electronegativity (Pauling)',
    melt: 'Melting point (K)',
    boil: 'Boiling point (K)',
    density: 'Density (g/cm³)',
    electron_configuration: 'Electron configuration',
    discovered_by: 'Discovered by',
    all_categories: 'All categories',
    all_phases: 'All phases',
    all_blocks: 'All blocks',
    heatmap_off: 'Heatmap: off',
    phaseMap: { solid: 'Solid', liquid: 'Liquid', gas: 'Gas' },
    categoryMap: {
      'diatomic nonmetal': 'Diatomic nonmetal',
      'polyatomic nonmetal': 'Polyatomic nonmetal',
      'noble gas': 'Noble gas',
      'alkali metal': 'Alkali metal',
      'alkaline earth metal': 'Alkaline earth metal',
      metalloid: 'Metalloid',
      'post-transition metal': 'Post-transition metal',
      'transition metal': 'Transition metal',
      lanthanide: 'Lanthanide',
      actinide: 'Actinide',
      halogen: 'Halogen',
      unknown: 'Unknown',
    },
    // Category descriptions (tooltip)
    categoryDesc: {
      'diatomic nonmetal': 'Nonmetals forming diatomic molecules (e.g., H2, N2, O2).',
      'polyatomic nonmetal': 'Nonmetals existing as polyatomic structures (e.g., S8).',
      'noble gas': 'Chemically inert, very stable gases.',
      'alkali metal': 'Group 1 metals, highly reactive.',
      'alkaline earth metal': 'Group 2 metals, less reactive than alkali metals.',
      metalloid: 'Intermediate properties between metals and nonmetals.',
      'post-transition metal': 'Softer metals after transition metals.',
      'transition metal': 'Metals with partially filled d orbitals.',
      lanthanide: 'Lanthanides (4f electrons).',
      actinide: 'Actinides (radioactive, 5f electrons).',
      halogen: 'Group 17 nonmetals with high reactivity.',
      unknown: 'Classification unclear or debated.',
    },
    room_temp: 'Room temp',
    en_summary_badge: 'English summary',
  },
};

/** Localize category label */
function tCategory(cat) {
  const L = I18N[state.lang];
  if (!cat) return L.categoryMap.unknown;
  const key = String(cat);
  return L.categoryMap[key] ?? key;
}
// Localize category description for tooltip
function tCategoryDesc(cat) {
  const L = I18N[state.lang];
  const key = String(cat || '');
  const map = /** @type {Record<string, string>} */(L.categoryDesc || {});
  return map[key] ?? tCategory(key);
}
/** Localize phase label */
function tPhase(phase) {
  const L = I18N[state.lang];
  const key = String(phase || '').toLowerCase();
  return L.phaseMap[key] ?? phase ?? '';
}

// Korean names mapping for display
const KONAMES = /** @type {Record<string, string>} */({
  H: '수소', He: '헬륨', Li: '리튬', Be: '베릴륨', B: '붕소', C: '탄소', N: '질소', O: '산소', F: '플루오린', Ne: '네온',
  Na: '나트륨', Mg: '마그네슘', Al: '알루미늄', Si: '규소', P: '인', S: '황', Cl: '염소', Ar: '아르곤',
  K: '칼륨', Ca: '칼슘', Sc: '스칸듐', Ti: '티타늄', V: '바나듐', Cr: '크로뮴', Mn: '망간', Fe: '철', Co: '코발트', Ni: '니켈', Cu: '구리', Zn: '아연',
  Ga: '갈륨', Ge: '게르마늄', As: '비소', Se: '셀레늄', Br: '브로민', Kr: '크립톤',
  Rb: '루비듐', Sr: '스트론튬', Y: '이트륨', Zr: '지르코늄', Nb: '나이오븀', Mo: '몰리브데넘', Tc: '테크네튬', Ru: '루테늄', Rh: '로듐', Pd: '팔라듐', Ag: '은', Cd: '카드뮴',
  In: '인듐', Sn: '주석', Sb: '안티모니', Te: '텔루륨', I: '요오드', Xe: '제논',
  Cs: '세슘', Ba: '바륨', La: '란타넘', Ce: '세륨', Pr: '프라세오디뮴', Nd: '네오디뮴', Pm: '프로메튬', Sm: '사마륨', Eu: '유로퓸', Gd: '가돌리늄', Tb: '테르븀', Dy: '디스프로슘', Ho: '홀뮴', Er: '에르븀', Tm: '툴륨', Yb: '이터븀', Lu: '루테튬',
  Hf: '하프늄', Ta: '탄탈럼', W: '텅스텐', Re: '레늄', Os: '오스뮴', Ir: '이리듐', Pt: '백금', Au: '금', Hg: '수은', Tl: '탈륨', Pb: '납', Bi: '비스무트', Po: '폴로늄', At: '아스타틴', Rn: '라돈',
  Fr: '프랑슘', Ra: '라듐', Ac: '악티늄', Th: '토륨', Pa: '프로악티늄', U: '우라늄', Np: '넵투늄', Pu: '플루토늄', Am: '아메리슘', Cm: '큐리움', Bk: '버클륨', Cf: '캘리포늄', Es: '아인슈타이늄', Fm: '페르뮴', Md: '멘델레븀', No: '노벨륨', Lr: '로렌슘',
});

/** Get localized display name for an element */
function displayName(el) {
  // Korean unified display name; fallback to original name
  return /** @type {string} */(el.koName ?? el.name);
}

/** Build aria-label for element button in current language */
function elementAriaLabel(el) {
  const L = I18N[state.lang];
  const catLabel = tCategory(el.category ?? '');
  const phaseLabel = tPhase(el.phase ?? '');
  const numSuffix = state.lang === 'ko' ? '번' : '';
  const room = L.room_temp;
  const nameKo = /** @type {string} */(el.koName ?? el.name);
  return `${el.number}${numSuffix} ${nameKo} (${el.symbol}), ${catLabel}; ${room} ${phaseLabel}`;
}

function renderGrid(elements) {
  const grid = refs.grid ?? document.getElementById('grid');
  if (!grid) return;
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const el of elements) {
    const btn = document.createElement('button');
    btn.className = 'cell';
    btn.type = 'button';
    // Position in CSS grid
    btn.style.gridColumn = String(el.xpos);
    btn.style.gridRow = String(el.ypos);
    // Data attributes
    btn.dataset.category = el.category ?? 'unknown';
    btn.dataset.symbol = el.symbol;
    btn.dataset.number = String(el.number);
    btn.dataset.name = /** @type {string} */(el.koName ?? el.name);
    btn.setAttribute('aria-label', elementAriaLabel(el));
    btn.innerHTML = `
      <span class="num">${el.number}</span>
      <span class="sym">${el.symbol}</span>
      <span class="name">${/** @type {string} */(el.koName ?? el.name)}</span>
      <span class="heat" aria-hidden="true"></span>
    `;
    const onMove = throttle((ev) => { if (state.funMode) microFollow(btn, ev); moveTooltip(ev); }, CFG.throttleMouseMs);
    btn.addEventListener('mouseenter', (ev) => showTooltip(ev, el));
    btn.addEventListener('mouseleave', (ev) => { resetTransform(ev.currentTarget); hideTooltip(); });
    btn.addEventListener('focus', (ev) => showTooltip(ev, el));
    btn.addEventListener('blur', (ev) => { resetTransform(ev.currentTarget); hideTooltip(); });
    btn.addEventListener('mousemove', onMove);
    // Touch long-press tooltip
    let touchTimer = 0;
    btn.addEventListener('touchstart', (ev) => { touchTimer = window.setTimeout(() => showTooltip(ev.touches[0], el), CFG.longPressMs); }, { passive: true });
    btn.addEventListener('touchend', () => { clearTimeout(touchTimer); hideTooltip(); }, { passive: true });
    btn.addEventListener('touchcancel', () => { clearTimeout(touchTimer); hideTooltip(); }, { passive: true });
    frag.appendChild(btn);
  }
  grid.appendChild(frag);
  updateHeatmap();
}

// NOTE: Wiki summary fetching removed - now using local JSON only

function hideTooltip() {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  t?.setAttribute('aria-hidden', 'true');
}
function moveTooltip(ev) { positionTooltip(ev); }

/** Startup notices */
function showStartupNotice(message) {
  const host = refs.noticeHost || document.body;
  const el = document.createElement('div');
  el.className = 'notice';
  el.textContent = message;
  host.parentElement?.insertBefore(el, host.nextSibling);
}
function showStartupError(message) {
  const host = refs.noticeHost || document.body;
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = message;
  host.parentElement?.insertBefore(el, host.nextSibling);
}

/** Get category color for visualization */
function categoryColor(cat) {
  const token = toToken(cat ?? '');
  const map = {
    'alkali-metal': '#ff6b6b',
    'alkaline-earth-metal': '#ffa94d',
    'transition-metal': '#ffd43b',
    'post-transition-metal': '#a5d8ff',
    'metalloid': '#66d9e8',
    'polyatomic-nonmetal': '#b2f2bb',
    'diatomic-nonmetal': '#8ce99a',
    'noble-gas': '#c0eb75',
    'lanthanide': '#faa2c1',
    'actinide': '#e599f7',
    'halogen': '#51cf66'
  };
  return map[token] || '#adb5bd';
}

/** Render tooltip from local data */
function renderTooltipFromData(el, data, x, y) {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  if (!t) return;
  
  const displayName = state.lang === 'ko' ? (data.koName || data.enName) : (data.enName || data.koName);
  const altName = state.lang === 'ko' ? data.enName : data.koName;
  const summary = data[`summary_${state.lang}`] || data.summary_en || '';
  const uses = data[`uses_${state.lang}`] || data.uses_en || [];
  const category = data[`category_${state.lang}`] || data.category_en || '';
  const phase = data[`phase_${state.lang}`] || data.phase_en || '';

  const usesHtml = uses.length > 0 
    ? `<div class="t-uses" style="margin-top:8px"><strong>🎯 ${state.lang === 'ko' ? '용도' : 'Uses'}</strong><ul style="margin:4px 0 0 18px; padding:0;">${uses.map(u => `<li>${u}</li>`).join('')}</ul></div>` 
    : '';

  t.innerHTML = `
    <div class="t-head">
      <span class="dot" style="background:${categoryColor(el.category)}"></span>
      <strong>${el.symbol} · ${displayName} ${altName ? `(${altName})` : ''} (#${el.number})</strong>
    </div>
    <div class="t-meta">${category}${phase ? ` · ${phase}` : ''}</div>
    <div class="t-desc" style="margin-top:6px">${summary || (state.lang === 'ko' ? '요약이 준비되지 않았습니다.' : 'Summary not available.')}</div>
    ${usesHtml}
    <div class="t-note" style="margin-top:8px; font-size:12px; opacity:.7">${state.lang === 'ko' ? '데이터 출처' : 'Source'}: /data/${el.symbol}.json</div>
  `;
  t.setAttribute('aria-hidden', 'false');
  positionTooltip({ clientX: x, clientY: y });
}

/** Render minimal tooltip when data not found */
function renderTooltipMinimal(el, x, y) {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  if (!t) return;
  
  const msg = state.lang === 'ko' 
    ? `로컬 데이터 파일을 찾을 수 없습니다. /data/${el.symbol}.json을 추가하세요.`
    : `Local data file not found. Please add /data/${el.symbol}.json`;

  t.innerHTML = `
    <div class="t-head"><strong>${el.symbol} · ${el.name}</strong></div>
    <div class="t-desc" style="margin-top:6px">${msg}</div>
  `;
  t.setAttribute('aria-hidden', 'false');
  positionTooltip({ clientX: x, clientY: y });
}

/** Show tooltip - load from local JSON only */
async function showTooltip(ev, el) {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  if (!t) return;
  
  // Get position
  let x, y;
  const hasClient = typeof ev === 'object' && ev !== null && 'clientX' in ev && 'clientY' in ev;
  if (hasClient) {
    x = ev.clientX;
    y = ev.clientY;
  } else if ('currentTarget' in ev) {
    const target = /** @type {HTMLElement} */(ev.currentTarget);
    if (target) {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
  }

  // Check cache first
  let data = elementCache.get(el.symbol);
  if (!data) {
    try {
      const r = await fetch(dataUrlFor(el.symbol), { cache: 'force-cache' });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      elementCache.set(el.symbol, data);
    } catch (e) {
      // 404/network error - show minimal info
      return renderTooltipMinimal(el, x, y);
    }
  }
  
  renderTooltipFromData(el, data, x, y);
}

function positionTooltip(ev) {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  if (!t) return;
  const pad = CFG.tooltipPad;
  const x = ev.clientX + pad;
  const y = ev.clientY + pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

/** Dialog - load from local JSON only */
async function openDialog(el) {
  const dlg = refs.dialog ?? document.getElementById('elementDialog');
  if (!(dlg instanceof HTMLDialogElement)) return;
  const link = refs.wikiLink ?? document.getElementById('wikiLink');

  // Check cache first
  let data = elementCache.get(el.symbol);
  if (!data) {
    try {
      const r = await fetch(dataUrlFor(el.symbol), { cache: 'force-cache' });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      elementCache.set(el.symbol, data);
    } catch (e) {
      // Fallback to minimal info
      data = null;
    }
  }

  // Build dialog content
  const body = dlg.querySelector('.dialog-body');
  if (body && data) {
    body.innerHTML = buildDialogHTML(el, data);
  } else if (body) {
    // Minimal fallback
    const msg = state.lang === 'ko' 
      ? `로컬 데이터 파일을 찾을 수 없습니다.`
      : `Local data file not found.`;
    body.innerHTML = `
      <h2>${el.symbol} · ${el.name} (#${el.number})</h2>
      <p>${msg}</p>
    `;
  }

  // Set wiki link
  if (link && data) {
    const href = state.lang === 'ko' ? (data.wiki_ko ?? data.wiki) : (data.wiki ?? data.wiki_ko);
    link.setAttribute('href', href || '#');
  } else if (link) {
    link.setAttribute('href', '#');
  }

  dlg.setAttribute('aria-modal', 'true');
  state.prevFocus = /** @type {HTMLElement|null} */(document.activeElement);
  dlg.showModal();
  activateFocusTrap(dlg);
}

function buildDialogHTML(el, data) {
  const L = I18N[state.lang];
  
  const displayName = state.lang === 'ko' ? (data.koName || data.enName) : (data.enName || data.koName);
  const altName = state.lang === 'ko' ? data.enName : data.koName;
  const summary = data[`summary_${state.lang}`] || data.summary_en || '';
  const uses = data[`uses_${state.lang}`] || data.uses_en || [];
  const category = data[`category_${state.lang}`] || data.category_en || '';
  const phase = data[`phase_${state.lang}`] || data.phase_en || '';

  const usesHtml = uses.length > 0 
    ? `<div style="margin-top:12px"><strong>🎯 ${state.lang === 'ko' ? '용도' : 'Uses'}</strong><ul style="margin:8px 0 0 20px;">${uses.map(u => `<li>${u}</li>`).join('')}</ul></div>` 
    : '';

  return `
    <h2>${el.symbol} · ${displayName} ${altName ? `(${altName})` : ''} (#${el.number})</h2>
    <p style="color: var(--muted)">${category}${phase ? ` · ${phase}` : ''}</p>
    <div style="margin-top:12px; line-height:1.6">${summary}</div>
    ${usesHtml}
    <ul style="margin-top:16px; font-size:13px">
      ${li(L.atomic_mass, el.atomic_mass)}
      ${li(L.electron_configuration, el.electron_configuration)}
      ${li(L.discovered_by, el.discovered_by)}
    </ul>
  `;
}

function li(label, v) {
  if (v === undefined || v === null || v === '') return '';
  return `<li><strong>${label}:</strong> ${v}</li>`;
}

// Focus trap + body scroll lock
function activateFocusTrap(dlg) {
  if (!(dlg instanceof HTMLDialogElement)) return;
  document.body.classList.add('scroll-lock');
  const focusables = /** @type {HTMLElement[]} */([...dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  first?.focus();
  const onKey = (ev) => {
    if (ev.key === 'Tab') {
      if (focusables.length === 0) { ev.preventDefault(); return; }
      const active = /** @type {HTMLElement} */(document.activeElement);
      if (ev.shiftKey) {
        if (active === first) { ev.preventDefault(); last?.focus(); }
      } else {
        if (active === last) { ev.preventDefault(); first?.focus(); }
      }
    } else if (ev.key === 'Escape') {
      dlg.close();
    }
  };
  dlg.addEventListener('keydown', onKey);
  dlg.addEventListener('close', () => {
    dlg.removeEventListener('keydown', onKey);
  }, { once: true });
}
function releaseFocusTrap() {
  document.body.classList.remove('scroll-lock');
  const prev = state.prevFocus;
  if (prev) { prev.focus(); }
  state.prevFocus = null;
}

/** Search + filters */
function applyFilters() {
  const q = /** @type {HTMLInputElement|null} */(document.getElementById('search'))?.value.trim().toLowerCase() ?? '';
  const cat = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-category'))?.value ?? '';
  const phase = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-phase'))?.value ?? '';
  const block = /** @type {HTMLSelectElement|null} */(document.getElementById('filter-block'))?.value ?? '';

  // 카테고리 선택 시 박스 강조 토글
  document.body.classList.toggle('category-boxing', cat !== '');
  
  // Update legend selection visuals
  const chips = /** @type {HTMLElement[]} */([...document.querySelectorAll('.legend .legend-item')]);
  for (const chip of chips) {
    const isSel = chip.getAttribute('data-cat') === cat && cat !== '';
    chip.classList.toggle('selected', isSel);
    chip.setAttribute('aria-pressed', String(isSel));
  }

  const filtered = state.elements.filter((el) => {
    const koName = String(el.koName ?? '').toLowerCase();
    const matchesQuery = q === '' || String(el.number).includes(q) || el.symbol.toLowerCase().includes(q) || el.name.toLowerCase().includes(q) || koName.includes(q);
    const matchesCat = cat === '' || el.category === cat;
    const matchesPhase = phase === '' || String(el.phase).toLowerCase() === phase;
    const matchesBlock = block === '' || String(el.block).toLowerCase() === block;
    return matchesQuery && matchesCat && matchesPhase && matchesBlock;
  });
  state.filtered = filtered;
  recomputeHeatCache();
  renderGrid(filtered);
}

function recomputeHeatCache() {
  const key = state.heatKey;
  if (!key) { heatCache = { key: '', values: [], max: 0 }; return; }
  const values = state.filtered.map((el) => normalize(getNum(el[key])));
  const max = Math.max(...values.map((v) => (Number.isFinite(v) ? v : 0)), 0);
  heatCache = { key, values, max };
}

function updateHeatmap() {
  const grid = refs.grid ?? document.getElementById('grid');
  if (!grid) return;
  const bars = grid.querySelectorAll('.cell .heat');
  if (!state.heatKey) { [...bars].forEach((bar) => { bar.style.transform = 'scaleY(0)'; }); return; }
  [...bars].forEach((bar, i) => {
    const v = heatCache.values[i] ?? 0;
    const ratio = heatCache.max > 0 && Number.isFinite(v) ? Math.max(0, Math.min(1, v / heatCache.max)) : 0;
    bar.style.transform = `scaleY(${ratio})`;
  });
}
function getNum(v) { return typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN); }
function normalize(v) { return Number.isFinite(v) ? Math.max(0, v) : 0; }

/** Random in current filtered */
function openRandom() {
  if (state.filtered.length === 0) return;
  const i = Math.floor(Math.random() * state.filtered.length);
  openDialog(state.filtered[i]);
}

/** Micro interaction: subtle follow */
function microFollow(target, ev) {
  if (!(target instanceof HTMLElement)) return;
  const r = target.getBoundingClientRect();
  const dx = (ev.clientX - (r.left + r.width / 2)) / r.width;
  const dy = (ev.clientY - (r.top + r.height / 2)) / r.height;
  const tX = clamp(dx * CFG.followMaxPx, -CFG.followMaxPx, CFG.followMaxPx);
  const tY = clamp(dy * CFG.followMaxPx, -CFG.followMaxPx, CFG.followMaxPx);
  target.style.transform = `translate(${tX}px, ${tY}px)`;
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

/** Keyboard navigation */
document.addEventListener('keydown', (ev) => {
  const active = document.activeElement;
  const grid = refs.grid ?? document.getElementById('grid');
  if (!grid) return;
  const cells = /** @type {HTMLButtonElement[]} */([...grid.querySelectorAll('.cell')]);
  const idx = cells.indexOf(active);
  if (ev.key === 'Escape') {
    hideTooltip();
    const dlg = refs.dialog ?? document.getElementById('elementDialog');
    if (dlg instanceof HTMLDialogElement && dlg.open) dlg.close();
    return;
  }
  if (idx >= 0) {
    const col = Number(active.style.gridColumn);
    const row = Number(active.style.gridRow);
    if (ev.key === 'Enter') {
      const el = state.filtered[idx];
      if (el) openDialog(el);
    } else if (ev.key === 'ArrowRight') focusBy(col + 1, row, cells);
    else if (ev.key === 'ArrowLeft') focusBy(col - 1, row, cells);
    else if (ev.key === 'ArrowDown') focusBy(col, row + 1, cells);
    else if (ev.key === 'ArrowUp') focusBy(col, row - 1, cells);
  }
});
function focusBy(col, row, cells) {
  for (const c of cells) {
    if (Number(c.style.gridColumn) === col && Number(c.style.gridRow) === row) {
      c.focus(); return;
    }
  }
}

/** Utils */
function toToken(cat) { return String(cat).toLowerCase().replace(/\s+/g, '-'); }

/** Init */
init();

function resetTransform(target) { if (target instanceof HTMLElement) target.style.transform = ''; }

/** Refresh currently open tooltip with new language */
function refreshOpenTooltip() {
  const t = refs.tooltip ?? document.getElementById('tooltip');
  if (!t || t.getAttribute('aria-hidden') === 'true') return;
  
  // Find active focused element
  const active = document.activeElement;
  if (!active || !active.classList.contains('cell')) return;
  
  const sym = active.getAttribute('data-symbol');
  if (!sym) return;
  
  const el = state.filtered.find(e => e.symbol === sym);
  const data = elementCache.get(sym);
  if (el && data) {
    const r = active.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    renderTooltipFromData(el, data, x, y);
  }
}

/** Language control */
function setLang(key, opts = { silent: false }) {
  const k = key === 'en' ? 'en' : 'ko';
  state.lang = /** @type {'ko'|'en'} */(k);
  document.documentElement.setAttribute('lang', k);
  try { localStorage.setItem('lang', k); } catch {}
  syncLangSegmentedSelection(k);
  buildFilters();
  buildLegend();
  renderGrid(state.filtered.length ? state.filtered : state.elements);
  updateThemeBadge();
  refreshOpenTooltip();
  if (!opts.silent) updateMinibar();
}
function syncLangSegmentedSelection(key) {
  const cont = refs.langControl ?? document.getElementById('langControl');
  if (!cont) return;
  const btns = cont.querySelectorAll('[data-lang]');
  btns.forEach((b) => {
    if (b instanceof HTMLButtonElement) {
      b.setAttribute('aria-checked', String(b.dataset.lang === key));
    }
  });
}
function setupLangControl() {
  const cont = refs.langControl ?? document.getElementById('langControl');
  if (!cont) return;
  cont.addEventListener('click', (ev) => {
    const target = ev.target;
    const btn = target instanceof HTMLElement ? target.closest('.seg-btn') : null;
    if (btn && btn instanceof HTMLButtonElement) {
      const langKey = btn.dataset.lang ?? '';
      if (langKey) setLang(/** @type {'ko'|'en'} */(langKey));
    }
  });
  cont.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const btns = Array.from(cont.querySelectorAll('.seg-btn')).filter((b) => b instanceof HTMLButtonElement);
    const currentIndex = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const len = btns.length;
    const nextIdx = ev.key === 'ArrowRight' ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
    const targetBtn = /** @type {HTMLButtonElement} */(btns[nextIdx]);
    targetBtn.focus();
    const key = targetBtn.dataset.lang ?? '';
    if (key) setLang(/** @type {'ko'|'en'} */(key));
  });
  // initial sync
  syncLangSegmentedSelection(state.lang);
}


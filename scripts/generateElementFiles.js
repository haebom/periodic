'use strict';
/**
 * Generate bilingual element JSON files under /data/{symbol}.json
 * - Source: assets/PeriodicTableJSON.json
 * - Korean names: assets/element_names_ko.json (fallback: transliteration)
 * - Korean wiki title: assets/wiki_titles_ko.json (fallback: koName)
 * - 119 override (Uue): fixed
 *
 * Usage:
 *   node scripts/generateElementFiles.js
 */

const fs = require('fs');
const path = require('path');

/** @typedef {{
 *  name: string; symbol: string; number: number; summary?: string;
 *  category?: string; phase?: string; source?: string;
 * }} ElementSrc
 */

/** @type {Record<string, string>} */
const CATEGORY_KO = {
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
};

/** @type {Record<string, string>} */
const PHASE_KO = { solid: '고체', liquid: '액체', gas: '기체' };

/** Known uses in EN -> KO (basic translation) */
/** @type {Record<string, string>} */
const USES_TRANSLATE = {
  'Rocket fuel (LH2)': '로켓 연료(LH2)',
  'Ammonia production (Haber)': '암모니아 생산(하버 공정)',
  'Cryogenics': '극저온 공학',
  'Balloon lifting gas': '풍선 부양 가스',
  'Rechargeable batteries': '충전식 배터리',
  'Ceramics/Glass': '세라믹/유리',
  'Steel making': '철강 제조',
  'Inert atmosphere': '불활성 분위기',
  'Medical oxygen': '의료용 산소',
  'Combustion': '연소',
  'Table salt (NaCl)': '식염(NaCl)',
  'Street lamps (Na vapor)': '가로등(나트륨 증기)',
  'Aerospace alloys': '항공 우주 합금',
  'Packaging foil': '포장용 박',
  'Semiconductors': '반도체',
  'Solar cells': '태양전지',
  'Fertilizers': '비료',
  'Matches': '성냥',
  'Vulcanization': '가황',
  'Sulfuric acid': '황산',
  'PVC production': 'PVC 생산',
  'Water disinfection': '정수 소독',
  'Construction steel': '건축용 강재',
  'Tools': '공구',
  'Electrical wiring': '전기 배선',
  'Plumbing': '배관',
  'Photography': '사진',
  'Electronics': '전자 공학',
  'Jewelry': '보석',
  'Nuclear fuel': '원자력 연료',
  'Radiometric dating (U-series)': '방사 연대 측정(U 계열)',
};

/** Minimal uses per symbol (subset) */
/** @type {Record<string, string[]>} */
const USES_EN = {
  H: ['Rocket fuel (LH2)', 'Ammonia production (Haber)'],
  He: ['Cryogenics', 'Balloon lifting gas'],
  Li: ['Rechargeable batteries', 'Ceramics/Glass'],
  C: ['Steel making', 'Composites'],
  N: ['Fertilizers', 'Inert atmosphere'],
  O: ['Medical oxygen', 'Combustion'],
  Na: ['Table salt (NaCl)', 'Street lamps (Na vapor)'],
  Al: ['Aerospace alloys', 'Packaging foil'],
  Si: ['Semiconductors', 'Solar cells'],
  P: ['Fertilizers', 'Matches'],
  S: ['Vulcanization', 'Sulfuric acid'],
  Cl: ['PVC production', 'Water disinfection'],
  Fe: ['Construction steel', 'Tools'],
  Cu: ['Electrical wiring', 'Plumbing'],
  Ag: ['Photography', 'Electronics'],
  Au: ['Jewelry', 'Electronics'],
  U: ['Nuclear fuel', 'Radiometric dating (U-series)'],
};

/** Generate simple, natural Korean summary (60~100 chars, 2 sentences max) */
/**
 * @param {string} enName
 * @param {string} categoryKo
 * @param {string} phaseKo
 * @param {string[]} usesKo
 */
function generateKoSummary(enName, categoryKo, phaseKo, usesKo) {
  const nameKo = transliterateKo(enName);
  const mainUse = usesKo[0] || '';
  const uText = mainUse ? `${mainUse} 등에 쓰이는` : `교육·연구·산업에 활용되는`;
  const s1 = `${nameKo}은(는) ${categoryKo} 원소로, ${uText} 기본 소재다.`;
  const s2 = `상온에서는 ${phaseKo}이며 안전 지침을 따라 다루는 것이 권장된다.`;
  let text = `${s1} ${s2}`;
  if (text.length > 100) {
    text = `${s1}`; // ensure within guidance
  }
  return text;
}

/** Very lightweight KO transliteration fallback (if no official koName) */
/** @param {string} enName */
function transliterateKo(enName) {
  // Fallback: return enName as-is for safety. (Avoid awkward romanization)
  return enName;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const srcPath = path.join(root, 'assets', 'PeriodicTableJSON.json');
  const koNamesPath = path.join(root, 'assets', 'element_names_ko.json');
  const koTitlesPath = path.join(root, 'assets', 'wiki_titles_ko.json');
  const outDir = path.join(root, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  /** @type {{elements: ElementSrc[]}} */
  const src = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  /** @type {Record<string,string>} */
  const koNames = JSON.parse(fs.readFileSync(koNamesPath, 'utf-8'));
  /** @type {Record<string,string>} */
  const koTitles = JSON.parse(fs.readFileSync(koTitlesPath, 'utf-8'));

  for (const el of src.elements) {
    const symbol = el.symbol;
    const number = el.number;
    const enName = el.name;
    const koNameFixed = number === 119 ? '우눈넨늄' : undefined;
    const koName = koNameFixed || koNames[symbol] || transliterateKo(enName);
    const category_en = el.category || 'unknown';
    const phase_en = el.phase || '';
    const category_ko = CATEGORY_KO[category_en] || CATEGORY_KO.unknown;
    const phase_ko = PHASE_KO[phase_en] || '';

    const uses_en = USES_EN[symbol] || [];
    const uses_ko = uses_en.map((u) => USES_TRANSLATE[u] || u);

    const summary_en = number === 119 ? 'A predicted superheavy element, yet to be synthesized.' : (el.summary || '');
    const summary_ko = number === 119
      ? '아직 합성되지 않은 초중원소로, 8주기 첫 번째 원소로 예측된다.'
      : generateKoSummary(enName, category_ko, phase_ko, uses_ko);

    const wiki = el.source && el.source.startsWith('http')
      ? el.source
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(enName)}`;
    const koTitle = koTitles[symbol] || koName;
    const wiki_ko = `https://ko.wikipedia.org/wiki/${encodeURIComponent(koTitle)}`;

    /** @type {Record<string, unknown>} */
    const out = {
      symbol,
      number,
      enName,
      koName,
      summary_en,
      summary_ko,
      uses_en,
      uses_ko,
      category_en,
      category_ko,
      phase_en,
      phase_ko,
      wiki,
      wiki_ko,
    };

    const outPath = path.join(outDir, `${symbol}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  }

  console.log(`Generated ${src.elements.length} files in /data`);
}

main();
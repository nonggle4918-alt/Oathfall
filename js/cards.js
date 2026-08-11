// 4종족 카드 정의 (§6). M2 확장: 왕국 외 3종족(광신도/차원 괴물/감염체) 추가.
// 외교(조약 파기) 종속 카드는 조약 시스템이 아직 없는 이 빌드에서는 의도적으로 제외했다 (M3에서 추가 예정).

export const RACE_INFO = {
  kingdom: { name: '왕국', resource: 'research', resourceName: '연구', desc: '물량+연구 특화. 신앙/군부/용사 중 하나로 특화한다.' },
  cultists: { name: '광신도', resource: 'zeal', resourceName: '광신', desc: '아군 병력을 제물로 바쳐 광신을 얻는 희생 경제. 병력은 싸고 약하다.' },
  rift: { name: '차원 괴물', resource: 'rift', resourceName: '균열력', desc: '차원문을 성장시켜 상위 병종을 해금. 수가 적고 비싸며 강하다.' },
  infested: { name: '감염체', resource: 'spore', resourceName: '포자', desc: '노드를 정복하지 않고 감염시킨다. 전투에서 져도 포자를 남긴다.' },
};

// 건물이 매 라운드 생산하는 자원 (종족 공통 조회 테이블)
export const BUILDING_INCOME = {
  granary: { supply: 2 },
  temple: { influence: 2 },
  library: { research: 1 },
  fortress: {},
  cult_zealShrine: { zeal: 2 },
  rift_watchtower: { rift: 1 },
  inf_sporePool: { spore: 2 },
};

export const CARD_DEFS = {
  // ---- 공통 (모든 종족) ----
  fortress: {
    name: '요새', type: 'building', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 방어 시 전력 +25%.',
  },
  resupply: {
    name: '재보급', type: 'tactical', apCost: 1, cost: { influence: 1 },
    needsTarget: false, desc: '즉시 물자 +3 획득.',
  },
  intel: {
    name: '정보 수집', type: 'tactical', apCost: 1, cost: { supply: 1 },
    needsTarget: false, desc: '즉시 영향력 +3 획득.',
  },
  forcedMarch: {
    name: '강행군', type: 'tactical', apCost: 1, cost: {},
    needsTarget: true, targetFilter: 'ownedWithArmy',
    desc: '대상 아군 부대, 이번 턴 진군 전력 +50%.',
  },

  // ---- 왕국 (Kingdom) ----
  granary: {
    name: '곡창지대', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 물자 +2 생산.',
  },
  temple: {
    name: '신전', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 영향력 +2 생산.',
  },
  library: {
    name: '서고', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 연구 +1 생산.',
  },
  militia: {
    name: '민병대 소집', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 2, desc: '대상 아군 노드에 전력 2의 병력을 생성(합산).',
  },
  regulars: {
    name: '정규군 훈련', type: 'military', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 5, desc: '대상 아군 노드에 전력 5의 병력을 생성(합산).',
  },
  heroAwaken: {
    name: '용사 각성', type: 'special', apCost: 2, cost: { supply: 3, research: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 8, hero: true,
    desc: '대상 아군 노드에 전력 8의 용사를 생성. 중립 캠프 상대 +50% 전력.',
  },
  pathFaith: {
    name: '신앙의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true, desc: '연구 특화: 신앙. 이후 매 라운드 영향력 +2 (영구).',
  },
  pathMilitary: {
    name: '군부의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true, desc: '연구 특화: 군부. 모든 아군 전력 +10% (영구).',
  },
  pathHero: {
    name: '용사의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true, desc: '연구 특화: 용사. 중립 캠프전 +50% 전력, 수도에 전력 6 용사 즉시 소환.',
    grantHeroAtCapital: 6,
  },

  // ---- 광신도 (Cultists) — 희생 경제 ----
  cult_levy: {
    name: '광신도 소집', type: 'military', apCost: 1, cost: { supply: 1 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3,
    desc: '대상 아군 노드에 전력 3의 싸구려 병력을 생성. 값싸고 약하지만 물량이 곧 제물이다.',
  },
  cult_sacrifice: {
    name: '제물 의식', type: 'special', apCost: 1, cost: {},
    needsTarget: true, targetFilter: 'ownedWithArmy', effect: 'sacrifice', sacrificeAmount: 3,
    desc: '대상 아군 부대의 전력 3을 제물로 바쳐 광신 획득(대제단 부착 시 +50%). 전력이 다하면 부대 소멸.',
  },
  cult_grandAltar: {
    name: '대제단', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 이 노드에서 제물 의식 시 광신 획득 +50%.',
  },
  cult_zealShrine: {
    name: '유혈 사원', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 광신 +2 생산.',
  },
  cult_bloodOath: {
    name: '피의 서약', type: 'special', apCost: 2, cost: { zeal: 3 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 10,
    desc: '광신 3을 태워 대상 아군 노드에 전력 10의 상위 유닛을 즉시 소환.',
  },

  // ---- 차원 괴물 (Rift Horrors) — 티어 해금 ----
  rift_watchtower: {
    name: '균열 감시탑', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 균열력 +1 생산.',
  },
  rift_gateExpand: {
    name: '차원문 확장', type: 'special', apCost: 1, cost: { rift: 3 },
    needsTarget: false, effect: 'gateExpand',
    desc: '수도의 차원문 레벨 +1 (최대 5). 레벨이 오를수록 소환수가 강해진다.',
  },
  rift_summonLow: {
    name: '심연의 부름', type: 'military', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 6, scalesWithGate: true, gatePowerMult: 2,
    desc: '대상 아군 노드에 전력 6 + (차원문 레벨×2)의 병력을 소환.',
  },
  rift_summonHigh: {
    name: '차원 군주 강림', type: 'military', apCost: 3, cost: { supply: 6, rift: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 12, scalesWithGate: true, gatePowerMult: 3,
    minGateLevel: 3, hero: true,
    desc: '차원문 Lv3 이상 필요. 전력 12 + (차원문 레벨×3)의 압도적 유닛을 소환.',
  },

  // ---- 감염체 (Infested) — 확산 ----
  inf_levy: {
    name: '감염된 무리', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3,
    desc: '대상 아군 노드에 전력 3의 병력을 생성. 개별로는 약하나 죽은 자리에 포자를 남긴다.',
  },
  inf_sporePool: {
    name: '포자 웅덩이', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 포자 +2 생산.',
  },
  inf_spread: {
    name: '포자 살포', type: 'special', apCost: 1, cost: { spore: 2 },
    needsTarget: true, targetFilter: 'infectable', effect: 'infect', infectRounds: 2,
    desc: '아군 노드에 인접한 비아군 노드(수도 제외)를 감염시킨다. 2라운드 후 자동으로 내 것이 된다.',
  },
  inf_plagueWave: {
    name: '역병의 파도', type: 'tactical', apCost: 1, cost: { spore: 3 },
    needsTarget: false, effect: 'plagueAccelerate',
    desc: '현재 진행 중인 모든 감염의 남은 라운드를 1 줄인다.',
  },
};

// 종족별 덱 구성: [카드kind, 매수]. 공통 카드 + 종족 전용 카드로 구성.
export const DECKS = {
  kingdom: [
    ['fortress', 2], ['resupply', 2], ['intel', 2], ['forcedMarch', 2],
    ['granary', 2], ['temple', 2], ['library', 2],
    ['militia', 3], ['regulars', 2], ['heroAwaken', 1],
    ['pathFaith', 1], ['pathMilitary', 1], ['pathHero', 1],
  ],
  cultists: [
    ['fortress', 2], ['resupply', 2], ['intel', 2], ['forcedMarch', 2],
    ['cult_levy', 5], ['cult_sacrifice', 4],
    ['cult_grandAltar', 2], ['cult_zealShrine', 2], ['cult_bloodOath', 2],
  ],
  rift: [
    ['fortress', 2], ['resupply', 2], ['intel', 2], ['forcedMarch', 2],
    ['rift_watchtower', 3], ['rift_gateExpand', 4],
    ['rift_summonLow', 5], ['rift_summonHigh', 2],
  ],
  infested: [
    ['fortress', 2], ['resupply', 2], ['intel', 2], ['forcedMarch', 2],
    ['inf_levy', 5], ['inf_sporePool', 3],
    ['inf_spread', 4], ['inf_plagueWave', 3],
  ],
};

export function buildDeck(seed, playerSalt, race) {
  const list = DECKS[race] || DECKS.kingdom;
  const cards = [];
  for (const [kind, count] of list) {
    for (let i = 0; i < count; i++) cards.push({ uid: `${playerSalt}-${kind}-${i}`, kind });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const r = seededRandomLocal(seed, playerSalt, i);
    const j = Math.floor(r * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// cards.js는 rng.js에 의존하지 않고 자체 해시를 쓴다 (초기 덱 구성 1회성이므로
// rules.js의 rngCounter 시스템과 분리해도 결정론이 깨지지 않는다).
function seededRandomLocal(seed, playerSalt, i) {
  const saltNum = playerSalt === 'P1' ? 1 : 2;
  let h = (seed ^ (i * 7919) ^ (saltNum * 104729)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

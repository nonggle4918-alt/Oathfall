// 왕국(Kingdom) 카드 정의 — §6.3, §7 참고.
// M1 프로토타입 축소판: 원 기획 25~30장 중 핵심 유형만 추려 23장 덱으로 구성.
// kind는 rules.js의 applyCardEffect()가 해석하는 태그.

export const CARD_DEFS = {
  granary: {
    name: '곡창지대', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 매 라운드 물자 +2 생산.',
  },
  temple: {
    name: '신전', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 매 라운드 영향력 +2 생산.',
  },
  fortress: {
    name: '요새', type: 'building', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 방어 시 전력 +25%.',
  },
  library: {
    name: '서고', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 매 라운드 연구 +1 생산.',
  },
  militia: {
    name: '민병대 소집', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 2,
    desc: '대상 아군 노드에 전력 2의 병력을 생성(합산).',
  },
  regulars: {
    name: '정규군 훈련', type: 'military', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 5,
    desc: '대상 아군 노드에 전력 5의 병력을 생성(합산).',
  },
  heroAwaken: {
    name: '용사 각성', type: 'special', apCost: 2, cost: { supply: 3, research: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 8, hero: true,
    desc: '대상 아군 노드에 전력 8의 용사를 생성. 중립 캠프 상대 +50% 전력.',
  },
  forcedMarch: {
    name: '강행군', type: 'tactical', apCost: 1, cost: {},
    needsTarget: true, targetFilter: 'ownedWithArmy',
    desc: '대상 아군 부대, 이번 턴 진군 전력 +50%.',
  },
  resupply: {
    name: '재보급', type: 'tactical', apCost: 1, cost: { influence: 1 },
    needsTarget: false,
    desc: '즉시 물자 +3 획득.',
  },
  intel: {
    name: '정보 수집', type: 'tactical', apCost: 1, cost: { supply: 1 },
    needsTarget: false,
    desc: '즉시 영향력 +3 획득.',
  },
  pathFaith: {
    name: '신앙의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true,
    desc: '연구 특화: 신앙. 이후 매 라운드 영향력 +2 (영구).',
  },
  pathMilitary: {
    name: '군부의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true,
    desc: '연구 특화: 군부. 모든 아군 전력 +10% (영구).',
  },
  pathHero: {
    name: '용사의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true,
    desc: '연구 특화: 용사. 중립 캠프전 +50% 전력, 수도에 전력 6 용사 즉시 소환.',
  },
};

// 덱 구성 (카드 종류, 매수) — 총 23장
export const DECK_LIST = [
  ['granary', 2], ['temple', 2], ['fortress', 2], ['library', 2],
  ['militia', 3], ['regulars', 2], ['heroAwaken', 1],
  ['forcedMarch', 2], ['resupply', 2], ['intel', 2],
  ['pathFaith', 1], ['pathMilitary', 1], ['pathHero', 1],
];

export function buildDeck(seed, playerSalt) {
  const cards = [];
  let n = 0;
  for (const [kind, count] of DECK_LIST) {
    for (let i = 0; i < count; i++) {
      cards.push({ uid: `${playerSalt}-${kind}-${i}`, kind });
      n++;
    }
  }
  // 결정론적 셔플 (Fisher-Yates, 시드 기반)
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

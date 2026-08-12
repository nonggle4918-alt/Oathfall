// 4종족 카드 정의 (§6). M3 개편:
//  - 공용 "영향력" 자원을 폐기하고 진영별 고유자원 2종(化폐성 자원 또는 화폐+티어축)으로 재편.
//  - 이동력(moveRange)을 가진 유닛 카드 추가 (기본 1, 종족별 고속 유닛 2~3).
//  - 수도 티어(minCapitalTier)로 상위 카드를 잠그는 시스템 추가 — 초반에 뽑혀도 못 쓰는 죽은 패 방지.
//  - 외교(조약 파기) 종속 카드는 조약 시스템이 아직 없는 이 빌드에서는 의도적으로 제외했다.

// 종족별 "화폐성" 2차 자원. rift/infested는 2차 축이 화폐가 아니라 gateLevel/virulence 같은
// "티어 스탯"이라 isCurrency:false — 대신 매 라운드 소량의 1차 자원을 보전받는다 (nodeIncome 참조).
export const RACE_SECONDARY = {
  kingdom: { key: 'authority', name: '권위', isCurrency: true },
  cultists: { key: 'corruption', name: '타락', isCurrency: true },
  rift: { key: 'gateLevel', name: '차원문 티어', isCurrency: false },
  infested: { key: 'virulence', name: '감염력', isCurrency: false },
};

export const RACE_INFO = {
  kingdom: {
    name: '왕국', resource: 'research', resourceName: '연구',
    desc: '연구(기술) + 권위(통치) 2축 경제. 영지를 넓힐수록 물자 보너스가 커진다. 신앙/군부/용사 중 하나로 특화한다.',
  },
  cultists: {
    name: '광신도', resource: 'zeal', resourceName: '광신',
    desc: '광신(제물) + 타락(누적 죄업) 2축 경제. 전투에서 피를 흘릴수록(자신/적 모두) 광신이 저절로 쌓인다.',
  },
  rift: {
    name: '차원 괴물', resource: 'rift', resourceName: '균열력',
    desc: '균열력을 태워 차원문 티어를 올린다. 차원문이 오를수록 소환수 자체의 전투력도 함께 강해지는 후반 캐리형 종족.',
  },
  infested: {
    name: '감염체', resource: 'spore', resourceName: '포자',
    desc: '노드를 정복 대신 감염시킨다. 완료된 감염 지대는 영구히 "포자 지대"로 남아 그 위의 감염체 병력을 강화한다 — 저그의 크립과 유사.',
  },
};

// 매 라운드 자동 생산 (일반 자원)
export const BUILDING_INCOME = {
  granary: { supply: 2 },
  library: { research: 1 },
  chancellery: { authority: 2 },
  fortress: {},
  command_post: {},
  cult_zealShrine: { zeal: 2 },
  cult_corruptionAltar: { corruption: 1 },
  rift_watchtower: { rift: 1 },
  inf_sporePool: { spore: 2 },
};

// AP는 nodeIncome 루프가 아니라 라운드 시작 시 별도 계산된다 (rules.js startTurn 참조).
export const AP_BONUS_BUILDINGS = { command_post: 1 };
export const AP_BONUS_CAP = 2; // 건물로 얻을 수 있는 AP 보너스 총합 상한

// cost가 함수([pl] => costObj)인 카드도 있다 (수도 확장 — 티어가 오를수록 비용이 커짐).
export function resolveCost(def, pl) {
  return typeof def.cost === 'function' ? def.cost(pl) : def.cost;
}

export const CARD_DEFS = {
  // ---- 공용 (모든 종족, 5종 — 종족 전용 카드 수보다 적게 유지) ----
  fortress: {
    name: '요새', type: 'building', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: '대상 노드에 부착. 방어 시 전력 +25%.',
  },
  command_post: {
    name: '지휘소', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding',
    desc: `대상 노드에 부착. 매 라운드 AP +1 (최대 +${AP_BONUS_CAP}까지 중첩).`,
  },
  resupply: {
    name: '재보급', type: 'tactical', apCost: 1, cost: {},
    needsTarget: false, desc: '즉시 물자 +2 획득.',
  },
  scouting: {
    name: '척후', type: 'tactical', apCost: 1, cost: { supply: 1 },
    needsTarget: false, effect: 'drawCard', drawAmount: 1,
    desc: '즉시 카드 1장을 뽑는다.',
  },
  forcedMarch: {
    name: '강행군', type: 'tactical', apCost: 1, cost: {},
    needsTarget: true, targetFilter: 'ownedWithArmy',
    desc: '대상 아군 부대, 이번 턴 진군 전력 +50%.',
  },

  // ---- 왕국 (Kingdom) — 연구/권위, 영지 확장형 물량 ----
  granary: {
    name: '곡창지대', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 물자 +2 생산.',
  },
  library: {
    name: '서고', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 연구 +1 생산.',
  },
  chancellery: {
    name: '관청', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 권위 +2 생산.',
  },
  militia: {
    name: '민병대 소집', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 2, moveRange: 1,
    desc: '대상 아군 노드에 전력 2의 병력을 생성(합산). 이동력 1.',
  },
  regulars: {
    name: '정규군 훈련', type: 'military', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 5, moveRange: 1,
    desc: '대상 아군 노드에 전력 5의 병력을 생성(합산). 이동력 1.',
  },
  kingdom_cavalry: {
    name: '기마 정찰대', type: 'military', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 4, moveRange: 2,
    desc: '대상 아군 노드에 전력 4의 병력을 생성. 이동력 2 — 한 턴에 두 칸까지 진군 가능.',
  },
  heroAwaken: {
    name: '용사 각성', type: 'special', apCost: 2, cost: { supply: 3, research: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 8, hero: true, moveRange: 1,
    desc: '대상 아군 노드에 전력 8의 용사를 생성. 중립 캠프 상대 +50% 전력.',
  },
  kingdom_capitalExpand: {
    name: '왕국 확장령', type: 'special', apCost: 2,
    cost: (pl) => ({ supply: 4 * (pl.capitalTier || 1), authority: 2 * (pl.capitalTier || 1) }),
    needsTarget: false, effect: 'capitalTierUp',
    desc: '수도 티어 +1 (최대 4). 티어가 높을수록 비용도 커진다. 티어를 올려야 상위 카드가 해금된다.',
  },
  kingdom_royalGuard: {
    name: '근위 성기사단', type: 'military', apCost: 3, cost: { supply: 7, authority: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 14, hero: true, moveRange: 1,
    minCapitalTier: 3,
    desc: '수도 티어 3 이상 필요. 전력 14의 왕국 최상위 유닛을 소환.',
  },
  pathFaith: {
    name: '신앙의 길', type: 'special', apCost: 1, cost: { research: 3 },
    needsTarget: false, once: true, desc: '연구 특화: 신앙. 이후 매 라운드 권위 +2 (영구).',
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

  // ---- 광신도 (Cultists) — 광신/타락, 희생 경제 ----
  cult_levy: {
    name: '광신도 소집', type: 'military', apCost: 1, cost: { supply: 1 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3, moveRange: 1,
    desc: '대상 아군 노드에 전력 3의 싸구려 병력을 생성. 값싸고 약하지만 물량이 곧 제물이다.',
  },
  cult_zealotRush: {
    name: '광신 돌격대', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3, moveRange: 2,
    desc: '대상 아군 노드에 전력 3의 병력을 생성. 이동력 2의 경돌격병.',
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
  cult_corruptionAltar: {
    name: '타락의 제단', type: 'building', apCost: 1, cost: { supply: 3 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 타락 +1 생산.',
  },
  cult_bloodOath: {
    name: '피의 서약', type: 'special', apCost: 2, cost: { zeal: 3 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 10, moveRange: 1,
    desc: '광신 3을 태워 대상 아군 노드에 전력 10의 상위 유닛을 즉시 소환.',
  },
  cult_capitalExpand: {
    name: '타락의 확장', type: 'special', apCost: 2,
    cost: (pl) => ({ supply: 4 * (pl.capitalTier || 1), corruption: 2 * (pl.capitalTier || 1) }),
    needsTarget: false, effect: 'capitalTierUp',
    desc: '수도 티어 +1 (최대 4). 티어가 높을수록 비용도 커진다.',
  },
  cult_demonPact: {
    name: '악마와의 계약', type: 'military', apCost: 3, cost: { zeal: 4, corruption: 6 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 16, hero: true, moveRange: 1,
    minCapitalTier: 3,
    desc: '수도 티어 3 이상 필요. 타락을 대량 소모해 전력 16의 악마를 강림시킨다.',
  },

  // ---- 차원 괴물 (Rift Horrors) — 균열력/차원문 티어, 후반 캐리형 ----
  rift_watchtower: {
    name: '균열 감시탑', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 균열력 +1 생산.',
  },
  rift_gateExpand: {
    name: '차원문 확장', type: 'special', apCost: 1, cost: { rift: 3 },
    needsTarget: false, effect: 'gateExpand',
    desc: '수도의 차원문 레벨 +1 (최대 5). 레벨이 오를수록 소환수뿐 아니라 모든 차원 괴물 부대의 전투력이 함께 강해진다.',
  },
  rift_summonLow: {
    name: '심연의 부름', type: 'military', apCost: 2, cost: { supply: 4 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 6, scalesWithGate: true, gatePowerMult: 2, moveRange: 1,
    desc: '대상 아군 노드에 전력 6 + (차원문 레벨×2)의 병력을 소환.',
  },
  rift_voidStalker: {
    name: '공허 추적자', type: 'military', apCost: 2, cost: { supply: 2, rift: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 5, moveRange: 3,
    minCapitalTier: 2,
    desc: '수도 티어 2 이상 필요. 전력 5, 이동력 3의 차원 도약체 — 한 턴에 세 칸까지 도약한다.',
  },
  rift_fracture: {
    name: '균열 파열', type: 'tactical', apCost: 1, cost: { rift: 2 },
    needsTarget: true, targetFilter: 'enemyArmyAdjacent', effect: 'weaken', weakenAmount: 3,
    desc: '아군 노드에 인접한 적 부대의 전력을 즉시 3 깎는다.',
  },
  rift_summonHigh: {
    name: '차원 군주 강림', type: 'military', apCost: 3, cost: { supply: 6, rift: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 12, scalesWithGate: true, gatePowerMult: 3,
    minGateLevel: 3, hero: true, moveRange: 1,
    desc: '차원문 Lv3 이상 필요. 전력 12 + (차원문 레벨×3)의 압도적 유닛을 소환.',
  },
  rift_capitalExpand: {
    name: '차원문 심화', type: 'special', apCost: 2,
    cost: (pl) => ({ supply: 4 * (pl.capitalTier || 1), rift: 3 * (pl.capitalTier || 1) }),
    needsTarget: false, effect: 'capitalTierUp',
    desc: '수도 티어 +1 (최대 4). 티어가 높을수록 비용도 커진다.',
  },
  rift_summonApex: {
    name: '심연 그 자체', type: 'military', apCost: 4, cost: { supply: 8, rift: 6 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 20, scalesWithGate: true, gatePowerMult: 5,
    minGateLevel: 5, minCapitalTier: 4, hero: true, moveRange: 1,
    desc: '수도 티어 4 & 차원문 Lv5 필요. 전력 20 + (차원문 레벨×5)의 종결급 존재 — 모든 종족 중 가장 강한 후반 카드.',
  },

  // ---- 감염체 (Infested) — 포자/감염력, 크립형 확산 ----
  inf_levy: {
    name: '감염된 무리', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3, moveRange: 1,
    desc: '대상 아군 노드에 전력 3의 병력을 생성. 개별로는 약하나 죽은 자리에 포자를 남긴다.',
  },
  inf_sporeGlider: {
    name: '포자 활공체', type: 'military', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 3, moveRange: 2,
    desc: '대상 아군 노드에 전력 3의 병력을 생성. 이동력 2의 활공 개체.',
  },
  inf_sporePool: {
    name: '포자 웅덩이', type: 'building', apCost: 1, cost: { supply: 2 },
    needsTarget: true, targetFilter: 'ownedNoBuilding', desc: '대상 노드에 부착. 매 라운드 포자 +2 생산.',
  },
  inf_spread: {
    name: '포자 살포', type: 'special', apCost: 1, cost: { spore: 2 },
    needsTarget: true, targetFilter: 'infectable', effect: 'infect', infectRounds: 2, infectRoundsCapital: 4,
    desc: '아군 노드에 인접한 비아군 노드를 감염시킨다. 무소유 노드는 완료 시 탈취되지만, 적이 소유한 노드(수도 포함)는 소유권은 그대로 두고 생산·방어를 깎는 디버프가 걸린다. 완료된 자리는 영구히 포자 지대가 되어 감염체 부대를 강화한다.',
  },
  inf_plagueWave: {
    name: '역병의 파도', type: 'tactical', apCost: 1, cost: { spore: 3 },
    needsTarget: false, effect: 'plagueAccelerate',
    desc: '현재 진행 중인 모든 감염의 남은 라운드를 1 줄인다.',
  },
  inf_virulenceUp: {
    name: '변종 진화', type: 'special', apCost: 1, cost: { spore: 4 },
    needsTarget: false, effect: 'virulenceUp',
    desc: '감염력 +1 (최대 5). 감염력이 오를수록 감염 완료가 빨라지고 포자 지대의 강화 효과도 커진다.',
  },
  inf_capitalExpand: {
    name: '균사 확장', type: 'special', apCost: 2,
    cost: (pl) => ({ supply: 4 * (pl.capitalTier || 1), spore: 3 * (pl.capitalTier || 1) }),
    needsTarget: false, effect: 'capitalTierUp',
    desc: '수도 티어 +1 (최대 4). 티어가 높을수록 비용도 커진다.',
  },
  inf_hiveQueen: {
    name: '군락의 여왕', type: 'military', apCost: 3, cost: { supply: 6, spore: 6 },
    needsTarget: true, targetFilter: 'owned', spawnPower: 12, hero: true, moveRange: 1,
    minCapitalTier: 3, grantsSporeIncome: 3,
    desc: '수도 티어 3 이상 필요. 전력 12의 여왕을 소환하고, 소환된 노드에 영구 포자 +3 생산을 부여한다.',
  },
};

// 종족별 덱 구성: [카드kind, 매수]. 공통 카드(5종) + 종족 전용 카드(7~12종)로,
// 종족 전용 카드 "종류" 수가 공통보다 항상 많도록 설계했다.
export const DECKS = {
  kingdom: [
    ['fortress', 2], ['resupply', 2], ['scouting', 2], ['forcedMarch', 2], ['command_post', 2],
    ['granary', 2], ['library', 2], ['chancellery', 2],
    ['militia', 3], ['regulars', 2], ['kingdom_cavalry', 2], ['heroAwaken', 1],
    ['kingdom_capitalExpand', 3], ['kingdom_royalGuard', 1],
    ['pathFaith', 1], ['pathMilitary', 1], ['pathHero', 1],
  ],
  cultists: [
    ['fortress', 2], ['resupply', 2], ['scouting', 2], ['forcedMarch', 2], ['command_post', 2],
    ['cult_levy', 4], ['cult_zealotRush', 2], ['cult_sacrifice', 4],
    ['cult_grandAltar', 2], ['cult_zealShrine', 2], ['cult_corruptionAltar', 2], ['cult_bloodOath', 2],
    ['cult_capitalExpand', 3], ['cult_demonPact', 1],
  ],
  rift: [
    ['fortress', 2], ['resupply', 2], ['scouting', 2], ['forcedMarch', 2], ['command_post', 2],
    ['rift_watchtower', 3], ['rift_gateExpand', 4], ['rift_fracture', 2],
    ['rift_summonLow', 4], ['rift_voidStalker', 2], ['rift_summonHigh', 2],
    ['rift_capitalExpand', 3], ['rift_summonApex', 1],
  ],
  infested: [
    ['fortress', 2], ['resupply', 2], ['scouting', 2], ['forcedMarch', 2], ['command_post', 2],
    ['inf_levy', 4], ['inf_sporeGlider', 2], ['inf_sporePool', 3],
    ['inf_spread', 4], ['inf_plagueWave', 2], ['inf_virulenceUp', 3],
    ['inf_capitalExpand', 3], ['inf_hiveQueen', 1],
  ],
};

// 수도 티어로 잠긴 카드(minCapitalTier > 1)는 시작 덱에서 분리해 별도 lockedPool에 보관한다.
// 초반에 상위 카드가 뽑혀도 쓰지 못한 채 죽은 패가 되는 것을 원천적으로 막기 위함.
export function buildDeck(seed, playerSalt, race) {
  const list = DECKS[race] || DECKS.kingdom;
  const cards = [];
  const locked = [];
  for (const [kind, count] of list) {
    const def = CARD_DEFS[kind];
    for (let i = 0; i < count; i++) {
      const card = { uid: `${playerSalt}-${kind}-${i}`, kind };
      if (def && def.minCapitalTier && def.minCapitalTier > 1) locked.push(card);
      else cards.push(card);
    }
  }
  shuffleLocal(cards, seed, playerSalt);
  shuffleLocal(locked, seed, playerSalt + '-locked');
  return { deck: cards, locked };
}

function shuffleLocal(arr, seed, playerSalt) {
  for (let i = arr.length - 1; i > 0; i--) {
    const r = seededRandomLocal(seed, playerSalt, i);
    const j = Math.floor(r * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// cards.js는 rng.js에 의존하지 않고 자체 해시를 쓴다 (초기 덱 구성 1회성이므로
// rules.js의 rngCounter 시스템과 분리해도 결정론이 깨지지 않는다).
function seededRandomLocal(seed, playerSalt, i) {
  const saltNum = String(playerSalt).startsWith('P1') ? 1 : 2;
  const saltExtra = String(playerSalt).includes('locked') ? 97 : 0;
  let h = (seed ^ (i * 7919) ^ (saltNum * 104729) ^ saltExtra) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

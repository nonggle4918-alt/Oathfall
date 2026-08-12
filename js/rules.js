// 순수 룰 엔진. reduce(state, action) -> state 외에는 아무것도 모른다 (§2 원칙 2).
// 네트워크·렌더링·저장을 몰라야 Firebase 연동(2단계) 시 코어를 그대로 승격할 수 있다.
//
// M3 개편 요약 (커밋 로그 참고):
//  - "영향력" 공용 자원 폐기 → 종족별 고유자원 2축(연구+권위 / 광신+타락 / 균열력+차원문티어 / 포자+감염력).
//  - AP는 라운드에 따라 자동 증가 + 지휘소 건물로 추가 보너스.
//  - 부대별 이동력(moveRange/movePoints) 도입 — "한 턴에 전 맵을 먹는" 문제 해결.
//  - 수도 티어(1~4) 시스템 — 상위 카드는 티어를 달성해야 덱에 섞여 들어간다 (죽은 패 방지).
//  - 감염체: 노드/수도를 감염시켜도 "탈취"는 중립 노드에만 적용된다. 이미 적이 소유한
//    노드(수도 포함)를 감염시키면 소유권은 그대로 두고 생산/방어를 깎는 "디버프"로 완료된다
//    (방어군 주둔 시 진행 정지는 동일). 완료 지점은 영구 "포자 지대"가 되어 감염체 부대를
//    강화한다(저그 크립과 유사) + 낮은 확률로 자연 확산.
//  - 외교(조약) 시스템은 완전히 제외한다. 예전에 외교에 묶여 있던 종족 정체성은 여기서
//    "종족 특수 능력"(카드 없이 항상 적용되는 패시브)으로 분리됐다 — 이름/설명은
//    cards.js의 RACE_SPECIAL_ABILITY, 실제 수치는 아래 각 함수에 있다:
//    왕국="영지 총동원령"(nodeIncome), 광신도="출혈의 계약"(ISSUE_MARCH 전투 분기),
//    차원 괴물="차원 공명"(powerMultiplier), 감염체="자가 증식"(maybeAutoSpread).
//  - AP: 라운드 자동 증가는 공용 상한 4까지. 그 위로는 종족별 진행축에 따라 각기 다르게
//    더 늘어난다 — 차원 괴물/감염체는 자신의 티어 스탯(차원문/감염력)이 4·5를 찍을 때마다
//    +1씩(최대 +2), 왕국/광신도는 수도 티어 4에서 +1.

import { buildGameMap, DUMP_NODE_IDS, NEUTRAL_CAMP_GARRISON, NEUTRAL_CAMP_REWARD, STARTING_ARMY_POWER } from './mapData.js';
import { CARD_DEFS, BUILDING_INCOME, AP_BONUS_BUILDINGS, AP_BONUS_CAP, RACE_SECONDARY, buildDeck, resolveCost } from './cards.js';
import { seededRandom, seededVariance } from './rng.js';

export const PLAYER_ORDER = ['P1', 'P2'];
export const HAND_LIMIT = 7;
export const START_HAND = 5;
export const DRAW_PER_TURN = 2;
export const BASE_AP_MIN = 2;
export const BASE_AP_MAX = 4; // 라운드에 따른 "공용" 자동 증가는 여기서 멈춘다
export const AP_GROWTH_EVERY_ROUNDS = 5; // N라운드마다 기본 AP +1
export const ROUND_CAP = 20;
export const DOMINATION_ROUNDS_NEEDED = 3;
export const CAPITAL_TIER_MAX = 4;
export const AUTO_SPREAD_CHANCE = 0.4;
export const DEBUFF_DURATION = 5; // 적 노드 감염 완료 시 적용되는 디버프 지속 라운드
export const DEBUFF_INCOME_MULT = 0.5;
export const DEBUFF_DEFENSE_MULT = 0.85;

function clone(x) {
  return typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
}

export function initGame(seed, opts = {}) {
  const races = opts.races || { P1: 'kingdom', P2: 'kingdom' };
  // 종족마다 수도 뒤 인컴 슬롯 개수가 다르므로(RACE_ECON_SLOTS), 맵 자체를 종족 선택에 맞춰
  // 매 게임 새로 생성한다 — 더 이상 고정된 모듈 레벨 맵이 아니다.
  const { nodes: mapNodes, nodeNames, adjacency } = buildGameMap(races);
  const nodes = {};
  for (const [id, def] of Object.entries(mapNodes)) {
    nodes[id] = {
      type: def.type, x: def.x, y: def.y,
      owner: def.owner,
      building: null,
      garrison: def.type === 'neutralCamp' ? NEUTRAL_CAMP_GARRISON : 0,
      army: def.type === 'capital'
        ? { owner: def.owner, power: STARTING_ARMY_POWER, stance: 'defend', hero: false, moveRange: 1, movePoints: 1 }
        : null,
      infested: null,
      sporeZone: false,
      bonusIncome: null,
      debuff: null,
    };
  }

  const players = {};
  for (const p of PLAYER_ORDER) {
    const race = races[p] || 'kingdom';
    const { deck, locked } = buildDeck(seed, p, race);
    players[p] = {
      race,
      supply: 5, ap: 0,
      research: 0, zeal: 0, rift: 0, spore: 0, authority: 0, corruption: 0,
      gateLevel: 1, virulence: 1,
      capitalTier: 1,
      hand: [], deck, discard: [], locked,
      specialization: null,
      isAI: opts.aiPlayers ? opts.aiPlayers.includes(p) : p === 'P2',
    };
  }

  let state = {
    seed, rngCounter: 0,
    round: 1, activePlayer: 'P1', phase: 'playing', winner: null, winReason: null,
    dumpDomination: { owner: null, consecutiveRounds: 0 },
    players, nodes, adjacency, nodeNames,
    log: [],
  };

  for (const p of PLAYER_ORDER) state = drawCards(state, p, START_HAND);
  state = startTurn(state, 'P1');
  return state;
}

function pushLog(state, text) {
  state.log.push({ round: state.round, player: state.activePlayer, text });
  if (state.log.length > 200) state.log.shift();
}

function drawCards(state, player, count) {
  const pl = state.players[player];
  for (let i = 0; i < count; i++) {
    if (pl.hand.length >= HAND_LIMIT) break;
    if (pl.deck.length === 0) {
      if (pl.discard.length === 0) break;
      pl.deck = pl.discard;
      pl.discard = [];
    }
    pl.hand.push(pl.deck.pop());
  }
  return state;
}

// 종족별 2차 통화 자원 (권위/타락). rift/infested는 통화가 아니라 티어 스탯이라 여기 없음.
function secondaryCurrencyKey(race) {
  const sec = RACE_SECONDARY[race];
  return sec && sec.isCurrency ? sec.key : null;
}
function primaryKey(race) {
  return { kingdom: 'research', cultists: 'zeal', rift: 'rift', infested: 'spore' }[race] || 'research';
}

function nodeIncome(node, pl) {
  const base = { supply: 0, research: 0, zeal: 0, rift: 0, spore: 0, authority: 0, corruption: 0 };
  const primary = primaryKey(pl.race);
  const secondary = secondaryCurrencyKey(pl.race);
  if (node.type === 'capital') { base.supply += 3; base[primary] += 1; }
  else if (node.type === 'territory') { base.supply += 2; }
  else if (node.type === 'sanctuary') {
    if (secondary) base[secondary] += 2;
    else base[primary] += 1; // rift/infested: 화폐 2축이 없으니 1차 자원으로 보전
  } else if (node.type === 'dump') {
    base.supply += 2;
    if (secondary) base[secondary] += 1;
    else base[primary] += 1;
  }
  // 건물 산출은 고정 오브젝트이거나 (node, pl) => 오브젝트 함수다 — 후자는 종족별로 건물
  // 효율이 다르게 스케일링되는 경우다(예: 차원 괴물은 차원문 레벨에 비례, 감염체는
  // 포자 지대 위에서 보너스). cards.js의 BUILDING_INCOME 주석 참조.
  const biRaw = node.building ? BUILDING_INCOME[node.building] : null;
  const bi = typeof biRaw === 'function' ? biRaw(node, pl) : biRaw;
  if (bi) for (const [k, v] of Object.entries(bi)) base[k] = (base[k] || 0) + v;
  if (node.bonusIncome) for (const [k, v] of Object.entries(node.bonusIncome)) base[k] = (base[k] || 0) + v;
  // 감염 디버프가 걸린 노드는 소유주가 그대로여도 생산량이 깎인다 (탈취 대신 디버프).
  if (node.debuff) for (const k of Object.keys(base)) base[k] = Math.floor(base[k] * DEBUFF_INCOME_MULT);
  return base;
}

function baseApForRound(round) {
  return Math.min(BASE_AP_MAX, BASE_AP_MIN + Math.floor((round - 1) / AP_GROWTH_EVERY_ROUNDS));
}

// 종족별 AP 상한 보너스. 공용 자동 증가(라운드 기준)는 4에서 멈추지만, 종족 고유
// 진행축(차원문/감염력/수도 티어)이 오르면 종족마다 다른 방식으로 그 위까지 늘어난다.
// 차원 괴물·감염체는 자기 티어 스탯이 4/5를 찍을 때마다 +1(최대 +2) — 후반 캐리형 종족이라
// 가장 크게 늘어난다. 왕국·광신도는 별도 티어 스탯이 없어 수도 티어 4에서 +1만 받는다.
function raceApBonus(pl) {
  if (pl.race === 'rift') {
    const lv = pl.gateLevel || 1;
    return lv >= 5 ? 2 : lv >= 4 ? 1 : 0;
  }
  if (pl.race === 'infested') {
    const lv = pl.virulence || 1;
    return lv >= 5 ? 2 : lv >= 4 ? 1 : 0;
  }
  if (pl.race === 'kingdom' || pl.race === 'cultists') {
    return (pl.capitalTier || 1) >= CAPITAL_TIER_MAX ? 1 : 0;
  }
  return 0;
}

function startTurn(state, player) {
  const pl = state.players[player];
  const inc = { supply: 0, research: 0, zeal: 0, rift: 0, spore: 0, authority: 0, corruption: 0 };
  let ownedTerritoryCount = 0;
  let apBonus = 0;
  for (const node of Object.values(state.nodes)) {
    if (node.owner !== player) continue;
    const i = nodeIncome(node, pl);
    for (const k of Object.keys(inc)) inc[k] += i[k] || 0;
    if (node.type === 'territory') ownedTerritoryCount += 1;
    if (node.building && AP_BONUS_BUILDINGS[node.building]) apBonus += AP_BONUS_BUILDINGS[node.building];
  }
  if (pl.specialization === 'faith') inc.authority += 2;
  // 왕국 종족 특수 능력 — 영지 총동원령: 소유한 영지(territory) 하나당 물자 +1 (넓게 펴는 물량형 정체성 강화)
  if (pl.race === 'kingdom') inc.supply += ownedTerritoryCount;
  for (const k of Object.keys(inc)) pl[k] += inc[k];
  pl.ap = baseApForRound(state.round) + Math.min(AP_BONUS_CAP, apBonus) + raceApBonus(pl);
  state.activePlayer = player;
  // 이동력 리셋 + 강행군 보너스 만료 ("이번 턴"에만 유효)
  for (const node of Object.values(state.nodes)) {
    if (node.army && node.army.owner === player) {
      node.army.movePoints = node.army.moveRange || 1;
      node.army.forcedMarchBonus = false;
    }
  }
  const incText = Object.entries(inc).filter(([, v]) => v > 0).map(([k, v]) => `${RES_LABEL[k]}+${v}`).join(' ') || '없음';
  pushLog(state, `--- ${player} 턴 시작 (AP ${pl.ap}, ${incText}) ---`);
  state = drawCards(state, player, DRAW_PER_TURN);
  return state;
}

const RES_LABEL = { supply: '물자', research: '연구', zeal: '광신', rift: '균열력', spore: '포자', authority: '권위', corruption: '타락' };

function canAfford(pl, cost) {
  return Object.entries(cost).every(([k, v]) => (pl[k] || 0) >= v);
}
function payCost(pl, cost) {
  for (const [k, v] of Object.entries(cost)) pl[k] -= v;
}

function powerMultiplier(state, player) {
  const pl = state.players[player];
  let mult = pl.specialization === 'military' ? 1.1 : 1.0;
  // 차원 괴물 종족 특수 능력 — 차원 공명: 차원문 티어가 오를수록 소환수뿐 아니라 부대 전투력 자체가 강해진다 (후반 캐리형).
  if (pl.race === 'rift') mult *= 1 + 0.08 * (pl.gateLevel || 1);
  return mult;
}

function checkConquest(state) {
  if (state.nodes.C1.owner !== 'P1') { state.phase = 'ended'; state.winner = 'P2'; state.winReason = 'conquest'; pushLog(state, `P1의 수도가 함락되었다. P2 승리 (정복)`); }
  else if (state.nodes.C2.owner !== 'P2') { state.phase = 'ended'; state.winner = 'P1'; state.winReason = 'conquest'; pushLog(state, `P2의 수도가 함락되었다. P1 승리 (정복)`); }
}

function resolveCombat(state, attackerPlayer, attackerRawPower, defenderPlayer, defenderRawPower, opts) {
  const c1 = state.rngCounter++;
  const c2 = state.rngCounter++;
  const stanceMult = opts.defenderStance === 'defend' ? 1.3 : opts.defenderStance === 'retreat' ? 0.5 : 1.0;
  const heroMult = opts.heroVsCamp ? 1.5 : 1.0;
  const forcedMult = opts.forcedMarch ? 1.5 : 1.0;
  const attackerSporeMult = opts.attackerSporeZone ? 1.15 : 1.0;
  const defenderSporeMult = opts.defenderSporeZone ? 1.15 : 1.0;

  const attackerEff = attackerRawPower * forcedMult * heroMult * attackerSporeMult * powerMultiplier(state, attackerPlayer) * seededVariance(state.seed, c1, 0.1);
  const defenderEff = defenderRawPower * stanceMult * opts.terrainMult * defenderSporeMult * (defenderPlayer ? powerMultiplier(state, defenderPlayer) : 1.0) * seededVariance(state.seed, c2, 0.1);

  const dmgToDefender = attackerEff * 0.7;
  const dmgToAttacker = defenderEff * 0.7;
  const defRemain = defenderEff - dmgToDefender;
  const atkRemain = attackerEff - dmgToAttacker;

  const attackerSurvivorRaw = atkRemain > 0 ? Math.max(1, Math.round(attackerRawPower * (atkRemain / attackerEff))) : 0;
  const defenderSurvivorRaw = defRemain > 0 ? Math.max(1, Math.round(defenderRawPower * (defRemain / defenderEff))) : 0;

  return {
    attackerWins: defRemain <= 0 && atkRemain > 0,
    defenderWins: atkRemain <= 0 && defRemain > 0,
    bothDestroyed: atkRemain <= 0 && defRemain <= 0,
    bothSurvive: atkRemain > 0 && defRemain > 0,
    attackerSurvivorRaw, defenderSurvivorRaw,
    lossAttacker: Math.max(0, attackerRawPower - attackerSurvivorRaw),
    lossDefender: Math.max(0, defenderRawPower - defenderSurvivorRaw),
  };
}

function updateDumpDomination(state) {
  const owners = DUMP_NODE_IDS.map((id) => state.nodes[id].owner);
  const allSame = owners.every((o) => o !== null && o === owners[0]);
  if (allSame) {
    if (state.dumpDomination.owner === owners[0]) state.dumpDomination.consecutiveRounds += 1;
    else state.dumpDomination = { owner: owners[0], consecutiveRounds: 1 };
    if (state.dumpDomination.consecutiveRounds >= DOMINATION_ROUNDS_NEEDED) {
      state.phase = 'ended'; state.winner = owners[0]; state.winReason = 'dump-domination';
      pushLog(state, `${owners[0]}가 매립지 ${DUMP_NODE_IDS.length}개를 ${DOMINATION_ROUNDS_NEEDED}라운드 연속 지배했다. 지배 승리!`);
    }
  } else {
    state.dumpDomination = { owner: null, consecutiveRounds: 0 };
  }
}

// 감염체 §6.4: 감염 진행 노드는 라운드가 끝날 때마다 카운트다운된다.
// M3: 방어군이 주둔해 있으면 진행이 "정지"된다(리셋은 아님).
// M3 수정: "탈취"는 중립(무소유) 노드에만 적용된다. 이미 다른 플레이어가 소유한 노드(수도
// 포함)를 감염시키면 완료 시 소유권은 그대로 두고 디버프(생산/방어 약화)를 건다 — 감염이
// 곧 즉시 정복으로 이어지는 것을 막고, 방어자에게는 "탈환하면 막을 수 있다"는 대응 수단을 준다.
function tickInfestation(state) {
  for (const [id, node] of Object.entries(state.nodes)) {
    if (!node.infested) continue;
    const defenderPresent = node.army && node.army.owner !== node.infested.owner && node.army.power > 0;
    if (defenderPresent) {
      pushLog(state, `${id}: 방어군 주둔으로 감염 진행 정지`);
      continue;
    }
    node.infested.roundsLeft -= 1;
    if (node.infested.roundsLeft <= 0) {
      const owner = node.infested.owner;
      const wasEnemyOwned = node.infested.debuffTarget;
      node.infested = null;
      if (wasEnemyOwned) {
        node.debuff = { owner, roundsLeft: DEBUFF_DURATION };
        pushLog(state, `${id} 노드에 ${owner}의 감염이 완료되어 디버프가 걸렸다 (소유권 유지, 생산 -${Math.round((1 - DEBUFF_INCOME_MULT) * 100)}% / 방어 -${Math.round((1 - DEBUFF_DEFENSE_MULT) * 100)}%, ${DEBUFF_DURATION}라운드)`);
      } else {
        const wasCapital = node.type === 'capital';
        node.owner = owner;
        pushLog(state, `${id} 노드가 감염 완료되어 ${owner} 소유가 되었다${wasCapital ? ' — 수도 함락!' : ''}`);
        maybeAutoSpread(state, owner, id);
      }
    }
  }
  for (const node of Object.values(state.nodes)) {
    if (!node.debuff) continue;
    node.debuff.roundsLeft -= 1;
    if (node.debuff.roundsLeft <= 0) node.debuff = null;
  }
  if (state.phase !== 'ended') checkConquest(state);
}

// 감염체 종족 특수 능력 — 자가 증식: 감염 완료 지점에서 40% 확률로 인접 노드에 무료로 감염이 새로 시작된다.
// (저그 크립처럼, 포자 지대가 스스로 번져나가는 느낌을 준다)
function maybeAutoSpread(state, player, fromId) {
  const pl = state.players[player];
  if (pl.race !== 'infested') return;
  const roll = seededRandom(state.seed, state.rngCounter++);
  if (roll > AUTO_SPREAD_CHANCE) return;
  const candidates = (state.adjacency[fromId] || []).filter((nb) => {
    const n = state.nodes[nb];
    if (n.type === 'capital') return false;
    if (n.owner === player) return false;
    if (n.infested) return false;
    return true;
  });
  if (!candidates.length) return;
  const idx = Math.floor(seededRandom(state.seed, state.rngCounter++) * candidates.length);
  const pick = candidates[idx];
  const rounds = Math.max(1, 2 - Math.floor(((pl.virulence || 1) - 1) / 2));
  const wasEnemyOwned = state.nodes[pick].owner !== null; // 자연 확산도 적 소유 노드면 탈취 대신 디버프로 완료된다
  state.nodes[pick].infested = { owner: player, roundsLeft: rounds, debuffTarget: wasEnemyOwned };
  state.nodes[pick].sporeZone = true;
  pushLog(state, `${player}: 포자 지대의 여파로 ${pick}에 자연 감염 발생 (감염력 특성)`);
}

function applyInfestedResidual(state, infestedPlayer, nodeId) {
  const node = state.nodes[nodeId];
  if (!node) return;
  if (node.owner === infestedPlayer && !node.infested) return;
  const virulence = state.players[infestedPlayer].virulence || 1;
  const wasEnemyOwned = node.owner !== null; // 중립이 아니면(=다른 플레이어 소유) 완료 시 탈취 대신 디버프
  const base = node.type === 'capital' ? 4 : 2;
  const rounds = Math.max(1, base - Math.floor((virulence - 1) / 2));
  node.infested = { owner: infestedPlayer, roundsLeft: rounds, debuffTarget: wasEnemyOwned };
  node.sporeZone = true;
  state.players[infestedPlayer].spore += 2;
  pushLog(state, `${infestedPlayer}: 전투의 여파로 ${nodeId}에 포자가 남았다 (감염 시작, 포자 지대화)`);
}

function computeScore(state, player) {
  let nodesOwned = 0, dumps = 0;
  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.owner === player) { nodesOwned++; if (DUMP_NODE_IDS.includes(id)) dumps++; }
  }
  const pl = state.players[player];
  const uniqueTotal = (pl.research || 0) + (pl.zeal || 0) + (pl.rift || 0) + (pl.spore || 0) + (pl.authority || 0) + (pl.corruption || 0);
  return nodesOwned * 10 + dumps * 15 + uniqueTotal * 1 + pl.supply * 1 + ((pl.capitalTier || 1) - 1) * 20;
}

function finalizeScoreVictory(state) {
  const s1 = computeScore(state, 'P1');
  const s2 = computeScore(state, 'P2');
  state.phase = 'ended'; state.winReason = 'score';
  if (s1 === s2) { state.winner = 'draw'; pushLog(state, `${ROUND_CAP}라운드 종료. 점수 동률(${s1} : ${s2}) — 무승부`); }
  else { state.winner = s1 > s2 ? 'P1' : 'P2'; pushLog(state, `${ROUND_CAP}라운드 종료. 점수 P1 ${s1} : P2 ${s2} — ${state.winner} 승리`); }
}

// 수도 티어가 오르면 잠겨 있던 상위 카드를 덱 안 무작위 위치에 끼워 넣는다 (즉시 재드로우 대상이 됨).
function unlockCardsForTier(state, player, tier) {
  const pl = state.players[player];
  const stay = [];
  const unlocked = [];
  for (const card of pl.locked) {
    const def = CARD_DEFS[card.kind];
    if (!def || !def.minCapitalTier || def.minCapitalTier <= tier) unlocked.push(card);
    else stay.push(card);
  }
  pl.locked = stay;
  for (const card of unlocked) {
    const idx = Math.floor(seededRandom(state.seed, state.rngCounter++) * (pl.deck.length + 1));
    pl.deck.splice(idx, 0, card);
  }
  if (unlocked.length) pushLog(state, `${player}: 수도 티어 ${tier} 달성 — 카드 ${unlocked.length}장 해금`);
}

function targetValid(state, player, nodeId, filter) {
  const node = state.nodes[nodeId];
  if (!node) return false;
  if (filter === 'owned') return node.owner === player;
  if (filter === 'ownedNoBuilding') return node.owner === player && !node.building;
  if (filter === 'ownedWithArmy') return node.owner === player && node.army && node.army.owner === player;
  if (filter === 'enemyArmyAdjacent') {
    if (!node.army || node.army.owner === player) return false;
    return (state.adjacency[nodeId] || []).some((nb) => state.nodes[nb].owner === player);
  }
  if (filter === 'infectable') {
    if (node.owner === player) return false;
    if (node.infested && node.infested.owner === player) return false;
    return (state.adjacency[nodeId] || []).some((nb) => state.nodes[nb].owner === player);
  }
  return true;
}

export function reduce(state, action) {
  state = clone(state);
  if (state.phase === 'ended') return state;

  switch (action.type) {
    case 'PLAY_CARD': {
      const { player, cardUid, targetNodeId } = action;
      if (state.activePlayer !== player) return state;
      const pl = state.players[player];
      const idx = pl.hand.findIndex((c) => c.uid === cardUid);
      if (idx === -1) return state;
      const card = pl.hand[idx];
      const def = CARD_DEFS[card.kind];
      if (!def) return state;
      const cost = resolveCost(def, pl);
      if (pl.ap < def.apCost) { pushLog(state, `AP 부족으로 ${def.name} 사용 실패`); return state; }
      if (!canAfford(pl, cost)) { pushLog(state, `자원 부족으로 ${def.name} 사용 실패`); return state; }
      if (def.once && pl.specialization) { pushLog(state, `이미 연구를 특화하여 ${def.name} 사용 불가`); return state; }
      if (def.minGateLevel && (pl.gateLevel || 1) < def.minGateLevel) { pushLog(state, `차원문 레벨 부족으로 ${def.name} 사용 실패`); return state; }
      if (def.minCapitalTier && (pl.capitalTier || 1) < def.minCapitalTier) { pushLog(state, `수도 티어 부족으로 ${def.name} 사용 실패`); return state; }
      if (def.effect === 'capitalTierUp' && (pl.capitalTier || 1) >= CAPITAL_TIER_MAX) { pushLog(state, `수도 티어가 이미 최대치(${CAPITAL_TIER_MAX})`); return state; }
      const targetNode = targetNodeId ? state.nodes[targetNodeId] : null;
      if (def.needsTarget && !targetValid(state, player, targetNodeId, def.targetFilter)) {
        pushLog(state, `${def.name}의 대상이 유효하지 않음`); return state;
      }

      pl.ap -= def.apCost;
      payCost(pl, cost);
      pl.hand.splice(idx, 1);
      pl.discard.push(card);

      if (def.type === 'building') {
        targetNode.building = card.kind;
        pushLog(state, `${player}: ${def.name} 사용 (대상 ${targetNodeId})`);
      } else if (def.effect === 'sacrifice') {
        if (!targetNode.army) { pushLog(state, `${player}: 제물로 바칠 부대가 없다`); return state; }
        const consumed = Math.min(def.sacrificeAmount, targetNode.army.power);
        targetNode.army.power -= consumed;
        let zealGain = consumed;
        if (targetNode.building === 'cult_grandAltar') zealGain = Math.round(zealGain * 1.5);
        pl.zeal += zealGain;
        if (targetNode.army.power <= 0) targetNode.army = null;
        pushLog(state, `${player}: ${def.name} — ${targetNodeId}에서 전력 ${consumed} 제물, 광신 +${zealGain}`);
      } else if (def.effect === 'gateExpand') {
        pl.gateLevel = Math.min(5, (pl.gateLevel || 1) + 1);
        pushLog(state, `${player}: ${def.name} — 차원문 레벨 ${pl.gateLevel}`);
      } else if (def.effect === 'virulenceUp') {
        pl.virulence = Math.min(5, (pl.virulence || 1) + 1);
        pushLog(state, `${player}: ${def.name} — 감염력 ${pl.virulence}`);
      } else if (def.effect === 'capitalTierUp') {
        pl.capitalTier = Math.min(CAPITAL_TIER_MAX, (pl.capitalTier || 1) + 1);
        unlockCardsForTier(state, player, pl.capitalTier);
        pushLog(state, `${player}: ${def.name} — 수도 티어 ${pl.capitalTier}`);
      } else if (def.effect === 'weaken') {
        if (!targetNode.army) { pushLog(state, `${player}: ${def.name} — 대상 부대가 없다`); return state; }
        targetNode.army.power = Math.max(0, targetNode.army.power - def.weakenAmount);
        pushLog(state, `${player}: ${def.name} — ${targetNodeId} 부대 전력 -${def.weakenAmount}`);
        if (targetNode.army.power <= 0) { targetNode.army = null; pushLog(state, `${targetNodeId} 부대가 소멸했다`); }
      } else if (def.effect === 'infect') {
        const isCapital = targetNode.type === 'capital';
        const wasEnemyOwned = targetNode.owner !== null; // 중립 노드만 완료 시 탈취, 적 소유 노드(수도 포함)는 디버프
        let rounds = isCapital ? (def.infectRoundsCapital || 4) : (def.infectRounds || 2);
        rounds = Math.max(1, rounds - Math.floor(((pl.virulence || 1) - 1) / 2));
        if (!isCapital) {
          const nearSpore = (state.adjacency[targetNodeId] || []).some((nb) => state.nodes[nb].sporeZone && state.nodes[nb].owner === player);
          if (nearSpore) rounds = Math.max(1, rounds - 1);
        }
        targetNode.infested = { owner: player, roundsLeft: rounds, debuffTarget: wasEnemyOwned };
        targetNode.sporeZone = true;
        const outcomeNote = wasEnemyOwned ? '완료 시 소유권은 유지되고 디버프가 걸림' : '완료 시 무소유지가 되어 있으므로 탈취됨';
        pushLog(state, `${player}: ${def.name} — ${targetNodeId} 감염 시작 (${rounds}라운드 후 완료, ${outcomeNote})`);
      } else if (def.effect === 'plagueAccelerate') {
        let count = 0;
        for (const node of Object.values(state.nodes)) {
          if (node.infested && node.infested.owner === player) { node.infested.roundsLeft = Math.max(0, node.infested.roundsLeft - 1); count++; }
        }
        pushLog(state, `${player}: ${def.name} — 진행 중인 감염 ${count}건 가속`);
      } else if (def.effect === 'drawCard') {
        state = drawCards(state, player, def.drawAmount || 1);
        pushLog(state, `${player}: ${def.name} — 카드 ${def.drawAmount || 1}장 드로우`);
      } else if (def.spawnPower) {
        if (!targetNode.army) targetNode.army = { owner: player, power: 0, stance: 'defend', hero: false, moveRange: 1, movePoints: 1 };
        let power = def.spawnPower;
        if (def.scalesWithGate) power += (pl.gateLevel || 1) * (def.gatePowerMult || 0);
        targetNode.army.power += power;
        if (def.hero) targetNode.army.hero = true;
        const range = def.moveRange || 1;
        targetNode.army.moveRange = Math.max(targetNode.army.moveRange || 1, range);
        targetNode.army.movePoints = Math.max(targetNode.army.movePoints || 0, range);
        if (def.grantsSporeIncome) {
          targetNode.bonusIncome = { ...(targetNode.bonusIncome || {}), spore: (targetNode.bonusIncome?.spore || 0) + def.grantsSporeIncome };
        }
        pushLog(state, `${player}: ${def.name} 사용 (대상 ${targetNodeId}, 전력 +${power}, 이동력 ${range})`);
      } else if (card.kind === 'resupply') {
        pl.supply += 2; pushLog(state, `${player}: ${def.name} 사용`);
      } else if (card.kind === 'forcedMarch') {
        targetNode.army.forcedMarchBonus = true; pushLog(state, `${player}: ${def.name} 사용 (대상 ${targetNodeId})`);
      } else if (card.kind === 'pathFaith') {
        pl.specialization = 'faith'; pushLog(state, `${player}: 연구 특화 — 신앙`);
      } else if (card.kind === 'pathMilitary') {
        pl.specialization = 'military'; pushLog(state, `${player}: 연구 특화 — 군부`);
      } else if (card.kind === 'pathHero') {
        pl.specialization = 'hero';
        const cap = state.nodes[player === 'P1' ? 'C1' : 'C2'];
        if (!cap.army) cap.army = { owner: player, power: 0, stance: 'defend', hero: false, moveRange: 1, movePoints: 1 };
        cap.army.power += def.grantHeroAtCapital || 6; cap.army.hero = true;
        pushLog(state, `${player}: 연구 특화 — 용사`);
      }
      return state;
    }

    case 'SET_STANCE': {
      const { player, nodeId, stance } = action;
      if (state.activePlayer !== player) return state;
      const node = state.nodes[nodeId];
      if (!node.army || node.army.owner !== player) return state;
      node.army.stance = stance;
      pushLog(state, `${player}: ${nodeId} 부대 태세를 ${stance === 'defend' ? '방어' : '후퇴'}로 설정`);
      return state;
    }

    case 'ISSUE_MARCH': {
      const { player, fromNodeId, toNodeId } = action;
      if (state.activePlayer !== player) return state;
      if (!state.adjacency[fromNodeId] || !state.adjacency[fromNodeId].includes(toNodeId)) return state;
      const fromNode = state.nodes[fromNodeId];
      const toNode = state.nodes[toNodeId];
      if (!fromNode.army || fromNode.army.owner !== player) return state;
      if ((fromNode.army.movePoints || 0) <= 0) {
        pushLog(state, `${player}: ${fromNodeId} 부대는 이번 턴 이동력을 모두 사용했다`);
        return state;
      }

      const movingArmy = fromNode.army;
      const remainingMP = movingArmy.movePoints - 1;
      const forcedMarch = !!movingArmy.forcedMarchBonus;
      const attackerRace = state.players[player].race;
      const attackerSporeZone = attackerRace === 'infested' && !!fromNode.sporeZone;

      const isEnemyArmy = toNode.army && toNode.army.owner !== player;
      const isGarrisonedCamp = toNode.type === 'neutralCamp' && toNode.owner === null && toNode.garrison > 0;

      if (!isEnemyArmy && !isGarrisonedCamp) {
        if (toNode.owner === player && toNode.army) {
          toNode.army.power += movingArmy.power;
          toNode.army.hero = toNode.army.hero || movingArmy.hero;
          toNode.army.moveRange = Math.max(toNode.army.moveRange || 1, movingArmy.moveRange || 1);
          toNode.army.movePoints = Math.max(toNode.army.movePoints || 0, remainingMP);
        } else {
          toNode.owner = player;
          toNode.army = { owner: player, power: movingArmy.power, stance: 'defend', hero: movingArmy.hero, moveRange: movingArmy.moveRange || 1, movePoints: remainingMP };
          if (toNode.infested && toNode.infested.owner === player) toNode.infested = null;
        }
        fromNode.army = null;
        pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 진군 (무혈 점령/합류, 남은 이동력 ${remainingMP})`);
      } else {
        const defenderPlayer = toNode.army ? toNode.army.owner : null;
        const defenderRace = defenderPlayer ? state.players[defenderPlayer].race : null;
        const defenderRawPower = toNode.army ? toNode.army.power : toNode.garrison;
        const terrainMult = (toNode.type === 'capital' ? 1.5 : toNode.building === 'fortress' ? 1.25 : 1.0) * (toNode.debuff ? DEBUFF_DEFENSE_MULT : 1.0);
        const heroVsCamp = movingArmy.hero && isGarrisonedCamp;
        const defenderSporeZone = defenderRace === 'infested' && !!toNode.sporeZone;
        const result = resolveCombat(state, player, movingArmy.power, defenderPlayer, defenderRawPower, {
          defenderStance: toNode.army ? toNode.army.stance : 'defend',
          terrainMult, heroVsCamp, forcedMarch, attackerSporeZone, defenderSporeZone,
        });

        // 광신도 종족 특수 능력 — 출혈의 계약: 전투가 벌어지면(승패 무관) 양측이 잃은 전력에 비례해 광신을 자동 획득한다.
        if (attackerRace === 'cultists') {
          const gain = Math.floor((result.lossAttacker + result.lossDefender) * 0.15);
          if (gain > 0) { state.players[player].zeal += gain; pushLog(state, `${player}: 출혈 경제 — 광신 +${gain}`); }
        }
        if (defenderRace === 'cultists' && defenderPlayer) {
          const gain = Math.floor((result.lossAttacker + result.lossDefender) * 0.15);
          if (gain > 0) { state.players[defenderPlayer].zeal += gain; pushLog(state, `${defenderPlayer}: 출혈 경제 — 광신 +${gain}`); }
        }

        if (result.bothDestroyed) {
          fromNode.army = null;
          toNode.army = null;
          if (isGarrisonedCamp) toNode.garrison = 0;
          pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 전투 — 양측 전멸`);
          if (attackerRace === 'infested') applyInfestedResidual(state, player, toNodeId);
          if (defenderRace === 'infested') applyInfestedResidual(state, defenderPlayer, toNodeId);
        } else if (result.attackerWins) {
          fromNode.army = null;
          const wasCamp = isGarrisonedCamp;
          toNode.owner = player;
          toNode.army = { owner: player, power: result.attackerSurvivorRaw, stance: 'defend', hero: movingArmy.hero, moveRange: movingArmy.moveRange || 1, movePoints: 0 };
          if (wasCamp) {
            toNode.garrison = 0;
            const rewardPl = state.players[player];
            rewardPl.supply += NEUTRAL_CAMP_REWARD.supply;
            state = drawCards(state, player, NEUTRAL_CAMP_REWARD.drawCards);
            pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 캠프 격파! 보상 획득 (물자+${NEUTRAL_CAMP_REWARD.supply} 카드+${NEUTRAL_CAMP_REWARD.drawCards})`);
          } else {
            pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 전투 승리, 노드 점령`);
          }
          if (defenderRace === 'infested') applyInfestedResidual(state, defenderPlayer, toNodeId);
        } else if (result.defenderWins) {
          fromNode.army = null;
          if (toNode.army) toNode.army.power = result.defenderSurvivorRaw;
          else toNode.garrison = result.defenderSurvivorRaw;
          pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 전투 패배, 부대 전멸`);
          if (attackerRace === 'infested') applyInfestedResidual(state, player, toNodeId);
        } else {
          if (toNode.army) toNode.army.power = result.defenderSurvivorRaw;
          else toNode.garrison = result.defenderSurvivorRaw;
          fromNode.army = { owner: player, power: result.attackerSurvivorRaw, stance: 'defend', hero: movingArmy.hero, moveRange: movingArmy.moveRange || 1, movePoints: 0 };
          pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 전투, 양측 생존 — 방어측 유지`);
        }
      }
      checkConquest(state);
      return state;
    }

    case 'END_TURN': {
      const { player } = action;
      if (state.activePlayer !== player) return state;
      const idx = PLAYER_ORDER.indexOf(player);
      const isLast = idx === PLAYER_ORDER.length - 1;
      if (isLast) {
        tickInfestation(state);
        if (state.phase === 'ended') return state;
        updateDumpDomination(state);
        if (state.phase === 'ended') return state;
        if (state.round >= ROUND_CAP) { finalizeScoreVictory(state); return state; }
        state.round += 1;
        state = startTurn(state, PLAYER_ORDER[0]);
      } else {
        state = startTurn(state, PLAYER_ORDER[idx + 1]);
      }
      return state;
    }

    default:
      return state;
  }
}

export { DUMP_NODE_IDS, targetValid };

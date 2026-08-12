// 더미 AI (M1/M2: "핫섯 + 더미 AI" — 최소 휴리스틱, 종족 불문 동작).
// 상태를 직접 바꾸지 않고 이번 턴에 실행할 액션 목록만 생성한다.
// 카드 kind 문자열을 하드코딩하지 않고 CARD_DEFS의 메타데이터(type/effect/spawnPower 등)로
// 판단하므로 4종족 어느 덱이 와도 동일한 로직으로 동작한다.
//
// M3: 이동력(moveRange) 도입으로 "한 부대 = 한 턴에 한 번 행동"이 아니게 됐다.
// 빠른 유닛(이동력 2~3)은 얕은 로컬 시뮬레이션으로 여러 칸을 미리 계획해 체인 이동시킨다.
// 전투가 끼는 순간부터는 결과가 불확실하므로 그 즉시 체인을 멈춘다.

import { CARD_DEFS, resolveCost } from './cards.js';
import { DUMP_NODE_IDS } from './mapData.js';

function affordable(sim, def) {
  if (sim.ap < def.apCost) return false;
  const cost = resolveCost(def, sim);
  return Object.entries(cost).every(([k, v]) => (sim[k] || 0) >= v);
}
function pay(sim, def) {
  const cost = resolveCost(def, sim);
  sim.ap -= def.apCost;
  for (const [k, v] of Object.entries(cost)) sim[k] -= v;
  if (def.effect === 'capitalTierUp') sim.capitalTier = Math.min(4, (sim.capitalTier || 1) + 1);
}

export function getAiActions(state, aiPlayer) {
  const actions = [];
  const pl = state.players[aiPlayer];
  const enemy = aiPlayer === 'P1' ? 'P2' : 'P1';
  const sim = {
    ap: pl.ap, supply: pl.supply, research: pl.research, zeal: pl.zeal, rift: pl.rift, spore: pl.spore,
    authority: pl.authority, corruption: pl.corruption, capitalTier: pl.capitalTier,
  };
  const hand = [...pl.hand];

  const myNodeIds = () => Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  const take = (card) => hand.splice(hand.indexOf(card), 1);

  // 1) 1회성 연구 특화 카드 (왕국 전용이지만 kind-agnostic하게 def.once로 판단)
  if (!pl.specialization) {
    const pathCard = hand.find((c) => CARD_DEFS[c.kind].once);
    if (pathCard) {
      const def = CARD_DEFS[pathCard.kind];
      if (affordable(sim, def)) {
        actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: pathCard.uid });
        pay(sim, def); take(pathCard);
      }
    }
  }

  // 2) 종족 고유 자원 액션 (희생/차원문 확장/감염/역병 가속/티어업 등) — 여유 자원이 있을 때 우선 시도
  for (const card of [...hand]) {
    const def = CARD_DEFS[card.kind];
    if (!def.effect) continue;
    if (!affordable(sim, def)) continue;

    if (def.effect === 'sacrifice') {
      const targetId = myNodeIds().find((id) => state.nodes[id].army && state.nodes[id].army.owner === aiPlayer && state.nodes[id].army.power > def.sacrificeAmount + 2);
      if (!targetId) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: targetId });
      pay(sim, def); take(card);
    } else if (def.effect === 'gateExpand') {
      if ((pl.gateLevel || 1) >= 5) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
      pay(sim, def); take(card);
    } else if (def.effect === 'virulenceUp') {
      if ((pl.virulence || 1) >= 5) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
      pay(sim, def); take(card);
    } else if (def.effect === 'capitalTierUp') {
      if ((pl.capitalTier || 1) >= 4) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
      pay(sim, def); take(card);
    } else if (def.effect === 'drawCard') {
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
      pay(sim, def); take(card);
    } else if (def.effect === 'weaken') {
      const targetId = findWeakenTarget(state, aiPlayer);
      if (!targetId) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: targetId });
      pay(sim, def); take(card);
    } else if (def.effect === 'infect') {
      const targetId = findInfectableNode(state, aiPlayer);
      if (!targetId) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: targetId });
      pay(sim, def); take(card);
    } else if (def.effect === 'plagueAccelerate') {
      const hasActive = Object.values(state.nodes).some((n) => n.infested && n.infested.owner === aiPlayer);
      if (!hasActive) continue;
      actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
      pay(sim, def); take(card);
    }
  }

  // 3) 건물 카드: 건물 없는 내 노드에 부착
  for (const card of hand.filter((c) => CARD_DEFS[c.kind].type === 'building')) {
    const def = CARD_DEFS[card.kind];
    if (!affordable(sim, def)) continue;
    const targetId = myNodeIds().find((id) => !state.nodes[id].building);
    if (!targetId) continue;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: targetId });
    pay(sim, def); take(card);
    state = { ...state, nodes: { ...state.nodes, [targetId]: { ...state.nodes[targetId], building: card.kind } } };
  }

  // 4) 군사 카드(전력 소환): 최전방 노드에 배치
  const frontierNodeId = findFrontierNode(state, aiPlayer);
  for (const card of hand.filter((c) => CARD_DEFS[c.kind].spawnPower)) {
    const def = CARD_DEFS[card.kind];
    if (!affordable(sim, def)) continue;
    if (!frontierNodeId) break;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: frontierNodeId });
    pay(sim, def); take(card);
    if (sim.ap <= 0) break;
  }

  // 5) 자투리 AP로 유틸 카드
  for (const kind of ['resupply', 'scouting']) {
    const card = hand.find((c) => c.kind === kind);
    if (!card) continue;
    const def = CARD_DEFS[kind];
    if (!affordable(sim, def)) continue;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
    pay(sim, def);
    if (sim.ap <= 0) break;
  }

  // 6) 병력 명령: 이동력만큼 여러 칸을 체인으로 계획한다 (전투가 끼면 그 즉시 멈춘다).
  for (const nodeId of myNodeIds()) {
    const node = state.nodes[nodeId];
    if (!node.army || node.army.owner !== aiPlayer) continue;
    if (node.type === 'capital') {
      actions.push({ type: 'SET_STANCE', player: aiPlayer, nodeId, stance: 'defend' });
      continue;
    }
    const chain = planArmyChain(state, aiPlayer, enemy, nodeId, node.army.moveRange || 1);
    actions.push(...chain);
  }

  actions.push({ type: 'END_TURN', player: aiPlayer });
  return actions;
}

function planArmyChain(state, aiPlayer, enemy, startId, moveRange) {
  const actions = [];
  const local = {};
  const touch = (id) => {
    if (!local[id]) {
      const n = state.nodes[id];
      local[id] = { owner: n.owner, armyOwner: n.army ? n.army.owner : null, armyPower: n.army ? n.army.power : 0, garrison: n.garrison || 0, type: n.type };
    }
    return local[id];
  };
  let currentId = startId;
  touch(currentId);

  for (let hop = 0; hop < moveRange; hop++) {
    const power = local[currentId].armyPower;
    const neighbors = state.adjacency[currentId] || [];
    let bestTarget = null, bestScore = -Infinity, bestIsCombat = false;
    for (const nb of neighbors) {
      touch(nb);
      const nbState = local[nb];
      let score = -1, isCombat = false;
      if (nbState.armyOwner && nbState.armyOwner !== aiPlayer) { score = power - nbState.armyPower * 1.3 + 5; isCombat = true; }
      else if (nbState.type === 'neutralCamp' && nbState.owner === null && nbState.garrison > 0) { score = power - nbState.garrison + 3; isCombat = true; }
      else if (nbState.owner === null) { score = 4; }
      else if (nbState.owner === aiPlayer) { score = -10; }
      if (score > bestScore) { bestScore = score; bestTarget = nb; bestIsCombat = isCombat; }
    }
    if (!bestTarget || bestScore < -2) break;
    actions.push({ type: 'ISSUE_MARCH', player: aiPlayer, fromNodeId: currentId, toNodeId: bestTarget });
    if (bestIsCombat) break; // 전투 결과는 불확실하니 이후 체인은 계획하지 않는다 (실제로도 이동력이 전부 소모됨)

    const dest = local[bestTarget];
    const mergedPower = dest.owner === aiPlayer && dest.armyOwner === aiPlayer ? dest.armyPower + power : power;
    local[bestTarget] = { ...dest, owner: aiPlayer, armyOwner: aiPlayer, armyPower: mergedPower };
    local[currentId] = { ...local[currentId], armyOwner: null, armyPower: 0 };
    currentId = bestTarget;
  }

  if (!actions.length) actions.push({ type: 'SET_STANCE', player: aiPlayer, nodeId: startId, stance: 'defend' });
  return actions;
}

function findFrontierNode(state, aiPlayer) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  for (const id of myNodes) {
    if ((state.adjacency[id] || []).some((nb) => DUMP_NODE_IDS.includes(nb))) return id;
  }
  return myNodes[0] || null;
}

function findInfectableNode(state, aiPlayer) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  for (const id of myNodes) {
    for (const nb of state.adjacency[id] || []) {
      const n = state.nodes[nb];
      if (n.type === 'capital') continue;
      if (n.owner === aiPlayer) continue;
      if (n.infested && n.infested.owner === aiPlayer) continue;
      return nb;
    }
  }
  return null;
}

function findWeakenTarget(state, aiPlayer) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  for (const id of myNodes) {
    for (const nb of state.adjacency[id] || []) {
      const n = state.nodes[nb];
      if (n.army && n.army.owner !== aiPlayer) return nb;
    }
  }
  return null;
}

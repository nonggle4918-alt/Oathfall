// 더미 AI (M1/M2: "핫싯 + 더미 AI" — 최소 휴리스틱, 종족 불문 동작).
// 상태를 직접 바꾸지 않고 이번 턴에 실행할 액션 목록만 생성한다.
// 카드 kind 문자열을 하드코딩하지 않고 CARD_DEFS의 메타데이터(type/effect/spawnPower 등)로
// 판단하므로 4종족 어느 덱이 와도 동일한 로직으로 동작한다.

import { CARD_DEFS } from './cards.js';
import { ADJACENCY, DUMP_NODE_IDS } from './mapData.js';

function affordable(sim, def) {
  if (sim.ap < def.apCost) return false;
  return Object.entries(def.cost).every(([k, v]) => (sim[k] || 0) >= v);
}
function pay(sim, def) {
  sim.ap -= def.apCost;
  for (const [k, v] of Object.entries(def.cost)) sim[k] -= v;
}

export function getAiActions(state, aiPlayer) {
  const actions = [];
  const pl = state.players[aiPlayer];
  const enemy = aiPlayer === 'P1' ? 'P2' : 'P1';
  const sim = { ap: pl.ap, supply: pl.supply, influence: pl.influence, research: pl.research, zeal: pl.zeal, rift: pl.rift, spore: pl.spore };
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

  // 2) 종족 고유 자원 액션 (희생/차원문 확장/감염/역병 가속) — 여유 자원이 있을 때 우선 시도
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
  for (const kind of ['resupply', 'intel']) {
    const card = hand.find((c) => c.kind === kind);
    if (!card) continue;
    const def = CARD_DEFS[kind];
    if (!affordable(sim, def)) continue;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
    pay(sim, def);
    if (sim.ap <= 0) break;
  }

  // 6) 병력 명령: 내가 가진 모든 부대에 대해 진군/방어 판단
  for (const nodeId of myNodeIds()) {
    const node = state.nodes[nodeId];
    if (!node.army || node.army.owner !== aiPlayer) continue;
    const neighbors = ADJACENCY[nodeId] || [];
    let bestTarget = null, bestScore = -Infinity;
    for (const nb of neighbors) {
      const nbNode = state.nodes[nb];
      let score = -1;
      if (nbNode.owner === enemy && nbNode.army) {
        score = node.army.power - nbNode.army.power * 1.3 + 5;
      } else if (nbNode.type === 'neutralCamp' && nbNode.garrison > 0) {
        score = node.army.power - nbNode.garrison + 3;
      } else if (nbNode.owner === null) {
        score = 4;
      } else if (nbNode.owner === aiPlayer) {
        score = -10;
      }
      if (score > bestScore) { bestScore = score; bestTarget = nb; }
    }
    const isCapital = node.type === 'capital';
    if (!isCapital && bestTarget && bestScore >= -2) {
      actions.push({ type: 'ISSUE_MARCH', player: aiPlayer, fromNodeId: nodeId, toNodeId: bestTarget });
    } else {
      actions.push({ type: 'SET_STANCE', player: aiPlayer, nodeId, stance: 'defend' });
    }
  }

  actions.push({ type: 'END_TURN', player: aiPlayer });
  return actions;
}

function findFrontierNode(state, aiPlayer) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  for (const id of myNodes) {
    if ((ADJACENCY[id] || []).some((nb) => DUMP_NODE_IDS.includes(nb))) return id;
  }
  return myNodes[0] || null;
}

function findInfectableNode(state, aiPlayer) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  for (const id of myNodes) {
    for (const nb of ADJACENCY[id] || []) {
      const n = state.nodes[nb];
      if (n.type === 'capital') continue;
      if (n.owner === aiPlayer) continue;
      if (n.infested && n.infested.owner === aiPlayer) continue;
      return nb;
    }
  }
  return null;
}

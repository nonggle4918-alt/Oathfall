// 더미 AI (M1: "핫싯 + 더미 AI" — 최소 휴리스틱). 상태를 직접 바꾸지 않고
// 이번 턴에 실행할 액션 목록만 생성한다. 실제 반영은 main.js가 reduce()로 처리한다.

import { CARD_DEFS } from './cards.js';
import { ADJACENCY, DUMP_NODE_IDS } from './mapData.js';

function affordable(sim, def) {
  return sim.ap >= def.apCost
    && sim.supply >= (def.cost.supply || 0)
    && sim.influence >= (def.cost.influence || 0)
    && sim.research >= (def.cost.research || 0);
}

export function getAiActions(state, aiPlayer) {
  const actions = [];
  const pl = state.players[aiPlayer];
  const enemy = aiPlayer === 'P1' ? 'P2' : 'P1';
  const sim = { ap: pl.ap, supply: pl.supply, influence: pl.influence, research: pl.research };
  const hand = [...pl.hand];

  const myNodeIds = () => Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);

  // 1) 연구 특화 (아직 안 했고 여유 있으면 최우선)
  if (!pl.specialization) {
    const pathCard = hand.find((c) => c.kind === 'pathMilitary') || hand.find((c) => c.kind === 'pathHero') || hand.find((c) => c.kind === 'pathFaith');
    if (pathCard) {
      const def = CARD_DEFS[pathCard.kind];
      if (affordable(sim, def)) {
        actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: pathCard.uid });
        sim.ap -= def.apCost; sim.research -= (def.cost.research || 0);
        hand.splice(hand.indexOf(pathCard), 1);
      }
    }
  }

  // 2) 건물 카드: 건물 없는 내 노드에 부착 (수도/영지 우선)
  const buildingKinds = ['granary', 'temple', 'library', 'fortress'];
  for (const kind of buildingKinds) {
    const card = hand.find((c) => c.kind === kind);
    if (!card) continue;
    const def = CARD_DEFS[kind];
    if (!affordable(sim, def)) continue;
    const targetId = myNodeIds().find((id) => !state.nodes[id].building);
    if (!targetId) continue;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: targetId });
    sim.ap -= def.apCost; sim.supply -= (def.cost.supply || 0);
    hand.splice(hand.indexOf(card), 1);
    state = { ...state, nodes: { ...state.nodes, [targetId]: { ...state.nodes[targetId], building: kind } } };
  }

  // 3) 군사 카드: 최전방(적/캠프에 가장 가까운 내 노드)에 병력 소환
  const frontierNodeId = findFrontierNode(state, aiPlayer, enemy);
  const militaryKinds = ['heroAwaken', 'regulars', 'militia'];
  for (const kind of militaryKinds) {
    const card = hand.find((c) => c.kind === kind);
    if (!card) continue;
    const def = CARD_DEFS[kind];
    if (!affordable(sim, def)) continue;
    if (!frontierNodeId) break;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid, targetNodeId: frontierNodeId });
    sim.ap -= def.apCost; sim.supply -= (def.cost.supply || 0); sim.research -= (def.cost.research || 0);
    hand.splice(hand.indexOf(card), 1);
    if (sim.ap <= 0) break;
  }

  // 4) 자투리 AP로 유틸 카드 (재보급/정보수집)
  for (const kind of ['resupply', 'intel']) {
    const card = hand.find((c) => c.kind === kind);
    if (!card) continue;
    const def = CARD_DEFS[kind];
    if (!affordable(sim, def)) continue;
    actions.push({ type: 'PLAY_CARD', player: aiPlayer, cardUid: card.uid });
    sim.ap -= def.apCost;
    if (sim.ap <= 0) break;
  }

  // 5) 병력 명령: 내가 가진 모든 부대에 대해 진군/방어 판단
  for (const nodeId of myNodeIds()) {
    const node = state.nodes[nodeId];
    if (!node.army || node.army.owner !== aiPlayer) continue;
    const neighbors = ADJACENCY[nodeId] || [];
    let bestTarget = null, bestScore = -Infinity;
    for (const nb of neighbors) {
      const nbNode = state.nodes[nb];
      let score = -1;
      if (nbNode.owner === enemy && nbNode.army) {
        score = node.army.power - nbNode.army.power * 1.3 + 5; // 이길 만하면 공격
      } else if (nbNode.type === 'neutralCamp' && nbNode.garrison > 0) {
        score = node.army.power - nbNode.garrison + 3;
      } else if (nbNode.owner === null) {
        score = 4; // 무주지 확장은 항상 남는 장사
      } else if (nbNode.owner === aiPlayer) {
        score = -10; // 이미 내 땅이면 굳이 안 감
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

function findFrontierNode(state, aiPlayer, enemy) {
  const myNodes = Object.keys(state.nodes).filter((id) => state.nodes[id].owner === aiPlayer);
  // 매립지 인접 내 노드를 우선, 없으면 아무 내 노드
  for (const id of myNodes) {
    if ((ADJACENCY[id] || []).some((nb) => DUMP_NODE_IDS.includes(nb))) return id;
  }
  return myNodes[0] || null;
}

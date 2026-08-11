import { initGame, reduce, targetValid } from './rules.js';
import { getAiActions } from './ai.js';
import { CARD_DEFS } from './cards.js';
import { renderMap, renderResourceBar, renderHand, renderLog, renderOrderPanel, renderVictory } from './render.js';
import { ADJACENCY } from './mapData.js';

const els = {
  map: document.getElementById('map'),
  resourceBar: document.getElementById('resource-bar'),
  hand: document.getElementById('hand'),
  log: document.getElementById('log'),
  orderPanel: document.getElementById('order-panel'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  victory: document.getElementById('victory-overlay'),
  roundInfo: document.getElementById('round-info'),
  newGameBtn: document.getElementById('new-game-btn'),
};

let state = initGame(makeSeed());
let ui = { selectedNodeId: null, selectedCardUid: null, targetableNodeIds: [] };
let aiTimer = null;

function makeSeed() {
  return Math.floor(Date.now() % 1000000);
}

function clearSelection() {
  ui = { selectedNodeId: null, selectedCardUid: null, targetableNodeIds: [] };
}

function dispatch(action) {
  state = reduce(state, action);
  render();
}

const handlers = {
  isSelectableNode(id) {
    const node = state.nodes[id];
    const active = state.players[state.activePlayer];
    return !active.isAI && node.army && node.army.owner === state.activePlayer && !state.ordersUsedThisTurn.includes(id);
  },
  onNodeClick(id) {
    const active = state.players[state.activePlayer];
    if (active.isAI || state.phase === 'ended') return;

    if (ui.selectedCardUid) {
      if (ui.targetableNodeIds.includes(id)) {
        const action = { type: 'PLAY_CARD', player: state.activePlayer, cardUid: ui.selectedCardUid, targetNodeId: id };
        clearSelection();
        dispatch(action);
      }
      return;
    }

    if (ui.selectedNodeId) {
      if (ui.selectedNodeId === id) { clearSelection(); render(); return; }
      const adjacent = (state.nodes[ui.selectedNodeId] && ruleAdjacent(ui.selectedNodeId, id));
      if (adjacent) {
        const action = { type: 'ISSUE_MARCH', player: state.activePlayer, fromNodeId: ui.selectedNodeId, toNodeId: id };
        clearSelection();
        dispatch(action);
        return;
      }
    }

    if (handlers.isSelectableNode(id)) {
      ui.selectedNodeId = id;
      ui.selectedCardUid = null;
      ui.targetableNodeIds = [];
      render();
    }
  },
  onCardClick(uid) {
    const active = state.players[state.activePlayer];
    if (active.isAI || state.phase === 'ended') return;
    const card = active.hand.find((c) => c.uid === uid);
    if (!card) return;
    const def = CARD_DEFS[card.kind];
    if (ui.selectedCardUid === uid) { clearSelection(); render(); return; }
    ui.selectedNodeId = null;
    if (def.needsTarget) {
      ui.selectedCardUid = uid;
      ui.targetableNodeIds = Object.keys(state.nodes).filter((id) => targetValid(state, state.activePlayer, state.nodes[id], def.targetFilter));
      render();
    } else {
      clearSelection();
      dispatch({ type: 'PLAY_CARD', player: state.activePlayer, cardUid: uid });
    }
  },
  onStance(nodeId, stance) {
    clearSelection();
    dispatch({ type: 'SET_STANCE', player: state.activePlayer, nodeId, stance });
  },
};

function ruleAdjacent(a, b) {
  return !!(ADJACENCY[a] && ADJACENCY[a].includes(b));
}

function render() {
  els.roundInfo.textContent = `라운드 ${state.round} / 12 — ${state.activePlayer} 턴`;
  renderMap(els.map, state, ui, handlers);
  renderResourceBar(els.resourceBar, state);
  renderHand(els.hand, state, ui, handlers);
  renderLog(els.log, state);
  renderOrderPanel(els.orderPanel, state, ui, handlers);
  renderVictory(els.victory, state);

  const active = state.players[state.activePlayer];
  els.endTurnBtn.disabled = active.isAI || state.phase === 'ended';
  els.endTurnBtn.textContent = active.isAI ? 'AI 턴 진행 중...' : '턴 종료';

  if (state.phase === 'playing' && active.isAI && !aiTimer) {
    aiTimer = setTimeout(() => {
      aiTimer = null;
      const actions = getAiActions(state, state.activePlayer);
      for (const action of actions) state = reduce(state, action);
      render();
    }, 700);
  }
}

els.endTurnBtn.addEventListener('click', () => {
  const active = state.players[state.activePlayer];
  if (active.isAI || state.phase === 'ended') return;
  clearSelection();
  dispatch({ type: 'END_TURN', player: state.activePlayer });
});

els.newGameBtn.addEventListener('click', restartGame);
els.victory.addEventListener('click', (e) => {
  if (e.target.id === 'restart-btn') restartGame();
});

function restartGame() {
  clearTimeout(aiTimer); aiTimer = null;
  state = initGame(makeSeed());
  clearSelection();
  render();
}

render();

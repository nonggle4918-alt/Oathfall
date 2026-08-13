import { initGame, reduce, targetValid, ROUND_CAP } from './rules.js';
import { getAiActions } from './ai.js';
import { CARD_DEFS } from './cards.js';
import {
  renderMap, renderResourceBar, renderHand, renderLog, renderOrderPanel, renderVictory,
  renderSetup, renderModeSelect, renderOnlineCreate, renderOnlineJoin, renderOnlineWaiting, renderErrorOverlay,
} from './render.js';
import * as netClient from './netClient.js';

const els = {
  map: document.getElementById('map'),
  resourceBar: document.getElementById('resource-bar'),
  hand: document.getElementById('hand'),
  log: document.getElementById('log'),
  orderPanel: document.getElementById('order-panel'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  victory: document.getElementById('victory-overlay'),
  setup: document.getElementById('setup-overlay'),
  roundInfo: document.getElementById('round-info'),
  newGameBtn: document.getElementById('new-game-btn'),
  gameLayout: document.getElementById('main-layout'),
  handTray: document.getElementById('hand-tray'),
};

let state = null;
let ui = { selectedNodeId: null, selectedCardUid: null, targetableNodeIds: [] };
let setup = { P1: 'kingdom', P2: 'kingdom' };
// 'modeSelect' | 'setup'(로컬 종족선택) | 'onlineCreate' | 'onlineJoin' | 'onlineWaiting' | 'onlineError' | 'playing'
let screen = 'modeSelect';
let aiTimer = null;

let mode = null; // 'local' | 'online'
let net = null; // { roomCode, mySeat } — 온라인일 때만
let onlineRace = 'kingdom';
let onlineJoinCode = '';
let onlineErrorMessage = '';
let pollTimer = null;
let pendingAction = false;

function makeSeed() {
  return Math.floor(Date.now() % 1000000);
}

function clearSelection() {
  ui = { selectedNodeId: null, selectedCardUid: null, targetableNodeIds: [] };
}

// 온라인 모드에서는 내가 고정된 시트, 로컬(핫싯)에서는 지금 턴인 사람이 곧 "보는 사람"이다.
function viewerSeat() {
  return mode === 'online' && net ? net.mySeat : state.activePlayer;
}

function canAct() {
  if (!state || state.phase === 'ended' || pendingAction) return false;
  if (mode === 'online') return !!net && state.activePlayer === net.mySeat;
  return !state.players[state.activePlayer].isAI;
}

function ruleAdjacent(a, b) {
  return !!(state.adjacency[a] && state.adjacency[a].includes(b));
}

function dispatch(action) {
  if (mode === 'online') { dispatchOnline(action); return; }
  state = reduce(state, action);
  render();
}

async function dispatchOnline(action) {
  if (pendingAction) return;
  pendingAction = true;
  render();
  try {
    const resp = await netClient.submitAction(action);
    state = resp.state;
  } catch (err) {
    if (err.status === 409 || err.status === 403) {
      // 턴이 이미 넘어갔거나 하는 등, 치명적이지 않은 불일치 — 서버 최신 상태로 다시 맞춘다.
      try {
        const fresh = await netClient.fetchState();
        if (fresh.state) state = fresh.state;
      } catch { /* 다음 폴링에서 다시 시도됨 */ }
    } else {
      pendingAction = false;
      goToOnlineError(`서버와 통신 중 문제가 발생했습니다: ${err.message || err.code || err}`);
      return;
    }
  }
  pendingAction = false;
  render();
}

const handlers = {
  isSelectableNode(id) {
    if (!canAct()) return false;
    const node = state.nodes[id];
    return node.army && node.army.owner === viewerSeat();
  },
  onNodeClick(id) {
    if (!canAct()) return;
    const seat = viewerSeat();

    if (ui.selectedCardUid) {
      if (ui.targetableNodeIds.includes(id)) {
        const action = { type: 'PLAY_CARD', player: seat, cardUid: ui.selectedCardUid, targetNodeId: id };
        clearSelection();
        dispatch(action);
      }
      return;
    }

    if (ui.selectedNodeId) {
      if (ui.selectedNodeId === id) { clearSelection(); render(); return; }
      const adjacent = (state.nodes[ui.selectedNodeId] && ruleAdjacent(ui.selectedNodeId, id));
      if (adjacent) {
        const action = { type: 'ISSUE_MARCH', player: seat, fromNodeId: ui.selectedNodeId, toNodeId: id };
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
    if (!canAct()) return;
    const seat = viewerSeat();
    const pl = state.players[seat];
    const card = pl.hand.find((c) => c.uid === uid);
    if (!card) return;
    const def = CARD_DEFS[card.kind];
    if (ui.selectedCardUid === uid) { clearSelection(); render(); return; }
    ui.selectedNodeId = null;
    if (def.needsTarget) {
      ui.selectedCardUid = uid;
      ui.targetableNodeIds = Object.keys(state.nodes).filter((id) => targetValid(state, seat, id, def.targetFilter));
      render();
    } else {
      clearSelection();
      dispatch({ type: 'PLAY_CARD', player: seat, cardUid: uid });
    }
  },
  onStance(nodeId, stance) {
    if (!canAct()) return;
    clearSelection();
    dispatch({ type: 'SET_STANCE', player: viewerSeat(), nodeId, stance });
  },
};

const setupHandlers = {
  onPickRace(side, race) {
    setup[side] = race;
    render();
  },
  onStartGame() {
    startLocalGame();
  },
};

const modeSelectHandlers = {
  onPickMode(pickedMode) {
    mode = pickedMode;
    screen = pickedMode === 'local' ? 'setup' : 'onlineCreate';
    render();
  },
};

const onlineCreateHandlers = {
  onPickRace(race) { onlineRace = race; render(); },
  onSwitchToJoin() { screen = 'onlineJoin'; render(); },
  onBack() { resetToModeSelect(); },
  async onCreateRoom() {
    try {
      const data = await netClient.createRoom(onlineRace);
      net = { roomCode: data.roomCode, mySeat: data.seat };
      screen = 'onlineWaiting';
      render();
      startPolling();
    } catch (err) {
      goToOnlineError(`방을 만들지 못했습니다: ${err.message || err.code || err}`);
    }
  },
};

const onlineJoinHandlers = {
  onPickRace(race) { onlineRace = race; render(); },
  onCodeChange(code) { onlineJoinCode = code; },
  onSwitchToCreate() { screen = 'onlineCreate'; render(); },
  onBack() { resetToModeSelect(); },
  async onJoinRoom(code) {
    try {
      const data = await netClient.joinRoom(code, onlineRace);
      net = { roomCode: data.roomCode, mySeat: data.seat };
      state = data.state;
      screen = 'playing';
      render();
      startPolling();
    } catch (err) {
      goToOnlineError(`방에 참가하지 못했습니다: ${err.message || err.code || err}`);
    }
  },
};

const onlineWaitingHandlers = {
  onCopyLink() {
    const link = netClient.shareLinkFor(net.roomCode);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).catch(() => {});
  },
  onBack() { resetToModeSelect(); },
};

const errorHandlers = {
  onBack() { resetToModeSelect(); },
};

function goToOnlineError(message) {
  stopPolling();
  onlineErrorMessage = message;
  screen = 'onlineError';
  render();
}

// ---- 폴링 (온라인 모드, 실시간 웹소켓 대신 단순 주기 조회) ----
function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollOnce, 4000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('focus', onFocus);
}
function onVisibilityChange() { if (!document.hidden) pollOnce(); }
function onFocus() { pollOnce(); }

async function pollOnce() {
  if (mode !== 'online' || !net || document.hidden) return;
  if (screen === 'playing' && state && state.activePlayer === net.mySeat) return; // 내 턴엔 조회할 필요 없음
  try {
    const data = await netClient.fetchState();
    if (data.status === 'waiting') {
      if (screen !== 'onlineWaiting') screen = 'onlineWaiting';
      render();
      return;
    }
    if (data.state) {
      state = data.state;
      screen = 'playing';
      render();
    }
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      goToOnlineError('이 방을 더 이상 찾을 수 없습니다.');
    }
    // 그 외 네트워크 오류는 조용히 무시하고 다음 폴링에서 재시도
  }
}

function startLocalGame() {
  clearTimeout(aiTimer); aiTimer = null;
  mode = 'local'; net = null;
  state = initGame(makeSeed(), { races: { P1: setup.P1, P2: setup.P2 }, aiPlayers: ['P2'] });
  clearSelection();
  screen = 'playing';
  render();
}

function resetToModeSelect() {
  clearTimeout(aiTimer); aiTimer = null;
  stopPolling();
  if (mode === 'online') netClient.clearSession();
  state = null; net = null; mode = null; pendingAction = false;
  clearSelection();
  screen = 'modeSelect';
  render();
}

async function tryResumeOnlineSession() {
  const session = netClient.getSession();
  if (!session) return false;
  mode = 'online';
  net = { roomCode: session.roomCode, mySeat: session.seat };
  try {
    const data = await netClient.fetchState();
    if (data.status === 'waiting') {
      screen = 'onlineWaiting';
    } else if (data.state) {
      state = data.state;
      screen = 'playing';
    }
    startPolling();
    return true;
  } catch {
    netClient.clearSession();
    net = null; mode = null;
    return false;
  }
}

function joinCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  return code ? code.toUpperCase() : null;
}

function render() {
  const showGame = screen === 'playing';
  els.gameLayout.classList.toggle('hidden', !showGame);
  els.handTray.classList.toggle('hidden', !showGame);
  els.resourceBar.classList.toggle('hidden', !showGame);
  els.victory.classList.add('hidden');
  els.setup.classList.add('hidden');

  if (screen === 'modeSelect') {
    els.roundInfo.textContent = '플레이 방식을 선택하세요';
    renderModeSelect(els.setup, modeSelectHandlers);
    return;
  }
  if (screen === 'setup') {
    els.roundInfo.textContent = '종족을 선택하세요';
    renderSetup(els.setup, setup, setupHandlers);
    return;
  }
  if (screen === 'onlineCreate') {
    els.roundInfo.textContent = '온라인 — 방 만들기';
    renderOnlineCreate(els.setup, onlineRace, onlineCreateHandlers);
    return;
  }
  if (screen === 'onlineJoin') {
    els.roundInfo.textContent = '온라인 — 방 참가';
    renderOnlineJoin(els.setup, onlineJoinCode, onlineRace, onlineJoinHandlers);
    return;
  }
  if (screen === 'onlineWaiting') {
    els.roundInfo.textContent = '온라인 — 상대 대기 중';
    renderOnlineWaiting(els.setup, net.roomCode, netClient.shareLinkFor(net.roomCode), onlineWaitingHandlers);
    return;
  }
  if (screen === 'onlineError') {
    els.roundInfo.textContent = '오류';
    renderErrorOverlay(els.setup, onlineErrorMessage, errorHandlers);
    return;
  }

  // screen === 'playing'
  const seat = viewerSeat();
  const turnNote = mode === 'online'
    ? (state.activePlayer === net.mySeat ? '당신 차례' : '상대 차례 대기 중...')
    : `${state.activePlayer} 턴`;
  els.roundInfo.textContent = `라운드 ${state.round} / ${ROUND_CAP} — ${turnNote}`;
  renderMap(els.map, state, ui, handlers);
  renderResourceBar(els.resourceBar, state);
  renderHand(els.hand, state, ui, handlers, seat);
  renderLog(els.log, state);
  renderOrderPanel(els.orderPanel, state, ui, handlers, seat);
  renderVictory(els.victory, state);

  if (mode === 'local') {
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
  } else {
    if (state.phase === 'ended') stopPolling();
    const myTurn = state.activePlayer === net.mySeat;
    els.endTurnBtn.disabled = !myTurn || state.phase === 'ended' || pendingAction;
    els.endTurnBtn.textContent = pendingAction ? '처리 중...' : myTurn ? '턴 종료' : '상대 턴 대기 중...';
  }
}

els.endTurnBtn.addEventListener('click', () => {
  if (screen !== 'playing' || !canAct()) return;
  clearSelection();
  dispatch({ type: 'END_TURN', player: viewerSeat() });
});

els.newGameBtn.addEventListener('click', resetToModeSelect);
els.victory.addEventListener('click', (e) => {
  if (e.target.id === 'restart-btn') resetToModeSelect();
});

(async function init() {
  if (await tryResumeOnlineSession()) { render(); return; }
  const joinCode = joinCodeFromUrl();
  if (joinCode) {
    mode = 'online';
    onlineJoinCode = joinCode;
    screen = 'onlineJoin';
  } else {
    screen = 'modeSelect';
  }
  render();
})();

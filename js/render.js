import { DUMP_NODE_IDS, MAP_VIEWBOX } from './mapData.js';
import { NODE_TYPES } from './mapData.js';
import { CARD_DEFS, RACE_INFO, RACE_SECONDARY, RACE_SPECIAL_ABILITY, resolveCost } from './cards.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OWNER_COLOR = { P1: '#3b82f6', P2: '#ef4444', neutral: '#475569' };
const TYPE_ICON = { capital: '★', territory: '●', sanctuary: '◆', dump: '◈', neutralCamp: '▲' };
const RES_LABEL = { supply: '물자', research: '연구', zeal: '광신', rift: '균열력', spore: '포자', authority: '권위', corruption: '타락' };

function el(tag, attrs = {}, ns = false) {
  const e = ns ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function renderMap(svg, state, ui, handlers) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`);

  for (const [a, b] of ADJACENCY_EDGES(state)) {
    const line = el('line', {
      x1: state.nodes[a].x, y1: state.nodes[a].y,
      x2: state.nodes[b].x, y2: state.nodes[b].y,
      stroke: '#334155', 'stroke-width': 3,
    }, true);
    svg.appendChild(line);
  }

  for (const [id, node] of Object.entries(state.nodes)) {
    const g = el('g', { class: 'node-group', 'data-node': id }, true);
    const ownerColor = node.owner ? OWNER_COLOR[node.owner] : OWNER_COLOR.neutral;
    const isDump = DUMP_NODE_IDS.includes(id);
    const radius = node.type === 'capital' ? 28 : isDump ? 24 : 20;

    const selectable = handlers.isSelectableNode(id);
    const selected = ui.selectedNodeId === id;
    const targetable = ui.targetableNodeIds && ui.targetableNodeIds.includes(id);

    if (node.sporeZone) {
      const zoneRing = el('circle', {
        cx: node.x, cy: node.y, r: radius + 10, fill: 'rgba(132,204,22,0.08)', stroke: '#4d7c0f', 'stroke-width': 1.5,
      }, true);
      g.appendChild(zoneRing);
    }

    const circle = el('circle', {
      cx: node.x, cy: node.y, r: radius,
      fill: '#0f172a', stroke: ownerColor, 'stroke-width': selected ? 5 : targetable ? 4 : 2.5,
      class: selectable || targetable ? 'node-clickable' : '',
    }, true);
    if (targetable) circle.setAttribute('stroke-dasharray', '4 3');
    g.appendChild(circle);

    const icon = el('text', {
      x: node.x, y: node.y + 5, 'text-anchor': 'middle',
      fill: ownerColor, 'font-size': 18, 'font-weight': 'bold',
    }, true);
    icon.textContent = TYPE_ICON[node.type];
    g.appendChild(icon);

    const label = el('text', {
      x: node.x, y: node.y + radius + 16, 'text-anchor': 'middle',
      fill: '#94a3b8', 'font-size': 11,
    }, true);
    label.textContent = `${(state.nodeNames && state.nodeNames[id]) || NODE_TYPES[node.type].label}${node.building ? ' [' + CARD_DEFS[node.building].name + ']' : ''}`;
    g.appendChild(label);

    if (node.type === 'neutralCamp' && node.garrison > 0) {
      const gt = el('text', { x: node.x, y: node.y - radius - 8, 'text-anchor': 'middle', fill: '#f59e0b', 'font-size': 12 }, true);
      gt.textContent = `수비 ${node.garrison}`;
      g.appendChild(gt);
    }

    if (node.army) {
      const armyColor = OWNER_COLOR[node.army.owner];
      const mp = node.army.movePoints ?? 0;
      const range = node.army.moveRange || 1;
      const at = el('text', { x: node.x, y: node.y - radius - 8, 'text-anchor': 'middle', fill: armyColor, 'font-size': 13, 'font-weight': 'bold' }, true);
      at.textContent = `${node.army.hero ? '⚔' : ''}${node.army.power} (${node.army.stance === 'defend' ? '방어' : '후퇴'}) 이동${mp}/${range}`;
      g.appendChild(at);
    }

    if (node.infested) {
      const infColor = OWNER_COLOR[node.infested.owner];
      const ring = el('circle', {
        cx: node.x, cy: node.y, r: radius + 6, fill: 'none', stroke: '#84cc16', 'stroke-width': 2, 'stroke-dasharray': '3 3',
      }, true);
      g.appendChild(ring);
      const it = el('text', { x: node.x, y: node.y + radius + 30, 'text-anchor': 'middle', fill: infColor, 'font-size': 11, 'font-weight': 'bold' }, true);
      it.textContent = `${node.infested.debuffTarget ? '감염(디버프 예정)' : '감염(탈취 예정)'} ${node.infested.roundsLeft}R (${node.infested.owner})`;
      g.appendChild(it);
    }

    if (node.debuff) {
      const dbColor = OWNER_COLOR[node.debuff.owner];
      const ring = el('circle', {
        cx: node.x, cy: node.y, r: radius + 6, fill: 'none', stroke: '#a3e635', 'stroke-width': 2, 'stroke-dasharray': '1 4',
      }, true);
      g.appendChild(ring);
      const dt = el('text', { x: node.x, y: node.y + radius + 30, 'text-anchor': 'middle', fill: dbColor, 'font-size': 11, 'font-weight': 'bold' }, true);
      dt.textContent = `역병 디버프 ${node.debuff.roundsLeft}R (생산/방어 약화, ${node.debuff.owner} 소행)`;
      g.appendChild(dt);
    }

    g.addEventListener('click', () => handlers.onNodeClick(id));
    svg.appendChild(g);
  }
}

function ADJACENCY_EDGES(state) {
  const seen = new Set();
  const edges = [];
  for (const [a, list] of Object.entries(state.adjacency)) {
    for (const b of list) {
      const key = [a, b].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  return edges;
}

export function renderResourceBar(container, state) {
  container.innerHTML = '';
  for (const p of ['P1', 'P2']) {
    const pl = state.players[p];
    const raceInfo = RACE_INFO[pl.race];
    const sec = RACE_SECONDARY[pl.race];
    const ability = RACE_SPECIAL_ABILITY[pl.race];
    const box = el('div', { class: `res-box res-${p}` });
    const secLine = sec.isCurrency
      ? `${sec.name} ${pl[sec.key]}`
      : sec.key === 'gateLevel' ? `차원문 Lv${pl.gateLevel}` : `감염력 Lv${pl.virulence}`;
    box.innerHTML = `
      <div class="res-title">${p}${p === state.activePlayer ? ' ▶' : ''} ${raceInfo.name} ${pl.isAI ? '(AI)' : '(플레이어)'}</div>
      <div class="res-line">물자 ${pl.supply} · 수도 티어 ${pl.capitalTier}/4</div>
      <div class="res-line">${raceInfo.resourceName} ${pl[raceInfo.resource]} · ${secLine}</div>
      <div class="res-line">AP ${pl.ap}${pl.specialization ? ' · 특화: ' + specName(pl.specialization) : ''}</div>
      <div class="res-line res-ability" title="${ability.desc}">특수능력: ${ability.name}</div>
    `;
    container.appendChild(box);
  }
}

function specName(s) {
  return { faith: '신앙', military: '군부', hero: '용사' }[s] || s;
}

// viewerSeat: 이 손패를 "누구 화면에" 그리는지. 기본값(state.activePlayer)은 기존 핫싯
// 동작과 완전히 동일하다(같은 화면에서 턴이 넘어가면 그 사람 손패가 보임). 온라인 모드에서는
// main.js가 고정된 내 시트(net.mySeat)를 넘겨서, 상대 턴이어도 내 손패는 계속(비활성 상태로)
// 보이게 한다 — 상대 턴에 내 손패 자리가 비거나 상대 손패가 새는 걸 막기 위함.
export function renderHand(container, state, ui, handlers, viewerSeat = state.activePlayer) {
  container.innerHTML = '';
  const pl = state.players[viewerSeat];
  if (pl.isAI) {
    container.innerHTML = '<div class="hand-empty">AI 턴 진행 중...</div>';
    return;
  }
  const canAct = viewerSeat === state.activePlayer && state.phase !== 'ended';
  for (const card of pl.hand) {
    const def = CARD_DEFS[card.kind];
    const cost = resolveCost(def, pl);
    const affordable = canAct
      && pl.ap >= def.apCost
      && Object.entries(cost).every(([k, v]) => (pl[k] || 0) >= v)
      && !(def.once && pl.specialization)
      && !(def.minGateLevel && (pl.gateLevel || 1) < def.minGateLevel)
      && !(def.minCapitalTier && (pl.capitalTier || 1) < def.minCapitalTier);
    const cardEl = el('div', { class: `card card-${def.type} ${affordable ? '' : 'card-disabled'} ${ui.selectedCardUid === card.uid ? 'card-selected' : ''}` });
    const costParts = Object.entries(cost).map(([k, v]) => `${RES_LABEL[k] || k}${v}`);
    const gateNote = def.minGateLevel ? ` · 차원문Lv${def.minGateLevel}+` : '';
    const tierNote = def.minCapitalTier ? ` · 수도T${def.minCapitalTier}+` : '';
    cardEl.innerHTML = `
      <div class="card-name">${def.name}</div>
      <div class="card-cost">AP${def.apCost}${costParts.length ? ' · ' + costParts.join(' ') : ''}${gateNote}${tierNote}</div>
      <div class="card-desc">${def.desc}</div>
    `;
    cardEl.addEventListener('click', () => { if (canAct) handlers.onCardClick(card.uid); });
    container.appendChild(cardEl);
  }
}

export function renderLog(container, state) {
  container.innerHTML = state.log.slice().reverse().map((l) => `<div class="log-line">[R${l.round} ${l.player}] ${l.text}</div>`).join('');
}

export function renderOrderPanel(container, state, ui, handlers, viewerSeat = state.activePlayer) {
  container.innerHTML = '';
  if (!ui.selectedNodeId) {
    container.innerHTML = '<div class="hint">내 부대가 있는 노드를 클릭하면 명령을 내릴 수 있습니다.</div>';
    return;
  }
  const node = state.nodes[ui.selectedNodeId];
  if (!node.army || node.army.owner !== viewerSeat || state.players[viewerSeat].isAI) return;
  const canAct = viewerSeat === state.activePlayer;
  const title = el('div', { class: 'order-title' });
  title.textContent = `${ui.selectedNodeId} 부대 (전력 ${node.army.power}, 이동력 ${node.army.movePoints}/${node.army.moveRange || 1})`;
  container.appendChild(title);

  const btnDefend = el('button', { class: 'btn' });
  btnDefend.textContent = '방어 (전력 +30%)';
  btnDefend.addEventListener('click', () => { if (canAct) handlers.onStance(ui.selectedNodeId, 'defend'); });
  container.appendChild(btnDefend);

  const btnRetreat = el('button', { class: 'btn' });
  btnRetreat.textContent = '후퇴 태세 (피해 -50%)';
  btnRetreat.addEventListener('click', () => { if (canAct) handlers.onStance(ui.selectedNodeId, 'retreat'); });
  container.appendChild(btnRetreat);

  if (!canAct) {
    const waitHint = el('div', { class: 'hint' });
    waitHint.textContent = '상대 턴입니다 — 지금은 명령을 내릴 수 없습니다.';
    container.appendChild(waitHint);
  } else if ((node.army.movePoints || 0) > 0) {
    const marchHint = el('div', { class: 'hint' });
    marchHint.textContent = `진군하려면 지도에서 인접한 노드를 클릭하세요. (남은 이동력 ${node.army.movePoints})`;
    container.appendChild(marchHint);
  } else {
    const done = el('div', { class: 'hint' });
    done.textContent = '이 부대는 이번 턴 이동력을 모두 사용했습니다.';
    container.appendChild(done);
  }
}

export function renderSetup(container, setup, handlers) {
  container.classList.remove('hidden');
  const raceCard = (side, raceKey) => {
    const info = RACE_INFO[raceKey];
    const ability = RACE_SPECIAL_ABILITY[raceKey];
    const selected = setup[side] === raceKey;
    return `
      <div class="race-card ${selected ? 'race-selected' : ''}" data-side="${side}" data-race="${raceKey}">
        <div class="race-name">${info.name}</div>
        <div class="race-desc">${info.desc}</div>
        <div class="race-ability"><strong>특수능력 · ${ability.name}</strong> — ${ability.desc}</div>
      </div>
    `;
  };
  const raceKeys = Object.keys(RACE_INFO);
  container.innerHTML = `
    <div class="setup-box">
      <h2>OATHFALL — 종족 선택</h2>
      <p class="hint">P1(당신, 파랑)과 P2(AI, 빨강)의 종족을 각각 선택하세요.</p>
      <div class="setup-side">
        <h3>P1 (플레이어)</h3>
        <div class="race-grid" data-role="P1">${raceKeys.map((r) => raceCard('P1', r)).join('')}</div>
      </div>
      <div class="setup-side">
        <h3>P2 (AI)</h3>
        <div class="race-grid" data-role="P2">${raceKeys.map((r) => raceCard('P2', r)).join('')}</div>
      </div>
      <button id="start-game-btn" class="btn btn-primary">게임 시작</button>
    </div>
  `;
  container.querySelectorAll('.race-card').forEach((elCard) => {
    elCard.addEventListener('click', () => handlers.onPickRace(elCard.dataset.side, elCard.dataset.race));
  });
  container.querySelector('#start-game-btn').addEventListener('click', () => handlers.onStartGame());
}

export function renderModeSelect(container, handlers) {
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="setup-box">
      <h2>OATHFALL</h2>
      <p class="hint">플레이 방식을 선택하세요.</p>
      <div class="mode-grid">
        <button class="btn mode-btn" data-mode="local">로컬 (핫싯 + AI)</button>
        <button class="btn mode-btn" data-mode="online">온라인 멀티플레이</button>
      </div>
    </div>
  `;
  container.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onPickMode(btn.dataset.mode));
  });
}

function raceGridHtml(raceKeys, selectedRace) {
  const raceCard = (raceKey) => {
    const info = RACE_INFO[raceKey];
    const ability = RACE_SPECIAL_ABILITY[raceKey];
    const selected = selectedRace === raceKey;
    return `
      <div class="race-card ${selected ? 'race-selected' : ''}" data-race="${raceKey}">
        <div class="race-name">${info.name}</div>
        <div class="race-desc">${info.desc}</div>
        <div class="race-ability"><strong>특수능력 · ${ability.name}</strong> — ${ability.desc}</div>
      </div>
    `;
  };
  return raceKeys.map(raceCard).join('');
}

export function renderOnlineCreate(container, race, handlers) {
  container.classList.remove('hidden');
  const raceKeys = Object.keys(RACE_INFO);
  container.innerHTML = `
    <div class="setup-box">
      <h2>온라인 — 방 만들기</h2>
      <p class="hint">종족을 고르고 방을 만들면 상대에게 보낼 방 코드/링크가 나옵니다.</p>
      <div class="race-grid">${raceGridHtml(raceKeys, race)}</div>
      <button id="online-create-btn" class="btn btn-primary" ${race ? '' : 'disabled'}>방 만들기</button>
      <button id="online-switch-btn" class="btn btn-ghost">방 코드가 있으신가요? 참가하기 →</button>
      <button id="online-back-btn" class="btn btn-ghost">뒤로</button>
    </div>
  `;
  container.querySelectorAll('.race-card').forEach((elCard) => {
    elCard.addEventListener('click', () => handlers.onPickRace(elCard.dataset.race));
  });
  container.querySelector('#online-create-btn').addEventListener('click', () => handlers.onCreateRoom());
  container.querySelector('#online-switch-btn').addEventListener('click', () => handlers.onSwitchToJoin());
  container.querySelector('#online-back-btn').addEventListener('click', () => handlers.onBack());
}

export function renderOnlineJoin(container, roomCode, race, handlers) {
  container.classList.remove('hidden');
  const raceKeys = Object.keys(RACE_INFO);
  container.innerHTML = `
    <div class="setup-box">
      <h2>온라인 — 방 참가</h2>
      <p class="hint">공유받은 방 코드를 입력하고 종족을 고른 뒤 참가하세요.</p>
      <input id="join-code-input" class="join-code-input" placeholder="방 코드 (예: AB12CD)" value="${roomCode || ''}" maxlength="6" />
      <div class="race-grid">${raceGridHtml(raceKeys, race)}</div>
      <button id="online-join-btn" class="btn btn-primary">참가하기</button>
      <button id="online-switch-btn" class="btn btn-ghost">← 새 방 만들기</button>
      <button id="online-back-btn" class="btn btn-ghost">뒤로</button>
    </div>
  `;
  container.querySelectorAll('.race-card').forEach((elCard) => {
    elCard.addEventListener('click', () => handlers.onPickRace(elCard.dataset.race));
  });
  const input = container.querySelector('#join-code-input');
  input.addEventListener('input', () => handlers.onCodeChange(input.value.toUpperCase()));
  container.querySelector('#online-join-btn').addEventListener('click', () => handlers.onJoinRoom(input.value.toUpperCase()));
  container.querySelector('#online-switch-btn').addEventListener('click', () => handlers.onSwitchToCreate());
  container.querySelector('#online-back-btn').addEventListener('click', () => handlers.onBack());
}

export function renderOnlineWaiting(container, roomCode, shareUrl, handlers) {
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="setup-box">
      <h2>상대를 기다리는 중...</h2>
      <p class="hint">아래 코드나 링크를 상대에게 보내세요. 상대가 참가하면 자동으로 게임이 시작됩니다.</p>
      <div class="room-code-display">${roomCode}</div>
      <div class="share-link-row">
        <input class="share-link-input" readonly value="${shareUrl}" />
        <button id="copy-link-btn" class="btn">링크 복사</button>
      </div>
      <button id="online-cancel-btn" class="btn btn-ghost">취소</button>
    </div>
  `;
  container.querySelector('#copy-link-btn').addEventListener('click', () => handlers.onCopyLink());
  container.querySelector('#online-cancel-btn').addEventListener('click', () => handlers.onBack());
}

export function renderErrorOverlay(container, message, handlers) {
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="setup-box">
      <h2>문제가 발생했습니다</h2>
      <p class="hint">${message}</p>
      <button id="error-back-btn" class="btn btn-primary">처음으로</button>
    </div>
  `;
  container.querySelector('#error-back-btn').addEventListener('click', () => handlers.onBack());
}

export function renderVictory(container, state) {
  if (state.phase !== 'ended') { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  const reasonText = { conquest: '정복 승리', 'dump-domination': '매립지 지배 승리', score: '점수 승리' }[state.winReason] || state.winReason;
  container.innerHTML = `
    <div class="victory-box">
      <h2>${state.winner === 'draw' ? '무승부' : `${state.winner} 승리`}</h2>
      <p>${reasonText}</p>
      <button id="restart-btn" class="btn">새 게임</button>
    </div>
  `;
}

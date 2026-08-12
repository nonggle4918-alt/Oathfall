import { ADJACENCY, DUMP_NODE_IDS, NODE_NAMES, MAP_VIEWBOX } from './mapData.js';
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
    label.textContent = `${NODE_NAMES[id] || NODE_TYPES[node.type].label}${node.building ? ' [' + CARD_DEFS[node.building].name + ']' : ''}`;
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
  for (const [a, list] of Object.entries(ADJACENCY)) {
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

export function renderHand(container, state, ui, handlers) {
  container.innerHTML = '';
  const pl = state.players[state.activePlayer];
  if (pl.isAI) {
    container.innerHTML = '<div class="hand-empty">AI 턴 진행 중...</div>';
    return;
  }
  for (const card of pl.hand) {
    const def = CARD_DEFS[card.kind];
    const cost = resolveCost(def, pl);
    const affordable = pl.ap >= def.apCost
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
    cardEl.addEventListener('click', () => handlers.onCardClick(card.uid));
    container.appendChild(cardEl);
  }
}

export function renderLog(container, state) {
  container.innerHTML = state.log.slice().reverse().map((l) => `<div class="log-line">[R${l.round} ${l.player}] ${l.text}</div>`).join('');
}

export function renderOrderPanel(container, state, ui, handlers) {
  container.innerHTML = '';
  if (!ui.selectedNodeId) {
    container.innerHTML = '<div class="hint">내 부대가 있는 노드를 클릭하면 명령을 내릴 수 있습니다.</div>';
    return;
  }
  const node = state.nodes[ui.selectedNodeId];
  if (!node.army || node.army.owner !== state.activePlayer || state.players[state.activePlayer].isAI) return;
  const title = el('div', { class: 'order-title' });
  title.textContent = `${ui.selectedNodeId} 부대 (전력 ${node.army.power}, 이동력 ${node.army.movePoints}/${node.army.moveRange || 1})`;
  container.appendChild(title);

  const btnDefend = el('button', { class: 'btn' });
  btnDefend.textContent = '방어 (전력 +30%)';
  btnDefend.addEventListener('click', () => handlers.onStance(ui.selectedNodeId, 'defend'));
  container.appendChild(btnDefend);

  const btnRetreat = el('button', { class: 'btn' });
  btnRetreat.textContent = '후퇴 태세 (피해 -50%)';
  btnRetreat.addEventListener('click', () => handlers.onStance(ui.selectedNodeId, 'retreat'));
  container.appendChild(btnRetreat);

  if ((node.army.movePoints || 0) > 0) {
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

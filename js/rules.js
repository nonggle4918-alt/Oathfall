// 순수 룰 엔진. reduce(state, action) -> state 외에는 아무것도 모른다 (§2 원칙 2).
// 네트워크·렌더링·저장을 몰라야 Firebase 연동(2단계) 시 코어를 그대로 승격할 수 있다.

import { NODES, ADJACENCY, DUMP_NODE_IDS, NEUTRAL_CAMP_GARRISON, NEUTRAL_CAMP_REWARD, STARTING_ARMY_POWER } from './mapData.js';
import { CARD_DEFS, BUILDING_INCOME, buildDeck } from './cards.js';
import { seededVariance } from './rng.js';

export const PLAYER_ORDER = ['P1', 'P2'];
export const HAND_LIMIT = 7;
export const START_HAND = 5;
export const DRAW_PER_TURN = 2;
export const AP_PER_TURN = 3;
export const ROUND_CAP = 12;
export const DOMINATION_ROUNDS_NEEDED = 2;

function clone(x) {
  return typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
}

export function initGame(seed, opts = {}) {
  const races = opts.races || { P1: 'kingdom', P2: 'kingdom' };
  const nodes = {};
  for (const [id, def] of Object.entries(NODES)) {
    nodes[id] = {
      type: def.type, x: def.x, y: def.y,
      owner: def.owner,
      building: null,
      garrison: def.type === 'neutralCamp' ? NEUTRAL_CAMP_GARRISON : 0,
      army: def.type === 'capital' ? { owner: def.owner, power: STARTING_ARMY_POWER, stance: 'defend', hero: false } : null,
      infested: null,
    };
  }

  const players = {};
  for (const p of PLAYER_ORDER) {
    players[p] = {
      race: races[p] || 'kingdom',
      supply: 5, influence: 2, research: 0, zeal: 0, rift: 0, spore: 0, ap: 0,
      gateLevel: 1,
      hand: [], deck: buildDeck(seed, p, races[p] || 'kingdom'), discard: [],
      specialization: null,
      isAI: opts.aiPlayers ? opts.aiPlayers.includes(p) : p === 'P2',
    };
  }

  let state = {
    seed, rngCounter: 0,
    round: 1, activePlayer: 'P1', phase: 'playing', winner: null, winReason: null,
    ordersUsedThisTurn: [],
    dumpDomination: { owner: null, consecutiveRounds: 0 },
    players, nodes,
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

function nodeIncome(node) {
  const base = { supply: 0, influence: 0, research: 0, zeal: 0, rift: 0, spore: 0 };
  if (node.type === 'capital') { base.supply += 3; base.influence += 1; }
  else if (node.type === 'territory') { base.supply += 2; }
  else if (node.type === 'sanctuary') { base.influence += 2; }
  else if (node.type === 'dump') { base.supply += 2; base.influence += 2; }
  const bi = node.building ? BUILDING_INCOME[node.building] : null;
  if (bi) for (const [k, v] of Object.entries(bi)) base[k] = (base[k] || 0) + v;
  return base;
}

function startTurn(state, player) {
  const pl = state.players[player];
  const inc = { supply: 0, influence: 0, research: 0, zeal: 0, rift: 0, spore: 0 };
  for (const node of Object.values(state.nodes)) {
    if (node.owner === player) {
      const i = nodeIncome(node);
      for (const k of Object.keys(inc)) inc[k] += i[k] || 0;
    }
  }
  if (pl.specialization === 'faith') inc.influence += 2;
  for (const k of Object.keys(inc)) pl[k] += inc[k];
  pl.ap = AP_PER_TURN;
  state.ordersUsedThisTurn = [];
  state.activePlayer = player;
  // 강행군 보너스는 "이번 턴"에만 유효 — 다음 자기 턴 시작 시 만료시킨다
  for (const node of Object.values(state.nodes)) {
    if (node.army && node.army.owner === player && node.army.forcedMarchBonus) node.army.forcedMarchBonus = false;
  }
  const incText = Object.entries(inc).filter(([, v]) => v > 0).map(([k, v]) => `${RES_LABEL[k]}+${v}`).join(' ') || '없음';
  pushLog(state, `--- ${player} 턴 시작 (${incText}) ---`);
  state = drawCards(state, player, DRAW_PER_TURN);
  return state;
}

const RES_LABEL = { supply: '물자', influence: '영향력', research: '연구', zeal: '광신', rift: '균열력', spore: '포자' };

function canAfford(pl, cost) {
  return Object.entries(cost).every(([k, v]) => (pl[k] || 0) >= v);
}
function payCost(pl, cost) {
  for (const [k, v] of Object.entries(cost)) pl[k] -= v;
}

function powerMultiplier(state, player) {
  return state.players[player].specialization === 'military' ? 1.1 : 1.0;
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

  const attackerEff = attackerRawPower * forcedMult * heroMult * powerMultiplier(state, attackerPlayer) * seededVariance(state.seed, c1, 0.1);
  const defenderEff = defenderRawPower * stanceMult * opts.terrainMult * (defenderPlayer ? powerMultiplier(state, defenderPlayer) : 1.0) * seededVariance(state.seed, c2, 0.1);

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
      pushLog(state, `${owners[0]}가 매립지 3개를 ${DOMINATION_ROUNDS_NEEDED}라운드 연속 지배했다. 지배 승리!`);
    }
  } else {
    state.dumpDomination = { owner: null, consecutiveRounds: 0 };
  }
}

// 감염체 §6.4: 감염 진행 노드는 라운드가 끝날 때마다 카운트다운되어 0이 되면 소유권이 넘어간다.
function tickInfestation(state) {
  for (const [id, node] of Object.entries(state.nodes)) {
    if (!node.infested) continue;
    node.infested.roundsLeft -= 1;
    if (node.infested.roundsLeft <= 0) {
      const owner = node.infested.owner;
      node.owner = owner;
      node.infested = null;
      pushLog(state, `${id} 노드가 감염 완료되어 ${owner} 소유가 되었다`);
    }
  }
  if (state.phase !== 'ended') checkConquest(state);
}

function applyInfestedResidual(state, infestedPlayer, nodeId) {
  const node = state.nodes[nodeId];
  if (!node || node.type === 'capital') return;
  if (node.owner === infestedPlayer && !node.infested) return;
  node.infested = { owner: infestedPlayer, roundsLeft: 2 };
  state.players[infestedPlayer].spore += 2;
  pushLog(state, `${infestedPlayer}: 전투의 여파로 ${nodeId}에 포자가 남았다 (감염 시작)`);
}

function computeScore(state, player) {
  let nodesOwned = 0, dumps = 0;
  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.owner === player) { nodesOwned++; if (DUMP_NODE_IDS.includes(id)) dumps++; }
  }
  const pl = state.players[player];
  return nodesOwned * 10 + dumps * 15 + pl.influence * 2 + pl.supply * 1;
}

function finalizeScoreVictory(state) {
  const s1 = computeScore(state, 'P1');
  const s2 = computeScore(state, 'P2');
  state.phase = 'ended'; state.winReason = 'score';
  if (s1 === s2) { state.winner = 'draw'; pushLog(state, `12라운드 종료. 점수 동률(${s1} : ${s2}) — 무승부`); }
  else { state.winner = s1 > s2 ? 'P1' : 'P2'; pushLog(state, `12라운드 종료. 점수 P1 ${s1} : P2 ${s2} — ${state.winner} 승리`); }
}

function targetValid(state, player, nodeId, filter) {
  const node = state.nodes[nodeId];
  if (!node) return false;
  if (filter === 'owned') return node.owner === player;
  if (filter === 'ownedNoBuilding') return node.owner === player && !node.building;
  if (filter === 'ownedWithArmy') return node.owner === player && node.army && node.army.owner === player;
  if (filter === 'infectable') {
    if (node.type === 'capital') return false;
    if (node.owner === player) return false;
    if (node.infested && node.infested.owner === player) return false;
    return (ADJACENCY[nodeId] || []).some((nb) => state.nodes[nb].owner === player);
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
      if (pl.ap < def.apCost) { pushLog(state, `AP 부족으로 ${def.name} 사용 실패`); return state; }
      if (!canAfford(pl, def.cost)) { pushLog(state, `자원 부족으로 ${def.name} 사용 실패`); return state; }
      if (def.once && pl.specialization) { pushLog(state, `이미 연구를 특화하여 ${def.name} 사용 불가`); return state; }
      if (def.minGateLevel && (pl.gateLevel || 1) < def.minGateLevel) { pushLog(state, `차원문 레벨 부족으로 ${def.name} 사용 실패`); return state; }
      const targetNode = targetNodeId ? state.nodes[targetNodeId] : null;
      if (def.needsTarget && !targetValid(state, player, targetNodeId, def.targetFilter)) {
        pushLog(state, `${def.name}의 대상이 유효하지 않음`); return state;
      }

      pl.ap -= def.apCost;
      payCost(pl, def.cost);
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
      } else if (def.effect === 'infect') {
        targetNode.infested = { owner: player, roundsLeft: def.infectRounds || 2 };
        pushLog(state, `${player}: ${def.name} — ${targetNodeId} 감염 시작 (${def.infectRounds}라운드 후 완료)`);
      } else if (def.effect === 'plagueAccelerate') {
        let count = 0;
        for (const node of Object.values(state.nodes)) {
          if (node.infested && node.infested.owner === player) { node.infested.roundsLeft = Math.max(0, node.infested.roundsLeft - 1); count++; }
        }
        pushLog(state, `${player}: ${def.name} — 진행 중인 감염 ${count}건 가속`);
      } else if (def.spawnPower) {
        if (!targetNode.army) targetNode.army = { owner: player, power: 0, stance: 'defend', hero: false };
        let power = def.spawnPower;
        if (def.scalesWithGate) power += (pl.gateLevel || 1) * (def.gatePowerMult || 0);
        targetNode.army.power += power;
        if (def.hero) targetNode.army.hero = true;
        pushLog(state, `${player}: ${def.name} 사용 (대상 ${targetNodeId}, 전력 +${power})`);
      } else if (card.kind === 'resupply') {
        pl.supply += 3; pushLog(state, `${player}: ${def.name} 사용`);
      } else if (card.kind === 'intel') {
        pl.influence += 3; pushLog(state, `${player}: ${def.name} 사용`);
      } else if (card.kind === 'forcedMarch') {
        targetNode.army.forcedMarchBonus = true; pushLog(state, `${player}: ${def.name} 사용 (대상 ${targetNodeId})`);
      } else if (card.kind === 'pathFaith') {
        pl.specialization = 'faith'; pushLog(state, `${player}: 연구 특화 — 신앙`);
      } else if (card.kind === 'pathMilitary') {
        pl.specialization = 'military'; pushLog(state, `${player}: 연구 특화 — 군부`);
      } else if (card.kind === 'pathHero') {
        pl.specialization = 'hero';
        const cap = state.nodes[player === 'P1' ? 'C1' : 'C2'];
        if (!cap.army) cap.army = { owner: player, power: 0, stance: 'defend', hero: false };
        cap.army.power += def.grantHeroAtCapital || 6; cap.army.hero = true;
        pushLog(state, `${player}: 연구 특화 — 용사`);
      }
      return state;
    }

    case 'SET_STANCE': {
      const { player, nodeId, stance } = action;
      if (state.activePlayer !== player) return state;
      if (state.ordersUsedThisTurn.includes(nodeId)) return state;
      const node = state.nodes[nodeId];
      if (!node.army || node.army.owner !== player) return state;
      node.army.stance = stance;
      state.ordersUsedThisTurn.push(nodeId);
      pushLog(state, `${player}: ${nodeId} 부대 태세를 ${stance === 'defend' ? '방어' : '후퇴'}로 설정`);
      return state;
    }

    case 'ISSUE_MARCH': {
      const { player, fromNodeId, toNodeId } = action;
      if (state.activePlayer !== player) return state;
      if (state.ordersUsedThisTurn.includes(fromNodeId)) return state;
      if (!ADJACENCY[fromNodeId] || !ADJACENCY[fromNodeId].includes(toNodeId)) return state;
      const fromNode = state.nodes[fromNodeId];
      const toNode = state.nodes[toNodeId];
      if (!fromNode.army || fromNode.army.owner !== player) return state;

      state.ordersUsedThisTurn.push(fromNodeId);
      const movingArmy = fromNode.army;
      const forcedMarch = !!movingArmy.forcedMarchBonus;

      const isEnemyArmy = toNode.army && toNode.army.owner !== player;
      const isGarrisonedCamp = toNode.type === 'neutralCamp' && toNode.owner === null && toNode.garrison > 0;

      if (!isEnemyArmy && !isGarrisonedCamp) {
        if (toNode.owner === player && toNode.army) {
          toNode.army.power += movingArmy.power;
          toNode.army.hero = toNode.army.hero || movingArmy.hero;
        } else {
          toNode.owner = player;
          toNode.army = { owner: player, power: movingArmy.power, stance: 'defend', hero: movingArmy.hero };
          if (toNode.infested && toNode.infested.owner === player) toNode.infested = null;
        }
        fromNode.army = null;
        pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 진군 (무혈 점령/합류)`);
      } else {
        const defenderPlayer = toNode.army ? toNode.army.owner : null;
        const defenderRawPower = toNode.army ? toNode.army.power : toNode.garrison;
        const terrainMult = toNode.type === 'capital' ? 1.5 : toNode.building === 'fortress' ? 1.25 : 1.0;
        const heroVsCamp = movingArmy.hero && isGarrisonedCamp;
        const result = resolveCombat(state, player, movingArmy.power, defenderPlayer, defenderRawPower, {
          defenderStance: toNode.army ? toNode.army.stance : 'defend',
          terrainMult, heroVsCamp, forcedMarch,
        });

        const attackerRace = state.players[player].race;
        const defenderRace = defenderPlayer ? state.players[defenderPlayer].race : null;

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
          toNode.army = { owner: player, power: result.attackerSurvivorRaw, stance: 'defend', hero: movingArmy.hero };
          if (wasCamp) {
            toNode.garrison = 0;
            const rewardPl = state.players[player];
            rewardPl.supply += NEUTRAL_CAMP_REWARD.supply;
            rewardPl.influence += NEUTRAL_CAMP_REWARD.influence;
            state = drawCards(state, player, NEUTRAL_CAMP_REWARD.drawCards);
            pushLog(state, `${player}: ${fromNodeId} → ${toNodeId} 캠프 격파! 보상 획득 (물자+${NEUTRAL_CAMP_REWARD.supply} 영향력+${NEUTRAL_CAMP_REWARD.influence} 카드+${NEUTRAL_CAMP_REWARD.drawCards})`);
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
          fromNode.army = { owner: player, power: result.attackerSurvivorRaw, stance: 'defend', hero: movingArmy.hero };
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

export { ADJACENCY, DUMP_NODE_IDS, targetValid };

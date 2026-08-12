// M3 확장 맵 (2인 미러전, §4 영역 그래프 설계를 2인용으로 확장)
// M1/M2의 11노드 단일 전선을 폐기하고, 수도마다 "안전한 인컴 건물 설치 공간(후방)"과
// "실제로 다른 두 개의 전선(북쪽 성소로, 남쪽 캠프로)"을 갖는 구조로 바꿨다.
// 매립지(Dump) 3개도 북/중앙/남으로 분산시켜, 지배 승리 조건이 한쪽 전선만 밀어도
// 끝나지 않고 두 전선 모두를 신경 써야 하게 만든다.
//
// 수도 뒤 인컴 노드는 처음부터 건물이 지어져 있는 게 아니라, 종족별로 "건물을 지을 수
// 있는 빈 슬롯"을 몇 개 주는 것이 목적이다. 슬롯 개수는 종족 정체성에 따라 다르다
// (RACE_ECON_SLOTS) — 왕국/광신도는 2개(안정적인 이중 경제), 차원 괴물은 1개(소수 정예,
// 대신 그 한 자리의 건물이 차원문 레벨에 비례해 스스로 강해진다), 감염체는 3개(넓게 퍼뜨리는
// 확산형 경제, 개별 산출은 낮지만 포자 지대 위에서는 보너스를 받는다). 실제 슬롯이 어떤
// 카드로 채워지는지, 그리고 그 카드의 산출 공식이 종족마다 어떻게 다른지는 cards.js의
// BUILDING_INCOME을 참조.

export const NODE_TYPES = {
  capital: { label: '수도', defenseMult: 1.5 },
  territory: { label: '영지', defenseMult: 1.0 },
  sanctuary: { label: '성소', defenseMult: 1.0 },
  dump: { label: '자원 매립지', defenseMult: 1.0 },
  neutralCamp: { label: '중립 캠프', defenseMult: 1.0 },
};

export const NEUTRAL_CAMP_GARRISON = 6;
export const NEUTRAL_CAMP_REWARD = { supply: 3, drawCards: 1 };
export const STARTING_ARMY_POWER = 6;
export const MAP_VIEWBOX = { width: 1130, height: 690 };

// 공용 맵 뼈대 — 수도, 두 전선(북/남), 중앙 매립지. 종족과 무관하게 항상 동일하다.
export const CORE_NODE_NAMES = {
  C1: '수도 [유일 시조]', C2: '수도 [균열 감시자]',
  A1: '북부 국경지대', A2: '북부 고대 성소', DN: '북부 매립지',
  A3: '북부 고대 성소', A4: '북부 국경지대',
  B1: '남부 변경', CAMP1: '황무지 야영지', DS: '남부 매립지',
  CAMP2: '황무지 야영지', B2: '남부 변경',
  DC: '중앙 매립지',
};

export const CORE_NODES = {
  C1: { type: 'capital', x: 70, y: 340, owner: 'P1' },

  // 북부 전선 (성소 루트)
  A1: { type: 'territory', x: 320, y: 110, owner: null },
  A2: { type: 'sanctuary', x: 460, y: 120, owner: null },
  DN: { type: 'dump', x: 590, y: 150, owner: null },
  A3: { type: 'sanctuary', x: 720, y: 120, owner: null },
  A4: { type: 'territory', x: 860, y: 110, owner: null },

  // 남부 전선 (캠프 루트)
  B1: { type: 'territory', x: 320, y: 570, owner: null },
  CAMP1: { type: 'neutralCamp', x: 460, y: 620, owner: null },
  DS: { type: 'dump', x: 590, y: 590, owner: null },
  CAMP2: { type: 'neutralCamp', x: 720, y: 620, owner: null },
  B2: { type: 'territory', x: 860, y: 570, owner: null },

  // 중앙 매립지 — 두 전선의 매립지를 잇는 다리. 3개 매립지 지배 승리의 핵심.
  DC: { type: 'dump', x: 590, y: 370, owner: null },

  C2: { type: 'capital', x: 1060, y: 340, owner: 'P2' },
};

export const CORE_EDGES = [
  ['C1', 'A1'], ['C1', 'B1'],
  ['A1', 'A2'], ['A2', 'DN'], ['DN', 'A3'], ['A3', 'A4'], ['A4', 'C2'],
  ['B1', 'CAMP1'], ['CAMP1', 'DS'], ['DS', 'CAMP2'], ['CAMP2', 'B2'], ['B2', 'C2'],
  ['DN', 'DC'], ['DS', 'DC'],
];

export const DUMP_NODE_IDS = Object.keys(CORE_NODES).filter((id) => CORE_NODES[id].type === 'dump');

// 종족별 수도 인컴 슬롯 개수 — "건물을 지을 빈 공간"의 개수다. 슬롯 자체는 항상 무소유
// 건물 없이 시작한다(초기 건물 없음).
export const RACE_ECON_SLOTS = {
  kingdom: ['territory', 'sanctuary'],
  cultists: ['territory', 'sanctuary'],
  rift: ['territory'],
  infested: ['territory', 'territory', 'sanctuary'],
};

const ECON_SLOT_NAME = {
  kingdom: { territory: '왕실 곡창', sanctuary: '왕실 성소' },
  cultists: { territory: '순교자 농장', sanctuary: '피의 사원' },
  rift: { territory: '균열 전초지' },
  infested: { territory: '포자 서식지', sanctuary: '균사 사원' },
};

function econYOffsets(n) {
  if (n <= 1) return [0];
  const span = 260;
  return Array.from({ length: n }, (_, i) => -span / 2 + i * (span / (n - 1)));
}

// 종족 선택에 따라 그 라운드의 실제 맵(노드/엣지/이름/인접표)을 만든다. rules.js의
// initGame()이 라운드 시작 시 한 번 호출해 state.adjacency / state.nodeNames로 들고 있는다 —
// 종족에 따라 노드 수가 달라지므로 더 이상 모듈 레벨 상수로 둘 수 없다.
export function buildGameMap(races) {
  const nodes = { ...CORE_NODES };
  const nodeNames = { ...CORE_NODE_NAMES };
  const edges = [...CORE_EDGES];

  for (const side of ['P1', 'P2']) {
    const race = races[side] || 'kingdom';
    const slotTypes = RACE_ECON_SLOTS[race] || RACE_ECON_SLOTS.kingdom;
    const capitalId = side === 'P1' ? 'C1' : 'C2';
    const capital = CORE_NODES[capitalId];
    const dir = side === 'P1' ? 1 : -1;
    const offsets = econYOffsets(slotTypes.length);
    slotTypes.forEach((type, i) => {
      const id = `E_${side}_${i}`;
      nodes[id] = { type, x: capital.x + dir * 120, y: capital.y + offsets[i], owner: side };
      nodeNames[id] = (ECON_SLOT_NAME[race] && ECON_SLOT_NAME[race][type]) || (type === 'sanctuary' ? '변경 성소' : '변경 영지');
      edges.push([capitalId, id]);
    });
  }

  return { nodes, edges, nodeNames, adjacency: buildAdjacency(nodes, edges) };
}

export function buildAdjacency(nodes, edges) {
  const adj = {};
  for (const id of Object.keys(nodes)) adj[id] = [];
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

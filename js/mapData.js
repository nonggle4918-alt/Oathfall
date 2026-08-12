// M3 확장 맵 (2인 미러전, §4 영역 그래프 설계를 2인용으로 확장)
// M1/M2의 11노드 단일 전선을 폐기하고, 수도마다 "안전한 인컴 노드 2개(후방)"과
// "실제로 다른 두 개의 전선(북쪽 성소로, 남쪽 캠프로)"을 갖는 17노드 구조로 바꾼다.
// 매립지(Dump) 3개도 북/중앙/남으로 분산시켜, 지배 승리 조건이 한쪽 전선만 밀어도
// 끝나지 않고 두 전선 모두를 신경 써야 하게 만든다.

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

// 노드 이름표 (렌더링용). type만으로는 "왕실 곡창"과 "북부 성소"를 구분할 수 없어 별도 테이블로 관리.
export const NODE_NAMES = {
  C1: '수도 [유일 시조]', C2: '수도 [균열 감시자]',
  K1: '왕실 곡창', K2: '왕실 성소', K3: '변경 곡창', K4: '변경 성소',
  A1: '북부 국경지대', A2: '북부 고대 성소', DN: '북부 매립지',
  A3: '북부 고대 성소', A4: '북부 국경지대',
  B1: '남부 변경', CAMP1: '황무지 야영지', DS: '남부 매립지',
  CAMP2: '황무지 야영지', B2: '남부 변경',
  DC: '중앙 매립지',
};

export const NODES = {
  // P1 수도 + 후방 인컴 노드 (전선에서 벗어난 안전지대 — 건물 배치용)
  C1: { type: 'capital', x: 70, y: 340, owner: 'P1' },
  K1: { type: 'territory', x: 190, y: 210, owner: 'P1' },
  K2: { type: 'sanctuary', x: 190, y: 470, owner: 'P1' },

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

  // P2 수도 + 후방 인컴 노드
  K3: { type: 'territory', x: 940, y: 210, owner: 'P2' },
  K4: { type: 'sanctuary', x: 940, y: 470, owner: 'P2' },
  C2: { type: 'capital', x: 1060, y: 340, owner: 'P2' },
};

export const EDGES = [
  ['C1', 'K1'], ['C1', 'K2'], ['C1', 'A1'], ['C1', 'B1'],
  ['A1', 'A2'], ['A2', 'DN'], ['DN', 'A3'], ['A3', 'A4'], ['A4', 'C2'],
  ['B1', 'CAMP1'], ['CAMP1', 'DS'], ['DS', 'CAMP2'], ['CAMP2', 'B2'], ['B2', 'C2'],
  ['DN', 'DC'], ['DS', 'DC'],
  ['C2', 'K3'], ['C2', 'K4'],
];

export const DUMP_NODE_IDS = Object.keys(NODES).filter((id) => NODES[id].type === 'dump');

export function buildAdjacency() {
  const adj = {};
  for (const id of Object.keys(NODES)) adj[id] = [];
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

export const ADJACENCY = buildAdjacency();

export const MAP_VIEWBOX = { width: 1130, height: 690 };

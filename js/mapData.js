// M1 로컬 프로토타입용 축소 맵 (2인 미러전, §4 영역 그래프 설계를 2인용으로 축소)
// 원 기획은 4인 27노드지만, 왕국 vs 왕국 미러전 검증에는 좌우 대칭 11노드로 충분하다.
// 좌(P1) — 중앙 매립지 3개 — 우(P2) 구조. 두 수도 사이 모든 경로가 반드시
// 중앙 매립지(D1-D3-D2)를 거치도록 설계되어 있다 (§4의 핵심 요구사항).

export const NODE_TYPES = {
  capital: { label: '수도', supplyIncome: 3, influenceIncome: 1, researchIncome: 0, defenseMult: 1.5 },
  territory: { label: '영지', supplyIncome: 2, influenceIncome: 0, researchIncome: 0, defenseMult: 1.0 },
  sanctuary: { label: '성소', supplyIncome: 0, influenceIncome: 2, researchIncome: 0, defenseMult: 1.0 },
  dump: { label: '자원 매립지', supplyIncome: 2, influenceIncome: 2, researchIncome: 0, defenseMult: 1.0 },
  neutralCamp: { label: '중립 캠프', supplyIncome: 0, influenceIncome: 0, researchIncome: 0, defenseMult: 1.0 },
};

export const NEUTRAL_CAMP_GARRISON = 8;
export const NEUTRAL_CAMP_REWARD = { supply: 3, influence: 2, drawCards: 1 };
export const STARTING_ARMY_POWER = 6;

export const NODES = {
  C1: { type: 'capital', x: 70, y: 260, owner: 'P1' },
  T1: { type: 'territory', x: 210, y: 130, owner: 'P1' },
  N1: { type: 'neutralCamp', x: 210, y: 390, owner: null },
  S1: { type: 'sanctuary', x: 350, y: 90, owner: null },
  D1: { type: 'dump', x: 380, y: 260, owner: null },
  D3: { type: 'dump', x: 480, y: 260, owner: null },
  D2: { type: 'dump', x: 580, y: 260, owner: null },
  S2: { type: 'sanctuary', x: 610, y: 90, owner: null },
  N2: { type: 'neutralCamp', x: 750, y: 390, owner: null },
  T2: { type: 'territory', x: 750, y: 130, owner: 'P2' },
  C2: { type: 'capital', x: 890, y: 260, owner: 'P2' },
};

export const EDGES = [
  ['C1', 'T1'], ['C1', 'N1'],
  ['T1', 'S1'], ['N1', 'D1'],
  ['S1', 'D1'], ['D1', 'D3'],
  ['D3', 'D2'],
  ['D2', 'N2'], ['D2', 'S2'],
  ['N2', 'C2'], ['S2', 'T2'],
  ['T2', 'C2'],
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

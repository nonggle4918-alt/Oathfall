// 시청자(seat)별로 상대에게 숨겨야 할 필드를 지운 state 사본을 만든다.
// Durable Object 저장소에는 항상 완전한 미마스킹 state만 있고, 이 함수는 HTTP 응답을
// 만들 때만 호출된다 — 리턴값은 새로 만든 오브젝트라 원본 state를 건드리지 않는다.
//
// 가장 중요한 규칙: seed/rngCounter는 여기서 아예 필드로 만들지 않는다. cards.js의 덱
// 셔플과 rng.js의 전투 변동치가 전부 seed 결정론이라, seed가 새면 상대 덱 순서와 미래
// 전투 결과를 미리 계산당할 수 있다 — 손패를 숨기는 것보다 훨씬 치명적인 누출이다.

function countObj(count) {
  return { count };
}

export function redactStateForViewer(state, viewerSeat) {
  const players = {};
  for (const [seat, pl] of Object.entries(state.players)) {
    const isSelf = seat === viewerSeat;
    players[seat] = {
      ...pl,
      hand: isSelf ? pl.hand : [],
      handCount: pl.hand.length,
      deck: countObj(pl.deck.length),
      locked: countObj(pl.locked.length),
      // discard는 의도적으로 그대로 노출한다 — 어차피 state.log에 카드 이름이 이미
      // 다 찍혀 있어서 숨겨도 정보 이득이 없다.
    };
  }

  return {
    round: state.round,
    activePlayer: state.activePlayer,
    phase: state.phase,
    winner: state.winner,
    winReason: state.winReason,
    dumpDomination: state.dumpDomination,
    players,
    nodes: state.nodes,
    adjacency: state.adjacency,
    nodeNames: state.nodeNames,
    log: state.log,
    yourSeat: viewerSeat,
    isYourTurn: state.activePlayer === viewerSeat,
  };
}

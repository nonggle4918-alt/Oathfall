// 결정론적 시드 기반 난수. Math.random()은 절대 쓰지 않는다 (기획서 §2-3).
// 같은 (seed, counter) 입력은 항상 같은 결과를 낸다 — 리플레이·상호검증의 기반.

export function seededRandom(seed, counter) {
  let h = (seed ^ counter) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0, 1)
}

// -1 ~ +1 사이 변동폭으로 변환 (전투 변동치 ±10% 등에 사용)
export function seededVariance(seed, counter, magnitude) {
  const r = seededRandom(seed, counter); // [0,1)
  return 1 + (r * 2 - 1) * magnitude;
}

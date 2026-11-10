// 백그라운드 경기 계산 워커: 다른 감독들의 경기를 같은 엔진으로 끝까지 돌려 전체 기록 요약을 돌려줌
importScripts('data.js', 'engine.js', 'dx_core.js');
onmessage = function (e) {
  const j = e.data;
  try {
    const M = FMEngine.createMatch({ seed: j.seed, neutral: !!j.neutral, big: !!j.big, weather: j.weather, teams: [{ team: j.home, setup: j.hs, condition: j.hc }, { team: j.away, setup: j.as, condition: j.ac }], aiSides: [0, 1] });
    FMEngine.simulateToEnd(M);
    postMessage({ id: j.id, res: DXC.fullSummary(M) });
  } catch (err) { postMessage({ id: j.id, error: String(err && err.message || err) }); }
};

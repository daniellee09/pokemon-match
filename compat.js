// 궁합 계산: 찰떡 파트너와 천적
//
// 찰떡 파트너 = 성격 궁합 60% + 타입 보완 40%
//   성격 궁합: 가치관 축(이성↔직감, 장난↔진지)은 비슷할수록,
//             에너지 축(활발↔차분, 외향↔내향, 모험↔신중)은 서로 반대일수록 높음
//   타입 보완: 내 포켓몬의 약점 공격을 파트너가 버텨주고, 그 반대도 성립할수록 높음
//   단, 내 포켓몬에게 효과가 굉장한 공격을 가진 포켓몬은 파트너 후보에서 제외 (천적과 겹치지 않게)
// 천적 = 나를 효과가 굉장한 공격으로 치고, 내 공격은 잘 버티는 포켓몬
//        (동점이면 성격이 나와 정반대인 포켓몬)

const VALUE_AXES = [2, 4];     // T, P
const ENERGY_AXES = [0, 1, 3]; // E, S, B
const ALL_TYPES = Object.keys(TYPE_CHART);
const MATE_WEIGHT = { personality: 0.6, type: 0.4 };

function typeMult(atkType, defTypes) {
  return defTypes.reduce((m, t) => m * (TYPE_CHART[atkType][t] ?? 1), 1);
}

function weaknesses(p) {
  return ALL_TYPES.filter((t) => typeMult(t, p.types) > 1);
}

// defender가 attackTypes 공격을 얼마나 잘 버티는지 (0~1)
function coverScore(defender, attackTypes) {
  if (!attackTypes.length) return 0.5;
  const each = attackTypes.map((t) => {
    const m = typeMult(t, defender.types);
    return m < 1 ? 1 : m === 1 ? 0.3 : 0;
  });
  return each.reduce((a, b) => a + b, 0) / each.length;
}

// a, b: 5축 성향 벡터 (사람의 답변 벡터든 포켓몬 프로필이든 상관없음)
function personalityScore(a, b) {
  const span = 2 * CLIP;
  const sims = VALUE_AXES.map((i) => 1 - Math.abs(a[i] - b[i]) / span);
  const comps = ENERGY_AXES.map((i) => 1 - Math.abs(a[i] + b[i]) / span);
  const all = [...sims, ...comps];
  return all.reduce((x, y) => x + y, 0) / all.length;
}

function typeScore(me, p) {
  return (coverScore(p, weaknesses(me)) + coverScore(me, weaknesses(p))) / 2;
}

function compatScore(aVec, aMon, bVec, bMon) {
  const score = MATE_WEIGHT.personality * personalityScore(aVec, bVec) + MATE_WEIGHT.type * typeScore(aMon, bMon);
  return Math.round(score * 100);
}

function findPartner(user, me) {
  return POKEMON.filter((p) => p.id !== me.id && bestAttack(p, me).mult <= 1)
    .map((p) => ({ ...p, compat: compatScore(user, me, p.v, p) }))
    .sort((a, b) => b.compat - a.compat)[0];
}

// attacker의 타입 중 defender에게 가장 잘 먹히는 공격
function bestAttack(attacker, defender) {
  return attacker.types
    .map((t) => ({ type: t, mult: typeMult(t, defender.types) }))
    .sort((a, b) => b.mult - a.mult)[0];
}

function findNemesis(user, me) {
  const dist = (p) => Math.sqrt(p.v.reduce((s, x, i) => s + (x - user[i]) ** 2, 0));
  return POKEMON.filter((p) => p.id !== me.id)
    .map((p) => {
      const hit = bestAttack(p, me);
      const counter = bestAttack(me, p);
      return { ...p, hit, counter, edge: hit.mult / Math.max(counter.mult, 0.25), dist: dist(p) };
    })
    .filter((p) => p.hit.mult > 1)
    .sort((a, b) => b.edge - a.edge || b.dist - a.dist)[0];
}

// ── 근거 문장 ──

const joinTypes = (types) => types.join("·");

// A, B = { vec: 성향 벡터, mon: 포켓몬, label: 문장에서 부를 이름 }
function matchReasons(A, B) {
  const reasons = [];
  const a = A.vec, b = B.vec;

  // 성격: 가치관이 같은 축 1개 + 에너지가 보완되는 축 1개
  const same = VALUE_AXES
    .filter((i) => Math.abs(b[i]) >= 0.5 && Math.sign(b[i]) === Math.sign(a[i]))
    .sort((x, y) => Math.abs(a[x] - b[x]) - Math.abs(a[y] - b[y]))[0];
  if (same !== undefined) {
    const adj = ADJ[AXES[same].key][b[same] > 0 ? 0 : 1];
    reasons.push(["성격", `둘 다 ${adj} 편이라 말이 잘 통해요`]);
  }
  const comp = ENERGY_AXES
    .filter((i) => Math.abs(a[i]) >= 0.5 && Math.abs(b[i]) >= 0.5 && Math.sign(a[i]) !== Math.sign(b[i]))
    .sort((x, y) => Math.abs(a[x] + b[x]) - Math.abs(a[y] + b[y]))[0];
  if (comp !== undefined) {
    const key = AXES[comp].key;
    const mine = ADJ[key][a[comp] > 0 ? 0 : 1];
    const theirs = ADJ[key][b[comp] > 0 ? 0 : 1];
    reasons.push(["성격", `${josa(A.label, "은", "는")} ${mine} 편, ${josa(B.label, "은", "는")} ${theirs} 편이라 서로 균형을 맞춰줘요`]);
  }

  // 배틀: 서로의 약점을 막아주는지
  const me = A.mon, p = B.mon;
  if (me.id === p.id) {
    reasons.push(["배틀", `둘 다 ${josa(me.name, "이라", "라")} 서로의 강점과 약점을 누구보다 잘 알아요`]);
  } else {
    const covered = weaknesses(me).filter((t) => typeMult(t, p.types) < 1);
    if (covered.length) {
      reasons.push(["배틀", `${me.name}의 약점인 ${joinTypes(covered)} 공격을 ${josa(p.name, "이", "가")} 버텨줘요`]);
    }
    const coveredBack = weaknesses(p).filter((t) => typeMult(t, me.types) < 1);
    if (coveredBack.length) {
      reasons.push(["배틀", `반대로 ${p.name}의 약점인 ${joinTypes(coveredBack)} 공격은 ${josa(me.name, "이", "가")} 막아줘요`]);
    }
  }

  // 보너스: 게임 속 같은 알 그룹
  const egg = me.eggGroups.filter((g) => g !== "미발견" && p.eggGroups.includes(g));
  if (egg.length && me.id !== p.id) {
    reasons.push(["보너스", `게임에서도 같은 ‘${egg[0]}’ 알 그룹이라 사이가 좋아요`]);
  }

  return reasons;
}

function partnerReasons(user, me, p) {
  return matchReasons({ vec: user, mon: me, label: "당신" }, { vec: p.v, mon: p, label: p.name });
}

// 친구 궁합: 서로 상대를 효과가 굉장한 공격으로 칠 수 있으면 '티격태격' 한 줄 추가
function friendReasons(me, friend) {
  const reasons = matchReasons(me, friend);
  const dist = Math.sqrt(me.vec.reduce((sum, x, i) => sum + (x - friend.vec[i]) ** 2, 0));
  if (dist < 1.5) {
    reasons.unshift(["성격", "둘은 성격이 거울처럼 닮았어요. 함께 있으면 편하지만, 서로 채워주는 맛은 조금 덜할 수 있어요"]);
  }
  if (me.mon.id !== friend.mon.id) {
    const hit = bestAttack(friend.mon, me.mon);
    const back = bestAttack(me.mon, friend.mon);
    if (hit.mult > 1 || back.mult > 1) {
      const [atk, def, h] = hit.mult >= back.mult ? [friend.mon, me.mon, hit] : [me.mon, friend.mon, back];
      reasons.push(["주의", `배틀에선 ${atk.name}의 ${h.type} 공격이 ${def.name}에게 ${h.mult}배라 가끔 티격태격할지도 몰라요`]);
    }
  }
  return reasons;
}

// 무작위 두 사람 2만 쌍 시뮬레이션 기준: 상위 약 10% / 25% / 50% / 85% / 나머지
const COMPAT_GRADES = [
  [75, "운명의 파트너"],
  [69, "찰떡궁합"],
  [62, "든든한 동료"],
  [52, "알아가는 사이"],
  [0, "라이벌"],
];
const compatGrade = (score) => COMPAT_GRADES.find(([min]) => score >= min)[1];

const EFFECT = (m) =>
  m === 0 ? "효과가 없어요 (0배)"
  : m < 1 ? `효과가 별로예요 (${m}배)`
  : m === 1 ? "보통이에요 (1배)"
  : `효과가 굉장해요 (${m}배)`;

function nemesisReasons(user, me, n) {
  const reasons = [
    ["상성", `${n.name}의 ${n.hit.type} 공격은 ${me.name}에게 ${EFFECT(n.hit.mult)}`],
    ["상성", `${me.name}의 ${n.counter.type} 공격은 ${n.name}에게 ${EFFECT(n.counter.mult)}`],
  ];
  const opposite = AXES.map((a, i) => i).filter((i) => Math.abs(user[i] - n.v[i]) >= 2);
  if (opposite.length) {
    const i = opposite[0];
    const key = AXES[i].key;
    reasons.push(["성격", `당신은 ${ADJ[key][user[i] > 0 ? 0 : 1]} 편인데 ${josa(n.name, "은", "는")} ${ADJ[key][n.v[i] > 0 ? 0 : 1]} 편이라 부딪히기 쉬워요`]);
  }
  return reasons;
}

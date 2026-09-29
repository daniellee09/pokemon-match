const IMG_URL = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 공식 타입 색상 (light: 밝은 배경이라 글자를 어둡게)
const TYPE_COLOR = {
  노말: ["#9fa19f", true], 불꽃: ["#e62829"], 물: ["#2980ef"], 전기: ["#fac000", true],
  풀: ["#3fa129"], 얼음: ["#3dcef3", true], 격투: ["#ff8000"], 독: ["#9141cb"],
  땅: ["#915121"], 비행: ["#81b9ef", true], 에스퍼: ["#ef4179"], 벌레: ["#91a119"],
  바위: ["#afa981", true], 고스트: ["#704170"], 드래곤: ["#5060e1"], 악: ["#624d4e"],
  강철: ["#60a1b8"], 페어리: ["#ef70ef"],
};

// 질문·선택지는 매번 섞어서 보여주지만, answers는 항상 원래 순서(QUESTIONS 기준 번호)로 저장한다.
// 그래야 결과 계산과 초대 링크(?from=...)가 섞는 순서와 상관없이 똑같이 동작한다.
let current = 0;       // 지금 몇 번째로 보여주는 질문인지 (0 ~ 9)
let order = [];        // 보여줄 질문 순서: order[current] = QUESTIONS 번호
let optionOrder = [];  // optionOrder[질문 번호] = 보여줄 선택지 순서
let answers = [];      // answers[질문 번호] = 고른 선택지의 원래 번호
let lastShare = "";
let lastBest = null; // 초대 문구에 넣을 내 포켓몬

// 친구 초대 링크: ?from=0123012301&name=닉네임 (from = 초대한 사람의 답변 번호 10자리)
const invite = parseInvite();

function parseInvite() {
  const params = new URLSearchParams(location.search);
  const ans = (params.get("from") || "").split("").map(Number);
  const valid = ans.length === QUESTIONS.length &&
    ans.every((a, i) => Number.isInteger(a) && a >= 0 && a < QUESTIONS[i].options.length);
  if (!valid) return null;
  const name = (params.get("name") || "").trim().slice(0, 10);
  return { answers: ans, label: name ? `${name}님` : "친구" };
}

const esc = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");
}

function lcd(text) {
  $("lcd").textContent = text;
}

function shuffled(n) {
  const arr = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderQuestion() {
  const qi = order[current];
  const item = QUESTIONS[qi];
  const pct = (current / QUESTIONS.length) * 100;
  $("qCount").textContent = `Q${current + 1} / ${QUESTIONS.length}`;
  $("trackFill").style.width = `${pct}%`;
  $("trackBall").style.left = `${pct}%`;
  $("trackBall").style.transform = `translate(-50%, -50%) rotate(${current * 72}deg)`;
  $("qText").textContent = item.q;
  $("backBtn").style.visibility = current === 0 ? "hidden" : "visible";
  lcd(`SCANNING ${current + 1}/${QUESTIONS.length}`);

  const box = $("options");
  box.classList.remove("locked");
  box.innerHTML = "";
  optionOrder[qi].forEach((oi) => {
    const btn = document.createElement("button");
    btn.className = "option";
    if (answers[qi] === oi) btn.classList.add("picked"); // 이전 질문으로 돌아왔을 때 고른 답 표시
    btn.textContent = item.options[oi].text;
    btn.onclick = () => choose(oi, btn);
    box.appendChild(btn);
  });
}

// 선택 표시를 잠깐 보여준 뒤 다음 질문으로
async function choose(oi, btn) {
  $("options").classList.add("locked");
  $("options").querySelectorAll(".picked").forEach((b) => b.classList.remove("picked"));
  btn.classList.add("picked");
  answers[order[current]] = oi;
  await wait(REDUCED_MOTION ? 0 : 220);
  current++;
  if (current < QUESTIONS.length) {
    renderQuestion();
    show("quiz");
  } else {
    showResult();
  }
}

// 답변 합계를 축마다 표준화(z-score)해서 포켓몬 프로필(전체 기준 z-score)과 같은 척도로 맞춤.
// 단순 합계를 쓰면 답이 서로 상쇄되어 대부분 중앙으로 몰리기 때문.
const CLIP = 2.5;
const clip = (x) => Math.max(-CLIP, Math.min(CLIP, x));

function userVector(ans = answers) {
  return AXES.map(({ key }) => {
    let total = 0, mean = 0, variance = 0;
    QUESTIONS.forEach((item, qi) => {
      const vals = item.options.map((o) => o.score[key] || 0);
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      mean += m;
      variance += vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
      total += item.options[ans[qi]].score[key] || 0;
    });
    return clip((total - mean) / Math.sqrt(variance));
  });
}

const MAX_DIST = Math.sqrt(AXES.length * (2 * CLIP) ** 2); // 모든 축이 정반대 끝일 때

// 성향 벡터로 만든 숫자. 같은 답변이면 항상 같은 값이 나온다.
function vectorHash(user) {
  return user.reduce((h, x) => Math.imul(h ^ Math.round((x + CLIP) * 1000), 2654435761) >>> 0, 7);
}

// 가까운 순으로 정렬. 반올림한 싱크로율이 아니라 실제 거리로 비교한다.
// 거리가 정확히 같으면(예: 종족값까지 똑같은 바오프·야나프·앗차프) 답변에서 나온 숫자로 순서를 정해서,
// 도감 번호가 앞선 포켓몬만 항상 이기지 않고 답변에 따라 셋 다 나올 수 있게 한다.
function rank(user) {
  const h = vectorHash(user);
  const tieKey = (id) => Math.imul(id ^ h, 2246822519) >>> 0;
  return POKEMON.map((p) => {
    const d = Math.sqrt(p.v.reduce((sum, x, i) => sum + (x - user[i]) ** 2, 0));
    return { ...p, dist: d, match: Math.round((1 - d / MAX_DIST) * 100) };
  }).sort((a, b) => (Math.abs(a.dist - b.dist) > 1e-9 ? a.dist - b.dist : tieKey(a.id) - tieKey(b.id)));
}

const TRAIT = {
  E: ["재빠르고 활동적인", "느긋하고 차분한"],
  S: ["사람들과 어울리길 좋아하는", "혼자만의 세계가 있는"],
  T: ["머리를 쓰는 전략가", "몸으로 부딪히는 행동파"],
  B: ["먼저 치고 나가는 모험가", "지키는 데 강한 신중파"],
  P: ["장난기 넘치는", "진지하고 묵직한"],
};

// 받침 유무에 따라 조사 선택: josa("피카츄", "은", "는") → "피카츄는"
function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

// 나와 포켓몬이 같은 방향으로 강한 축 2개를 골라 공통점 문장을 만든다
function commonTraits(user, p) {
  const picks = AXES.map((a, i) => ({ a, i, score: user[i] * p.v[i] }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
    .map(({ a, i }) => TRAIT[a.key][p.v[i] > 0 ? 0 : 1]);
  if (picks.length === 0) return `${josa(p.name, "과", "와")} 당신은 서로 다른 매력으로 균형을 이루는 사이예요.`;
  return `당신과 ${josa(p.name, "은", "는")} 둘 다 ${picks.join(", ")} 타입이에요.`;
}

// ── 판단 근거: 원본 수치 대신 "결론 + 쉬운 이유"로 보여준다 ──

const ADJ = {
  E: ["활발한", "차분한"], S: ["외향적인", "내향적인"], T: ["이성적인", "직감적인"],
  B: ["모험적인", "신중한"], P: ["장난스러운", "진지한"],
};

function conclusion(key, v) {
  if (Math.abs(v) < 0.5) return "중간";
  const adj = ADJ[key][v > 0 ? 0 : 1];
  return Math.abs(v) >= 1.2 ? `매우 ${adj} 편` : `${adj} 편`;
}

// 전체 포켓몬 중 위치: "상위 12%" / "하위 8%"
function rankText(value, all) {
  const below = all.filter((x) => x < value).length / all.length;
  return below >= 0.5
    ? `상위 ${Math.max(1, Math.round((1 - below) * 100))}%`
    : `하위 ${Math.max(1, Math.round(below * 100) + 1)}%`;
}

const ALL_SPEED = POKEMON.map((p) => p.stats.spe);
// 절(clause)마다 [이어지는 형태, 끝나는 형태]를 두고 자연스럽게 한 문장으로 잇는다
function sentence(clauses) {
  return clauses.map((c, i) => (i === clauses.length - 1 ? c[1] : c[0])).join(", ");
}

const HABITAT_TEXT = {
  도시: "사람 사는 도시 근처에 살", 초원: "탁 트인 초원에 살", 물가: "물가에 살",
  숲: "숲에 살", 바다: "바다에 살", 험지: "험한 지형에 살",
  산: "깊은 산에 살", 동굴: "어두운 동굴에 살",
};

function reason(p, key) {
  const s = p.stats, b = p.basis;
  switch (key) {
    case "E":
      return `1~5세대 중 스피드 ${rankText(s.spe, ALL_SPEED)}`;
    case "S": {
      if (p.legendary) return "홀로 지내는 전설·환상의 포켓몬이에요";
      const c = [];
      if (b.habitat === "희귀") c.push(["좀처럼 모습을 드러내지 않고", "좀처럼 모습을 드러내지 않아요"]);
      else if (HABITAT_TEXT[b.habitat]) c.push([`${HABITAT_TEXT[b.habitat]}고`, `${HABITAT_TEXT[b.habitat]}아요`]);
      if (p.capture >= 120) c.push(["야생에서 흔히 보이며", "야생에서 흔히 보여요"]);
      else if (p.capture <= 45) c.push(["야생에서 보기 드물며", "야생에서 보기 드물어요"]);
      else c.push(["야생에서 가끔 보이며", "야생에서 가끔 보여요"]);
      if (p.happiness > 70) c.push(["사람을 잘 따르고", "사람을 잘 따라요"]);
      if (p.happiness < 70) c.push(["사람과 쉽게 친해지지 않고", "사람과 쉽게 친해지지 않아요"]);
      return sentence(c);
    }
    case "T": {
      const diff = s.spa - s.atk;
      if (Math.abs(diff) <= 10) return "힘과 특수 능력을 고루 써서 싸워요";
      return diff > 0 ? "힘보다 특수 능력(초능력·원소 기술)으로 싸워요" : "특수 능력보다 힘으로 부딪혀 싸워요";
    }
    case "B": {
      const diff = s.atk + s.spa - (s.def + s.spd);
      if (Math.abs(diff) <= 15) return "공격과 방어가 균형 잡혀 있어요";
      return diff > 0 ? "버티기보다 공격이 특기예요" : "공격보다 버티기가 특기예요";
    }
    case "P": {
      const c = [];
      const playful = b.playTypes.filter((t) => t.bonus > 0).map((t) => t.type);
      const serious = b.playTypes.filter((t) => t.bonus < 0).map((t) => t.type);
      if (playful.length) c.push([`${playful.join("·")} 타입이라 장난기가 있고`, `${playful.join("·")} 타입이라 장난기가 있어요`]);
      if (serious.length) c.push([`${serious.join("·")} 타입이라 묵직하고`, `${serious.join("·")} 타입이라 묵직해요`]);
      const words = [...b.playWords, ...b.seriousWords].map((w) => `‘${w}’`).join(", ");
      if (words) c.push([`도감에 ${words} 같은 말이 나오고`, `도감에 ${words} 같은 말이 나와요`]);
      return c.length ? sentence(c) : "성격을 드러내는 특징이 뚜렷하지 않아요";
    }
  }
}

function renderResult(user, best, rest) {
  const [mainType] = best.types;
  document.documentElement.style.setProperty("--type", TYPE_COLOR[mainType]?.[0] || "#9fa19f");

  const no = `No.${String(best.id).padStart(3, "0")}`;
  $("rNo").textContent = no;
  $("rGenus").textContent = `${best.gen}세대 · ${best.genus}`;
  $("rName").textContent = best.name;
  $("rImg").src = IMG_URL(best.id);
  $("rImg").alt = best.name;
  $("rMatch").textContent = `${best.match}%`;
  $("rGauge").style.setProperty("--pct", best.match);
  $("rTypes").innerHTML = typeBadges(best.types);

  const summary = commonTraits(user, best);
  $("rDesc").textContent = summary;
  $("rFlavor").textContent = best.flavor ? `“${best.flavor}”` : "";
  $("rFlavor").hidden = !best.flavor;

  const pos = (v) => ((v + CLIP) / (2 * CLIP)) * 100;
  $("rAxes").innerHTML = AXES.map((a, i) => `
    <div class="axis-row">
      <div class="axis">
        <span>${a.minus}</span>
        <div class="bar">
          <div class="dot pk" style="left:${pos(best.v[i])}%"></div>
          <div class="dot me" style="left:${pos(user[i])}%"></div>
        </div>
        <span>${a.plus}</span>
      </div>
      <p class="basis"><b>${conclusion(a.key, best.v[i])}</b> · ${reason(best, a.key)}</p>
    </div>`).join("");

  $("rOthers").innerHTML = rest.slice(0, 3).map((p) => `
    <div class="other">
      <img src="${IMG_URL(p.id)}" alt="${p.name}" loading="lazy" />
      <span class="no">No.${String(p.id).padStart(3, "0")}</span>
      <strong>${p.name}</strong>
      <span>${p.match}%</span>
    </div>`).join("");

  const partner = findPartner(user, best);
  const nemesis = findNemesis(user, best);
  $("rPartner").innerHTML = mateCard("partner", "찰떡 파트너", partner, `${partner.compat}%`, "궁합", partnerReasons(user, best, partner));
  $("rNemesis").innerHTML = nemesis
    ? mateCard("nemesis", "천적", nemesis, `${nemesis.hit.mult}배`, "상성", nemesisReasons(user, best, nemesis))
    : "";

  const friendLine = renderFriend(user, best);
  lastBest = best;

  selectTab("panelWhy");
  lastShare = `나와 닮은 포켓몬은 ${no} ${best.name}! (싱크로율 ${best.match}%)\n${summary}\n찰떡 파트너: ${partner.name} (궁합 ${partner.compat}%)${friendLine}`;
  lcd(`${no} ${best.name}`);
}

function typeBadges(types) {
  return types.map((t) => {
    const [color, light] = TYPE_COLOR[t] || ["#9fa19f"];
    return `<span class="type${light ? " light" : ""}" style="background:${color}">${t}</span>`;
  }).join("");
}

// 초대 링크로 들어온 경우: 초대한 사람과의 궁합 카드
function renderFriend(user, best) {
  const box = $("rFriend");
  box.hidden = !invite;
  if (!invite) return "";

  const friendVec = userVector(invite.answers);
  const [friendMon] = rank(friendVec);
  const score = compatScore(user, best, friendVec, friendMon);
  const grade = compatGrade(score);
  const reasons = friendReasons(
    { vec: user, mon: best, label: "당신" },
    { vec: friendVec, mon: friendMon, label: invite.label },
  );

  box.innerHTML = `
    <p class="mate-label">${esc(josa(invite.label, "과", "와"))}의 궁합</p>
    <div class="duo">
      <figure>
        <img src="${IMG_URL(best.id)}" alt="${best.name}" />
        <figcaption><small>나</small><strong>${best.name}</strong></figcaption>
      </figure>
      <div class="duo-score"><strong>${score}%</strong><span>${grade}</span></div>
      <figure>
        <img src="${IMG_URL(friendMon.id)}" alt="${friendMon.name}" />
        <figcaption><small>${esc(invite.label)}</small><strong>${friendMon.name}</strong></figcaption>
      </figure>
    </div>
    <ul class="mate-reasons">
      ${reasons.map(([tag, text]) => `<li><span class="tag">${tag}</span>${esc(text)}</li>`).join("")}
    </ul>`;
  return `\n${josa(invite.label, "과", "와")} 나의 포켓몬 궁합: ${score}% (${grade})`;
}

function mateCard(kind, label, p, score, scoreLabel, reasons) {
  return `
    <article class="mate ${kind}">
      <p class="mate-label">${label}</p>
      <div class="mate-main">
        <img src="${IMG_URL(p.id)}" alt="${p.name}" loading="lazy" />
        <div class="mate-info">
          <span class="no">No.${String(p.id).padStart(3, "0")}</span>
          <strong>${p.name}</strong>
          <div class="types">${typeBadges(p.types)}</div>
        </div>
        <div class="mate-score"><strong>${score}</strong><span>${scoreLabel}</span></div>
      </div>
      <ul class="mate-reasons">
        ${reasons.map(([tag, text]) => `<li><span class="tag">${tag}</span>${esc(text)}</li>`).join("")}
      </ul>
    </article>`;
}

// 몬스터볼 흔들림 → 섬광 → 결과 공개
async function showResult() {
  const user = userVector();
  const [best, ...rest] = rank(user);

  // 연출 중에 이미지를 미리 받아둔다
  const preload = new Image();
  preload.src = IMG_URL(best.id);

  const dex = document.querySelector(".dex");
  if (!REDUCED_MOTION) {
    dex.classList.add("busy");
    lcd("ANALYZING...");
    show("reveal");
    await wait(1500);
    $("reveal").classList.add("flashing");
    await wait(300);
  }
  renderResult(user, best, rest);
  show("result");
  $("reveal").classList.remove("flashing");
  dex.classList.remove("busy");
  document.querySelector(".dex").scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
}

function selectTab(panelId) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.panel === panelId;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === panelId));
}

const SITE_URL = `${location.origin}${location.pathname}`; // 초대 코드(?from=...)가 없는 기본 주소

// 문구와 링크를 하나의 텍스트로 합쳐서 보낸다.
// share()에 url을 따로 넘기면 공유 시트의 '복사'나 카카오톡 등에서 문구가 빠지고 링크만 전달되기 때문.
async function shareMessage(text, url, copiedMsg) {
  const message = `${text}\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ text: message });
      return;
    }
  } catch (err) {
    if (err.name === "AbortError") return; // 사용자가 공유 시트를 닫음
  }
  await copyMessage(message, copiedMsg);
}

async function copyMessage(message, copiedMsg) {
  try {
    await navigator.clipboard.writeText(message);
    toast(copiedMsg);
  } catch {
    toast("복사하지 못했어요. 다시 시도해 주세요.");
  }
}

function share() {
  return shareMessage(lastShare, SITE_URL, "결과를 클립보드에 복사했어요!");
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2000);
}

function inviteUrl() {
  const params = new URLSearchParams({ from: answers.join("") });
  const name = $("nickname").value.trim().slice(0, 10);
  if (name) params.set("name", name);
  return `${SITE_URL}?${params}`;
}

function sendInvite() {
  return shareMessage(inviteText(), inviteUrl(), "초대 문구와 링크를 복사했어요! 친구에게 보내보세요.");
}

function copyInvite() {
  return copyMessage(`${inviteText()}\n${inviteUrl()}`, "초대 문구와 링크를 복사했어요! 친구에게 보내보세요.");
}

function inviteText() {
  const name = $("nickname").value.trim().slice(0, 10);
  const who = name ? `${name}님` : "이 트레이너";
  return [
    `📟 도감 No.${String(lastBest.id).padStart(3, "0")} ${lastBest.name} 등록 완료!`,
    `${josa(who, "과", "와")} 짝이 될 포켓몬을 찾고 있어요.`,
    "당신의 포켓몬을 스캔하고 궁합을 확인하세요.",
  ].join("\n");
}

function restart() {
  current = 0;
  answers = [];
  order = shuffled(QUESTIONS.length);
  optionOrder = QUESTIONS.map((q) => shuffled(q.options.length));
  renderQuestion();
  show("quiz");
}

// 시작 화면: 초대받았으면 친구 포켓몬의 실루엣, 아니면 매번 다른 포켓몬 실루엣
if (invite) {
  const [friendMon] = rank(userVector(invite.answers));
  $("silhouette").src = IMG_URL(friendMon.id);
  $("inviteBanner").hidden = false;
  $("inviteBanner").textContent = `${josa(invite.label, "이", "가")} 포켓몬 궁합을 보자고 초대했어요!`;
  $("startBtn").textContent = "나도 스캔하고 궁합 보기";
  lcd("INVITED");
} else {
  const randomMon = POKEMON[Math.floor(Math.random() * POKEMON.length)];
  $("silhouette").src = IMG_URL(randomMon.id);
}

$("startBtn").onclick = restart;
$("retryBtn").onclick = restart;
$("shareBtn").onclick = share;
$("inviteToggle").onclick = () => {
  $("inviteBox").hidden = !$("inviteBox").hidden;
  if (!$("inviteBox").hidden) $("nickname").focus();
};
$("inviteSend").onclick = sendInvite;
$("inviteCopy").onclick = copyInvite;
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => selectTab(t.dataset.panel)));
$("backBtn").onclick = () => {
  if (current > 0) {
    current--;
    renderQuestion();
  }
};

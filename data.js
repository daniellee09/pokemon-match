// 성향 축 (값은 151마리 기준 z-score, -2.5 ~ +2.5)
//   E: 활발(+)  ↔ 차분(-)
//   S: 외향(+)  ↔ 내향(-)
//   T: 이성(+)  ↔ 직감(-)
//   B: 모험(+)  ↔ 신중(-)
//   P: 장난(+)  ↔ 진지(-)
const AXES = [
  { key: "E", plus: "활발", minus: "차분" },
  { key: "S", plus: "외향", minus: "내향" },
  { key: "T", plus: "이성", minus: "직감" },
  { key: "B", plus: "모험", minus: "신중" },
  { key: "P", plus: "장난", minus: "진지" },
];

const QUESTIONS = [
  {
    q: "주말 아침, 눈을 뜬 당신은?",
    options: [
      { text: "바로 밖으로 나간다", score: { E: 2, B: 1 } },
      { text: "친구들에게 연락해서 약속을 잡는다", score: { S: 2, E: 1 } },
      { text: "이불 속에서 조금만 더 뒹군다", score: { E: -2, P: 1 } },
      { text: "미뤄둔 책이나 공부를 꺼낸다", score: { T: 2, E: -1, P: -1 } },
    ],
  },
  {
    q: "친구들과 모였을 때 나는?",
    options: [
      { text: "분위기를 띄우는 분위기 메이커", score: { S: 2, P: 2 } },
      { text: "조용히 이야기를 들어주는 편", score: { S: -2, E: -1 } },
      { text: "장소와 일정을 챙기는 진행 담당", score: { T: 2, P: -1 } },
      { text: "갑자기 엉뚱한 제안을 던지는 사람", score: { B: 2, P: 1 } },
    ],
  },
  {
    q: "어려운 문제를 만났을 때?",
    options: [
      { text: "차근차근 분석하고 계획을 세운다", score: { T: 2, B: -1 } },
      { text: "일단 부딪혀 본다", score: { B: 2, E: 1, T: -1 } },
      { text: "주변 사람들에게 도움을 청한다", score: { S: 2, T: -1 } },
      { text: "잠깐 쉬면서 머리를 식힌다", score: { E: -2, P: 1 } },
    ],
  },
  {
    q: "여행을 떠난다면?",
    options: [
      { text: "시간 단위로 촘촘하게 계획한다", score: { T: 2, P: -2 } },
      { text: "발길 닿는 대로 즉흥 여행", score: { B: 1, P: 2, T: -1 } },
      { text: "조용한 휴양지에서 푹 쉰다", score: { E: -2, B: -1 } },
      { text: "번지점프, 서핑 같은 액티비티!", score: { E: 2, B: 2 } },
    ],
  },
  {
    q: "친구가 고민을 털어놓으면?",
    options: [
      { text: "끝까지 공감하며 들어준다", score: { T: -2, S: 1 } },
      { text: "현실적인 해결책을 알려준다", score: { T: 2 } },
      { text: "장난으로 기분부터 풀어준다", score: { P: 2, S: 1 } },
      { text: "같이 화내주고 편들어준다", score: { E: 1, B: 1, T: -1 } },
    ],
  },
  {
    q: "나를 가장 잘 표현하는 단어는?",
    options: [
      { text: "열정", score: { E: 2, B: 1 } },
      { text: "침착", score: { E: -1, T: 1, P: -1 } },
      { text: "다정", score: { S: 1, T: -2 } },
      { text: "자유", score: { P: 2, B: 1 } },
    ],
  },
  {
    q: "새 학기, 새 회사처럼 낯선 환경에서는?",
    options: [
      { text: "내가 먼저 말을 건다", score: { S: 2, B: 1 } },
      { text: "분위기를 살피며 천천히 적응한다", score: { S: -1, B: -2 } },
      { text: "혼자 지내도 별로 상관없다", score: { S: -2, T: 1 } },
      { text: "재밌는 일부터 찾아다닌다", score: { P: 2, E: 1 } },
    ],
  },
  {
    q: "가장 좋아하는 날씨는?",
    options: [
      { text: "햇볕 쨍쨍한 여름날", score: { E: 2 } },
      { text: "빗소리 들리는 비 오는 날", score: { E: -1, T: -1, S: -1 } },
      { text: "눈 내리는 조용한 겨울", score: { E: -1, P: -1, T: 1 } },
      { text: "천둥번개 치는 날", score: { B: 2, E: 1 } },
    ],
  },
  {
    q: "팀 게임에서 내가 맡는 역할은?",
    options: [
      { text: "맨 앞에서 돌격하는 공격수", score: { B: 2, E: 1 } },
      { text: "팀원을 챙기는 힐러·서포터", score: { S: 1, B: -1, T: -1 } },
      { text: "판을 읽는 전략가", score: { T: 2 } },
      { text: "혼자 맵 구석구석 탐험", score: { S: -2, P: 1 } },
    ],
  },
  {
    q: "규칙에 대한 나의 생각은?",
    options: [
      { text: "정해진 규칙은 반드시 지킨다", score: { P: -2, B: -1 } },
      { text: "이유가 납득되면 지킨다", score: { T: 2 } },
      { text: "상황에 따라 유연하게", score: { P: 1, T: -1 } },
      { text: "규칙은 깨라고 있는 것!", score: { P: 2, B: 2 } },
    ],
  },
];

// 포켓몬 프로필은 pokemon-data.js (scripts/build_data.py 로 생성)

# 나와 닮은 포켓몬 찾기

질문 10개에 답하면 1세대 포켓몬 151마리 중 성격이 가장 닮은 포켓몬을 찾아주는 웹서비스예요.
찰떡 파트너·천적, 친구와의 궁합(초대 링크)도 볼 수 있어요.

## 구성
- `index.html`, `style.css`, `app.js`: 화면과 퀴즈 로직
- `data.js`: 질문과 성향 축
- `compat.js`: 궁합 계산 (찰떡 파트너, 천적, 친구 궁합)
- `pokemon-data.js`: 151마리 성향 프로필과 타입 상성표 (자동 생성)
- `scripts/build_data.py`: PokeAPI에서 데이터를 받아 `pokemon-data.js`를 만드는 스크립트

## 로컬 실행
```bash
python3 -m http.server 8000
```

## 데이터 다시 만들기
```bash
python3 scripts/build_data.py
```

데이터 출처: [PokeAPI](https://pokeapi.co) · 포켓몬 이미지 및 명칭 © Nintendo / Creatures / GAME FREAK. 비상업 팬 프로젝트입니다.

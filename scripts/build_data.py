"""PokeAPI 데이터로 1~5세대 포켓몬 649마리의 성향 프로필을 만든다.

실행: python3 scripts/build_data.py
결과: pokemon-data.js (웹페이지에서 그대로 불러 씀)

각 축은 아래 공식으로 원점수(raw)를 계산한 뒤 전체 기준으로 표준화(z-score)한다.
서식지 데이터는 1~3세대에만 있어서, 4~5세대는 서식지 보정을 0(중립)으로 둔다.
  E 활발↔차분 = 스피드
  S 외향↔내향 = 친밀도 + 포획률 + 서식지 보정 (전설/환상은 감점)
  T 이성↔직감 = 특수공격 - 공격 (머리로 싸우나, 몸으로 싸우나)
  B 모험↔신중 = (공격 + 특수공격) - (방어 + 특수방어)
  P 장난↔진지 = 타입 보정 + 도감 설명(한국어 전체 버전) 키워드
"""

import json
import re
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "cache"
OUT = ROOT / "pokemon-data.js"
API = "https://pokeapi.co/api/v2"
CLIP = 2.5
LAST_ID = 649  # 5세대 마지막 (게노세크트)
GEN_NO = {"generation-i": 1, "generation-ii": 2, "generation-iii": 3, "generation-iv": 4, "generation-v": 5}

TYPE_KO = {
    "normal": "노말", "fire": "불꽃", "water": "물", "electric": "전기", "grass": "풀",
    "ice": "얼음", "fighting": "격투", "poison": "독", "ground": "땅", "flying": "비행",
    "psychic": "에스퍼", "bug": "벌레", "rock": "바위", "ghost": "고스트", "dragon": "드래곤",
    "dark": "악", "steel": "강철", "fairy": "페어리",
}

HABITAT = {  # 서식지 → 외향 보정
    "urban": ("도시", 1.5), "grassland": ("초원", 1.0), "waters-edge": ("물가", 0.5),
    "forest": ("숲", 0.0), "sea": ("바다", 0.0), "rough-terrain": ("험지", -0.5),
    "mountain": ("산", -1.0), "cave": ("동굴", -1.5), "rare": ("희귀", -2.0),
}

TYPE_PLAY = {  # 타입 → 장난 보정
    "ghost": 2.0, "fairy": 1.5, "normal": 0.5, "psychic": 0.5, "electric": 0.5,
    "fighting": -1.5, "steel": -1.0, "rock": -1.0, "dragon": -1.0, "ice": -0.5, "ground": -0.5,
}

# 부분일치로 찾기 때문에 "놀라다"처럼 엉뚱하게 걸리는 짧은 단어는 피한다
EGG_KO = {
    "monster": "괴수", "water1": "수중1", "water2": "수중2", "water3": "수중3", "bug": "벌레",
    "flying": "비행", "ground": "육상", "fairy": "요정", "plant": "식물", "humanshape": "인간형",
    "mineral": "광물", "indeterminate": "부정형", "ditto": "메타몽", "dragon": "드래곤",
    "no-eggs": "미발견",
}

PLAY_WORDS = {  # 검색어 → 화면 표시용 단어
    "장난": "장난", "놀이": "놀이", "놀기": "놀기", "놀고": "놀기", "놀아": "놀기", "귀여": "귀여움",
    "춤": "춤", "노래": "노래", "웃": "웃음", "즐겁": "즐거움", "즐기": "즐기기", "호기심": "호기심",
    "흉내": "흉내", "친근": "친근함", "애교": "애교",
}
SERIOUS_WORDS = {
    "사납": "사나움", "난폭": "난폭", "흉포": "흉포", "공격적": "공격적", "성질이 거": "거친 성질",
    "화가 나": "화", "싸움": "싸움", "단련": "단련", "수행": "수행", "냉정": "냉정", "냉혹": "냉혹",
    "경계심": "경계심",
}


def fetch(path):
    cache_file = CACHE / (path.replace("/", "_") + ".json")
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    req = urllib.request.Request(f"{API}/{path}", headers={"User-Agent": "pokemon-quiz"})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    cache_file.write_text(json.dumps(data, ensure_ascii=False))
    return data


def ko(entries, field):
    return [e[field] for e in entries if e["language"]["name"] == "ko"]


def load(pid):
    poke = fetch(f"pokemon/{pid}")
    spec = fetch(f"pokemon-species/{pid}")
    stats = {s["stat"]["name"]: s["base_stat"] for s in poke["stats"]}
    flavors = ko(spec["flavor_text_entries"], "flavor_text")
    flavors = list(dict.fromkeys(re.sub(r"\s+", " ", f).strip() for f in flavors))
    return {
        "id": pid,
        "name": ko(spec["names"], "name")[0],
        "genus": (ko(spec["genera"], "genus") or [""])[0],
        "types": [t["type"]["name"] for t in poke["types"]],
        "stats": {
            "hp": stats["hp"], "atk": stats["attack"], "def": stats["defense"],
            "spa": stats["special-attack"], "spd": stats["special-defense"], "spe": stats["speed"],
        },
        "happiness": spec["base_happiness"] or 0,
        "capture": spec["capture_rate"],
        "habitat": (spec["habitat"] or {}).get("name"),
        "gen": GEN_NO[spec["generation"]["name"]],
        "legendary": spec["is_legendary"] or spec["is_mythical"],
        "flavor": flavors[-1] if flavors else "",
        "eggGroups": [EGG_KO.get(g["name"], g["name"]) for g in spec["egg_groups"]],
        "allFlavors": " ".join(flavors),
    }


def zscores(values):
    mean, sd = statistics.mean(values), statistics.pstdev(values)
    return [max(-CLIP, min(CLIP, (v - mean) / sd)) for v in values]


def type_chart():
    """공격 타입 → {방어 타입: 배율}. 표에 없으면 1배."""
    chart = {}
    for eng, ko_name in TYPE_KO.items():
        rel = fetch(f"type/{eng}")["damage_relations"]
        row = {}
        for key, mult in (("double_damage_to", 2), ("half_damage_to", 0.5), ("no_damage_to", 0)):
            for t in rel[key]:
                if t["name"] in TYPE_KO:
                    row[TYPE_KO[t["name"]]] = mult
        chart[ko_name] = row
    return chart


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(8) as pool:
        mons = list(pool.map(load, range(1, LAST_ID + 1)))

    raw = {k: [] for k in "ESTBP"}
    for m in mons:
        s = m["stats"]
        habitat_bonus = HABITAT.get(m["habitat"], ("", 0))[1]
        text = m.pop("allFlavors")
        play_hits = list(dict.fromkeys(label for w, label in PLAY_WORDS.items() if w in text))
        serious_hits = list(dict.fromkeys(label for w, label in SERIOUS_WORDS.items() if w in text))
        type_play = sum(TYPE_PLAY.get(t, 0) for t in m["types"])

        m["basis"] = {
            "habitat": HABITAT.get(m["habitat"], ("", 0))[0],
            "habitatBonus": habitat_bonus,
            "typePlay": type_play,
            "playTypes": [{"type": TYPE_KO[t], "bonus": TYPE_PLAY[t]} for t in m["types"] if t in TYPE_PLAY],
            "playWords": play_hits,
            "seriousWords": serious_hits,
        }

        raw["E"].append(s["spe"])
        # 친밀도(0~140)와 포획률(3~255)은 단위가 달라 각각 0~1로 맞춘 뒤 더한다
        raw["S"].append(m["happiness"] / 140 + m["capture"] / 255 + habitat_bonus * 0.5
                        - (1.0 if m["legendary"] else 0))
        raw["T"].append(s["spa"] - s["atk"])
        raw["B"].append((s["atk"] + s["spa"]) - (s["def"] + s["spd"]))
        raw["P"].append(type_play + len(play_hits) - len(serious_hits))

    z = {k: zscores(v) for k, v in raw.items()}
    for i, m in enumerate(mons):
        m["types"] = [TYPE_KO[t] for t in m["types"]]
        m["v"] = [round(z[k][i], 2) for k in "ESTBP"]

    OUT.write_text(
        "// 자동 생성 파일: scripts/build_data.py 로 다시 만들 수 있음 (직접 수정하지 마세요)\n"
        "const POKEMON = [\n"
        + ",\n".join(json.dumps(m, ensure_ascii=False) for m in mons)
        + "\n];\n\n"
        "// 타입 상성표: TYPE_CHART[공격 타입][방어 타입] = 배율 (없으면 1배)\n"
        f"const TYPE_CHART = {json.dumps(type_chart(), ensure_ascii=False)};\n"
    )
    print(f"{len(mons)}마리 저장 → {OUT.name}")


if __name__ == "__main__":
    main()

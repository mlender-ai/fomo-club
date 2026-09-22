# 연구 노트

**랩이 새로 갖는 유일한 데이터다**(UI-02 PART E). FCE 에 없다 — 무엇을 확인하고
있고 무엇을 알아냈는지는 엔진이 아니라 사람이 갖는 기록이다.

## 편집

파일이 정본이다. 고치고 시드를 돌리면 DB 로 간다:

```bash
npm run lab:research-seed          # 파일 → DB
npm run lab:research-seed -- --dry # 무엇이 들어갈지만
```

편집 UI 는 나중이다(E-3).

## 파일 모양

```markdown
---
no: "01"
title: 고래는 65.8% 맞히는데 우리는 왜 32.4%인가
status: open            # open | testing | blocked | closed
verdict:                # 닫혔을 때만 — yes | no | inconclusive
summary: 한 줄
opened_at: 2026-09-19
closed_at:
tracks: [whale]
blocks:                 # 이것 때문에 막힌 것
---

## 가설
...

## 어떻게 확인하나
...

## 근거
- 라벨 | 값 | 출처

## 결정
...
```

## 규칙

| | |
|---|---|
| **닫아도 지우지 않는다** | 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다 |
| 근거에 출처를 적는다 | 출처 없는 수치는 다음 사람이 검증할 수 없다 |
| `inconclusive` 를 쓴다 | 모르는 걸 `no` 로 닫으면 기록이 거짓이 된다 |

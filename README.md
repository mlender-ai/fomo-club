# STRATEGY LAB

> **여러 전략이 각자 독립 자본으로 페이퍼 매매를 하고, 그 성과를 같은 기준으로 비교하는 랩.**
>
> 핵심 질문 하나 — **이 전략에 실제 돈을 넣어도 되나?**
> 이 질문에 답하는 데 필요 없는 건 만들지 않는다.

| | |
|---|---|
| **최상위 정본** | [`docs/LAB-00_MASTER.md`](docs/LAB-00_MASTER.md) — 충돌 시 이 문서가 이긴다 |
| 에이전트 규칙 | [`CLAUDE.md`](CLAUDE.md) → [`AGENTS.md`](AGENTS.md) |
| 격리 목록 | [`docs/lab/DORMANT.md`](docs/lab/DORMANT.md) |
| 현재 상태 | [`docs/STATUS.md`](docs/STATUS.md) |
| 사용자 | 본인 1명 · BM 설계 없음 |
| 최종 목표 | 실제 자금 자동매매 |

옛 소비자 제품(**FOMO Club** — "주식시장의 틴더", 종목 카드 피드)은 `LAB-00` 이 대체했다.
그 제품 정본 [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) 와 해자 정본
[`docs/FOMO_MOAT_DOCTRINE.md`](docs/FOMO_MOAT_DOCTRINE.md) 는 `LAB-09` 참조용으로만 남는다.

---

## 모노레포 지도

| 워크스페이스 | 목적 | 스택 | 진입점 |
|---|---|---|---|
| **`apps/web`** (`@fomo/backend`) | 랩 대시보드 + 페이퍼·인증 API | Next.js | `app/(lab)/` · `app/api/` |
| **`apps/api`** (`@fomo/legacy-paper-api`) | 페이퍼 체결 엔진 — `paperBroker` · `tradeExecutor` · `feeModel` · `strategyWorker` | Fastify + worker | `src/server.ts` · `src/worker.ts` |
| `packages/shared` | 공용 타입·유틸 | TS | `src/index.ts` |
| `packages/lab` | 성적 집계 원시 — 표본 30 하한, 백테스트·실적 합산 차단 | TS (순수함수) | `src/stats.ts` |

`packages/dormant/` 는 **워크스페이스가 아니다.** `LAB-09` 용으로 격리한 644 파일이 들어 있고
빌드·타입체크·테스트 어디에도 들어가지 않는다. 상세는 [`docs/lab/DORMANT.md`](docs/lab/DORMANT.md).

`apps/web` 은 `apps/api`(`:4000`)로 프록시한다 — `lib/backend-api.ts`.
**실행기는 하나다**(`LAB-00` §4-1). 백테스트와 페이퍼가 같은 엔진을 쓰고 데이터 소스만 갈아 끼운다.

---

## 화면

`LAB-01` PART D-1 — **셋뿐이다.**

| 경로 | 무엇 | 언제 채워지나 |
|---|---|---|
| `/` | 백테스트 (기본) | `LAB-05` |
| `/live` | 전광판 | `LAB-08` |
| `/strategy/[id]` | 전략 상세 | `LAB-08` |

지금은 셋 다 `아직 데이터가 없습니다.` 를 낸다. **`LAB-05` 까지 이 상태로 둔다.**
스타일도 최소만이다 — 제대로 만드는 것은 `LAB-05` 다.

---

## 돌리기

```bash
npm ci
npm run prisma:generate
npm run dev          # api(:4000) + worker + web(:3200) 동시
```

| 명령 | 무엇 |
|---|---|
| `npm run dev:web` | 랩 대시보드만 (`:3200`) |
| `npm run dev:api` | 페이퍼 엔진 API 만 (`:4000`) |
| `npm run dev:worker` | 전략 워커만 |
| `npm run ci` | lint → typecheck → build |
| `npm test` | vitest (격리분 제외) |
| `npm run paper:status` | 페이퍼 상태 조회 |

---

## 절대 규칙 (`LAB-00` §7)

| 규칙 | 이유 |
|---|---|
| 레버리지 기본 1배 | 수익률 부풀림 방지 |
| 종료 전략도 표에 남긴다 | 진 걸 지우면 전부 거짓이 됨 |
| 벤치마크를 항상 옆에 둔다 | +30%가 좋은지 모름 |
| 순위는 수익/낙폭으로 | 수익률 순위는 레버리지가 이김 |
| 표본 30 미만은 순위 없음 | `packages/lab/src/stats.ts` 가 타입으로 막는다 |
| 전략 5개 이하 | 많으면 하나는 운으로 좋아 보임 |
| 페이퍼 한계를 화면에 쓴다 | |
| 데이터 구멍을 메우지 않는다 | |

---

## 진행

```
LAB-01 ✅ → LAB-02 → LAB-03 → LAB-04 ─┬→ LAB-05
                                      └→ LAB-06 → LAB-07 → LAB-08 → LAB-09
```

**`LAB-05` 까지가 1차 목표다.** 거기서 알파가 안 나오면 그 뒤는 의미가 없다.

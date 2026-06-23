# M4 — 불안 해소 여정의 완성 · 실행 계획서

> **문서 위상**: 폐기된 실행 계획 (Execution Brief). `docs/legacy/IDENTITY_AND_MILESTONES.md §M4`의 구체 구현안.
> **상태**: 🚧 P0 읽기 경로 구현·배포됨 (2026-06-11) — `voices.ts`+테스트 / `/api/fomo/voices`(큐레이션 폴백) / 피드 탭+`VoiceFeed`.
> **남은 것**: Step 2/4 쓰기 경로 — Prisma `situationKey`/`resolveKey` 2필드(optional) **migration 사용자 확인 필요** + vote 확장 + 게이트 2-스텝 선택 UI. 작성일 2026-06-08.
> **스타일**: BCG/실리콘밸리식 — 가설 → 우선순위 → 임팩트·리스크 분리.
> **범위 확정**: ① 타인의 목소리 = **구조화 한마디** ② 출시 = **피드 탭 1개 집중** ③ 플랫폼 = **웹만** (fomo-web + fomo-core + apps/web API).

---

## 1. Executive Summary

M4의 완료 기준은 한 문장이다: **"물렸을 때 다른 앱을 전전하지 않고 여기서 사이클이 끝난다."**

지금까지(M1~M3) 포모는 *"너만 그런 게 아니야"*를 **숫자(집계)와 마스코트(앱의 목소리)**로 전했다. M4의 도약은 위로의 출처를 **앱의 단정 → 타인의 목소리**로 옮기는 것이다. 사람은 시스템이 "괜찮아"라고 말할 때보다, 같은 처지의 다른 사람이 "나도 버티는 중이야"라고 말할 때 더 깊이 안도한다.

**핵심 긴장(Central Tension)**: 정체성 §2.2 *"형태가 곧 윤리"* — 자유 텍스트 날것 공간은 디시화(독성)를 부른다. 타인의 목소리를 원하지만 자유 입력은 금지다.

**해소 전략**: 사용자는 **쓰지 않고 고른다.** 정해진 선택지(상황 × 의연함)를 조합해 정제된 한 줄을 만든다. 디시화 위험 0%, regulation 금칙어 원천 차단, 회복적 가드레일이 **선택지 설계 단계에서** 강제된다. 이것이 "규칙과 형태가 곧 가드레일"의 직접 구현이다.

---

## 2. Context — 왜 지금인가

| 신호 | 내용 |
|---|---|
| **로드맵 정합** | `docs/legacy/FOMO_CLUB.md`가 명시적으로 예고했던 *"Phase 2에서 익명 감정 피드 추가 예정 (지금 구현 X)"* 기록. 현재 PRODUCT_VISION v5 기준이 아니다. |
| **선행 완료** | M1(마스코트 2단계)·M2(캘린더)·M3(집계+고래 배너)가 lovable 게이트를 통과해 배포됨. M4는 앞 마일스톤 위에서 시작 가능. |
| **인프라 준비** | `EmotionVote` 테이블·`todayTally`·`corsJson`·탭 바(직전 작업)·`banner.ts`의 순수함수 콘텐츠 패턴이 모두 재사용 가능. 신규 외부 의존성 0. |
| **갭** | 현재 위로의 출처가 100% "앱의 목소리"(`mascot-lines.ts`). 타인의 목소리 채널이 없어 M4 완료 기준 미충족. |

---

## 3. 전략적 포지셔닝 — "구조화 한마디"의 형태

자유 텍스트를 받지 않고 타인의 진짜 목소리를 만드는 메커니즘. **3-슬롯 조합**:

```
[감정]        +  [상황 선택지]              +  [의연함 선택지]
공포             "오늘도 파란 날이었고"        "그래도 손절은 안 했어"
                (situationKey, 5~6개)        (resolveKey, 5~6개)
        ↓ composeVoice() 결정적 조합
   "공포 · 오늘도 파란 날이었지만, 그래도 손절은 안 했어."
```

**설계 원칙 (BCG식 'so what')**:
1. **회복적 가드레일이 데이터 구조에 내장** — `resolveKey` 선택지에는 *의연함*만 존재(버팀/쉼/거리두기). *무모함*("풀배팅했어", "추매 가즈아")은 **선택지에 아예 없다.** 가드레일을 런타임 검사가 아니라 **스키마로** 강제 → regulation-reviewer가 검사할 자유 텍스트가 없음.
2. **정직한 숫자 유지** — voice는 실제 사용자가 고른 조합만. 0개면 0개. 콜드스타트 구간엔 포모의 큐레이션 멘트로 폴백(가짜 사용자 ❌).
3. **익명·무가입** — 기존 `sessionId` 그대로. 신규 PII 0.

---

## 4. 솔루션 아키텍처

### 4.1 데이터 모델 (`prisma/schema.prisma`)
`EmotionVote`에 **optional 2필드 추가** (별도 테이블 X — 1세션 1일 1회 제약과 1:1, 마이그레이션 최소):

```prisma
model EmotionVote {
  // ... 기존 필드 ...
  situationKey String?  // 상황 선택지 키 (없으면 voice 미생성)
  resolveKey   String?  // 의연함 선택지 키
  @@index([votedDate, situationKey])  // 피드 조회용
}
```
> ⚠️ Prisma migration = CLAUDE.md 크리티컬 예외. **실행 전 사용자 확인 필수.**

### 4.2 도메인 로직 (`packages/fomo-core/src/voices.ts` — 신규)
`banner.ts`·`mascot-lines.ts`의 순수함수 패턴을 그대로 따름:

```ts
export interface VoiceOption { key: string; label: string }
export const SITUATION_OPTIONS: readonly VoiceOption[]  // 5~6개, 담담한 사실
export const RESOLVE_OPTIONS: readonly VoiceOption[]    // 5~6개, 의연함만
export interface FomoVoice { emotion; situationKey; resolveKey; }
export function composeVoice(v: FomoVoice): string | null  // 결정적 조합, 잘못된 키→null
export function curatedVoices(date: string): string[]      // 콜드스타트 폴백(date 해시, restorativeLine 패턴)
```
- `index.ts`에 `export * from "./voices"` 추가.
- 테스트 `__tests__/voices.test.ts` — 조합 정확성·잘못된 키 방어·가드레일(무모함 키 부재) 검증.

### 4.3 API (`apps/web/app/api/fomo/`)
| 라우트 | 변경 | 재사용 |
|---|---|---|
| `emotions/vote/route.ts` | `situationKey`/`resolveKey` optional 수신 → upsert에 포함 | 기존 upsert 그대로 확장 |
| `voices/route.ts` (신규) | `GET` 최근 N개 익명 voice 반환. `composeVoice`로 서버 조합, 결측 시 `curatedVoices` 폴백 | `corsJson`/`withCors`/`prisma`/`kstDate` |

### 4.4 UI (`apps/fomo-web/`)
| 파일 | 변경 |
|---|---|
| `components/HomeView.tsx` | 탭 배열에 **"피드"** 추가 (직전 `TabButton` 구조 그대로 확장 — 3개 탭) |
| `components/VoiceFeed.tsx` (신규) | 타인의 구조화 한마디 카드 리스트. `fomo-rise` 애니메이션·감정색 토큰 재사용 |
| `components/EmotionGate.tsx` | 감정 선택 후 **상황·의연함 2-스텝 선택** 추가 (skip 가능 — voice는 opt-in) |
| `lib/fomoApi.ts` | `fetchVoices()` 추가, `postVote`에 선택 필드 |

---

## 5. 우선순위 — 임팩트 × 노력 × 리스크

> P0=완료 기준 직결 / P1=깊이 강화 / P2=검증 후.

### P0 — 타인의 목소리 채널 (완료 기준 직결)
| 항목 | 임팩트 | 노력 | 리스크 |
|---|---|---|---|
| `voices.ts` 선택지·`composeVoice`·폴백 | **높음** — M4의 심장 | 중 | 낮음 (순수함수+테스트) |
| 피드 탭 + `VoiceFeed` (읽기 전용) | **높음** — "타인" 체감 | 중 | 낮음 |
| `voices` API + 폴백 | **높음** | 낮음 | 낮음 |
| Prisma 2필드 + vote 확장 (쓰기) | **높음** | 낮음 | **중** (migration — 사용자 확인) |

**P0 완료 = M4 완료 기준 충족.** 사용자가 게이트에서 한마디를 고르고, 피드에서 타인의 한마디를 본다.

### P1 — 여정의 깊이
| 항목 | 임팩트 | 노력 | 리스크 |
|---|---|---|---|
| 공감 반응 "나도 그래"(익명 카운트) | 중 | 중 | 낮음 |
| 회복 큐레이션 멘트 확장(`mascot-lines` 연계) | 중 | 낮음 | 낮음 |
| 피드 정렬(공감순/최신) | 낮음 | 낮음 | 낮음 |

### P2 — 검증 후 (제품에 대한 FOMO 경계)
| 항목 | 비고 |
|---|---|
| 네이티브(fomo-club) 동기화 | 메모리 원칙상 보류 |
| voice → 캘린더 칸 연동(과거 한마디 회상) | M2와 교차, 검증 후 |

---

## 6. 사이드이펙트 & 리스크 매트릭스

| # | 리스크 | 발생 영역 | 심각도 | 완화책 |
|---|---|---|---|---|
| R1 | **Prisma migration**으로 프로덕션 DB 영향 | `schema.prisma` | 높음 | optional 필드만(기존 데이터 무손상). 실행 전 사용자 확인 + `npx prisma validate` |
| R2 | 콜드스타트 — 초기 voice 0개로 피드 빈 화면 | `voices` API | 중 | `curatedVoices` 폴백(정직성 유지: "아직 아무도…" 대신 포모 큐레이션). **가짜 사용자 수 표기 금지** |
| R3 | 선택지가 무모함을 암시 = 도박 미화 | `voices.ts` 카피 | 중 | resolveKey에 의연함만. lovable+regulation 게이트(HARNESS Gate 4·6) 통과 |
| R4 | 탭 3개로 정보 과밀/네비 혼란 | `HomeView` | 낮음 | 오늘/기록/피드 라벨 명확, 직전 탭 구조 검증됨 |
| R5 | 웹/네이티브 voice 스키마 분기 | fomo-core 공유 | 낮음 | fomo-core 단일 소스. 네이티브는 P2에서 동일 타입 소비 |
| R6 | API 응답 지연(피드 쿼리) | `voices` 쿼리 | 낮음 | `@@index([votedDate, situationKey])` + N개 limit |

**임팩트 요약**: P0만으로 M4 완료 기준 100% 충족. 신규 외부 의존성·PII·페이지 0 추가. 가장 큰 리스크는 R1(migration) 단 하나 — optional 필드라 실질 위험 낮음.

---

## 7. 변경 파일 요약

**신규** (4): `packages/fomo-core/src/voices.ts`, `packages/fomo-core/__tests__/voices.test.ts`, `apps/web/app/api/fomo/voices/route.ts`, `apps/fomo-web/components/VoiceFeed.tsx`
**수정** (6): `prisma/schema.prisma`, `packages/fomo-core/src/index.ts`, `apps/web/app/api/fomo/emotions/vote/route.ts`, `apps/fomo-web/components/HomeView.tsx`, `apps/fomo-web/components/EmotionGate.tsx`, `apps/fomo-web/lib/fomoApi.ts`

---

## 8. 검증 계획 (End-to-End)

1. **단위** — `npm run test`로 `voices.test.ts`: composeVoice 조합 정확성, 잘못된 키→null, **무모함 키 부재** 단언.
2. **타입·빌드** — `npm run typecheck:fomo-web && npm run typecheck:fomo-core && npm run build:web`.
3. **스키마** — `npx prisma validate` (migration은 사용자 확인 후).
4. **게이트** — HARNESS Gate 4(regulation: 금칙어 0)·Gate 6(lovable: "그날 밤의 내가 덜 외로웠을까") 통과.
5. **런타임 QA** — `preview_start`(fomo-web) → 게이트에서 감정+상황+의연함 선택 → 피드 탭에서 본인+타인 한마디 노출 확인 → `preview_screenshot` 1장. 콘솔 에러 0.
6. **배포** — main push → Vercel 자동 배포 → 공개 URL 확인.

---

## 9. 실행 시퀀스 (한 번에 하나씩)

```
Step 1 (P0-a): voices.ts + 테스트          → 순수 로직 먼저, 빌드·테스트 green
Step 2 (P0-b): voices API + vote 확장       → migration은 여기서 사용자 확인
Step 3 (P0-c): 피드 탭 + VoiceFeed (읽기)   → preview 확인
Step 4 (P0-d): 게이트 작성 플로우 (쓰기)    → E2E QA → 커밋·push·배포
─────────────── M4 완료 기준 충족 지점 ───────────────
Step 5 (P1): 공감 반응·큐레이션 확장        → 별도 라운드
```

각 Step 후 커밋. Step 4 완료 시 PR + lovable 게이트 + 배포. P1은 검증 후 별도 진행.

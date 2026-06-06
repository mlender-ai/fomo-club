# FOMO Club — Design System (DESIGN_FOMO.md)

| | |
|---|---|
| **위상** | FOMO Club 시각 언어의 단일 소스. 피그마 작업 전 단계의 기준. |
| **관계** | 기존 `DESIGN.md`(타로 "Mystical Terminal", 녹색)와 **별개**. FOMO Club 전용. |
| **정체성 근거** | `docs/IDENTITY_AND_MILESTONES.md`, `docs/MASCOT.md` |
| **리서치 출처** | designengineer.tools (James Warner 큐레이션) |

> 정체성 한 줄: **"디시의 마음(담담한 솔직함) + 인디게임의 몸(만듦새)."**
> 시각 언어도 이 둘이 한 몸이다 — 절제된 흑백 위에, 인디게임의 픽셀 악센트와 감정 색 한 점.

---

## 1. 디자인 원칙 (정체성 → 시각)

1. **기리고式 비움**: 순수 검정 베이스, 화면당 요소 최소, 여백 최대. 주인공은 포모 하나. (타로의 #121212보다 더 깊은 `#000`.)
2. **인디게임의 몸**: 픽셀/모노 텍스처는 **악센트로만** — FOMO Index 숫자, 상태 라벨(무관심/광기), 캘린더 블록. 본문까지 픽셀로 덮지 않는다.
3. **담담함**: 고대비 흰색 본문, 차분한 위계. 화려한 그라데이션·드롭섀도 금지(타로 원칙 계승). 깊이는 그림자가 아니라 **배경 명도 차**로.
4. **형태가 곧 윤리**: 감정은 자유 텍스트가 아니라 5색·표정·픽셀로 담는다. 색은 칠하지 않고 **포인트 광(glow)**으로만.
5. **love mark 우선**: 전환 곡선·표정 디테일·캘린더 채움감은 nice-to-have가 아니라 의도적 우선순위.

---

## 2. 컬러

### 2.1 베이스 (무채색)
| 토큰 | HEX | 용도 |
|---|---|---|
| `ink` | `#000000` | 앱 배경(순수 검정) |
| `surface` | `#0E0E0E` | 카드/표면(배경과 거의 동일, 명도차로만 분리) |
| `elevated` | `#1A1A1A` | 살짝 떠 있는 표면(트랙/칩 배경) |
| `hairline` | `#2A2A2A` | 경계선(아주 옅게) |
| `muted` | `#8A8A8A` | 보조 텍스트 |
| `whiteout` | `#FAFAFA` | 본문/주요 텍스트, 포모의 흰 눈 |

### 2.2 감정 색 (포인트 전용 — `@fomo/core` EMOTION_COLORS 단일 소스)
검정 위에서 빛나는 점 하나. 화면을 채우지 않는다. **OKLCH로 정의**해 glow 명도 램프를 일관화한다(designengineer.tools → OKLCH Color Picker로 최종 확정).

| 감정 | HEX | OKLCH (근사 — 도구로 확정) | 체감 근거 |
|---|---|---|---|
| FOMO | `#FF5A36` | `oklch(0.68 0.20 35)` | 달아오르는 불꽃(빨강~주황) |
| 공포 fear | `#38BDF8` | `oklch(0.76 0.13 235)` | 얼어붙는 차가움(파랑~청록) |
| 후회 regret | `#8B7CF6` | `oklch(0.66 0.18 290)` | 가라앉아 곱씹음(보라~남색) |
| 탐욕 greed | `#34D399` | `oklch(0.78 0.15 165)` | 돈의 욕망(초록/황금) |
| 확신 conviction | `#FACC15` | `oklch(0.86 0.17 95)` | 또렷한 자신감(노랑/골드) |

- **glow 램프**: 각 감정색에서 L(명도)만 +0.08/−0.10한 2단계로 배경광(box-shadow/radial)을 만든다. 채도·색상(C·H)은 고정 → 5색이 같은 "온도"로 빛난다.
- **접근성**: 검정 위 텍스트로 쓸 땐 명도 충분(전부 L≥0.66). 칩 보더/텍스트에 사용 OK. designengineer.tools → Color.review로 대비 검증.

---

## 3. 타이포그래피

한국어 UI이므로 **한글 지원이 1순위**. 폰트 sprawl 금지(정체성 §2.3 깊이 있는 단순함) — **두 가족만**.

### 3.1 본문 — Pretendard (담담한 목소리)
- 한글+라틴 모두 우수, 무료(OFL), 한국 제품의 사실상 표준. 따뜻하면서 중립적 → "담담함".
- 용도: 모든 본문, 멘트("다들 어떻든…"), 설명, 버튼.
- CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css`

### 3.2 악센트 — 픽셀/모노 (인디게임의 몸)
"인디게임의 몸"을 한 곳에만: **FOMO Index 숫자, 상태 라벨, 캘린더, 작은 메타 라벨**.
- **Galmuri (갈무리)** — 한글+라틴+숫자 픽셀 폰트(quiple, OFL). 한국어 라벨(무관심/광기)까지 픽셀로 → 1폰트로 해결. **권장.** (CDN: jsdelivr `quiple/galmuri`)
- 대안/병행: **Departure Mono** — 라틴/숫자 전용 픽셀 모노(Helena Zhang, OFL, 상업 무료). 순수 숫자(74)에 더 깔끔. 한글 미지원이라 라벨엔 Galmuri.

### 3.3 스케일
| 토큰 | 크기 | 폰트 | 용도 |
|---|---|---|---|
| `display` | 64–72 | 픽셀 | FOMO Index 대형 숫자 |
| `headingLg` | 28 | Pretendard 600 | 화면 제목 |
| `heading` | 20 | Pretendard 600 | 섹션 제목 |
| `body` | 16 | Pretendard 400/500 | 본문·멘트 |
| `label` | 13 | 픽셀 | 상태 라벨/메타(무관심·광기, 캘린더) |
| `caption` | 12 | Pretendard 400 | 보조 |
- 본문 letter-spacing 0, 픽셀은 폰트 자체 그리드 존중(자간 0).

---

## 4. 스페이싱 · 라운드
- 스페이싱 8px 그리드: `4 / 8 / 12 / 16 / 24 / 32 / 40 / 64`. **비움을 위해 한 단계 크게** 쓰는 걸 기본으로(기리고).
- 라운드: 칩/입력 `12`, 카드 `16`, 알약 `9999`. 마스코트 얼굴 = 완전 원.
- 그림자 금지. 분리는 배경 명도차(ink↔surface↔elevated) + hairline.

---

## 5. 모션 (love mark의 핵심)
절제하되, 의미 있는 순간엔 정성. designengineer.tools → Easing Editor / Easing.dev로 곡선 확정.

| 순간 | 동작 | 곡선/지속 |
|---|---|---|
| 진입 | 포모가 옅게 페이드인(시장의 포모) | ease-out, 300ms |
| **2단계 전환** | 감정 선택 → 포모가 감정색으로 물들고 멘트가 떠오르듯 | ease-out-quad, 420ms (현재 모바일 구현됨) |
| 표정 변화 | 눈 모양 보간 | ease-in-out, 250ms |
| 집계 바 | 비율 바가 좌→우로 채워짐 | ease-out, 500ms |
| 캘린더 채움 | 픽셀 블록이 톡 찍히듯 | spring/짧은 pop |

- **마스코트 표정·전환은 "장식"이 아니라 핵심 경험**(NORTH_STAR 킬리스트 예외). 그 외 글로우 남발·파티클은 금지.
- 마스코트 모션 에셋은 **Lottie**로(앱·웹 공용, 가벼움). designengineer.tools → Lottie Creator/Lottielab. 웹 미세 인터랙션은 Motion Primitives.

---

## 6. 마스코트 포모 렌더 규칙 (docs/MASCOT.md 시각화)
- 검은 얼굴 + 흰 눈 2점, 얼굴 중심(머리+어깨). 배경 검정. 완전 원형(현재 플레이스홀더).
- 감정/지수 색은 **얼굴 뒤 배경광(radial glow)**으로만. 얼굴 자체는 흑백 유지.
- 5시장표정(무관심/관망/관심/FOMO/광기) ↔ FOMO Index 5구간 1:1(`@fomo/core` scoreToFace 단일 소스).
- 2단계: ①시장의 포모(지수색 옅은 glow) → ②나의 포모(선택 감정색 glow + 멘트).
- 구체 픽셀 조형은 미확정(MASCOT §10) — 원칙만 강제, 시각 작업(피그마/픽셀)에서 확정.

---

## 7. 컴포넌트 규칙(요약)
- **감정 칩**: 기본 surface + hairline 보더 / 선택 시 감정색 보더 + 감정색 12% 배경 + 감정색 텍스트.
- **집계 바**: elevated 트랙 + 감정색 채움, 우측에 % 픽셀 라벨.
- **FOMO Index**: 대형 픽셀 숫자(주인공 아님 — 포모 아래 보조), 상태 라벨은 픽셀.
- **Market Pulse 배너**: surface 1줄, 🚨/이모지 + 픽셀 메타, 롤링.

---

## 8. Do / Don't
| Do | Don't |
|---|---|
| 순수 검정 + 흰 텍스트 + 감정색 한 점 | 알록달록 다색 / 그라데이션 범벅 |
| 픽셀은 숫자·라벨·캘린더 악센트로만 | 본문까지 픽셀(가독성·담담함 해침) |
| 명도차·hairline으로 깊이 | 드롭섀도·네온 글로우 남발 |
| 표정/전환에 정성(love mark) | 의미 없는 장식 애니메이션·파티클 |
| 담담한 카피(사실+위로) | 가짜긍정/거친 톤/투자조언 |
| 여백 크게(기리고) | 화면 빽빽하게 채우기 |

---

## 9. 적용 도구 체크리스트 (designengineer.tools)
- 색 램프 확정: **OKLCH Color Picker** · 대비: **Color.review**
- 폰트: **Fontshare**(라틴 대안) · **Departure Mono**(픽셀 모노) · Galmuri(한글 픽셀)
- 모션 곡선: **Easing Editor / Easing.dev** · 마스코트: **Lottie Creator/Lottielab** · 웹: **Motion Primitives**
- 영감: **Godly / Mobbin**(다크 미니멀) · **game UI database**(픽셀/인디 결)

## 10. 코드 파생 (P3에서 wiring)
- 웹: `apps/fomo-web/tailwind.config.ts` (이미 감정색 @fomo/core 미러) ← 베이스 토큰/폰트 추가
- 모바일: `apps/fomo-club/constants/fomoTheme.ts` ← 동일 토큰
- 폰트 로드: 웹은 CDN/next/font, 앱은 expo-font. 픽셀 폰트는 숫자/라벨 컴포넌트에만 적용.
- 색·표정 단일 소스는 `@fomo/core`(EMOTION_COLORS, scoreToFace) 유지.

---
version: alpha
name: FOMO Club
description: >-
  투자자 감정 동반자. 검정 베이스 + 감정색 포인트 + 픽셀 악센트.
  "디시의 마음(담담한 솔직함) + 인디게임의 몸(만듦새)". 다크-네이티브.
colors:
  ink: "#000000"
  surface: "#0E0E0E"
  elevated: "#1A1A1A"
  hairline: "#2A2A2A"
  muted: "#8A8A8A"
  whiteout: "#FAFAFA"
  emotion-fomo: "#FF5A36"
  emotion-fear: "#38BDF8"
  emotion-regret: "#8B7CF6"
  emotion-greed: "#34D399"
  emotion-conviction: "#FACC15"
  primary: "{colors.emotion-fomo}"
  background: "{colors.ink}"
  text: "{colors.whiteout}"
typography:
  display:
    fontFamily: "Galmuri11, Departure Mono, monospace"
    fontSize: 64px
    lineHeight: 1
  headingLg:
    fontFamily: Pretendard
    fontSize: 28px
    fontWeight: 600
  heading:
    fontFamily: Pretendard
    fontSize: 20px
    fontWeight: 600
  body:
    fontFamily: Pretendard
    fontSize: 16px
    fontWeight: 400
  label:
    fontFamily: "Galmuri11, Departure Mono, monospace"
    fontSize: 13px
  caption:
    fontFamily: Pretendard
    fontSize: 12px
rounded:
  sm: 12px
  md: 16px
  lg: 20px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
components:
  mascotFace:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: 160px
  emotionChip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.whiteout}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  emotionChipSelected:
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  indexNumber:
    textColor: "{colors.whiteout}"
    typography: "{typography.display}"
  stateLabel:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  tallyBar:
    backgroundColor: "{colors.elevated}"
    rounded: "{rounded.pill}"
  pulseBanner:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
---

# FOMO Club — Design System (DESIGN.md)

> 표준: Google DESIGN.md 스펙(getdesign.md). frontmatter = 기계가독 토큰, 아래 = 사람/에이전트용 산문.
> 기계가독 단일 소스는 `design/tokens.json`(DTCG). 색·표정 진실은 코드 `@fomo/core`. Figma 왕복: `docs/FIGMA_WORKFLOW.md`.
> 기존 `DESIGN.md`(타로 "Mystical Terminal", 녹색)와 **별개** — FOMO Club 전용.

## Overview

정체성 한 줄: **"디시의 마음(담담한 솔직함) + 인디게임의 몸(만듦새)."** 정본 `docs/IDENTITY_AND_MILESTONES.md`, 마스코트 `docs/MASCOT.md`.

디자인 5원칙:
1. **기리고式 비움** — 순수 검정, 요소 최소, 여백 최대. 주인공은 포모 하나.
2. **인디게임의 몸** — 픽셀/모노는 악센트로만(숫자·라벨·캘린더). 본문은 픽셀로 덮지 않음.
3. **담담함** — 고대비 흰 텍스트, 차분한 위계. 그라데이션·드롭섀도 금지.
4. **형태가 곧 윤리** — 감정은 자유 텍스트가 아니라 5색·표정·픽셀로. 색은 칠하지 않고 포인트 광(glow)으로만.
5. **love mark 우선** — 전환 곡선·표정 디테일·캘린더 채움은 의도적 우선순위.

**다크-네이티브**: FOMO Club은 라이트 테마가 없다(정체성). 프리뷰는 `docs/design/preview-dark.html` 하나뿐.

## Colors

베이스는 무채색, 감정은 포인트 광으로만. (frontmatter `colors` 참조.)

| 토큰 | HEX | 용도 |
|---|---|---|
| ink | `#000000` | 배경(순수 검정) |
| surface / elevated / hairline | `#0E0E0E` / `#1A1A1A` / `#2A2A2A` | 표면·트랙·경계(명도차로 분리) |
| muted / whiteout | `#8A8A8A` / `#FAFAFA` | 보조/주요 텍스트 |
| emotion-fomo | `#FF5A36` | 달아오르는 불꽃 |
| emotion-fear | `#38BDF8` | 얼어붙는 차가움 |
| emotion-regret | `#8B7CF6` | 가라앉아 곱씹음 |
| emotion-greed | `#34D399` | 돈의 욕망 |
| emotion-conviction | `#FACC15` | 또렷한 자신감 |

- **OKLCH glow 램프**: 각 감정색의 L(명도)만 ±조정한 2단계로 배경광(radial/box-shadow). C·H 고정 → 5색이 같은 온도로 빛난다. (designengineer.tools → OKLCH Color Picker로 확정.)
- **대비**: whiteout/ink = AAA, muted/ink ≈ 5.4:1(AA). 감정색은 검정 위 보더/라벨용(L≥0.66). Color.review로 검증.

## Typography

한글 UI → 한글 지원 1순위. **두 가족만**(깊이 있는 단순함).

| 토큰 | 폰트 | 크기 | 용도 |
|---|---|---|---|
| display | 픽셀(Galmuri/Departure Mono) | 64 | FOMO Index 대형 숫자 |
| headingLg / heading | Pretendard 600 | 28 / 20 | 제목 |
| body | Pretendard 400/500 | 16 | 본문·멘트 |
| label | 픽셀 | 13 | 상태 라벨(무관심/광기)·캘린더 |
| caption | Pretendard | 12 | 보조 |

- 본문 **Pretendard**(한글+라틴, OFL) — 담담함. 악센트 **Galmuri11**(한글 픽셀, OFL) / **Departure Mono**(라틴 픽셀, OFL) — 인디게임의 몸.

## Layout & Spacing

8px 그리드: `4 / 8 / 16 / 24 / 32 / 40`(frontmatter `spacing`). **비움을 위해 한 단계 크게** 쓰는 걸 기본으로. 모바일·웹 공통 max-width 중앙 정렬.

## Elevation & Depth

**그림자 금지.** 깊이는 배경 명도차(ink → surface → elevated) + hairline 경계로만. 네온 글로우 남발 금지(감정 glow는 마스코트·포인트 한정).

## Shapes

라운드: 칩/입력 `12`, 카드 `16`, 큰 카드 `20`, 알약 `9999`(frontmatter `rounded`). 마스코트 얼굴 = 완전 원.

## Components

- **mascotFace**: 검은 원 + 흰 눈 2점. 감정/지수 색은 얼굴 뒤 radial glow로만(얼굴은 흑백 유지).
- **emotionChip**: surface + hairline 보더 / 선택 시 감정색 보더 + 감정색 12% 배경 + 감정색 텍스트.
- **indexNumber / stateLabel**: 픽셀. 주인공 아님(포모 아래 보조).
- **tallyBar**: elevated 트랙 + 감정색 채움 + 우측 % 픽셀 라벨.
- **pulseBanner**: surface 1줄, 이모지 + 픽셀 메타, 롤링.

## Motion

절제하되 의미 있는 순간엔 정성(love mark). 곡선은 Easing.dev로 확정, 마스코트는 Lottie 권장.

| 순간 | 동작 | 곡선/지속 |
|---|---|---|
| 진입 | 포모 페이드인(시장의 포모) | ease-out 300ms |
| 2단계 전환 | 감정 선택 → 감정색 물듦 + 멘트 떠오름 | ease-out-quad 420ms (모바일 구현됨) |
| 표정 변화 | 눈 모양 보간 | ease-in-out 250ms |
| 집계 바 | 좌→우 채움 | ease-out 500ms |
| 캘린더 채움 | 픽셀 블록 톡 | spring/짧은 pop |

> 마스코트 표정·전환은 "장식"이 아니라 핵심 경험(NORTH_STAR 킬리스트 예외).

## Do's and Don'ts

| Do | Don't |
|---|---|
| 검정 + 흰 텍스트 + 감정색 한 점 | 알록달록 다색 / 그라데이션 범벅 |
| 픽셀은 숫자·라벨·캘린더 악센트로만 | 본문까지 픽셀 |
| 명도차·hairline으로 깊이 | 드롭섀도·네온 글로우 남발 |
| 표정/전환에 정성(love mark) | 의미 없는 장식 애니메이션·파티클 |
| 담담한 카피(사실+위로) | 가짜긍정/거친 톤/투자조언 |
| 여백 크게(기리고) | 화면 빽빽하게 |

## Responsive Behavior

- 모바일(`apps/fomo-club`, Expo): 단일 컬럼, max 약 420dp, 터치타깃 ≥44pt.
- 웹(`apps/fomo-web`, Next): 중앙 정렬 max-width ~480px(모바일 우선), 데스크톱도 같은 컬럼 폭 유지(밀도 비움).
- 둘 다 동일 홈 경험·동일 토큰. 라이트 모드 없음.

## Agent Prompt Guide

코딩 에이전트가 이 DESIGN.md를 읽고 FOMO Club 화면을 만들 때:
- **주인공은 포모 표정**, FOMO Index 숫자는 보조(작게). 감정 색은 **glow로만**, 화면을 칠하지 않는다.
- **픽셀 폰트는 숫자·라벨·캘린더에만**, 본문은 Pretendard.
- 두 단계(시장의 포모 → 나의 포모) + 전환 애니메이션 + 담담한 멘트 필수(`docs/MASCOT.md`).
- 톤 = **담담한 솔직함**(가짜긍정❌·거침❌·투자조언❌). 머지 전 **Lovable 게이트**(HARNESS Gate 6, `lovable-reviewer`) 통과.
- 토큰은 `design/tokens.json`(DTCG)이 단일 소스 — 하드코딩 금지, 토큰 참조.
- **Figma**: 사용자의 Figma 디자인이 있으면 **Figma MCP**로 읽어 이 토큰과 대조/반영(`docs/FIGMA_WORKFLOW.md`).

예시 프롬프트: *"design/tokens.json과 docs/DESIGN_FOMO.md를 따라 FOMO Club 홈을 만들어줘. 검정 배경에 포모 마스코트(표정=FOMO Index), 그 아래 픽셀 숫자, 5감정 칩, 선택 시 2단계 전환. 담담한 톤."*

# 포모 SVG 레트로 픽셀 캐릭터 — 작업 가이드

> ⚠️ **[폐기 — 히스토리 보존]** 마스코트 "포모" 캐릭터는 **현재 정체성이 아니다.** 현재 정본: `docs/PRODUCT_VISION.md` (**주식시장의 틴더 v5 — 두 표면·한 엔진**). 화면의 중심은 종목 카드와 발견 경험이며, 마스코트 부활은 금지. 새 작업·에이전트는 SSOT(PRODUCT_VISION)를 따른다.

| | |
|---|---|
| **상태** | v1 구현 완료 · 고도화 대기 |
| **구현 파일** | `apps/fomo-web/components/FomoFace.tsx` |
| **작성일** | 2026-06-08 |

---

## 1. 레퍼런스 — 왜 이 방향인가

### 영감 출처 (첨부 링크)

| 레퍼런스 | 핵심 시사점 |
|---|---|
| [pixel-art-animator SKILL](https://github.com/willibrandon/pixel-plugin/blob/main/skills/pixel-art-animator/SKILL.md) | `<rect shapeRendering="crispEdges">` 기반 SVG 픽셀 그리드 구현 패턴 |
| [pixel-art SKILL](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/pixel-art/SKILL.md) | 색상 팔레트 설계, 픽셀 캐릭터 좌표 매핑 방식 |
| [Pixel-Art repo (Normandy72)](https://github.com/Normandy72/Pixel-Art) | 그리드 기반 픽셀 드로잉, 컬러맵 배열 패턴 |
| [skillsllm pixel-plugin](https://skillsllm.com/skill/pixel-plugin) | 애니메이션 확장 고려사항 |

### 비주얼 레퍼런스

- **타마고치 / 동물의 숲** — 둥근 머리 + 작은 몸 + 발 2개의 풀바디 비율
- **ShowHex 스타일** — 흰 본체 + 회색 윤곽선 + 감정 색 악센트만
- **Alter Ego 게임** — 픽셀 표정 레이어(눈·입) 오버레이 구조

---

## 2. 현재 구현 구조 (`FomoFace.tsx`)

### 2.1 그리드 정의

```
COLS = 16, ROWS = 18  →  총 288 픽셀 셀
pixel = size / (COLS + 2)  // 좌우 여백 1칸 확보
```

### 2.2 BASE 실루엣 — 컬러맵 문자열 배열

```
K = 윤곽선 (#6E6E82 회색)
W = 몸 (#F2F2EA 아이보리 화이트)
. = 투명 (skip)
```

```
"......KKKK......"   ← 머리 꼭대기
"....KKWWWWKK...."
"...KWWWWWWWWK..."
"..KWWWWWWWWWWK.."
".KWWWWWWWWWWWWK."
".KWWWWWWWWWWWWK."
"KWWWWWWWWWWWWWWK"   ← 7행 (눈 영역)
"KWWWWWWWWWWWWWWK"   ← 8행 (볼 영역)
"KWWWWWWWWWWWWWWK"   ← 9행
"KWWWWWWWWWWWWWWK"   ← 10행 (입 영역)
"KWWWWWWWWWWWWWWK"   ← 11행
".KWWWWWWWWWWWWK."
".KWWWWWWWWWWWWK."
"..KWWWWWWWWWWK.."
"..KWWWWWWWWWWK.."
"...KWWWWWWWWK..."
"...KWW....WWK..."   ← 발 (16행)
"....KK....KK...."   ← 발 끝 (17행)
```

### 2.3 표정 레이어 — EXPR 오버레이 시스템

표정은 BASE(W 픽셀) 위에 눈·입·볼 좌표 Set으로 덮어 그린다.

```ts
interface Expr {
  eyes: string[];    // `${row},${col}` 형식
  mouth: string[];
  cheeks: string[];
}
```

| 표정 | 눈 | 입 | 볼 | FOMO Index 대응 |
|---|---|---|---|---|
| `sleepy` | 가로선 2칸 (감긴 눈) | 점 1개 | 양측 1칸 | 0~20 무관심 |
| `calm` | 2×1 점 눈 | 가로 2칸 (옅은 미소) | 양측 1칸 | 21~40 관망 |
| `curious` | 2×1 점 눈 | 세로 2칸 (작은 O) | 양측 1칸 | 41~60 관심 |
| `excited` | 2×2 큰 눈 | 6픽셀 열린 입 | 양측 2칸 | 61~80 FOMO |
| `manic` | 2×2 눈 (더 위) | 8픽셀 크게 벌린 입 | 양측 2칸 | 81~100 광기 |

### 2.4 색 체계

```ts
OUTLINE = "#6E6E82"   // 윤곽선 — 회색
BODY    = "#F2F2EA"   // 본체 — 아이보리 화이트
EYE     = "#2A2A35"   // 눈·입 — 거의 검정

cheek = glow ?? "#FF9AA2"  // 볼터치: glow(감정색) 있으면 감정색, 없으면 옅은 분홍
```

감정 색(glow)은 **볼 픽셀 직접 채색 + `drop-shadow` 외곽광** 두 레이어로 표현.

```
filter: `drop-shadow(0 0 ${pixel * 1.4}px ${glow}99)`
```

흰 캐릭터에 색 악센트만 입히는 ShowHex 문법과 동일.

### 2.5 Props

```ts
face: FomoFaceType   // "sleepy" | "calm" | "curious" | "excited" | "manic"
glow?: string        // hex 색상 — EMOTION_COLORS[emotion] or stateGlow(score)
size?: number        // 기본값 168. 렌더링: HomeView=84, EmotionGate=92, SplashScreen=76
```

---

## 3. 사용처별 크기

| 컴포넌트 | size | 용도 |
|---|---|---|
| `HomeView.tsx` | **84px** | 메인 홈 — 포모 인덱스 옆 |
| `EmotionGate.tsx` | **92px** | 감정 선택 화면 중앙 |
| `SplashScreen.tsx` | **76px** | 진입 스플래시 |
| `FomoFace.tsx` default | 168px | 단독 showcase용 |

> 2026-06-08: 사용자 피드백으로 전체 30% 축소 (여백 확보).

---

## 4. 향후 작업 가이드라인

### 4.1 표정 추가/수정

`EXPR` 객체에 좌표 배열만 수정하면 된다. 툴:
- 16×18 격자를 그려서 행·열 번호 확인
- `k(row, col)` 헬퍼로 키 생성
- W 영역(6~13행 × 2~13열)에만 오버레이 가능

### 4.2 바디 형태 변경

`BASE` 배열의 문자열을 수정. 규칙:
- 각 행은 정확히 `COLS(16)` 길이
- K=윤곽, W=몸, .=투명 3종류만
- 발 영역(16~17행)은 `KWW....WWK` 패턴 유지 (좌우 발 분리)

### 4.3 애니메이션 확장

현재: CSS `fomo-float` (idle float, 6s ease-in-out) — `global.css`에 정의.

추가 예정 (고도화 시):
```css
/* 감정 선택 시 점프 */
@keyframes fomo-jump { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
/* 걸음 (발 픽셀 위치 변경 필요) */
@keyframes fomo-walk { ... }
```

> ⚠️ CSS animation만으로 픽셀 단위 발 움직임은 불가. 걷기 애니메이션은 BASE 배열을 2프레임으로 분리해 JS setInterval 토글 방식 필요.

### 4.4 시즌/소품 레이어

BASE 위에 세 번째 레이어(accessory) 좌표 Set 추가 패턴:
```ts
// 예: 크리스마스 모자
const HAT: string[] = [k(0,6), k(0,7), k(0,8), k(0,9), k(1,5), k(1,10)]
```
감정 표정 레이어 이후 마지막에 그리면 된다.

### 4.5 캘린더 아이콘화

캘린더 칸(작은 크기)에 삽입 시:
- `size={24}` 또는 `size={20}`
- `glow` 없이 감정 색으로 BASE W 픽셀을 직접 채색하는 variant 고려

---

## 5. 기술 선택 근거

| 대안 | 장점 | 선택 안 한 이유 |
|---|---|---|
| CSS + div 그리드 | 간단 | 픽셀 경계 안티앨리어싱, 크기 조절 불안정 |
| Canvas API | 고성능 | SSR 불가, React 생명주기 복잡 |
| PNG/GIF 스프라이트 | 표현력 높음 | 번들 크기, retina 대응, 색 동적 변경 불가 |
| **SVG `<rect shapeRendering="crispEdges">`** | SSR ⭕, 색 동적 변경 ⭕, 크기 자유, 번들 0 | — **현재 선택** |

`shapeRendering="crispEdges"` 가 핵심 — 서브픽셀 렌더링 없이 날카로운 픽셀 경계 보장.

---

## 6. 관련 파일

```
apps/fomo-web/components/FomoFace.tsx   ← 구현 본체
apps/fomo-web/components/HomeView.tsx   ← size=84 사용
apps/fomo-web/components/EmotionGate.tsx← size=92 사용
apps/fomo-web/components/SplashScreen.tsx← size=76 사용
packages/fomo-core/src/state.ts         ← scoreToFace() — FOMO Index → FomoFaceType 변환
docs/legacy/MASCOT.md                   ← 마스코트 정체성/역할 정의(legacy)
docs/legacy/DESIGN_FOMO.md              ← 구 색 토큰, 디자인 시스템(legacy)
```

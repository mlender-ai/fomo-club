import type { Config } from "tailwindcss";
import { EMOTION_COLORS } from "@fomo/core";

// 토큰: design/tokens.json(DTCG) 값과 정렬. 감정색은 @fomo/core 단일 소스(드리프트 테스트로 정합).
//
// 정본은 DS-00(v2) — docs/design/DS-00_TOKENS.md. 코드에서는 `ds` 네임스페이스로 노출한다.
//   색: bg-ds-bg / bg-ds-surface-1 / text-ds-text-2 / border-ds-border / text-ds-accent ...
//   간격: p-s4 gap-s2 px-gutter · radius: rounded-card rounded-block · 타이포: text-ds-display 등
// 아래 legacy/DESIGN.md-v1 토큰은 화면별 스펙(DS-01~06) 도착 시 화면 단위로 ds로 교체한다.
// 지금 값을 덮어쓰지 않는 이유: 렌더링이 조용히 바뀌는 것을 막기 위함(DS-00 §10).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── DS-00(v2) 정본. 신규 UI는 이것만 쓴다. docs/design/DS-00_TOKENS.md §2 ──
        ds: {
          bg: "#000000",
          "surface-1": "#101010",
          "surface-2": "#181818",
          border: "#242422",
          "text-1": "#FFFFFF",
          "text-2": "#9A9A96",
          "text-3": "#5A5A57",
          // 화면당 1회만. 우리 성적 자리 전용 — CTA·차트에 쓰지 않는다.
          accent: "#D4FF3F",
          "accent-ink": "#1A1A00",
          // 하락. 상승은 text-1(흰색). 빨강/초록 등락색 금지(§7).
          down: "#7A7A76",
          // ── WO-HOOK-01 카드 그림 전용(§4-2·§6-2). 본문 텍스트에 쓰지 않는다. ──
          /** A형 주가선 — 누적선(accent)보다 한 단 뒤로 물러나야 갭이 읽힌다. */
          "chart-line": "#4A4A48",
          /** C형 미매수·과거 매수일 막대 — 배경보다 아주 조금 밝은 정도. */
          "chart-bar": "#252523",
        },

        // 레거시 토큰(점진 마이그레이션 — 컴포넌트는 화면별 핸드오프로 DESIGN.md 토큰으로 전환).
        ink: "#000000",
        surface: "#0E0E0E",
        elevated: "#1A1A1A",
        hairline: "#2A2A2A",
        muted: "#8A8A8A",
        whiteout: "#FAFAFA",
        fomo: EMOTION_COLORS.fomo,
        fear: EMOTION_COLORS.fear,
        regret: EMOTION_COLORS.regret,
        greed: EMOTION_COLORS.greed,
        conviction: EMOTION_COLORS.conviction,

        // ── DESIGN.md v1 정본 토큰(추가). 핸드오프에서 위 레거시 대신 이걸 쓴다. docs/DESIGN.md §2. ──
        canvas: "#0B0B0C",
        "surface-base": "#141416",
        "surface-raised": "#1A1A1D",
        "surface-overlay": "#202024",
        "hairline-soft": "rgba(255,255,255,0.08)",
        "hairline-strong": "rgba(255,255,255,0.14)",
        "text-primary": "#F2F2F0",
        "text-secondary": "#8A8A86",
        "text-tertiary": "#5A5A57",
        // 브랜드(역할 인코딩 — 등락 사용 금지)
        orange: { DEFAULT: "#FF5A1F", "600": "#E0440F", dim: "#5A2A14" },
        neon: { DEFAULT: "#D8FF3A", "600": "#B6E000", dim: "#2E3A0A" },
        // 봉인색 — 등락 데이터 전용(브랜드로 사용 금지)
        up: "#FF4D4D",
        down: "#4D8DFF",
        flat: "#8A8A86",
        // 근거 보조(헤어라인 수준, fill 판정 금지)
        "flag-green": "#3FB984",
        "flag-amber": "#E0A82E",
      },
      borderRadius: {
        // DS-00 §5
        card: "16px",
        block: "10px",
        pill: "999px",
        // v1 레거시
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      spacing: {
        // DS-00 §4 — 4의 배수만
        s1: "4px",
        s2: "8px",
        s3: "12px",
        s4: "16px",
        s5: "24px",
        s6: "32px",
        gutter: "20px",
      },
      borderWidth: {
        /**
         * **`hairline` 이 아니라 `hair` 다.** 레거시 색 토큰(`colors.hairline = #2A2A2A`)과 이름이
         * 같으면 Tailwind 가 같은 클래스로 색·폭 유틸을 둘 다 만들고, 나중에 나오는 색 규칙이
         * `border-ds-border` 를 덮는다 — 실측에서 DS 경계선이 전부 `#2A2A2A` 로 나왔다.
         */
        hair: "0.5px",
      },
      height: {
        // DS-00 §5·§6
        "btn-primary": "48px",
        "btn-secondary": "44px",
        chip: "26px",
        touch: "44px",
      },
      // 터치 타겟은 44×44 다 — 높이만 주면 폭이 내용에 붙어 계약이 반만 성립한다(DS-00 §6).
      width: {
        touch: "44px",
      },
      fontSize: {
        // DS-00 §3-1. weight는 400·500 두 개만.
        "ds-display": ["24px", { lineHeight: "1.32", letterSpacing: "-0.02em", fontWeight: "500" }],
        // 중간 두 단 — DS-03 ① 결론(22) · DS-02 덱 타이틀(20). display(24)와 title(17) 사이.
        "ds-display-sm": ["22px", { lineHeight: "1.32", letterSpacing: "-0.02em", fontWeight: "500" }],
        "ds-title-lg": ["20px", { lineHeight: "1.32", letterSpacing: "-0.01em", fontWeight: "500" }],
        "ds-title": ["17px", { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "500" }],
        "ds-body": ["14px", { lineHeight: "1.65", letterSpacing: "0", fontWeight: "400" }],
        "ds-data": ["14px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "400" }],
        "ds-label": ["12px", { lineHeight: "1.4", letterSpacing: "0.04em", fontWeight: "400" }],
        "ds-caption": ["11px", { lineHeight: "1.5", letterSpacing: "0.02em", fontWeight: "400" }],
        // ── WO-HOOK-01 등재분(DS-00 §3-1 — 화면 스펙이 요구하면 등재하고 쓴다) ──
        /** 카드 후킹 문장(§4-1). display(24)보다 작다 — 3형 전부 2줄에 들어가야 한다. */
        "ds-hook": ["19px", { lineHeight: "1.35", letterSpacing: "-0.02em", fontWeight: "500" }],
        /** B형 큰 숫자(§5-1). weight 600 은 이 한 자리 예외다 — DS-00 §3-1 에 사유와 함께 등재. */
        "ds-ratio": ["52px", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "600" }],
        /** B형에서 큰 숫자를 문장으로 되읽는 줄(§5-2). */
        "ds-ratio-line": ["16px", { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "500" }],
        /** 카드 가격(§3-②). data(14)보다 한 단 크다. */
        "ds-price": ["15px", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "400" }],
        /** 그림 범례·캡션(§4-2·§6-2). 11px 하한의 유일한 예외 — DS-00 §3-1 에 사유와 함께 등재. */
        "ds-legend": ["10px", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "400" }],
      },
      fontFamily: {
        body: ["Pretendard", "system-ui", "sans-serif"],
        sans: ["Pretendard", "system-ui", "sans-serif"],
        // DS-00 §3 — 수치·라벨·날짜는 mono(Departure Mono, 번들 포함), 문장은 Pretendard.
        // 에셋이 없던 동안 mono 가 Pretendard 로 폴백했고, DS-06 §6-2 에서 실물이 들어왔다.
        number: ["Departure Mono", "Pretendard", "monospace"],
        mono: ["Departure Mono", "Pretendard", "monospace"],
        pixel: ["Departure Mono", "Pretendard", "monospace"],
        display: ["Departure Mono", "Pretendard", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

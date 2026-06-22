import type { Config } from "tailwindcss";
import { EMOTION_COLORS } from "@fomo/core";

// 토큰: design/tokens.json(DTCG) 값과 정렬. 감정색은 @fomo/core 단일 소스(드리프트 테스트로 정합).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
        // DESIGN.md §5
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      fontFamily: {
        // 본문 Pretendard(담담) / 픽셀 악센트 Galmuri(인디게임의 몸) — design/tokens.json
        body: ["Pretendard", "system-ui", "sans-serif"],
        pixel: ["Galmuri11", "Departure Mono", "monospace"],
        // DESIGN.md v1: 한글·문장 sans / 라틴 디스플레이·데이터 mono(Departure Mono 에셋 셋업 후 우선).
        sans: ["Pretendard", "system-ui", "sans-serif"],
        display: ["Silkscreen", "Departure Mono", "Galmuri11", "monospace"],
        mono: ["Departure Mono", "Galmuri11", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";
import { EMOTION_COLORS } from "@fomo/core";

// 토큰: design/tokens.json(DTCG) 값과 정렬. 감정색은 @fomo/core 단일 소스(드리프트 테스트로 정합).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        // 본문 Pretendard(담담) / 픽셀 악센트 Galmuri(인디게임의 몸) — design/tokens.json
        body: ["Pretendard", "system-ui", "sans-serif"],
        pixel: ["Galmuri11", "Departure Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

import { EMOTION_COLORS } from "@fomo/core";

/**
 * FOMO Club 다크 테마 토큰.
 *
 * 정본: DS-00(v2) — docs/design/DS-00_TOKENS.md, 기계가독 소스는 design/tokens.json 의 `ds` 블록.
 * 신규 화면은 `DS` 만 쓴다. 아래 FomoColors/Spacing/Radius 는 v1 레거시로,
 * 화면별 스펙(DS-01~06) 도착 시 화면 단위로 DS 로 교체한다(DS-00 §10).
 */
export const DS = {
  color: {
    bg: "#000000",
    surface1: "#101010",
    surface2: "#181818",
    border: "#242422",
    text1: "#FFFFFF",
    text2: "#9A9A96",
    text3: "#5A5A57",
    /** 화면당 1회만. 우리 성적 자리 전용 — CTA·차트 금지. */
    accent: "#D4FF3F",
    accentInk: "#1A1A00",
    /** 하락. 상승은 text1(흰색). 빨강/초록 등락색 금지(DS-00 §7). */
    down: "#7A7A76",
  },
  /** 4의 배수만. gutter=화면 좌우 여백. */
  space: { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, gutter: 20 },
  radius: { card: 16, block: 10, pill: 999 },
  /** weight 는 "400" 과 "500" 두 개만. 11px 미만 금지. */
  type: {
    display: { fontSize: 24, fontWeight: "500", lineHeight: 32, letterSpacing: -0.48 },
    title: { fontSize: 17, fontWeight: "500", lineHeight: 24, letterSpacing: -0.17 },
    body: { fontSize: 14, fontWeight: "400", lineHeight: 23, letterSpacing: 0 },
    data: { fontSize: 14, fontWeight: "400", lineHeight: 20, letterSpacing: 0, mono: true },
    label: { fontSize: 12, fontWeight: "400", lineHeight: 17, letterSpacing: 0.48, mono: true },
    caption: { fontSize: 11, fontWeight: "400", lineHeight: 17, letterSpacing: 0.22 },
  },
  size: { buttonPrimary: 48, buttonSecondary: 44, chip: 26, hairline: 0.5, touchMin: 44 },
} as const;

/** @deprecated v1 레거시. DS 로 이관 중(DS-00 §9). */
export const FomoColors = {
  ink: "#000000",
  surface: "#121212",
  elevated: "#1e1e1e",
  hairline: "#2e2e2e",
  muted: "#8a8a8a",
  whiteout: "#fafafa",
  /** @deprecated 데이터 계약으로만 존재. UI 사용 금지(DS-00 §9). */
  emotion: EMOTION_COLORS,
} as const;

/** @deprecated DS.space 를 쓴다. */
export const Spacing = { s4: 4, s8: 8, s12: 12, s16: 16, s24: 24, s32: 32, s40: 40 } as const;
/** @deprecated DS.radius 를 쓴다. */
export const Radius = { sm: 6, md: 12, lg: 16, pill: 9999 } as const;

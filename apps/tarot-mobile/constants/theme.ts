// DESIGN.md 기반 디자인 토큰 — Trading Taro

export const Colors = {
  // Surfaces
  midnightAbyss:  "#000000",
  ebonyCanvas:    "#121212",
  graphiteBase:   "#242424",
  steelSurface:   "#2e2e2e",
  carbonBorder:   "#393939",
  ironOutline:    "#4d4d4d",

  // Text
  midGrayText:      "#898989",
  silverHighlight:  "#b4b4b4",
  whiteout:         "#fafafa",

  // Accent — Taro Essence
  taroEssence:    "#3ecf8e",
  deepInsight:    "#1f4b37",
  arcaneCta:      "#006239",
  luminousReveal: "#00c573",
  voidGreen:      "#002918",

  // Chart — 명도 대비 강화 (#333 Designer)
  chartUp:        "#32C874",
  chartDown:      "#FF4C41",

  // Semantic aliases (backward compat with existing code)
  bg:      "#121212",
  surface: "#2e2e2e",
  card:    "#121212",
  border:  "#393939",
  accent:  "#3ecf8e",
  gold:    "#3ecf8e",
  text:    "#fafafa",
  muted:   "#898989",
} as const;

export const Typography = {
  size: {
    caption:    12,
    bodySm:     14,
    body:       16,
    subheading: 18,
    heading:    24,
    headingLg:  36,
    display:    72,
  },
  lineHeight: {
    caption:    1.56,
    bodySm:     1.5,
    body:       1.43,
    subheading: 1.38,
    heading:    1.33,
    headingLg:  1.25,
    display:    1.11,
  },
  letterSpacing: -0.007,
  weight: {
    regular: "400" as const,
    medium:  "500" as const,
  },
} as const;

export const Spacing = {
  s8:   8,
  s16:  16,
  s24:  24,
  s32:  32,
  s40:  40,
  s48:  48,
  s64:  64,
  s80:  80,
  s96:  96,
  s112: 112,
  s128: 128,
  s224: 224,
} as const;

export const Radius = {
  cards:       16,
  inputs:       6,
  buttons:      6,
  pill:      9999,
} as const;

export const CardPadding = Spacing.s24;

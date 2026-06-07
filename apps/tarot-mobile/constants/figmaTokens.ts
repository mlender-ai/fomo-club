/**
 * Figma → theme.ts bridge
 *
 * When Figma MCP is configured (FIGMA_ACCESS_TOKEN set in .claude/settings.json),
 * run `/browse` or ask Claude to fetch variables from your Figma file and paste
 * the values here. The shape must match what theme.ts consumes.
 *
 * Usage:
 *   1. Set FIGMA_ACCESS_TOKEN in .claude/settings.json
 *   2. Ask: "피그마에서 Trading Taro 컬러 토큰 가져와서 figmaTokens.ts 업데이트해줘"
 *   3. Claude will fetch variables via Figma MCP and update this file
 *   4. theme.ts will be updated to import from here
 *
 * Figma file: https://www.figma.com/YOUR_FILE_KEY (replace when available)
 */

export const FigmaColors = {
  // Surfaces — Figma: "Color/Surface/*"
  midnightAbyss:  "#000000",
  ebonyCanvas:    "#121212",
  graphiteBase:   "#242424",
  steelSurface:   "#2e2e2e",
  carbonBorder:   "#393939",
  ironOutline:    "#4d4d4d",

  // Text — Figma: "Color/Text/*"
  midGrayText:      "#898989",
  silverHighlight:  "#b4b4b4",
  whiteout:         "#fafafa",

  // Accent — Figma: "Color/Accent/Taro Essence"
  taroEssence:    "#3ecf8e",
  deepInsight:    "#1f4b37",
  arcaneCta:      "#006239",
  luminousReveal: "#00c573",
  voidGreen:      "#002918",

  // Chart — 명도 대비를 높여 시인성 강화 (#333 Designer)
  chartUp:        "#32C874", // 상승 — 원래 #3ecf8e 대비 채도 낮추고 명도 높임
  chartDown:      "#FF4C41", // 하락 — 원래 #ff3b30 대비 채도 낮추고 명도 높임
} as const;

export const FigmaTypography = {
  // Figma: "Typography/Size/*"
  size: {
    caption:    12,
    bodySm:     14,
    body:       16,
    subheading: 18,
    heading:    24,
    headingLg:  36,
    display:    72,
  },
} as const;

export const FigmaSpacing = {
  // Figma: "Spacing/*"
  s8:   8,
  s16:  16,
  s24:  24,
  s32:  32,
} as const;

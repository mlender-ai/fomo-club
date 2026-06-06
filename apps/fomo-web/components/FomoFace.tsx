import type { FomoFace as FomoFaceType } from "@fomo/core";

/**
 * 마스코트 '포모' (웹). docs/MASCOT.md / DESIGN_FOMO.md.
 * 검은 얼굴 + 흰 눈 2점 + 작은 입. 5표정은 눈/입 변형으로, 감정·지수 색은 배경광(glow)으로만.
 * 형태는 미확정(MASCOT §10) — 원칙(흑백 얼굴+감정색 glow) 안에서 love mark 위해 표정 디테일.
 */
export function FomoFace({
  face,
  glow,
  size = 168,
}: {
  face: FomoFaceType;
  glow?: string | undefined;
  size?: number;
}) {
  const e = EXPR[face];
  const eyeW = size * 0.11;
  const gap = size * 0.18;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: "#000",
        border: "1px solid #2A2A2A",
        // 감정/지수 색은 배경광으로만 (얼굴은 흑백 유지)
        boxShadow: glow ? `0 0 36px 2px ${glow}, inset 0 0 22px ${glow}33` : "0 0 0 transparent",
        transition: "box-shadow 420ms cubic-bezier(0.16,1,0.3,1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "fomo-float 6s ease-in-out infinite",
      }}
    >
      <div style={{ display: "flex", gap, alignItems: "center" }}>
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              width: eyeW,
              height: eyeW * e.eyeH,
              borderRadius: "9999px",
              background: "#FAFAFA",
              opacity: e.eyeO,
              transition: "all 280ms ease",
            }}
          />
        ))}
      </div>
      {/* 입 — 표정별 작은 변형 */}
      <span
        style={{
          marginTop: size * 0.1,
          width: size * e.mouthW,
          height: e.mouthShape === "o" ? size * 0.06 : Math.max(2, size * 0.018),
          borderRadius: "9999px",
          background: e.mouthShape === "none" ? "transparent" : "#FAFAFA",
          opacity: e.mouthO,
          transition: "all 280ms ease",
        }}
      />
    </div>
  );
}

// 표정 사양: 눈 높이비/투명도, 입 폭/모양/투명도
const EXPR: Record<FomoFaceType, { eyeH: number; eyeO: number; mouthW: number; mouthShape: "line" | "o" | "none"; mouthO: number }> = {
  sleepy: { eyeH: 0.28, eyeO: 0.65, mouthW: 0.08, mouthShape: "line", mouthO: 0.4 }, // 졸린·반쯤 감김
  calm: { eyeH: 0.85, eyeO: 0.9, mouthW: 0.1, mouthShape: "line", mouthO: 0.7 }, // 차분
  curious: { eyeH: 1.05, eyeO: 1, mouthW: 0.07, mouthShape: "o", mouthO: 0.8 }, // 또렷·두리번
  excited: { eyeH: 1.35, eyeO: 1, mouthW: 0.12, mouthShape: "o", mouthO: 1 }, // 들뜸
  manic: { eyeH: 1.55, eyeO: 1, mouthW: 0.16, mouthShape: "o", mouthO: 1 }, // 광기
};

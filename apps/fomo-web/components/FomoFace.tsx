import { memo, useMemo } from "react";
import type { FomoFace as FomoFaceType } from "@fomo/core";

/**
 * 마스코트 '포모' (웹) — 레트로 풀바디 픽셀 캐릭터 초안. docs/MASCOT.md / DESIGN_FOMO.md.
 * 타마고치/동물의숲/ShowHex 류: 둥근 머리 + 작은 몸 + 발 + 윤곽선 + 볼터치.
 * 흰 본체 + 회색 윤곽 + 검정 눈, 감정색(glow)은 볼터치 + 외곽광으로(레퍼런스의 '흰 캐릭터 + 색 악센트' 문법).
 * 5표정은 눈·입 픽셀 오버레이로. 애니메이션은 idle float만(초안 — 고도화 전).
 * React.memo + useMemo: face/glow/size가 동일하면 SVG 전체 재계산·리렌더 방지.
 */

const COLS = 16;
const ROWS = 18;

// 본체 실루엣. K=윤곽선, W=몸(흰), .=투명. 둥근 머리 일체형 몸 + 발 2개.
const BASE = [
  "......KKKK......",
  "....KKWWWWKK....",
  "...KWWWWWWWWK...",
  "..KWWWWWWWWWWK..",
  ".KWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWK.",
  "KWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWK",
  "KWWWWWWWWWWWWWWK",
  ".KWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWK.",
  "..KWWWWWWWWWWK..",
  "..KWWWWWWWWWWK..",
  "...KWWWWWWWWK...",
  "...KWW....WWK...",
  "....KK....KK....",
];

// 표정별 눈·입·볼 좌표("row,col"). 본체(W) 위에 덮어 그린다.
interface Expr {
  eyes: string[];
  mouth: string[];
  cheeks: string[];
}
const k = (r: number, c: number) => `${r},${c}`;

const EXPR: Record<FomoFaceType, Expr> = {
  // 졸림 — 감긴 눈(가로선), 작은 입
  sleepy: {
    eyes: [k(7, 4), k(7, 5), k(7, 10), k(7, 11)],
    mouth: [k(10, 8)],
    cheeks: [k(8, 2), k(8, 13)],
  },
  // 차분 — 점 눈, 옅은 미소(가로 2칸)
  calm: {
    eyes: [k(6, 4), k(7, 4), k(6, 11), k(7, 11)],
    mouth: [k(10, 7), k(10, 8)],
    cheeks: [k(8, 2), k(8, 13)],
  },
  // 또렷 — 점 눈, 작은 동그란 입
  curious: {
    eyes: [k(6, 4), k(7, 4), k(6, 11), k(7, 11)],
    mouth: [k(9, 8), k(10, 8)],
    cheeks: [k(8, 2), k(8, 13)],
  },
  // 들뜸 — 큰 눈(2x2), 벌어진 입, 진한 볼
  excited: {
    eyes: [k(6, 3), k(6, 4), k(7, 3), k(7, 4), k(6, 11), k(6, 12), k(7, 11), k(7, 12)],
    mouth: [k(9, 7), k(9, 8), k(10, 6), k(10, 9), k(11, 7), k(11, 8)],
    cheeks: [k(8, 2), k(8, 3), k(8, 12), k(8, 13)],
  },
  // 광기 — 큰 눈 + 크게 벌어진 입
  manic: {
    eyes: [k(5, 3), k(5, 4), k(6, 3), k(6, 4), k(5, 11), k(5, 12), k(6, 11), k(6, 12)],
    mouth: [k(9, 6), k(9, 7), k(9, 8), k(9, 9), k(10, 6), k(10, 9), k(11, 7), k(11, 8)],
    cheeks: [k(8, 2), k(8, 3), k(8, 12), k(8, 13)],
  },
};

const OUTLINE = "#6E6E82";
const BODY = "#F2F2EA";
const EYE = "#2A2A35";

export const FomoFace = memo(
  function FomoFace({
    face,
    glow,
    size = 168,
  }: {
    face: FomoFaceType;
    glow?: string | undefined;
    size?: number;
  }) {
    const pixel = size / (COLS + 2); // 좌우 여백 1칸
    const w = COLS * pixel;
    const h = ROWS * pixel;

    // face·glow·size가 바뀔 때만 셀 배열 재계산
    const cells = useMemo(() => {
      const e = EXPR[face];
      const eyeSet = new Set(e.eyes);
      const mouthSet = new Set(e.mouth);
      const cheekSet = new Set(e.cheeks);
      const cheek = glow ?? "#FF9AA2"; // glow 있으면 감정색, 없으면 옅은 분홍

      const result: { x: number; y: number; fill: string }[] = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ch = BASE[r]![c];
          if (ch === ".") continue;
          const key = `${r},${c}`;
          let fill: string;
          if (eyeSet.has(key) || mouthSet.has(key)) fill = EYE;
          else if (cheekSet.has(key)) fill = cheek;
          else if (ch === "K") fill = OUTLINE;
          else fill = BODY;
          result.push({ x: c, y: r, fill });
        }
      }
      return result;
    }, [face, glow]);

    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // 감정/지수 색은 외곽광으로만
          filter: glow ? `drop-shadow(0 0 ${pixel * 1.4}px ${glow}99)` : "none",
          transition: "filter 420ms cubic-bezier(0.16,1,0.3,1)",
          animation: "fomo-float 6s ease-in-out infinite",
        }}
      >
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
          {cells.map(({ x, y, fill }) => (
            <rect key={`${x},${y}`} x={x * pixel} y={y * pixel} width={pixel} height={pixel} fill={fill} />
          ))}
        </svg>
      </div>
    );
  }
);

"use client";

import { useEffect, useState } from "react";
import { isKrStockCode, stockLogoApiSrcForStock } from "@/lib/stockLogo";

/**
 * 종목 로고 배지 — KR 은 네이버 로고 프록시, US 는 parqet, 실패 시 이니셜 원형.
 * StockSwipeDeck 의 LogoBadge 를 공용으로 추출(WO-P2 §3 로고 복원) — 서버 스키마 변경 0.
 */
const NEON = "#D8FF3A";

export function StockLogoBadge({
  name,
  naverCode,
  symbol,
  size = 36,
}: {
  name: string;
  naverCode?: string | undefined;
  symbol?: string | undefined;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const ch = name.trim().slice(0, 1) || "·";
  const usSymbol = symbol && !isKrStockCode(symbol.trim()) ? symbol : undefined;
  const src =
    stockLogoApiSrcForStock({ naverCode, symbol, name }) ??
    (usSymbol ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(usSymbol)}` : undefined);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const box = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
        style={box}
        className="shrink-0 rounded-full bg-white object-contain p-1"
      />
    );
  }
  return (
    <span
      style={{ ...box, backgroundColor: "rgba(216,255,58,0.14)", color: NEON }}
      className="flex shrink-0 items-center justify-center rounded-full text-base font-bold"
      aria-hidden
    >
      {ch}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * 롤링 배너 — items를 일정 간격으로 한 줄씩 교체(페이드). 고래/시장 신호용.
 * DESIGN_FOMO: surface 1줄, 픽셀 메타, 절제된 모션.
 */
export function RollingBanner({ items, intervalMs = 4000 }: { items: string[]; intervalMs?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setI((p) => (p + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [items, intervalMs]);

  if (items.length === 0) return null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-hairline bg-surface px-4 py-2.5">
      <p
        key={i}
        className="fomo-rise truncate font-pixel text-xs text-muted"
        aria-live="polite"
      >
        {items[i]}
      </p>
    </div>
  );
}

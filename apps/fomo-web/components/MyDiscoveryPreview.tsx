"use client";

import type { WatchItem } from "@/lib/watchlist";

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function MyDiscoveryPreview({
  items,
  onOpen,
}: {
  items: readonly WatchItem[];
  onOpen: (item: WatchItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs text-muted">내 발굴함</p>
        <span className="font-pixel text-[10px] text-muted">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.slice(0, 8).map((item) => (
          <button
            key={`${item.stock}-${item.ts}`}
            onClick={() => onOpen(item)}
            className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-muted"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-base font-semibold text-whiteout">{item.stock}</span>
              <span className="shrink-0 text-[11px] text-muted">{relativeTime(item.ts)}</span>
            </div>
            {(item.sector || item.reason) && (
              <div className="mt-1.5 flex flex-col gap-1">
                {item.sector && <span className="text-[11px] text-muted"># {item.sector}</span>}
                {item.reason && <span className="line-clamp-2 text-xs leading-5 text-muted">{item.reason}</span>}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

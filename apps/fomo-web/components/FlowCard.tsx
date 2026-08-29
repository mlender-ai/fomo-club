"use client";

import type { QuietPickFlowCard } from "@/lib/fomoApi";

/**
 * WO-RESET-08 §B — **자금 흐름 카드.** 종목 카드가 아니라 시장 카드다.
 *
 * ## 그림은 막대 두 개와 화살표. 그게 전부다 (§B-2)
 *
 * WO 가 못을 박았다 — *"3D·애니메이션·산키 다이어그램 쓰지 않는다."* 흐름을 화려하게
 * 그리면 그림이 주인공이 되고 숫자가 장식이 된다. 여기서 보여줄 것은 **어디서 빠져
 * 어디로 들어왔나** 하나다.
 *
 * 왼쪽(빠진 곳)은 회색, 오른쪽(들어간 곳)은 라임 — 다른 카드와 같은 문법이다.
 * accent 는 언제나 "지금 무슨 일이 벌어지고 있는가" 를 가리킨다.
 *
 * ## 인과로 말하지 않는다 (§E-1)
 *
 * 문장은 서버가 만들어 보낸다(`hook`). 화면이 「이동」·「옮겨갔다」 같은 말을 덧붙이지
 * 않는다 — 같은 돈인지 우리는 모른다.
 */
export function FlowCard({ card, onDetail }: { card: QuietPickFlowCard; onDetail?: () => void }) {
  const scale = Math.max(Math.abs(card.fromNet), Math.abs(card.toNet));
  const width = (v: number) => (scale > 0 ? `${Math.max(6, (Math.abs(v) / scale) * 100)}%` : "0%");

  return (
    <div className="flex flex-col rounded-card bg-ds-surface-1 p-s4" data-testid="flow-card" data-card-type="flow">
      {/* 종목 카드가 아니라는 것을 맨 위에서 밝힌다 — 가릴 종목명도 없다(§B-4). */}
      <p className="font-mono text-ds-label text-ds-text-3">돈이 옮겨가고 있어요</p>

      <p
        className="mt-[20px] whitespace-pre-line break-keep text-ds-hook text-ds-text-1"
        data-testid="flow-hook"
      >
        {card.hook}
      </p>

      {/* ── 그림: 막대 둘 + 화살표 하나 ── */}
      <div className="mt-[20px]" data-testid="flow-figure">
        <div className="flex items-center gap-s3">
          <span className="w-[72px] shrink-0 truncate text-right font-mono text-ds-label text-ds-text-2">
            {card.fromSector}
          </span>
          <span className="h-[10px] flex-1 overflow-hidden rounded-[2px] bg-ds-chart-bar/30" aria-hidden>
            <span className="block h-full bg-ds-chart-bar" style={{ width: width(card.fromNet) }} />
          </span>
        </div>

        {/* 화살표 하나로 방향을 표시한다. 애니메이션 없음. */}
        <p className="my-s2 text-center font-mono text-ds-label text-ds-text-3" aria-hidden>
          ↓
        </p>

        <div className="flex items-center gap-s3">
          <span className="w-[72px] shrink-0 truncate text-right font-mono text-ds-label text-ds-text-1">
            {card.toSector}
          </span>
          <span className="h-[10px] flex-1 overflow-hidden rounded-[2px] bg-ds-chart-bar/30" aria-hidden>
            <span className="block h-full bg-ds-accent" style={{ width: width(card.toNet) }} />
          </span>
        </div>
      </div>

      {card.support.length > 0 && (
        <div className="mt-[18px] space-y-[2px]" data-testid="flow-support">
          {card.support.map((line) => (
            <p key={line} className="break-keep text-ds-label text-ds-text-2">
              {line}
            </p>
          ))}
        </div>
      )}

      {onDetail && (
        <button
          type="button"
          onClick={onDetail}
          data-testid="flow-cta"
          className="tap-button mt-[18px] flex h-touch w-full items-center justify-center rounded-block border-hair border-ds-border bg-ds-surface-2 text-[14px] text-ds-text-1"
        >
          어떤 종목들인지 보기
        </button>
      )}
    </div>
  );
}

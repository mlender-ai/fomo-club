"use client";

import { useMemo, useState } from "react";
import { StockInsightView, type StockContext } from "@/components/KeywordDepthPage";
import type { DeckNarrative, DeckNarrativeStock } from "@/lib/discoveryDeck";
import { CaretDownIcon, CaretUpIcon } from "@/components/icons";

const DIR_COLOR: Record<string, string> = { up: "#FF4D4D", down: "#3B82F6", flat: "#8A8A86" };

function cleanText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function relationLabel(relation: DeckNarrativeStock["relation"]): string {
  switch (relation) {
    case "trigger":
      return "트리거";
    case "customer":
      return "수요처";
    case "supplier":
      return "공급사";
    case "material":
      return "원재료";
    case "beneficiary":
      return "확산 수혜";
    case "peer":
    default:
      return "동행";
  }
}

function changeParts(changePct: number): { text: string; dir: "up" | "down" | "flat" } {
  const dir = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  return { text: `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`, dir };
}

function relationSentence(stock: DeckNarrativeStock, card: DeckNarrative): string {
  const reason = cleanText(stock.relationReason);
  if (stock.relation === "trigger") {
    const event = cleanText(card.trigger.headline);
    return [event ? `사건 상세: ${event}` : "사건 상세: 원문 사건의 직접 당사자입니다.", reason].filter(Boolean).join(" ");
  }
  return `동행 근거: ${reason || "같은 사건 묶음에서 당일 등락이 함께 확인됐어요."}`;
}

function buildStoryDescription(card: DeckNarrative): string[] {
  const trigger = card.stocks.find((stock) => stock.relation === "trigger" || stock.ticker === card.trigger.anchorTicker) ?? card.stocks[0];
  const companions = card.stocks.filter((stock) => stock.ticker !== trigger?.ticker);
  const companionNames = companions.slice(0, 3).map((stock) => `${stock.name}(${relationLabel(stock.relation)})`).join(", ");
  const relationBasis = companions
    .slice(0, 2)
    .map((stock) => cleanText(stock.relationReason))
    .filter(Boolean)
    .join(" ");

  const lines = [
    `${cleanText(card.trigger.headline)} 원문을 기준으로 ${trigger?.name ?? card.trigger.anchorTicker}가 사건의 직접 당사자로 잡혔어요.`,
  ];
  if (companionNames && relationBasis) {
    lines.push(`${companionNames}은 ${relationBasis} 그래서 같은 스토리 안의 연결 종목으로 묶였어요.`);
  } else if (companionNames) {
    lines.push(`${companionNames}은 카드에 기록된 관계와 당일 등락 사실 때문에 같은 사건 묶음에 들어왔어요.`);
  }
  lines.push("가격 방향은 당일 등락 사실만 보여주고, 사건이 주가를 움직였다고 단정하지 않아요.");
  return lines;
}

function storyVerdict(card: DeckNarrative): string {
  const trigger = card.stocks.find((stock) => stock.relation === "trigger");
  const companions = card.stocks.filter((stock) => stock.relation !== "trigger");
  const sameDirection =
    companions.length > 0 &&
    trigger &&
    companions.filter((stock) => Math.sign(stock.changePct) === Math.sign(trigger.changePct)).length >= Math.ceil(companions.length / 2);
  if (sameDirection) {
    return "사건과 동행 등락이 같은 방향으로 확인된 카드라, 지속성은 후속 공시와 추가 원문 확인이 필요해요.";
  }
  return "원문 사건과 관계 메모로 묶은 단발 스토리 성격이라, 다음 재료가 이어지는지 확인이 필요해요.";
}

function stockContext(card: DeckNarrative, stock: DeckNarrativeStock): StockContext {
  return {
    reason: relationSentence(stock, card),
    sourceLabel: card.source,
    ...(card.trigger.url ? { sourceUrl: card.trigger.url } : {}),
    ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
    ...(stock.symbol ? { symbol: stock.symbol } : {}),
    market: stock.market,
    country: stock.country,
  };
}

function SourceLink({ card }: { card: DeckNarrative }) {
  const label = `${card.source} · ${card.asOf}`;
  if (!card.trigger.url) {
    return <span className="text-[12px] leading-5 text-muted">{label}</span>;
  }
  return (
    <a href={card.trigger.url} target="_blank" rel="noreferrer" className="text-[12px] leading-5 text-muted underline-offset-4 hover:text-whiteout hover:underline">
      원문 보기 · {label}
    </a>
  );
}

export function NarrativeDepthPage({
  card,
  onClose,
  inline = false,
}: {
  card: DeckNarrative;
  onClose: () => void;
  inline?: boolean;
}) {
  const [selectedStock, setSelectedStock] = useState<DeckNarrativeStock | null>(null);
  const description = useMemo(() => buildStoryDescription(card), [card]);

  if (selectedStock) {
    return (
      <StockInsightView
        stock={selectedStock.name}
        context={stockContext(card, selectedStock)}
        onClose={() => setSelectedStock(null)}
        inline={inline}
        inlineBackLabel="스토리"
      />
    );
  }

  return (
    <div className={inline ? "flex h-full min-h-0 flex-col" : "fixed inset-0 z-[70] bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"}>
      <div className={inline ? "flex h-full min-h-0 flex-col" : "mx-auto flex h-full max-w-md flex-col"}>
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-whiteout" aria-label="뒤로">
            ← 뒤로
          </button>
          <span className="font-pixel text-[11px] text-muted">STORY</span>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-6">
          <p className="font-pixel text-[11px] uppercase tracking-wide text-muted">사건</p>
          <h2 className="mt-3 text-2xl font-bold leading-8 text-whiteout">{card.headline}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{cleanText(card.trigger.headline)}</p>

          <div className="mt-6 space-y-3 rounded-xl border border-hairline bg-surface px-4 py-4">
            {description.map((line) => (
              <p key={line} className="text-sm leading-6 text-whiteout">
                {line}
              </p>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-hairline bg-white/[0.035] px-4 py-3">
            <span className="block text-[11px] text-muted">사건 판단</span>
            <p className="mt-1 text-sm leading-6 text-whiteout">{storyVerdict(card)}</p>
          </div>

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-whiteout">연결 종목</h3>
              <span className="text-[11px] text-muted">{card.stocks.length}개</span>
            </div>
            <div className="space-y-2.5">
              {card.stocks.map((stock) => {
                const change = changeParts(stock.changePct);
                return (
                  <button
                    key={`${card.id}:${stock.ticker}`}
                    type="button"
                    onClick={() => setSelectedStock(stock)}
                    className="block w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-whiteout/20"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-base font-bold text-whiteout">{stock.name}</span>
                          <span className="shrink-0 rounded-full border border-hairline-soft px-2 py-0.5 text-[10px] text-muted">
                            {relationLabel(stock.relation)}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" style={{ color: DIR_COLOR[change.dir] }}>
                        {change.dir === "up" && <CaretUpIcon size={11} />}
                        {change.dir === "down" && <CaretDownIcon size={11} />}
                        {change.text}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{relationSentence(stock, card)}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mt-7 border-t border-hairline pt-4">
            <SourceLink card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}

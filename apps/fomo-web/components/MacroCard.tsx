"use client";

import { CardShell, CardCta } from "@/components/CardShell";
import { Sparkline } from "@/components/Sparkline";
import type { QuietPickMacroCard } from "@/lib/fomoApi";

/**
 * WO-RESET-09 §B-1 — **거시 카드.** 종목 카드가 아니라 시장 카드다.
 *
 * ## 마지막 줄이 이 카드의 전부다
 *
 * 환율 숫자는 어디에나 있다. **「우리가 최근 짚은 종목 중 4곳이 여기 닿아요」** 는
 * 우리만 말할 수 있다. 그래서 연결이 2곳 미만이면 서버가 애초에 카드를 안 만든다.
 *
 * ## 예측하지 않는다 (§F-1)
 *
 * 문장은 전부 서버가 만들어 보낸다. 화면이 「오를 거예요」 류를 덧붙이지 않는다 —
 * 일반 원리(`환율이 오르면 수출하는 회사에 유리해요`)와 사실만 쓴다.
 *
 * ## 관측일을 밝힌다
 *
 * 거시 지표는 하루이틀 늦게 나온다. 그 사실을 숨기지 않는다 — 공시 카드가 공시일을
 * 쓰는 것과 같은 규칙이다.
 */
export function MacroCard({ card, onDetail }: { card: QuietPickMacroCard; onDetail?: () => void }) {
  return (
    <CardShell
      kind="macro"
      testId="macro-card"
      /* 종목 카드가 아니라는 것을 맨 위에서 밝힌다 — 가릴 종목명이 없다. */
      eyebrow={<p className="font-mono text-ds-label text-ds-text-3">{`${card.indicatorName} · ${card.asOf} 기준`}</p>}
      cta={onDetail ? <CardCta label="어떤 종목인지 보기" onClick={onDetail} testId="macro-cta" /> : undefined}
    >

      <p
        className="mt-[20px] whitespace-pre-line break-keep text-ds-hook text-ds-text-1"
        data-testid="macro-hook"
      >
        {card.hook}
      </p>

      <p className="mt-s3 font-mono text-ds-price text-ds-text-1" data-testid="macro-value">
        {card.fromText} → {card.toText}
        <span className={`ml-s2 text-ds-label ${card.changePct < 0 ? "text-ds-down" : "text-ds-text-2"}`}>
          {`${card.changePct > 0 ? "+" : ""}${card.changePct.toFixed(1)}%`}
        </span>
      </p>

      {card.series.length >= 4 && (
        <div className="mt-[20px]" data-testid="macro-figure">
          <Sparkline variant="ds" series={card.series} height={54} />
        </div>
      )}

      {/* 일반 원리 — **예측이 아니다.** 서버가 만든 문장을 그대로 쓴다. */}
      <p className="mt-[18px] break-keep text-ds-label text-ds-text-2" data-testid="macro-principle">
        {card.principle}
      </p>

      {/* 마지막 줄 — 이 카드의 존재 이유. */}
      {card.support.length > 0 && (
        <div className="mt-s2 space-y-[2px]" data-testid="macro-support">
          {card.support.map((line) => (
            <p key={line} className="break-keep text-ds-label text-ds-text-2">
              {line}
            </p>
          ))}
        </div>
      )}

    </CardShell>
  );
}

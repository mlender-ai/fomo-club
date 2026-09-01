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
 * ## 관측일을 밝힌다 — 상대 시간으로
 *
 * 거시 지표는 하루이틀 늦게 나온다. 그 사실을 숨기지 않는다. 다만 `8월 25일 기준` 으로
 * 쓰면 사용자가 오늘 날짜와 빼봐야 오래됐다는 걸 안다. **`어제 기준` 은 그 계산을 대신해
 * 준다**(MACRO-01 §B-3). 문장은 서버가 굽는 시점에 굳혀 보낸다.
 *
 * ## 숫자를 두 번 쓰지 않는다 (MACRO-01 §D-2)
 *
 * 종전에는 `$89.8 → $83.9` 가 값 줄에도 있고 보조 줄에도 있었다. 같은 카드에 같은 숫자가
 * 두 번 나오면 두 번째는 읽히지 않는다. 값은 여기서만 그린다.
 *
 * ## 영향 설명은 상세로 내렸다 (MACRO-01 §D-2)
 *
 * `유가가 내리면 연료를 많이 쓰는 회사에 유리하고…` 는 두 줄짜리 설명이라 카드를 길게
 * 만들었다. **긴 카드는 눌리지 않는다.** 그 줄은 상세 1걸음이 그린다 — 카드는 무슨 일이
 * 벌어졌는지만 말하고, 왜 중요한지는 눌러서 본다.
 */
export function MacroCard({ card, onDetail }: { card: QuietPickMacroCard; onDetail?: () => void }) {
  return (
    <CardShell
      kind="macro"
      testId="macro-card"
      /* 종목 카드가 아니라는 것을 맨 위에서 밝힌다 — 가릴 종목명이 없다. */
      eyebrow={
        <p className="font-mono text-ds-label text-ds-text-3">{`${card.indicatorName} · ${card.asOfLabel}`}</p>
      }
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

      {/* 마지막 줄 — 이 카드의 존재 이유. 영향 설명(`principle`)은 상세로 내렸다(§D-2). */}
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

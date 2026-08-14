"use client";

import type { ArchetypeRiskItem, SymbolRisk } from "@fomo/core";

/**
 * "이게 틀리는 경우" 섹션 (WO-SUB-06 §6 · 커밋 7).
 *
 * ## 이 컴포넌트가 지키는 것
 *
 * 1. **유형 리스크는 고지 없이 렌더되지 않는다**(완료 조건 1). 고지를 옵션 prop 으로 두지 않고
 *    `archetype.disclaimer` 를 필수로 받는다 — 유형 리스크를 종목 고유 리스크처럼 보이게 하면
 *    거짓말이기 때문이다.
 * 2. **종목 고유 리스크 블록을 숨기지 않는다**(완료 조건 3). 항목이 0개면 미확보 문안을
 *    표시한다(문안은 `@fomo/core` 상수 — 여기 복붙하지 않는다). 블록이 사라지면
 *    "리스크 없는 회사" 로 읽힌다 — §10 실패 모드.
 * 3. **되돌아보는 선(가격)과 사업 조건을 나란히** 둔다(§5-3). 가격만 있으면 주가가 안 빠지면서
 *    논리가 깨지는 경우를 말하지 못한다.
 *
 * 문안은 전부 데이터에서 온다. 카피를 이 파일에 하드코딩하지 않는다(독트린이 정본).
 */

export interface WhereThisIsWrongProps {
  symbol: {
    items: SymbolRisk[];
    /** 항목이 0개인 이유. `items` 가 비었으면 반드시 있다. */
    unavailableReason: string | null;
    /** 미확보 문안 — `@fomo/core` 의 `SYMBOL_RISK_UNAVAILABLE_TEXT`. */
    unavailableText: string;
  };
  archetype: {
    items: ArchetypeRiskItem[];
    /** 필수 — 옵션이 아니다. */
    disclaimer: string;
  };
  invalidation: {
    /** 되돌아보는 선 — 가격 기준(`verdict.invalidation`). */
    priceText: string | null;
    /** 사업 기준 조건. 만들 수 없는 유형은 null 이고 사유를 짝으로 받는다. */
    businessText: string | null;
    businessAbsentReason: string | null;
    /** 다음 확인 시점. null 이면 상태가 이유를 말한다(#1040 규약). */
    checkAt: string | null;
    checkAtStatus: string | null;
  };
  /** 출처 링크 해석 — source_id → URL. 없으면 링크를 그리지 않는다. */
  sourceHref?: (sourceId: string) => string | undefined;
}

const CHECK_AT_NOTE: Record<string, string> = {
  no_source_kr: "국내 종목은 실적 발표 예정일 공개 소스가 없어요",
  outside_window: "예정일이 아직 발표 캘린더에 없어요",
  unknown: "확인 예정일을 아직 못 잡았어요",
};

export function WhereThisIsWrong({ symbol, archetype, invalidation, sourceHref }: WhereThisIsWrongProps) {
  const hasInvalidation = Boolean(invalidation.priceText || invalidation.businessText || invalidation.businessAbsentReason);
  // 유형 리스크도 종목 리스크도 무효 조건도 없으면 섹션 자체가 의미 없다.
  if (archetype.items.length === 0 && symbol.items.length === 0 && !symbol.unavailableReason && !hasInvalidation) {
    return null;
  }

  return (
    <section className="mt-6 space-y-4" aria-label="이게 틀리는 경우">
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
        <p className="font-pixel text-sm text-whiteout">이게 틀리는 경우</p>

        {/* 이 회사 고유 — 항목이 없어도 블록을 숨기지 않는다(완료 조건 3) */}
        <p className="mt-3 text-[12px] font-bold leading-5 text-muted">이 회사 고유</p>
        {symbol.items.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">
            {symbol.items.map((item) => {
              const href = sourceHref?.(item.source_ids[0] ?? "");
              return (
                <li key={item.id} className="text-sm leading-6 text-whiteout">
                  · {item.text}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 text-[12px] text-muted underline underline-offset-2"
                    >
                      출처
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm leading-6 text-muted">{symbol.unavailableText}</p>
        )}

        {/* 이 유형에 일반적인 것 — 고지는 항상 함께 나간다(완료 조건 1) */}
        {archetype.items.length > 0 && (
          <>
            <p className="mt-4 text-[12px] font-bold leading-5 text-muted">이 유형에 흔한 것</p>
            <ul className="mt-1.5 space-y-1.5">
              {archetype.items.map((item) => (
                <li key={item.id} className="text-sm leading-6 text-whiteout">
                  · {item.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] leading-5 text-muted">※ {archetype.disclaimer}</p>
          </>
        )}
      </div>

      {hasInvalidation && (
        <div className="rounded-2xl border border-hairline bg-surface px-4 py-4">
          <p className="font-pixel text-sm text-whiteout">다시 봐야 하는 조건</p>
          {invalidation.priceText && (
            <div className="mt-2 flex gap-2">
              <span className="shrink-0 text-[12px] font-bold leading-6 text-muted">가격</span>
              <p className="text-sm leading-6 text-whiteout">{invalidation.priceText}</p>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <span className="shrink-0 text-[12px] font-bold leading-6 text-muted">사업</span>
            <div>
              {invalidation.businessText ? (
                <>
                  <p className="text-sm leading-6 text-whiteout">{invalidation.businessText}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-muted">
                    {invalidation.checkAt
                      ? `확인 예정일 ${invalidation.checkAt}`
                      : (CHECK_AT_NOTE[invalidation.checkAtStatus ?? "unknown"] ?? CHECK_AT_NOTE["unknown"])}
                  </p>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted">{invalidation.businessAbsentReason ?? "사업 기준 조건을 만들지 못했어요."}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

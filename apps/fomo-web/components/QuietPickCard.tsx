"use client";

import type { QuietPick, QuietPickCardType } from "@/lib/fomoApi";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { trustedSector } from "@/lib/sectorTrust";
import { isRevealed } from "@/lib/cardReveal";
import { haptic } from "@/lib/haptics";
import { pickHook } from "@/lib/pickCopyRepair";
import { Sparkline } from "@/components/Sparkline";
import { DivergenceChart } from "@/components/DivergenceChart";
import { StreakBars } from "@/components/StreakBars";

/**
 * 메인 카드 — **정본은 `docs/wo/WO-HOOK-01-main-card-hook.md`** 다. DS-01 을 대체한다.
 *
 * ## 무엇이 바뀌었나 (DS-01 → WO-HOOK-01)
 *
 * | 항목 | DS-01 | 지금 |
 * |---|---|---|
 * | 종목 정체 | 종목명 + 티커 노출 | **가린다.** 국가·섹터·시총만. 상세를 열면 영구 해제 |
 * | 후킹 | 신호를 서술한 한 문장 | **형별 후킹** — 역행 / 비율 / 희소성 |
 * | 그림 | 스파크라인 하나 | **형별 그림** — 두 선의 갭 / 큰 숫자 / 연속 막대 |
 * | 근거 | 라벨-값 3행 박스 | 보조 2줄(칩·박스 없음) |
 * | accent | 결론 · 우리 성적 · CTA (3곳) | **형별 1곳.** CTA·가격·문장에 쓰지 않는다 |
 * | 우리 성적 | 카드에 표시 | 상세로 이동(WO-HOOK-02) — accent 가 두 곳이 되고, 마스킹된 카드에서 "짚은 뒤"는 정체를 암시한다 |
 * | ★ 관심 | 앞면 우상단 | 상세로 이동 |
 *
 * ## 왜 가리나
 *
 * 우리 유니버스는 무명주다. 이름이 보이면 "모르는 회사네" 하고 넘긴다. **정보를 줄여서 후킹을
 * 만든다.** 다 가리면 낚시가 되므로 국가·섹터·시총·가격은 남긴다(§2-2). 가렸다는 사실은
 * CTA 가 명시한다 — `어떤 회사인지 보기`(§2-4).
 *
 * ## 블록 (위→아래, 고정 높이 없음)
 *
 * ① 정체(마스킹) → ② 가격 → ③ 후킹 → ④ 그림 → ⑤ 보조 2줄 → ⑥ CTA
 */

/** 표시용 회사명 — 정규화는 전 화면 공통 창구에 위임한다. */
export function displayName(pick: QuietPick): string {
  return subjectName(pick.subject);
}

/**
 * 가격 표기 — **통화 기호를 반드시 붙인다.** 실측에서 미국 종목이 `4.945` 로 나왔다(무슨
 * 통화인지 알 수 없다). 서버 문구(`4,560원`)가 이미 단위를 담고 있으면 그대로 쓴다.
 */
export function priceText(pick: QuietPick): string {
  const text = pick.price.currentText?.trim();
  const isUs = pick.subject.country === "US";
  if (text) {
    if (!isUs || /^[$₩]/.test(text) || /원$/.test(text)) return text;
    return `$${text}`;
  }
  const value = pick.price.current;
  return isUs ? `$${value.toFixed(2)}` : `${value.toLocaleString("en-US")}원`;
}

const COUNTRY_LABEL: Record<string, string> = { KR: "한국", US: "미국" };

/**
 * ① 정체 줄 — 가려진 상태에서 남기는 것들(§2-2).
 *
 * 국가는 항상, 섹터는 **신뢰할 수 있을 때만**(DS-05 §4 — 테마 라벨이 섞여 온다), 시총은
 * 확보된 시장만. 거래 규모는 경고가 아니라 특징이므로 같은 줄에 중립 정보로 붙인다(§8).
 */
export function maskedIdentityLine(pick: QuietPick): string {
  const liquidity = liquidityMetaOf(pick);
  return [
    COUNTRY_LABEL[pick.subject.country] ?? null,
    trustedSector(pick.subject.identity) ?? null,
    pick.subject.marketCapText ? `시총 ${pick.subject.marketCapText}` : null,
    liquidity,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** 거래 규모 — 평가어("얇아요")를 떼고 괄호 안 실수치만 남긴다(§8: 경고 아이콘 → 중립 정보). */
function liquidityMetaOf(pick: QuietPick): string | null {
  const note = pick.liquidityNote;
  if (!note) return null;
  const inner = note.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (!inner) return null;
  return inner.startsWith("일") ? inner.replace(/^일\s*/, "일 거래 ") : inner;
}

/**
 * 형별 그림. **accent 는 여기 한 곳에만 있다**(§7) — A 는 누적선, B 는 큰 숫자, C 는 연속 구간.
 * 재료가 모자라면 그리지 않는다(자리표시자 금지, DS-00 §1-1).
 */
function CardFigure({ cardType }: { cardType: QuietPickCardType }) {
  const figure = cardType.figure;

  if (figure.kind === "divergence") {
    return (
      <DivergenceChart priceSeries={figure.priceSeries} buySeries={figure.buySeries} buyLegend={figure.buyLegend} />
    );
  }

  if (figure.kind === "ratio") {
    const series = figure.priceSeries ?? [];
    return (
      <div>
        <p className="font-mono text-ds-ratio text-ds-accent" data-testid="pick-ratio">
          {`${figure.ratioPct}%`}
        </p>
        {series.length >= 20 && (
          <div className="mt-s3">
            <Sparkline
              variant="ds"
              series={series.slice(-30)}
              height={54}
              {...(typeof figure.markerIndex === "number" ? { markerIndex: figure.markerIndex } : {})}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <StreakBars
      buyDays={figure.buyDays}
      streakFrom={figure.streakFrom}
      streakTo={figure.streakTo}
      actor={figure.actor}
    />
  );
}

export function QuietPickCard({
  pick,
  /** CTA. 없으면 버튼을 그리지 않는다 — 자리만 남기지 않는다. */
  onDetail,
  /**
   * 정체 공개 여부. 덱이 해제 상태를 들고 있어 상세를 닫고 돌아왔을 때 바로 반영된다.
   * 넘기지 않으면 로컬 저장소에서 직접 읽는다(성적표·내 기록처럼 덱 밖에서 쓰는 경우).
   */
  revealed,
}: {
  pick: QuietPick;
  onDetail?: () => void;
  revealed?: boolean;
}) {
  const isOpen = revealed ?? isRevealed(pick.subject.canonical);
  const cardType = pick.cardType;
  /**
   * 폴백 — 새 payload 가 오기 전(하루 한 번 굽는 배치) 한 배치 동안은 형이 없다.
   * 그때는 종전 훅을 그대로 쓰고 그림은 스파크라인 하나로 둔다. 지어내지 않는다.
   */
  const hook = cardType?.hook ?? pickHook(pick);
  const support = cardType?.support ?? [];
  const changePct = pick.price.changePct;
  const ticker = subjectTicker(pick.subject);
  const identityLine = maskedIdentityLine(pick);
  const fallbackSeries = pick.price.sparkline ?? [];

  return (
    <div
      className="flex flex-col rounded-card bg-ds-surface-1 p-s4"
      data-testid="quiet-pick-card"
      data-card-type={cardType?.type ?? "legacy"}
      data-revealed={isOpen ? "true" : "false"}
      /**
       * 스크린리더는 카드를 **한 덩어리로** 읽는다(DS-06 §7). 가려진 카드에서는 종목명을
       * 읽어주지 않는다 — 그러면 마스킹이 시각 사용자에게만 걸리는 장치가 된다.
       */
      role="group"
      aria-label={[isOpen ? displayName(pick) : identityLine, hook.replace(/\n/g, " "), support.join(". ")]
        .filter(Boolean)
        .join(". ")}
    >
      {/* ① 정체 — 가려진 동안은 국가·섹터·시총 한 줄. 열고 나면 종목명·티커가 그 위에 온다. */}
      {isOpen && (
        <p className="flex min-w-0 items-baseline gap-s2" data-testid="pick-name">
          <span className="truncate text-ds-title text-ds-text-1">{displayName(pick)}</span>
          {ticker && <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{ticker}</span>}
        </p>
      )}
      {identityLine && (
        <p
          className={`truncate font-mono text-ds-label text-ds-text-2 ${isOpen ? "mt-s1" : ""}`}
          data-testid="pick-identity"
        >
          {identityLine}
        </p>
      )}

      {/* ② 가격 — 화살표 없음. 상승 text-1 / 하락 down. accent 를 쓰지 않는다(§7). */}
      <div className="mt-s2 flex items-baseline gap-s2">
        <span className="font-mono text-ds-price text-ds-text-1">{priceText(pick)}</span>
        {typeof changePct === "number" && (
          <span
            className={`font-mono text-ds-label tabular-nums ${changePct < 0 ? "text-ds-down" : "text-ds-text-1"}`}
            data-testid="pick-change"
          >
            {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* ③ 후킹 — 형이 정한 문장. `\n` 이 의도된 줄바꿈이라 whitespace-pre-line 으로 살린다. */}
      <p
        /*
         * `line-clamp-2` 는 안전망이지 레이아웃이 아니다(§10 완료 기준 12). 문안은 이미
         * 320px 2줄 안에 들어오도록 fomo-core 에서 길이를 고정했고(`card-type.test.ts`),
         * 여기 클램프는 미래에 긴 문장이 새로 들어와도 카드가 무너지지 않게 하는 마지막 방어다.
         */
        className="mt-[20px] line-clamp-2 whitespace-pre-line break-keep text-ds-hook text-ds-text-1"
        data-testid="pick-hook"
      >
        {hook}
      </p>

      {/* ④ 그림 — 형별로 다르다. accent 가 있는 유일한 자리(§7). */}
      <div className="mt-[20px]">
        {cardType ? (
          <CardFigure cardType={cardType} />
        ) : (
          fallbackSeries.length >= 20 && (
            <Sparkline variant="ds" series={fallbackSeries.slice(-30)} height={54} />
          )
        )}
      </div>

      {/* ⑤ 보조 — 최대 2줄. 칩 없음(§3-⑤·§8). */}
      {support.length > 0 && (
        <div className="mt-[18px] space-y-[2px]" data-testid="pick-support">
          {support.map((line) => (
            <p key={line} className="break-keep text-ds-label text-ds-text-2">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* ⑥ CTA 하나 — surface-2 + 0.5px border. accent 를 쓰지 않는다(§3-⑥·§7). */}
      {onDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic();
            onDetail();
          }}
          className="tap-button mt-[18px] h-btn-primary w-full rounded-pill border-hair border-ds-border bg-ds-surface-2 text-ds-body font-medium text-ds-text-1 active:bg-[#202020]"
          data-testid="pick-cta"
        >
          {/* 가렸다는 사실을 CTA 가 명시한다 — 안 그러면 낚시로 읽힌다(§2-4). */}
          {isOpen ? "자세히 보기" : "어떤 회사인지 보기"}
        </button>
      )}
    </div>
  );
}

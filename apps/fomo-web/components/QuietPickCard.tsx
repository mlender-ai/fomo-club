"use client";

import { useState } from "react";
import { buildQuietPickChips, buildQuietPickEvidenceLine, type QuietPickAnomalyFacts } from "@fomo/core";
import type { QuietPick } from "@/lib/fomoApi";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { recordPickTelemetry } from "@/lib/pickTelemetry";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";
import { Sparkline } from "@/components/Sparkline";
import { StarIcon } from "@/components/icons";

/**
 * 메인 카드 — DS-01(`docs/design/DS-01_MAIN_CARD.md`). 토큰은 DS-00.
 *
 * ## 원칙: 한 장면에 놀라움 하나
 *
 * 2초 안에 세 가지만 전한다 — ① 무슨 일이 있었나(결론) ② 얼마나 드문 일인가(근거 하나)
 * ③ 이 앱을 믿을 만한가(우리 성적). **그 외 전부 상세로 내렸다.**
 *
 * ## 블록 (위→아래)
 *
 * ① 종목 아이덴티티 → ② 가격 → ③ 결론(`display`, 카드당 1회) → ④ 근거 한 줄 →
 * ⑤ 스파크라인 → ⑥ 우리 성적(**유일한 accent**) → ⑦ CTA 하나.
 *
 * ## DS-01 에서 카드에서 빠진 것
 *
 * 되돌아보는 선·매출 막대·아키타입 경고·밴드 부재 문구·회사 설명·"이런 신호, 과거엔 어땠나"·
 * 재등장 사유는 **상세로 옮겼다**(삭제가 아니다 — `QuietPickDepth` 에 있다).
 * 칩 3개는 ④ 한 줄로 합쳤다. 넘기기 버튼은 스와이프가, `더보기 →` 는 CTA 가 대신한다.
 * `N/10` 카운터는 카드 밖(덱)이다.
 *
 * ## 고정 높이가 없다
 *
 * 블록이 빠지면 카드가 그만큼 짧아진다(DS-01 §5). 최소 높이 계약도 두지 않는다 —
 * 종전 `quietCardMinHeight` 가 하단 공백의 원인이었다.
 */

/** 시장 배지 — 국기 이모지 대신 텍스트다(DS-00 §7 이모지 금지). */
function marketBadge(pick: QuietPick): string | null {
  if (pick.subject.market === "COIN") return null;
  return pick.subject.country === "US" ? "US" : "KR";
}

/** 표시용 회사명 — 정규화는 전 화면 공통 창구에 위임한다. */
export function displayName(pick: QuietPick): string {
  return subjectName(pick.subject);
}

/** 화면에 병기할 티커 — US 는 심볼, KR 은 6자리 종목코드. */
function ticker(pick: QuietPick): string | undefined {
  return subjectTicker(pick.subject);
}

function anomalyFacts(pick: QuietPick): QuietPickAnomalyFacts {
  return {
    kind: pick.signal.kind,
    actorNoun: repairPickCopy(pick.signal.actors).replace(/\s*\d+명$/, ""),
    scale: repairPickCopy(pick.signal.scale),
    days: pick.signal.days,
    ...(typeof pick.signal.insiderCount === "number" ? { insiderCount: pick.signal.insiderCount } : {}),
    ...pick.signalFacts,
  };
}

/**
 * ④ 근거 한 줄 — 실수치(`signalFacts`)에서 만든다. 문장을 되파싱하지 않는다.
 * 구 페이로드(실수치 없음)는 발행 시점에 굳은 칩을 같은 규칙으로 이어 붙인다.
 */
export function cardEvidenceLine(pick: QuietPick, hook: string): string {
  const hookNumbers = new Set(hook.match(/\d+/g) ?? []);
  if (pick.signalFacts) return buildQuietPickEvidenceLine(anomalyFacts(pick), hook);
  const items = (pick.chips?.length ? pick.chips : buildQuietPickChips(anomalyFacts(pick)))
    .map(repairPickCopy)
    .filter((item) => !(item.match(/\d+/g) ?? []).some((n) => hookNumbers.has(n)))
    .slice(0, 3);
  return items.join(" · ");
}

export function QuietPickCard({
  pick,
  /** ⑦ CTA. 없으면 버튼을 그리지 않는다 — 자리만 남기지 않는다. */
  onDetail,
  /** 덱에서의 위치(1-based). 관심 담기 지표를 위치별로 보기 위해 받는다. */
  position,
}: {
  pick: QuietPick;
  onDetail?: () => void;
  position?: number;
}) {
  const [watched, setWatched] = useState(() => isWatched(pick.subject.canonical));

  /**
   * ① 두 번째 줄 — 섹터 · 거래 규모. 거래 규모는 **경고가 아니라 특징이다**(DS-01 §4):
   * 큰 회사는 조용할 수 없다. 평가어("얇아요")를 떼고 괄호 안 실수치만 남긴다.
   */
  const liquidityMeta = (() => {
    const note = pick.liquidityNote;
    if (!note) return null;
    const inner = note.match(/\(([^)]+)\)/)?.[1]?.trim();
    if (!inner) return note;
    return inner.startsWith("일") ? inner.replace(/^일\s*/, "일 거래 ") : inner;
  })();

  const series = pick.price.sparkline ?? [];
  /** ⑤ 20포인트 미만이면 스파크라인을 통째로 숨긴다(DS-01 §3-⑤). 형태가 안 보이는 선은 장식이다. */
  const showSparkline = series.length >= 20;
  const markerIndex = showSparkline
    ? Math.max(0, series.length - 1 - Math.min(pick.signal.days, series.length - 1))
    : undefined;

  const changePct = pick.price.changePct;
  const hook = pickHook(pick);
  const evidence = cardEvidenceLine(pick, hook);
  const record = pick.ourRecord;
  const badge = marketBadge(pick);

  /**
   * 관심 — DS-02 가 스와이프를 탐색 제스처로 바꿨으므로(좌=다음/우=이전) **관심은 이 버튼만
   * 담당한다.** 종전 우스와이프가 하던 저장(사유·섹터 포함)과 지표 기록을 여기서 이어받는다.
   */
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = toggleWatch(pick.subject.canonical, Date.now(), {
      ...(pick.subject.identity ? { sector: pick.subject.identity } : {}),
      reason: hook,
    });
    setWatched(now);
    if (now) recordPickTelemetry({ event: "card_watchlist_add", ...(position ? { position } : {}) });
  };

  return (
    <div className="flex flex-col rounded-card bg-ds-surface-1 p-s4" data-testid="quiet-pick-card">
      {/* ① 종목 아이덴티티 — 로고 이미지·국기 이모지 없음(DS-01 §3-①). */}
      <div className="flex items-start justify-between gap-s2">
        <div className="min-w-0">
          <p className="truncate text-ds-title text-ds-text-1">{displayName(pick)}</p>
          {(pick.subject.identity || liquidityMeta) && (
            <p className="mt-s1 truncate font-mono text-ds-label text-ds-text-2" data-testid="pick-identity">
              {/* 섹터가 확보되지 않으면 표시하지 않는다 — 틀린 섹터가 맞는 섹터보다 나쁘다. */}
              {pick.subject.identity}
              {pick.subject.identity && liquidityMeta && " · "}
              {liquidityMeta}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-s2">
          <div className="text-right">
            {ticker(pick) && <span className="font-mono text-ds-label text-ds-text-3">{ticker(pick)}</span>}
            {badge && <span className="ml-s1 font-mono text-ds-caption text-ds-text-3">{badge}</span>}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={watched}
            aria-label={watched ? "관심 해제" : "관심"}
            className="-mr-2 -mt-2 flex h-touch w-touch items-center justify-center"
          >
            <StarIcon size={16} className={watched ? "text-ds-text-1" : "text-ds-text-3"} />
          </button>
        </div>
      </div>

      {/* ② 가격 — 화살표 아이콘 없음. 부호로 충분하다. 등락에 색을 쓰지 않는다(DS-00 §2-1). */}
      <div className="mt-s1 flex items-baseline gap-s2">
        <span className="font-mono text-[16px] leading-tight text-ds-text-1">
          {pick.price.currentText ?? pick.price.current.toLocaleString("en-US")}
        </span>
        {typeof changePct === "number" && (
          <span
            className={`font-mono text-[13px] leading-tight tabular-nums ${changePct < 0 ? "text-ds-down" : "text-ds-text-1"}`}
            data-testid="pick-change"
          >
            {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* ③ 결론 — 이 카드의 전부. 화면에서 가장 큰 텍스트이고 카드당 한 번이다. */}
      <p className="mt-s5 line-clamp-2 text-ds-display text-ds-text-1" data-testid="pick-hook">
        {hook}
      </p>

      {/* ④ 근거 한 줄 — 칩 폐지(DS-01 §3-④). 결론에 나온 숫자는 여기 없다. */}
      {evidence && (
        <p className="mt-s2 font-mono text-ds-label text-ds-text-2" data-testid="pick-evidence">
          {evidence}
        </p>
      )}

      {/* ⑤ 스파크라인 — 회색 선 하나. 면 채우기·캡션·축 없음. */}
      {showSparkline && (
        <div className="mt-s4" aria-label="최근 30거래일 가격 흐름">
          <Sparkline
            variant="ds"
            series={series.slice(-30)}
            height={56}
            {...(markerIndex !== undefined ? { markerIndex } : {})}
          />
        </div>
      )}

      {/*
        ⑥ 우리 성적 — 카드에서 accent 를 쓰는 **유일한** 자리.
        기록이 없으면(오늘 첫 발행·발행일 가격 결손) 블록 전체가 없다. 그러면 이 카드에는
        accent 가 없다 — 그게 정상이고, 색을 다른 데로 옮기지 않는다(DS-00 §2-1).
      */}
      {record && (
        <div className="mt-s4 flex gap-[10px]" data-testid="pick-our-record">
          <span className="w-[2px] shrink-0 self-stretch bg-ds-accent" aria-hidden />
          <div>
            <p className="font-mono text-ds-label text-ds-text-2">{record.sinceText}</p>
            <p className="font-mono text-[18px] font-medium leading-tight text-ds-accent">
              {`${record.returnPct > 0 ? "+" : ""}${record.returnPct.toFixed(1)}%`}
            </p>
          </div>
        </div>
      )}

      {/* ⑦ CTA 하나. accent 를 쓰지 않는다 — 성적과 경쟁한다. */}
      {onDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDetail();
          }}
          className="mt-s4 h-btn-primary w-full rounded-pill border-hairline border-ds-border bg-ds-surface-2 text-[14px] font-medium text-ds-text-1"
          data-testid="pick-cta"
        >
          자세히 보기
        </button>
      )}
    </div>
  );
}

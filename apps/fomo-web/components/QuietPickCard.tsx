"use client";

import { useState } from "react";
import type { QuietPick } from "@/lib/fomoApi";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { cardEvidenceRows } from "@/lib/depthSections";
import { trustedSector } from "@/lib/sectorTrust";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { recordPickTelemetry } from "@/lib/pickTelemetry";
import { haptic, hapticMedium } from "@/lib/haptics";
import { pickHook } from "@/lib/pickCopyRepair";
import { Sparkline } from "@/components/Sparkline";
import { StarIcon } from "@/components/icons";

/**
 * 메인 카드 — **기획자 모킹이 정본이다**(`docs/design/DS-01_MAIN_CARD.md` §15에 모킹 반영 기록).
 *
 * ## 모킹과 DS-01 문서가 어긋난 곳은 모킹을 따른다
 *
 * | 항목 | 문서 | 모킹 = 구현 |
 * |---|---|---|
 * | 결론 색 | `text-1` | **`accent`** — 화면에서 가장 먼저 눈에 닿아야 하는 것이 결론이다 |
 * | CTA | `surface-2` (accent 금지) | **`accent` pill + `accent-ink` 글씨** |
 * | 근거 | 회색 한 줄 | **`surface-2` 박스 안 라벨-값 3행**(값 우측 정렬) |
 * | 티커 | 우측 정렬 + US/KR 배지 | **종목명 옆에 나란히** |
 *
 * 1차 구현에서 문서 문구("accent 는 화면당 1회, CTA 금지")만 따라 결론·CTA 를 무채색으로
 * 만들었더니 화면 전체가 죽었다. accent 는 **결론 → 성적 → CTA** 세 자리를 쓴다. 그 밖(스파크라인,
 * 등락, 칩, 섹션 제목)에는 여전히 쓰지 않는다.
 *
 * ## 블록 (위→아래)
 *
 * ① 종목명+티커 / 섹터·시총·거래 → ② 가격·등락 → ③ 결론(accent) → ④ 신호 후 주가 →
 * ⑤ 근거 박스 → ⑥ 스파크라인 → ⑦ 우리 성적(accent) → ⑧ CTA(accent)
 *
 * 고정 높이는 없다. 블록이 빠지면 카드가 그만큼 짧아진다.
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

/** 신호가 시작된 뒤 주가가 어떻게 됐나 — 모킹의 `주가는 5일간 -9%`. 당시가가 없으면 만들지 않는다. */
export function sincePriceLine(pick: QuietPick): string | null {
  const at = pick.signal.priceAtSignal;
  const now = pick.price.current;
  const days = pick.signal.days;
  if (!Number.isFinite(at) || !at || at <= 0 || !Number.isFinite(now) || days <= 0) return null;
  const pct = Math.round(((now - at) / at) * 100 * 10) / 10;
  if (Math.abs(pct) < 0.1) return `주가는 ${days}일간 그대로`;
  return `주가는 ${days}일간 ${pct > 0 ? "+" : ""}${pct}%`;
}

export function QuietPickCard({
  pick,
  /** CTA. 없으면 버튼을 그리지 않는다 — 자리만 남기지 않는다. */
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
   * ① 두 번째 줄 — 섹터 · 거래 규모. 거래 규모는 **경고가 아니라 특징이다**:
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
  /** 20포인트 미만이면 스파크라인을 통째로 숨긴다. 형태가 안 보이는 선은 장식이다. */
  const showSparkline = series.length >= 20;
  const markerIndex = showSparkline
    ? Math.max(0, series.length - 1 - Math.min(pick.signal.days, series.length - 1))
    : undefined;

  /** 섹터는 **신뢰할 수 있을 때만** 그린다(DS-05 §4) — 테마 라벨이 섞여 온다. */
  const sector = trustedSector(pick.subject.identity);
  const changePct = pick.price.changePct;
  const hook = pickHook(pick);
  const rows = cardEvidenceRows(pick, hook);
  const since = sincePriceLine(pick);
  const record = pick.ourRecord;
  const ticker = subjectTicker(pick.subject);

  /**
   * 관심 — 스와이프가 탐색 제스처가 됐으므로(DS-02) **관심은 이 버튼만** 담당한다.
   * 종전 우스와이프가 하던 저장(사유·섹터 포함)과 지표 기록을 여기서 이어받는다.
   */
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = toggleWatch(pick.subject.canonical, Date.now(), {
      ...(sector ? { sector } : {}),
      reason: hook,
      // 내 기록 탭의 변동률 기준가(DS-04 §2-1) — 누른 순간의 가격을 남긴다.
      priceAt: pick.price.current,
      ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
      ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
      ...(pick.subject.market ? { market: pick.subject.market } : {}),
      ...(pick.subject.country ? { country: pick.subject.country } : {}),
    });
    setWatched(now);
    // 관심 등록만 medium — "기록됐다"를 몸으로 알린다(DS-06 §2).
    if (now) {
      hapticMedium();
      recordPickTelemetry({ event: "card_watchlist_add", ...(position ? { position } : {}) });
    } else {
      haptic();
    }
  };

  return (
    <div
      className="flex flex-col rounded-card bg-ds-surface-1 p-s4"
      data-testid="quiet-pick-card"
      /**
       * 스크린리더는 카드를 **한 덩어리로** 읽는다(DS-06 §7) — 종목·결론·근거 요약까지.
       * 개별 요소를 훑게 하면 숫자만 나열돼 무슨 카드인지 알 수 없다.
       */
      role="group"
      aria-label={[displayName(pick), hook, rows.map((row) => `${row.label} ${row.value}`).join(", ")]
        .filter(Boolean)
        .join(". ")}
    >
      {/* ① 종목 아이덴티티 — 로고 이미지·국기 이모지 없음. 티커는 종목명 옆에 나란히. */}
      <div className="flex items-start justify-between gap-s2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-baseline gap-s2">
            <span className="truncate text-ds-title text-ds-text-1">{displayName(pick)}</span>
            {ticker && <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{ticker}</span>}
          </p>
          {(sector || liquidityMeta) && (
            <p className="mt-s1 truncate font-mono text-ds-label text-ds-text-2" data-testid="pick-identity">
              {/* 신뢰 불가 섹터는 통째로 빠진다 — 틀린 섹터가 없는 섹터보다 나쁘다. */}
              {[sector, liquidityMeta].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={watched}
          aria-label={watched ? "관심 해제" : "관심"}
          className="tap-star -mr-2 -mt-2 flex h-touch w-touch shrink-0 items-center justify-center"
        >
          <StarIcon size={16} className={watched ? "text-ds-text-1" : "text-ds-text-3"} />
        </button>
      </div>

      {/* ② 가격 — 화살표 아이콘 없음. 등락에 색을 쓰지 않는다(상승 흰색 / 하락 회색). */}
      <div className="mt-s2 flex items-baseline gap-s2">
        <span className="font-mono text-[16px] leading-tight text-ds-text-1">{priceText(pick)}</span>
        {typeof changePct === "number" && (
          <span
            className={`font-mono text-[13px] leading-tight tabular-nums ${changePct < 0 ? "text-ds-down" : "text-ds-text-1"}`}
            data-testid="pick-change"
          >
            {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* ③ 결론 — 카드의 전부. **accent**, 최대 2줄, 카드당 1회. */}
      <p /* break-keep: 한국어 단어 단위로 끊는다 — `5`/`일` 이 갈리지 않게. */
        className="mt-s5 line-clamp-2 break-keep text-ds-display text-ds-accent" data-testid="pick-hook">
        {hook}
      </p>

      {/* ④ 신호 후 주가 — 결론이 값 얘기를 하지 않으므로 여기서 한 줄로 답한다. */}
      {since && (
        <p className="mt-s2 text-ds-caption text-ds-text-2" data-testid="pick-since">
          {since}
        </p>
      )}

      {/* ⑤ 근거 박스 — 라벨(좌·회색) / 값(우·흰색). 한 줄 나열보다 스캔이 빠르다. */}
      {rows.length > 0 && (
        <dl className="mt-s4 rounded-block bg-ds-surface-2 px-s4 py-s3" data-testid="pick-evidence">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-s3 py-[3px]">
              <dt className="shrink-0 font-mono text-ds-label text-ds-text-2">{row.label}</dt>
              {/*
                320px 에서 `기관 · 919주` 가 `기관` 으로 잘렸다(DS-06 §6-1 실측). 값이 잘리면
                근거가 사라진다 — 자르지 말고 줄바꿈을 허용한다(라벨은 그대로 한 줄).
              */}
              <dd className="min-w-0 break-keep text-right font-mono text-ds-data text-ds-text-1">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* ⑥ 스파크라인 — 회색 선 하나. 면 채우기·캡션·축 없음. */}
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
        ⑦ 우리 성적 — 위에 0.5px 구분선을 두고 accent 바를 세운다.
        기록이 없으면(오늘 첫 발행·발행일 가격 결손·아직 0.0%) 블록 전체가 없다.
      */}
      {record && (
        <div className="mt-s4 border-t-hair border-ds-border pt-s4" data-testid="pick-our-record">
          <div className="flex gap-[10px]">
            <span className="w-[2px] shrink-0 self-stretch bg-ds-accent" aria-hidden />
            <div>
              <p className="font-mono text-ds-label text-ds-text-2">{record.sinceText}</p>
              <p className="font-mono text-[20px] font-medium leading-tight text-ds-accent">
                {`${record.returnPct > 0 ? "+" : ""}${record.returnPct.toFixed(1)}%`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ⑧ CTA 하나 — accent pill. 카드에서 유일한 채워진 버튼이다. */}
      {onDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic();
            onDetail();
          }}
          className="tap-button mt-s4 h-btn-primary w-full rounded-pill bg-ds-accent text-[15px] font-medium text-ds-accent-ink active:bg-[#c2eb2f]"
          data-testid="pick-cta"
        >
          자세히 보기
        </button>
      )}
    </div>
  );
}

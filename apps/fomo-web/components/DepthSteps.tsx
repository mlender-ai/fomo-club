"use client";

import type { CompanyGroup } from "@/lib/fomoApi";

/**
 * WO-RESET-05 §1 — 상세를 이루는 조각들. **한 화면에 한 걸음.**
 *
 * 종전 상세는 정보 블록을 위에서 아래로 쌓은 한 장이었다. 읽는 순서가 없고, 다 읽고 나서
 * 뭘 해야 하는지도 없었다. 여기 조각들은 그 한 장을 **이야기 순서**로 나눈 것이다 —
 * 놀라움 → 이유 → 실체 → 결정.
 */

/**
 * 진행 점 `● ○ ○ ○`.
 *
 * 걸음 수는 **종목마다 다르다** — 데이터 없는 걸음은 건너뛰므로(§6) 점도 그만큼 줄어든다.
 * 빈 걸음을 만들지 않기로 했으니 점이 그 사실을 그대로 비춘다.
 */
export function StepDots({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex items-center gap-[6px]" data-testid="depth-dots" aria-label={`${total}걸음 중 ${index + 1}번째`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-[6px] w-[6px] rounded-full ${i === index ? "bg-ds-accent" : "bg-ds-border"}`}
        />
      ))}
    </div>
  );
}

/**
 * 다음 걸음으로 가는 버튼. 이 화면에서 **유일하게 강조된 것**이라 다른 것과 겨루지 않는다.
 * 문구는 걸음마다 다르다 — `왜 사는지 보기` 처럼 **다음에 무엇이 나오는지** 말한다.
 */
/**
 * 상세 하단 고정 바 (2026-08-31 지시 — "CTA 위치 맨 하단으로 플로팅으로 고정").
 *
 * ## 왜 고정인가
 *
 * 종전에는 버튼이 본문 끝에 붙어 있었다. 걸음마다 내용 길이가 달라 **버튼이 화면
 * 중간에도 오고 스크롤 밖에도 갔다** — 다음으로 가려면 매번 눈으로 찾아야 했다.
 * 아래에 붙박아두면 어느 걸음에서든 엄지가 닿는 자리에 있다.
 *
 * 바탕을 깔아 본문이 버튼 뒤로 비쳐 지나가지 않게 한다. 홈 인디케이터를 피해
 * `safe-area` 만큼 더 띄운다.
 */
export function StepBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] border-t-hair border-ds-border bg-ds-bg pb-[env(safe-area-inset-bottom)]"
      data-testid="depth-bar"
    >
      <div className="mx-auto w-full max-w-[480px] px-gutter py-s3">{children}</div>
    </div>
  );
}

export function StepNext({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="depth-next"
      className="tap-button flex h-touch w-full items-center justify-center gap-s2 rounded-block bg-ds-accent px-gutter text-[15px] font-medium text-ds-bg"
    >
      {label}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * 5점 만점 점.
 *
 * ## 옆 문장 없이 혼자 선다 (FIX-01 B-3)
 *
 * 종전 규약은 「점만 두지 않는다 — 옆 문장이 없으면 그리지 않는다」였다. 그 규약이 실측 화면에
 * 같은 말을 두 번 쓰게 만들었다:
 *
 * ```
 * PBR  2.79배
 * 최근 5년 중 높은 쪽이에요          ← 줄 설명
 * ●○○○○  최근 5년 중 높은 편이에요   ← 점 설명(거의 같은 말)
 * ```
 *
 * **점은 그림이다.** 왼쪽에 몰리면 낮고 오른쪽으로 갈수록 높다는 것은 화면 하단 범례
 * (`ScoreLegend`)가 한 번만 말한다. 줄이 이미 말한 것을 점 옆에 되풀이하지 않는다 —
 * 그러면 점을 넣은 이유가 없어진다.
 */
export function ScoreDots({ score }: { score: number }) {
  return (
    <span className="font-mono text-[13px] tracking-[0.15em] text-ds-accent" data-testid="depth-score-dots" aria-label={`5점 중 ${score}점`}>
      {"●".repeat(score)}
      <span className="text-ds-border">{"○".repeat(Math.max(0, 5 - score))}</span>
    </span>
  );
}

/**
 * 점의 방향을 말하는 **한 줄 범례** (FIX-01 B-3).
 *
 * 점마다 설명을 붙이는 대신 화면에 한 번만 둔다. 점이 하나도 없는 종목에서는 부르는 쪽이
 * 그리지 않는다 — 설명할 그림이 없으면 범례도 없다.
 */
export function ScoreLegend() {
  return (
    <p className="mt-s4 text-ds-caption text-ds-text-3" data-testid="depth-score-legend">
      ● 이 많을수록 좋은 쪽이에요
    </p>
  );
}

/**
 * 3걸음의 한 덩어리 — `돈은 잘 버나요` 처럼 **질문**이 제목이다.
 *
 * 라벨(`수익성`)이 아니라 질문이어야 답이 읽힌다. 줄마다 숫자와 **그 숫자를 읽는 문장**이
 * 같이 있다 — 문장 없는 줄은 애초에 만들어지지 않는다(`companyRead` 가 거른다).
 */
export function CompanyGroupBlock({ group }: { group: CompanyGroup }) {
  return (
    <section className="mt-s6" data-testid="depth-company-group">
      <h3 className="text-[15px] font-medium text-ds-text-1">{group.title}</h3>

      {group.rows.map((row) => (
        <div key={row.label} className="mt-s3 flex items-baseline justify-between gap-s3">
          <div className="min-w-0">
            <p className="font-mono text-[14px] text-ds-text-1">
              {row.label} {row.value}
            </p>
            {/* 비교 문장 — **이게 이 줄의 존재 이유**다. WO §4-3 */}
            <p className="mt-[2px] break-keep text-ds-caption text-ds-text-2" data-testid="depth-comparison">
              {row.comparison}
            </p>
            {/*
              FIX-01 A-2 — 기간이 다른 둘째 사실은 **줄을 나눠** 쓴다. 한 줄에 붙이면
              `작년보다 줄었어요 · 3년째 늘고 있어요` 가 되어 정반대 말이 한 줄에 선다.
            */}
            {row.trend && (
              <p className="mt-[2px] break-keep text-ds-caption text-ds-text-3" data-testid="depth-trend">
                {row.trend}
              </p>
            )}
          </div>
        </div>
      ))}

      {/*
        FIX-01 B — 점은 **혼자 선다.** 옆 문장은 줄이 말하지 않은 사실이 있을 때만 오고
        (적자처럼), 그런 사실이 없으면 서버가 `scoreText: null` 로 준다.
      */}
      {group.score !== null && (
        <div className="mt-s3 flex items-center gap-s3">
          <ScoreDots score={group.score} />
          {group.scoreText && <p className="min-w-0 break-keep text-ds-caption text-ds-text-2">{group.scoreText}</p>}
        </div>
      )}
      {/* 점이 없어도 할 말이 있으면 한다 — 적자라서 못 잰 것은 데이터가 없는 것과 다르다. */}
      {group.score === null && group.scoreText && (
        <p className="mt-s3 break-keep text-ds-caption text-ds-text-2">{group.scoreText}</p>
      )}
    </section>
  );
}

/**
 * 점수 계산 방법 — **화면 맨 아래 한 번, 접힌 채로** (FIX-01 PART D).
 *
 * 종전에는 덩어리마다 `어떻게 계산했나요` 링크가 붙고, 하나를 누르면 그 문장이 덩어리 사이에
 * 끼어들었다. 실측 화면에는 링크가 **두 번** 나오고 그중 하나는 이미 펼쳐진 상태였다 —
 * 계산 방법이 본문을 밀어내고 있었다.
 *
 * 사용자는 계산 방법을 먼저 궁금해하지 않는다. 그래서 **기본은 닫힘**이고, 한 걸음에
 * 하나이며, 열면 세 덩어리 방법을 한자리에서 보여준다.
 */
export function MethodDisclosure({
  groups,
  open,
  onToggle,
}: {
  groups: readonly CompanyGroup[];
  open: boolean;
  onToggle: () => void;
}) {
  const withMethod = groups.filter((g) => g.method.trim().length > 0);
  if (withMethod.length === 0) return null;
  return (
    <div className="mt-s5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-ds-caption text-ds-text-3 underline"
        data-testid="depth-method-toggle"
      >
        점수는 이렇게 매겼어요
      </button>
      {open && (
        <div className="mt-s3" data-testid="depth-method">
          {withMethod.map((g) => (
            <div key={g.title} className="mt-s2">
              <p className="text-ds-caption text-ds-text-2">{g.title}</p>
              <p className="mt-[2px] break-keep text-ds-caption text-ds-text-3">{g.method}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 마지막 걸음 — **모든 카드 종류가 여기서 끝난다**(DETAIL-01 §D-1).
 *
 * 종목·지표·업종·인물, 무엇을 봤든 여정은 같은 곳에서 끝나야 한다. 끝이 매번 다르면
 * 사용자는 매번 「이제 뭘 하지」를 다시 판단해야 한다.
 *
 * 이 컴포넌트는 **본문만** 그린다. 버튼은 `StepBar` 안에 있어야 어느 걸음에서든 같은
 * 자리에 오므로, 부르는 쪽이 `WatchAction` 을 바에 넣는다.
 */
export function WatchStep({
  title,
  subject,
  done,
  doneText,
}: {
  /** `국제 유가를 계속 지켜볼까요` — 대상 이름이 들어간 물음. */
  title: string;
  /** 담으면 무엇을 알려주는지. 지키지 못할 약속은 쓰지 않는다. */
  subject: string;
  done: boolean;
  doneText: string;
}) {
  return (
    <div className="mt-s6" data-testid="depth-watch-step">
      <p className="break-keep text-ds-display-sm text-ds-text-1">{title}</p>
      <p className="mt-s2 break-keep text-ds-body text-ds-text-2">{subject}</p>
      {done && (
        <div className="mt-s6" data-testid="depth-watch-done">
          <p className="text-ds-display-sm text-ds-text-1">담았어요</p>
          <p className="mt-s2 break-keep text-ds-body text-ds-text-2">{doneText}</p>
        </div>
      )}
    </div>
  );
}

/** 마지막 걸음의 바 — 담기 전엔 담기, 담은 뒤엔 닫기. 자리는 그대로다. */
export function WatchAction({
  done,
  label,
  onWatch,
  onClose,
}: {
  done: boolean;
  label: string;
  onWatch: () => void;
  onClose: () => void;
}) {
  if (done) {
    return (
      <button
        type="button"
        onClick={onClose}
        data-testid="depth-close"
        className="tap-button flex h-touch w-full items-center justify-center rounded-block border-hair border-ds-border bg-ds-surface-2 text-[15px] text-ds-text-1"
      >
        닫기
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onWatch}
      data-testid="depth-watch"
      className="tap-button flex h-touch w-full items-center justify-center gap-s2 rounded-block bg-ds-accent px-gutter text-[15px] font-medium text-ds-bg"
    >
      ★ {label}
    </button>
  );
}

/**
 * 한 줄 = 이름 + 금액. 누를 수 있으면 버튼이 된다(§D-3 상세 → 상세).
 *
 * **이름이 없으면 그리지 않는다** — 종목코드를 이름 자리에 쓰면 읽는 사람에게는 빈 줄이다.
 */
export function AmountRow({
  name,
  amount,
  onTap,
  testId,
}: {
  name: string;
  amount: string;
  onTap?: (() => void) | undefined;
  testId?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 truncate text-ds-body text-ds-text-1">{name}</span>
      <span className="shrink-0 font-mono text-ds-label text-ds-text-2">{amount}</span>
    </>
  );
  if (!onTap) {
    return (
      <div className="flex items-baseline justify-between gap-s3 py-[3px]" data-testid={testId}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid={testId}
      className="tap-button flex w-full items-baseline justify-between gap-s3 py-[3px] text-left"
    >
      {body}
    </button>
  );
}

/**
 * 금액 막대 — **두 막대가 같은 축을 쓴다**(FLOW-01 §B-2).
 *
 * 가장 큰 절대값이 100% 폭이다. 라벨과 금액은 막대 **위에** 양 끝으로 둔다 —
 * 왼쪽에 두면 이름 길이가 제각각이라 정렬이 깨진다(§A-2).
 */
export function FlowBar({
  label,
  amount,
  ratio,
  tone,
}: {
  label: string;
  amount: string;
  /** 0~1. 최대 절대값 대비. */
  ratio: number;
  tone: "out" | "in";
}) {
  const width = `${Math.max(2, Math.min(100, Math.round(ratio * 100)))}%`;
  return (
    <div className="mt-s3" data-testid={`flow-bar-${tone}`}>
      <div className="flex items-baseline justify-between gap-s3">
        <span className="min-w-0 truncate text-ds-body text-ds-text-1">{label}</span>
        <span className={`shrink-0 font-mono text-ds-label ${tone === "in" ? "text-ds-accent" : "text-ds-text-2"}`}>
          {amount}
        </span>
      </div>
      {/* 색 문법은 카드와 같다 — 빠진 쪽 `chart-bar`(회색), 들어온 쪽 `accent`(라임). */}
      <div className="mt-[6px] h-[8px] w-full overflow-hidden rounded-[2px] bg-ds-chart-bar/30">
        <div className={`h-full rounded-[2px] ${tone === "in" ? "bg-ds-accent" : "bg-ds-chart-bar"}`} style={{ width }} />
      </div>
    </div>
  );
}

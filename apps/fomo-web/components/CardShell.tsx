"use client";

/**
 * **모든 메인 카드가 쓰는 한 벌의 껍데기** (2026-08-31 지시 — "카드 크기가 제각각").
 *
 * ## 무엇이 문제였나
 *
 * 종목·흐름·거시 카드가 각자 `rounded-card bg-ds-surface-1 p-s4` 를 따로 적고 있었다.
 * 같은 값이라도 **따로 적으면 따로 흘러간다** — 실제로 세 카드의 높이가 내용에 따라
 * 제각각이었고, 스와이프할 때마다 무대가 출렁였다.
 *
 * ## 높이를 맞춘다
 *
 * 카드가 내용 길이대로 늘었다 줄었다 하면 넘길 때마다 배경이 흔들린다. 최소 높이를 주고
 * **CTA 를 맨 아래로 밀어** 어느 카드든 버튼이 같은 자리에 오게 한다. 내용이 짧은 카드는
 * 가운데가 비지만, 그게 카드마다 버튼을 찾아 눈이 움직이는 것보다 낫다.
 *
 * ## 여기서 정하는 것과 안 정하는 것
 *
 * 껍데기(모서리·배경·여백·최소 높이·CTA 자리)만 정한다. 안쪽 문법(어디에 accent 를 쓰는지,
 * 그림이 무엇인지)은 카드마다 다르므로 손대지 않는다.
 */

import { haptic } from "@/lib/haptics";

/** 카드 최소 높이 — 가장 내용이 많은 카드(A형 역행)를 기준으로 잡았다. */
export const CARD_MIN_HEIGHT = 460;

export function CardShell({
  /** `pick` · `flow` · `macro` — 회귀 테스트가 이 값으로 카드를 가른다. */
  kind,
  testId,
  /** 맨 위 한 줄(작게, 회색). 없으면 자리도 없다. */
  eyebrow,
  children,
  /** 맨 아래 고정 CTA. 없으면 그리지 않는다 — 자리만 남기지 않는다. */
  cta,
  /**
   * 스크린리더가 카드를 한 덩어리로 읽게 한다(DS-06 §7). 종목 카드는 가려진 동안 종목명을
   * 빼고 읽어야 하므로 문장을 직접 만든다 — 껍데기가 대신 만들 수 없다.
   */
  ariaLabel,
  /** `data-*` 여벌. 종목 카드의 `data-revealed` 처럼 **그 종류만** 쓰는 표식용. */
  marks,
}: {
  kind: string;
  testId: string;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  cta?: React.ReactNode;
  ariaLabel?: string;
  marks?: Record<string, string>;
}) {
  return (
    <div
      className="flex flex-col rounded-card bg-ds-surface-1 p-s4"
      style={{ minHeight: CARD_MIN_HEIGHT }}
      data-testid={testId}
      data-card-type={kind}
      {...marks}
      {...(ariaLabel ? { role: "group" as const, "aria-label": ariaLabel } : {})}
    >
      {eyebrow}
      {/* 본문은 남는 높이를 먹고, CTA 는 그 아래로 밀린다 — 카드마다 버튼 위치가 같아진다. */}
      <div className="min-h-0 flex-1">{children}</div>
      {cta && <div className="mt-s5 shrink-0">{cta}</div>}
    </div>
  );
}

/**
 * 카드 하단 CTA — 세 카드가 **같은 모양**을 쓴다. accent 를 쓰지 않는다(DS §7).
 *
 * 햅틱(light)과 누름 배경도 여기서 준다. 종전에는 종목 카드만 갖고 있었다 — 같은 모양의
 * 버튼이 어떤 카드에서는 진동하고 어떤 카드에서는 안 하면 그게 더 이상하다(DS-06 §2).
 */
export function CardCta({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        haptic();
        onClick();
      }}
      data-testid={testId}
      className="tap-button flex h-touch w-full items-center justify-center rounded-block border-hair border-ds-border bg-ds-surface-2 text-[14px] text-ds-text-1 active:bg-[#202020]"
    >
      {label}
    </button>
  );
}

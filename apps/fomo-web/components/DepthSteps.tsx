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
export function StepNext({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="depth-next"
      className="tap-button mt-s6 flex h-touch w-full items-center justify-center gap-s2 rounded-block bg-ds-accent px-gutter text-[15px] font-medium text-ds-bg"
    >
      {label}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** 5점 만점 점. **점만 두지 않는다** — 옆 문장이 없으면 이 컴포넌트를 그리지 않는다(§4-5). */
export function ScoreDots({ score }: { score: number }) {
  return (
    <span className="font-mono text-[13px] tracking-[0.15em] text-ds-accent" data-testid="depth-score-dots" aria-label={`5점 중 ${score}점`}>
      {"●".repeat(score)}
      <span className="text-ds-border">{"○".repeat(Math.max(0, 5 - score))}</span>
    </span>
  );
}

/**
 * 3걸음의 한 덩어리 — `돈은 잘 버나요` 처럼 **질문**이 제목이다.
 *
 * 라벨(`수익성`)이 아니라 질문이어야 답이 읽힌다. 줄마다 숫자와 **그 숫자를 읽는 문장**이
 * 같이 있다 — 문장 없는 줄은 애초에 만들어지지 않는다(`companyRead` 가 거른다).
 */
export function CompanyGroupBlock({ group, onMethod }: { group: CompanyGroup; onMethod: () => void }) {
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
          </div>
        </div>
      ))}

      {group.score !== null && group.scoreText && (
        <div className="mt-s3 flex items-center gap-s3">
          <ScoreDots score={group.score} />
          <p className="min-w-0 break-keep text-ds-caption text-ds-text-2">{group.scoreText}</p>
        </div>
      )}
      {/* 점이 없어도 할 말이 있으면 한다 — 적자라서 못 잰 것은 데이터가 없는 것과 다르다. */}
      {group.score === null && group.scoreText && (
        <p className="mt-s3 break-keep text-ds-caption text-ds-text-2">{group.scoreText}</p>
      )}

      {group.score !== null && (
        <button
          type="button"
          onClick={onMethod}
          className="mt-s2 text-ds-caption text-ds-text-3 underline"
          data-testid="depth-method-toggle"
        >
          어떻게 계산했나요
        </button>
      )}
    </section>
  );
}

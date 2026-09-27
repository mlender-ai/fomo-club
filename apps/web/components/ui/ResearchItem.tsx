/**
 * 연구 항목 — 번호 · 제목 · 상태 알약 · 한 줄 (UI-01 E · UI-02 E).
 *
 * 번호(`01`)를 크게 둔다. SuperHi 의 번호 섹션에서 가져온 인상이고,
 * **열린 질문이 몇 번째까지 왔는지**가 한눈에 보이는 게 요점이다.
 */
import Link from "next/link";

import { Pill, type PillTone } from "./Pill";

export type ResearchStatus = "open" | "testing" | "blocked" | "closed";

/**
 * 상태 알약 (UI-08 A-4) — **이 한 곳**에서 정한다. Overview · 전략 · 포지션 · 고래가 같은 부품을 쓴다.
 *
 * | 상태 | 알약 | 뜻 |
 * |---|---|---|
 * | 진행중 | warn | 확인하는 중 |
 * | 실매매 차단 | dn | 이게 안 풀리면 실제 돈을 못 넣는다 |
 * | 닫힘 · 있음 | up | 가설 맞음 |
 * | 닫힘 · 없음 | mute | 가설 틀림 |
 * | 판단 불가 | mute | 데이터 부족 |
 */
const STATUS: Record<ResearchStatus, { label: string; tone: PillTone }> = {
  open: { label: "진행중", tone: "warn" },
  testing: { label: "진행중", tone: "warn" },
  blocked: { label: "막힘", tone: "dn" },
  closed: { label: "닫힘", tone: "mute" },
};

/** 알약 글자와 색 — 목록 · 상세 · 다른 탭이 같은 말을 쓰게. */
export function researchPill(status: ResearchStatus, verdict?: string | null, blocks?: string | null): { label: string; tone: PillTone } {
  const s = STATUS[status] ?? { label: status, tone: "mute" as PillTone };
  if (status === "blocked" && blocks) return { label: `${blocks} 차단`, tone: "dn" };
  if (status === "closed" && verdict) {
    // 알약은 6자 안(UI-FIX A-2). "판단 불가" 는 그 자체로 닫힌 답이라 "닫힘" 을 붙이지 않는다.
    if (verdict === "inconclusive") return { label: "판단 불가", tone: "mute" };
    return { label: `닫힘 · ${VERDICT[verdict] ?? verdict}`, tone: verdict === "yes" ? "up" : "mute" };
  }
  return s;
}

/** 닫힌 질문의 답 — 알약 한 개에 "닫힘 · 없음" 으로 붙인다(UI-04 G). */
const VERDICT: Record<string, string> = { yes: "있음", no: "없음", inconclusive: "판단 불가" };

export function ResearchItem({
  no,
  title,
  status,
  summary,
  verdict,
  blocks,
  href,
}: {
  no: string;
  title: string;
  status: ResearchStatus;
  /** 한 줄 — **가장 중요한 숫자 하나**(UI-04 G). */
  summary?: string;
  /** 닫힌 항목의 답. `yes` · `no` · `inconclusive`. */
  verdict?: string | null;
  /** 이것 때문에 막힌 것. 있으면 알약이 "실매매 차단" 이 된다. */
  blocks?: string | null;
  href?: string;
}) {
  const s = researchPill(status, verdict, blocks);
  const label = s.label;
  const body = (
    <>
      {/* 번호 — 열린 건 파랑, 닫힌 건 회색. 몇 번째 질문까지 왔는지가 한눈에 보인다. */}
      <span className={`ui-research-no${status === "closed" ? " is-closed" : ""}`}>{no}</span>
      <span className="ui-research-body">
        <span className="ui-research-title">{title}</span>
        <span className="ui-research-head">
          <Pill tone={s.tone}>{label}</Pill>
          {summary ? <span className="ui-research-summary">{summary}</span> : null}
        </span>
      </span>
    </>
  );
  return (
    <li className={`ui-research-item${status === "closed" ? " is-closed" : ""}`}>
      {href ? (
        <Link className="ui-research-link" href={href}>
          {body}
        </Link>
      ) : (
        <span className="ui-research-link">{body}</span>
      )}
    </li>
  );
}

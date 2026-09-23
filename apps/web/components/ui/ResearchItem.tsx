/**
 * 연구 항목 — 번호 · 제목 · 상태 알약 · 한 줄 (UI-01 E · UI-02 E).
 *
 * 번호(`01`)를 크게 둔다. SuperHi 의 번호 섹션에서 가져온 인상이고,
 * **열린 질문이 몇 번째까지 왔는지**가 한눈에 보이는 게 요점이다.
 */
import Link from "next/link";

import { Pill, type PillTone } from "./Pill";

export type ResearchStatus = "open" | "testing" | "blocked" | "closed";

const STATUS: Record<ResearchStatus, { label: string; tone: PillTone }> = {
  open: { label: "진행중", tone: "blue" },
  testing: { label: "확인중", tone: "blue" },
  blocked: { label: "막힘", tone: "warn" },
  closed: { label: "닫힘", tone: "mute" },
};

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
  const s = STATUS[status];
  const label =
    status === "blocked" && blocks
      ? `${blocks} 차단`
      : status === "closed" && verdict
        ? `닫힘 · ${VERDICT[verdict] ?? verdict}`
        : s.label;
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

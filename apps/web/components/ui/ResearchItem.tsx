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
  open: { label: "열림", tone: "blue" },
  testing: { label: "확인중", tone: "blue" },
  blocked: { label: "막힘", tone: "warn" },
  closed: { label: "닫힘", tone: "mute" },
};

export function ResearchItem({
  no,
  title,
  status,
  summary,
  verdict,
  href,
}: {
  no: string;
  title: string;
  status: ResearchStatus;
  summary?: string;
  /** 닫힌 항목의 답. `yes` · `no` · `inconclusive`. */
  verdict?: string | null;
  href?: string;
}) {
  const s = STATUS[status];
  const body = (
    <>
      <span className="ui-research-no">{no}</span>
      <span className="ui-research-body">
        <span className="ui-research-head">
          <span className="ui-research-title">{title}</span>
          <Pill tone={s.tone}>{s.label}</Pill>
          {verdict ? <Pill tone="mute">{verdict}</Pill> : null}
        </span>
        {summary ? <span className="ui-research-summary">{summary}</span> : null}
      </span>
    </>
  );
  return (
    <li className="ui-research-item">
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

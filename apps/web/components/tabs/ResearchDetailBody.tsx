"use client";

/**
 * 연구 상세 본문 (UI-08 PART B) — **에디토리얼.** 본문 폭 680 · 여백 넓게.
 *
 * ```
 * 01                                            [진행중]
 * 고래는 65.8% 맞히는데 우리는 왜 32.4%인가         ← 36/700 · 두 줄까지
 * 2026-09-19 열림 · 9일째 · 고래 추종
 *
 * ① 왜 궁금한가 · ② 가설(번호) · ③ 어떻게 확인하나(번호)
 * ④ 지금까지 알아낸 것 — ✓ 확인됨 · ✗ 기각 · · 진행중 (줄마다 출처)
 * ⑤ 결정 — 강조 카드 · 파랑 왼쪽 바
 * ⑥ 관련 · 근거 수치(접힘)
 * ```
 *
 * UI-FIX C-5 — 연구 상세는 **문단이 허용되는 유일한 곳**이다. 카드 테두리 없이 섹션 제목 + 본문.
 */
import Link from "next/link";

import type { Research as ResearchRow } from "@prisma/client";

import { Note, NoteInline } from "../shell/Note";
import { Pill, researchPill, type ResearchStatus } from "../ui";
import type { Finding, Related } from "../../lib/lab/research-note";
import type { Jsonify } from "../../lib/lab/wire";

export type ResearchDetailItem = Jsonify<ResearchRow>;

const TRACK: Record<string, string> = {
  crypto: "크립토",
  whale: "고래 추종",
  stock_us: "주식 US",
  stock_kr: "주식 KR",
  polymarket: "폴리마켓",
};

const MARK: Record<Finding["mark"], { glyph: string; label: string; tone: string }> = {
  confirmed: { glyph: "✓", label: "확인됨", tone: "up" },
  rejected: { glyph: "✗", label: "기각", tone: "dn" },
  pending: { glyph: "·", label: "진행중", tone: "mute" },
};

const DAY = 86_400_000;

const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function ResearchDetailBody({ item: it, now = new Date() }: { item: ResearchDetailItem; now?: Date }) {
  const pill = researchPill(it.status as ResearchStatus, it.verdict, it.blocks);
  const closed = it.status === "closed";
  const days = closed ? null : Math.max(1, Math.floor((now.getTime() - Date.parse(it.openedAt)) / DAY) + 1);
  const tracks = asList<string>(it.trackKeys);
  const hypotheses = asList<string>(it.hypotheses);
  const methods = asList<string>(it.methods);
  const findings = asList<Finding>(it.findings);
  const related = asList<Related>(it.related);
  const evidence = asList<{ label: string; value: string; source: string }>(it.evidence);

  const meta = [
    `${it.openedAt.slice(0, 10)} 열림`,
    closed && it.closedAt ? `${it.closedAt.slice(0, 10)} 닫힘` : days ? `${days}일째` : null,
    tracks.length ? tracks.map((t) => TRACK[t] ?? t).join(" · ") : null,
  ].filter(Boolean);

  return (
    <article className="rd">
      <header className="rd-head">
        <div className="rd-head-row">
          <span className={`rd-no${closed ? " is-closed" : ""}`}>{it.no}</span>
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </div>
        <h1 className="rd-title">{it.title}</h1>
        <p className="rd-meta">
          <Link href="/research">연구</Link> · {meta.join(" · ")}
        </p>
        {it.summary ? <p className="rd-summary">{it.summary}</p> : null}
      </header>

      {it.why ? (
        <Section title="왜 궁금한가">
          <Note text={it.why} />
        </Section>
      ) : null}

      {hypotheses.length ? (
        <Section title="가설">
          <ol className="rd-ol">
            {hypotheses.map((h, i) => (
              <li key={i}>
                <NoteInline text={h} />
              </li>
            ))}
          </ol>
        </Section>
      ) : it.hypothesis ? (
        <Section title="가설">
          <Note text={it.hypothesis} />
        </Section>
      ) : null}

      {methods.length ? (
        <Section title="어떻게 확인하나">
          <ol className="rd-ol">
            {methods.map((m, i) => (
              <li key={i}>
                <NoteInline text={m} />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="지금까지 알아낸 것">
        {findings.length === 0 ? (
          <p className="sh-note">아직 없다.</p>
        ) : (
          <ul className="rd-findings">
            {findings.map((f, i) => {
              const m = MARK[f.mark] ?? MARK.pending;
              return (
                <li key={i} className={`rd-finding is-${m.tone}`}>
                  <span className="rd-mark" aria-label={m.label} title={m.label}>
                    {m.glyph}
                  </span>
                  <div className="rd-finding-body">
                    <p className="rd-finding-text">
                      <NoteInline text={f.text} />
                    </p>
                    {f.note ? (
                      <p className="rd-finding-note">
                        → <NoteInline text={f.note} />
                      </p>
                    ) : null}
                    <p className="rd-source">
                      출처 · <NoteInline text={f.source} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="결정">
        <div className="rd-decision">
          {it.decision ? <Note text={it.decision} /> : <p>아직 없다.</p>}
        </div>
      </Section>

      {related.length || tracks.length ? (
        <Section title="관련">
          <dl className="rd-related">
            {related.map((r) => (
              <div key={`${r.label}-${r.value}`}>
                <dt>{r.label}</dt>
                <dd>
                  <RelatedValue value={r.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {evidence.length ? (
        <details className="rd-evidence">
          <summary>근거 수치 {evidence.length}줄</summary>
          <ul>
            {evidence.map((e, i) => (
              <li key={i}>
                <span className="rd-ev-label">{e.label}</span>
                <span className="rd-ev-value">{e.value}</span>
                <span className="rd-source">{e.source || "출처 없음"}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rd-section">
      <h2 className="rd-section-title">{title}</h2>
      {children}
    </section>
  );
}

/** `/whales` 같은 화면 경로는 링크로, 연구 번호(`05 …`)는 그 연구로, 나머지는 글자로. */
function RelatedValue({ value }: { value: string }) {
  if (/^\/[a-z]/.test(value)) {
    const [path, ...rest] = value.split(" ");
    return (
      <>
        <Link href={path as string}>{path}</Link>
        {rest.length ? ` ${rest.join(" ")}` : ""}
      </>
    );
  }
  const parts = value.split(" · ");
  return (
    <>
      {parts.map((p, i) => {
        const no = /^(\d{2})\s/.exec(p);
        return (
          <span key={i}>
            {i > 0 ? " · " : ""}
            {no ? <Link href={`/research/${no[1]}`}>{p}</Link> : <NoteInline text={p} />}
          </span>
        );
      })}
    </>
  );
}

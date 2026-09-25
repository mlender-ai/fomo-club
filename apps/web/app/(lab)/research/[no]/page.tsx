"use client";

/**
 * `/research/[no]` — 연구 상세 (UI-03 PART B).
 *
 * 가설 · 어떻게 확인하나 · 근거 · 결정. **근거에는 출처가 붙는다** — 출처 없는 수치는
 * 다음 사람이 검증할 수 없다.
 *
 * `/backtest` 가 `/research/04` 로 온다 — 1차 백테스트의 판정이 여기 있다.
 */
import Link from "next/link";
import { useParams } from "next/navigation";

import type { Research as ResearchRow } from "@prisma/client";

import { LabView } from "../../../../components/shell/LabView";
import { Note } from "../../../../components/shell/Note";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import { Card, Pill, Skeleton, SkeletonRows } from "../../../../components/ui";
import type { PillTone } from "../../../../components/ui";
import type { Jsonify } from "../../../../lib/lab/wire";

type Item = Jsonify<ResearchRow>;

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "열림", tone: "blue" },
  testing: { label: "확인중", tone: "blue" },
  blocked: { label: "막힘", tone: "warn" },
  closed: { label: "닫힘", tone: "mute" },
};
const VERDICT_LABEL: Record<string, string> = { yes: "예", no: "아니오", inconclusive: "판단 불가" };

interface Evidence {
  label: string;
  value: string;
  source: string;
}

export default function ResearchDetailPage() {
  const { no } = useParams<{ no: string }>();
  const { state, retry } = useLab<{ item: Item }>(`/api/lab/research/${encodeURIComponent(no)}`);

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title={`연구 ${no}`} side={<Skeleton height={180} radius="var(--r-card)" />}>
          <Skeleton width={480} height={32} />
          <SkeletonRows rows={6} />
        </PageFrame>
      }
    >
      {(data) => {
        const it = data.item;
        const st = STATUS[it.status] ?? { label: it.status, tone: "mute" as PillTone };
        const evidence = Array.isArray(it.evidence) ? (it.evidence as unknown as Evidence[]) : [];
        const tracks = Array.isArray(it.trackKeys) ? (it.trackKeys as unknown as string[]) : [];

        return (
          <PageFrame
            title={`${it.no} · ${it.title}`}
            description={
              <>
                <Link href="/research">연구</Link> · {it.summary}
              </>
            }
            side={
              <Card title="상태">
                <div className="sh-inline">
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {it.verdict ? <Pill tone="mute">{VERDICT_LABEL[it.verdict] ?? it.verdict}</Pill> : null}
                </div>
                <dl className="sh-meta">
                  <dt>열림</dt>
                  <dd>{it.openedAt.slice(0, 10)}</dd>
                  <dt>닫힘</dt>
                  <dd>{it.closedAt ? it.closedAt.slice(0, 10) : "—"}</dd>
                  <dt>트랙</dt>
                  <dd>
                    {tracks.length === 0
                      ? "—"
                      : tracks.map((t) => (
                          <Link key={t} href={`/strategies/${t}`} className="sh-meta-link">
                            {t}
                          </Link>
                        ))}
                  </dd>
                  {it.blocks ? (
                    <>
                      <dt>막고 있는 것</dt>
                      <dd>
                        <Pill tone="warn">{it.blocks}</Pill>
                      </dd>
                    </>
                  ) : null}
                </dl>
              </Card>
            }
          >
            {/* UI-FIX C-5 — 에디토리얼이라 문단이 허용되는 유일한 곳. 카드 테두리 없이 섹션 제목 + 본문. */}
            {it.hypothesis ? (
              <section className="sh-section">
                <h2 className="sh-section-title">가설</h2>
                <Note text={it.hypothesis} />
              </section>
            ) : null}
            {it.method ? (
              <section className="sh-section">
                <h2 className="sh-section-title">어떻게 확인하나</h2>
                <Note text={it.method} />
              </section>
            ) : null}
            <section className="sh-section">
              <h2 className="sh-section-title">근거</h2>
              {evidence.length === 0 ? (
                <p className="sh-note">근거가 아직 없어요.</p>
              ) : (
                <ul className="ui-rows">
                  {evidence.map((e, i) => (
                    <li key={`${e.label}-${i}`} className="ui-row">
                      <span className="ui-row-link sh-evidence">
                        <span className="ui-row-title">{e.label}</span>
                        <span className="sh-evidence-value">{e.value}</span>
                        <span className="ui-row-sub">{e.source || "출처 없음"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="sh-section">
              <h2 className="sh-section-title">결정</h2>
              {it.decision ? <Note text={it.decision} /> : <p className="sh-note">아직 결정이 없다.</p>}
            </section>
          </PageFrame>
        );
      }}
    </LabView>
  );
}

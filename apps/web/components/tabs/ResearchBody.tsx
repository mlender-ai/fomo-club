"use client";

/**
 * 연구 목록 본문 (UI-FIX C-5 — 목록은 유지).
 *
 * 가장 큰 숫자는 **열린 질문 수**다. 닫힌 항목도 같이 보인다 — **지우지 않는다.**
 * 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다.
 */
import { PageFrame } from "../shell/PageFrame";
import { AssetRow, Card, Empty, Hero, Pill, ResearchItem } from "../ui";
import type { ResearchStatus } from "../ui";
import type { Wire } from "../../lib/lab/wire";

type Research = Wire<"research">;

export function ResearchBody({ data }: { data: Research }) {
  return (
    <PageFrame
      title="연구"
      description="가설 → 확인 → 근거 → 결정"
      info={
        <p>
          질문 하나가 노트 하나다. 닫아도 지우지 않는다 — 진 질문이 남아 있어야 같은 걸 다시 묻지 않는다. 노트의 정본은
          레포의 연구 노트 파일이다.
        </p>
      }
      side={
        <Card title="막고 있는 것" description="풀려야 다음으로 간다" flush>
          {data.blockers.length === 0 ? (
            <p className="sh-note" style={{ padding: "0 var(--card-pad) var(--card-pad)" }}>
              막고 있는 질문이 없어요.
            </p>
          ) : (
            <ul className="ui-rows">
              {data.blockers.map((b) => (
                <AssetRow
                  key={b.no}
                  icon={b.no}
                  name={b.title}
                  value={<Pill tone="warn">{`${b.blocks} 차단`}</Pill>}
                  href={`/research/${b.no}`}
                />
              ))}
            </ul>
          )}
        </Card>
      }
    >
      <Hero label="열린 질문" value={String(data.open)} meta={`막힘 ${data.blocked} · 닫힘 ${data.closed}`} />
      {data.items.length === 0 ? (
        <Empty
          title="연구 항목이 아직 없어요"
          reason="연구 노트를 시드하면 여기 뜹니다."
          action={<code>npm run lab:research-seed</code>}
        />
      ) : (
        <Card flush>
          <ul className="ui-research">
            {data.items.map((r) => (
              <ResearchItem
                key={r.no}
                no={r.no}
                title={r.title}
                status={r.status as ResearchStatus}
                summary={r.summary}
                verdict={r.verdict}
                blocks={r.blocks}
                href={`/research/${r.no}`}
              />
            ))}
          </ul>
        </Card>
      )}
    </PageFrame>
  );
}

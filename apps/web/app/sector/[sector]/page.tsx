import Link from "next/link";
import { notFound } from "next/navigation";

import { getSectorDeepDiveData } from "../../../lib/researchInsights";

export const dynamic = "force-dynamic";

function getCatalystHorizonLabel(horizon: "today" | "this-week" | "next") {
  switch (horizon) {
    case "today":
      return "오늘";
    case "this-week":
      return "이번 주";
    default:
      return "다음";
  }
}

export default async function SectorDeepDivePage({
  params
}: {
  params: Promise<{ sector: string }>;
}) {
  const { sector } = await params;
  const data = await getSectorDeepDiveData(sector as Parameters<typeof getSectorDeepDiveData>[0]);

  if (!data) {
    notFound();
  }

  return (
    <main className="research-app">
      <div className="research-shell detail-shell">
        <section className="detail-hero">
          <div className="detail-hero-copy">
            <div className="detail-breadcrumbs">
              <Link href="/">리서치 홈</Link>
              <span>/</span>
              <span>{data.sector.label}</span>
            </div>
            <span className="section-kicker">Deep Sector Brief</span>
            <h1>{data.sector.label}</h1>
            <p className="detail-summary">{data.workspace.agentPipeline.market.summary}</p>
            <div className="detail-chip-row">
              <span className="masthead-chip">{data.workspace.agentPipeline.market.strongSectors[0]?.horizon ?? "단기"}</span>
              <span className="masthead-chip">핵심 뉴스 {data.workspace.news.derivedArticles.length + (data.workspace.news.headline ? 1 : 0)}개</span>
              <span className="masthead-chip">연결 수혜주 {data.relatedOpportunities.length}개</span>
            </div>
          </div>

          <div className="detail-hero-panel">
            <div className="detail-price">
              <strong>{data.workspace.agentPipeline.actionPlan.strategy}</strong>
              <span>{data.workspace.agentPipeline.actionPlan.recommendedActions[0] ?? "행동 제안 준비 중"}</span>
            </div>
            <Link className="detail-cta-link" href="/">
              메인으로 돌아가기
            </Link>
          </div>
        </section>

        <section className="detail-insight-grid">
          <article className="detail-insight-card">
            <span className="eyebrow">시장 해석</span>
            <strong>{data.workspace.agentPipeline.market.shortTermView}</strong>
            <p>{data.workspace.agentPipeline.market.mediumTermView}</p>
          </article>
          <article className="detail-insight-card">
            <span className="eyebrow">강세</span>
            <strong>{data.workspace.agentPipeline.market.strongSectors[0]?.sector ?? "강세 섹터 없음"}</strong>
            <p>{data.workspace.agentPipeline.market.strongSectors[0]?.reason ?? "강세 흐름이 아직 정리되지 않았습니다."}</p>
          </article>
          <article className="detail-insight-card">
            <span className="eyebrow">리스크</span>
            <strong>{data.workspace.agentPipeline.market.riskSectors[0]?.sector ?? "리스크 섹터 없음"}</strong>
            <p>{data.workspace.agentPipeline.market.riskSectors[0]?.reason ?? "리스크 흐름이 아직 정리되지 않았습니다."}</p>
          </article>
        </section>

        <section className="detail-catalyst-grid">
          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Morning Routine</span>
                <h2>이 섹터를 볼 때의 오늘 루틴</h2>
              </div>
              <p>바쁜 사용자가 아침에 3분 안에 섹터 판단을 끝낼 수 있게 순서를 고정했습니다.</p>
            </div>
            <div className="detail-routine-list">
              <article className="detail-routine-item">
                <span className="detail-routine-step">1</span>
                <div>
                  <strong>핵심 뉴스 확인</strong>
                  <p>{data.workspace.news.headline?.analysis ?? "섹터 헤드라인부터 읽고 시작합니다."}</p>
                </div>
              </article>
              <article className="detail-routine-item">
                <span className="detail-routine-step">2</span>
                <div>
                  <strong>시장 해석 연결</strong>
                  <p>{data.workspace.agentPipeline.market.shortTermView}</p>
                </div>
              </article>
              <article className="detail-routine-item">
                <span className="detail-routine-step">3</span>
                <div>
                  <strong>행동 조건 확인</strong>
                  <p>{data.workspace.agentPipeline.actionPlan.recommendedActions[0] ?? "행동 제안 준비 중입니다."}</p>
                </div>
              </article>
            </div>
          </article>

          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Catalyst Watch</span>
                <h2>지금 체크할 촉매</h2>
              </div>
              <p>뉴스를 계속 스크롤하지 않아도, 섹터 흐름을 바꿀 이벤트만 모았습니다.</p>
            </div>
            <div className="detail-catalyst-list">
              {data.catalysts.map((catalyst) => (
                <article className="detail-catalyst-item" key={`${catalyst.horizon}-${catalyst.title}`}>
                  <span className={`detail-catalyst-chip horizon-${catalyst.horizon}`}>{getCatalystHorizonLabel(catalyst.horizon)}</span>
                  <div>
                    <strong>{catalyst.title}</strong>
                    <p>{catalyst.reason}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="detail-main-grid">
          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Headline Stack</span>
                <h2>{data.sector.label} 핵심 인사이트</h2>
              </div>
              <p>뉴스를 길게 나열하지 않고, 실제 판단에 필요한 이유만 남겼습니다.</p>
            </div>
            <div className="detail-news-list">
              {[data.workspace.news.headline, ...data.workspace.news.derivedArticles]
                .filter((item): item is NonNullable<typeof item> => Boolean(item))
                .slice(0, 4)
                .map((item) => (
                  <article className="detail-news-item" key={item.id}>
                    <div>
                      <span className="eyebrow">{item.source}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.analysis}</p>
                  </article>
                ))}
            </div>
          </article>

          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Cross-Market Plays</span>
                <h2>미장·국장 수혜주 묶음</h2>
              </div>
              <p>이 섹터를 볼 때 함께 모니터링할 만한 연결 종목입니다.</p>
            </div>
            <div className="detail-related-grid">
              {data.relatedOpportunities.map((item) => (
                <Link className="detail-related-card" href={`/ticker/${encodeURIComponent(item.ticker.replace(/\.KS$|\.KQ$/u, ""))}?market=${item.market}`} key={item.ticker}>
                  <div>
                    <span className="eyebrow">{item.market === "KR" ? "국장" : "미장"}</span>
                    <strong>{item.label}</strong>
                  </div>
                  <p>{item.reason}</p>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="detail-footer-row">
          {data.adjacentSectors.map((sector) => (
            <Link className="detail-sector-link" href={`/sector/${sector.id}`} key={sector.id}>
              <span className="eyebrow">Adjacent Sector</span>
              <strong>{sector.label}</strong>
              <p>{sector.description}</p>
            </Link>
          ))}
        </section>

        {data.warnings.length > 0 ? <p className="toolbar-notice">{data.warnings.join(" ")}</p> : null}
      </div>
    </main>
  );
}

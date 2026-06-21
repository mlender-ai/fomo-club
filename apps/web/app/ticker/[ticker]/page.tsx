import Link from "next/link";
import { notFound } from "next/navigation";

import { FavoriteTickerButton } from "../../../components/research/FavoriteTickerButton";
import { getTickerDeepDiveData } from "../../../lib/researchInsights";

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

function getScenarioLabel(label: "bull" | "base" | "bear") {
  switch (label) {
    case "bull":
      return "강세";
    case "base":
      return "기본";
    default:
      return "리스크";
  }
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getDisplayTicker(ticker: string) {
  return ticker.replace(/\.KS$|\.KQ$/u, "");
}

export default async function TickerDeepDivePage({
  params,
  searchParams
}: {
  params: Promise<{ ticker: string }>;
  searchParams?: Promise<{ market?: string }>;
}) {
  const [{ ticker }, query] = await Promise.all([params, searchParams]);
  const data = await getTickerDeepDiveData(decodeURIComponent(ticker), query?.market);

  if (!data) {
    notFound();
  }

  const chartUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(data.analysis.tradingViewSymbol ?? data.ticker)}&interval=60&hidesidetoolbar=1&hidelegend=1&symboledit=1&saveimage=0&toolbarbg=F8FAFC&theme=light&style=1&timezone=Asia%2FSeoul&withdateranges=1`;

  return (
    <main className="research-app">
      <div className="research-shell detail-shell">
        <section className="detail-hero">
          <div className="detail-hero-copy">
            <div className="detail-breadcrumbs">
              <Link href="/">리서치 홈</Link>
              <span>/</span>
              <Link href={`/sector/${data.sectorTag}`}>{data.sectorLabel}</Link>
            </div>
            <span className="section-kicker">Deep Ticker Brief</span>
            <h1>
              {data.company} <span>{getDisplayTicker(data.ticker)}</span>
            </h1>
            <p className="detail-summary">{data.analysis.summary}</p>
            <div className="detail-chip-row">
              <span className="masthead-chip">{data.sectorLabel}</span>
              <span className="masthead-chip">{data.analysis.market === "KR" ? "국장" : "미장"}</span>
              {data.themeBullets.map((item) => (
                <span className="masthead-chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="detail-hero-panel">
            <div className="detail-price">
              <strong>{formatPrice(data.analysis.latestPrice)}</strong>
              <span className={(data.analysis.priceChangePercent ?? 0) >= 0 ? "positive" : "negative"}>
                {formatPercent(data.analysis.priceChangePercent) ?? "변동 없음"}
              </span>
            </div>
            <FavoriteTickerButton sectorTag={data.sectorTag} ticker={data.ticker} />
            <Link className="detail-cta-link" href={`/sector/${data.sectorTag}`}>
              {data.sectorLabel} 섹터 전체 보기
            </Link>
          </div>
        </section>

        <section className="detail-insight-grid">
          <article className="detail-insight-card">
            <span className="eyebrow">판단</span>
            <strong>{data.sectorWorkspace.agentPipeline.actionPlan.strategy}</strong>
            <p>{data.analysis.recommendation}</p>
          </article>
          <article className="detail-insight-card">
            <span className="eyebrow">왜 지금</span>
            <strong>{data.sectorWorkspace.agentPipeline.market.summary}</strong>
            <p>{data.analysis.marketContext}</p>
          </article>
          <article className="detail-insight-card">
            <span className="eyebrow">수혜 확산</span>
            <strong>미장·국장 연결 수혜주 {data.relatedOpportunities.length}개</strong>
            <p>{data.relatedOpportunities[0]?.reason ?? "직접 연결 수혜주를 아직 계산하지 못했습니다."}</p>
          </article>
        </section>

        <section className="detail-catalyst-grid">
          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Catalyst Watch</span>
                <h2>지금 체크할 촉매</h2>
              </div>
              <p>실시간 뉴스가 많아도, 가격 판단에 직접 연결되는 이벤트만 남겼습니다.</p>
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

          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Scenario CTA</span>
                <h2>매수할지 말지 보는 시나리오</h2>
              </div>
              <p>숫자를 길게 읽기보다, 강세·기본·리스크 시나리오로 바로 판단할 수 있게 정리했습니다.</p>
            </div>
            <div className="detail-scenario-list">
              {data.scenarios.map((scenario) => (
                <article className={`detail-scenario-card ${scenario.label}`} key={scenario.label}>
                  <div className="detail-scenario-head">
                    <span className="eyebrow">{getScenarioLabel(scenario.label)}</span>
                    <strong>{scenario.title}</strong>
                  </div>
                  <p>{scenario.description}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="section-panel detail-opportunity-panel">
          <div className="section-heading compact">
            <div>
              <span className="section-kicker">Opportunity Map</span>
              <h2>공급망 그래프로 보는 수혜주 맵</h2>
            </div>
            <p>{data.opportunityMap.thesis}</p>
          </div>
          <div className="detail-opportunity-shell">
            <article className="detail-opportunity-core">
              <span className="eyebrow">Core Ticker</span>
              <strong>
                {data.company} <span>{getDisplayTicker(data.ticker)}</span>
              </strong>
              <p>{data.analysis.marketContext}</p>
            </article>
            <div className="detail-opportunity-grid">
              {data.opportunityMap.groups.map((group) => (
                <article className="detail-opportunity-group" key={group.relation}>
                  <div className="detail-opportunity-group-head">
                    <span className="subtle-chip">{group.title}</span>
                    <p>{group.description}</p>
                  </div>
                  <div className="detail-opportunity-links">
                    {group.items.map((item) => (
                      <Link className="detail-opportunity-link" href={`/ticker/${encodeURIComponent(getDisplayTicker(item.ticker))}?market=${item.market}`} key={item.ticker}>
                        <strong>
                          {item.label} <span>{getDisplayTicker(item.ticker)}</span>
                        </strong>
                        <p>{item.reason}</p>
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="detail-main-grid">
          <article className="section-panel detail-chart-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Live Chart</span>
                <h2>실차트 기준으로 보기</h2>
              </div>
              <a className="api-link" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(data.analysis.tradingViewSymbol ?? data.ticker)}`} rel="noreferrer" target="_blank">
                TradingView 크게 보기
              </a>
            </div>
            <iframe className="tradingview-frame detail" loading="lazy" src={chartUrl} title={`${data.ticker} TradingView chart`} />
          </article>

          <aside className="detail-side-stack">
            <article className="section-panel detail-side-card">
              <span className="section-kicker">기술적 해석</span>
              <h3>기술적 상태</h3>
              <p>{data.analysis.technicalAnalysis}</p>
            </article>
            <article className="section-panel detail-side-card">
              <span className="section-kicker">패턴</span>
              <h3>차트 패턴</h3>
              <div className="pattern-list">
                {data.analysis.patternAnalysis.map((pattern) => (
                  <article className="pattern-card" key={pattern.name}>
                    <div className="card-headline-meta">
                      <strong>{pattern.name}</strong>
                      <span className="subtle-chip">{pattern.confidence}</span>
                    </div>
                    <p>{pattern.detail}</p>
                  </article>
                ))}
              </div>
            </article>
          </aside>
        </section>

        <section className="detail-main-grid">
          <article className="section-panel detail-story-panel">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">Sector Context</span>
                <h2>{data.sectorLabel}에서 같이 봐야 하는 흐름</h2>
              </div>
              <p>단일 티커 판단이 아니라, 어떤 뉴스와 어떤 업종 확산이 같이 붙는지 먼저 보이게 정리했습니다.</p>
            </div>
            <div className="detail-news-list">
              {[data.sectorWorkspace.news.headline, ...data.linkedNews, ...data.sectorWorkspace.news.derivedArticles]
                .filter((item, index, list): item is NonNullable<typeof item> => Boolean(item) && list.findIndex((candidate) => candidate?.id === item?.id) === index)
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
                <span className="section-kicker">Related Plays</span>
                <h2>함께 봐야 하는 수혜주</h2>
              </div>
              <p>뉴스를 나열하는 대신, 이 종목이 움직일 때 같이 볼 종목들을 먼저 보여줍니다.</p>
            </div>
            <div className="detail-related-grid">
              {data.relatedOpportunities.map((item) => (
                <Link className="detail-related-card" href={`/ticker/${encodeURIComponent(getDisplayTicker(item.ticker))}?market=${item.market}`} key={item.ticker}>
                  <div>
                    <span className="eyebrow">{item.market === "KR" ? "국장" : "미장"}</span>
                    <strong>
                      {item.label} <span>{getDisplayTicker(item.ticker)}</span>
                    </strong>
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

/**
 * 콘텐츠 피드 베리에이션 빌더 (2026-07-11 User Zero: "매번 지수 얘기뿐 — 다양하게").
 *
 * 신규 4타입 — 전부 결정론(LLM 없음, 요청 경로 안전):
 * - coin-issue : 코인 핫이슈 — 시총 10위권 스냅샷 캐시에서 최대 무버·거래대금 이상.
 * - hot-issue  : 미장·국장 뉴스 핫이슈 — 이미 수집된 기사에서 다수 소스가 겹치는 사건.
 * - term       : 오늘의 경제용어 — 정적 용어사전 날짜 로테이션(사실 서술만).
 * - event      : 시장 일정 — 규칙 계산 만기일(3째 금요일/둘째 목요일) + Fed 공개 FOMC 일정.
 *
 * 카피 원칙: 사실+수치만, 예측·판단·매매 지시 없음(AGENTS.md 블랙리스트).
 */

import type { RawArticle } from "@fomo/core";
import type { DeckContentCard, DeckContentFact } from "./deck-content";
import { readCoinMarketSnapshots, type CoinMarketSnapshot } from "./coin-market-source";
import { computeCoinSignal } from "./coin-discovery";
import { fetchAllNews } from "./fomo-news-sources";
import { koreanTitle } from "./content-i18n";

function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function kstDate(): string {
  return kstNow().toISOString().slice(0, 10);
}

// ── coin-issue ───────────────────────────────────────────────────────────────

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function krwText(price: number): string {
  if (price >= 1000) return `${Math.round(price).toLocaleString("ko-KR")}원`;
  return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
}

/** 코인 핫이슈 1장 — 시총 10위권(캐시) 중 오늘 가장 크게 움직인 코인 + 상위 4종 시세표. */
export async function buildCoinIssueCards(): Promise<DeckContentCard[]> {
  const snapshots = await readCoinMarketSnapshots().catch((): CoinMarketSnapshot[] => []);
  if (snapshots.length === 0) return [];
  const withSignal = snapshots
    .map((snapshot) => ({ snapshot, signal: computeCoinSignal(snapshot) }))
    .filter((x): x is { snapshot: CoinMarketSnapshot; signal: NonNullable<ReturnType<typeof computeCoinSignal>> } => x.signal !== null);
  if (withSignal.length === 0) return [];
  const mover = [...withSignal].sort(
    (a, b) => Math.abs(b.snapshot.changePct) + b.signal.volumeRatio - (Math.abs(a.snapshot.changePct) + a.signal.volumeRatio)
  )[0]!;
  const headlineParts = [`${mover.snapshot.koreanName} 하루 ${signedPct(mover.snapshot.changePct)}`];
  if (mover.signal.volumeRatio >= 1.3) headlineParts.push(`거래대금 평소 ${mover.signal.volumeRatio.toFixed(1)}배`);
  if (typeof mover.snapshot.marketCapRank === "number") headlineParts.push(`시총 ${mover.snapshot.marketCapRank}위`);
  const facts: DeckContentFact[] = [...withSignal]
    .sort((a, b) => (a.snapshot.marketCapRank ?? 999) - (b.snapshot.marketCapRank ?? 999))
    .slice(0, 4)
    .map(({ snapshot }) => ({
      label: snapshot.koreanName,
      value: `${signedPct(snapshot.changePct)} · ${krwText(snapshot.price)}`,
    }));
  return [
    {
      kind: "content",
      id: `content:coin-issue:${kstDate()}`,
      contentType: "coin-issue",
      scope: "global",
      headline: headlineParts.join(" · "),
      facts,
      source: "Upbit · CoinGecko",
      asOf: kstDate(),
    },
  ];
}

// ── hot-issue ────────────────────────────────────────────────────────────────

const HOT_ISSUE_WINDOW_HOURS = 30;
const HOT_ISSUE_MIN_CLUSTER = 2; // 서로 다른 기사 2건 이상이 겹치는 사건만 "핫이슈"

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

function clusterScore(article: RawArticle, tokenFreq: Map<string, number>): number {
  const tokens = new Set(tokenize(article.title));
  let shared = 0;
  for (const token of tokens) {
    const freq = tokenFreq.get(token) ?? 0;
    if (freq >= 2) shared += Math.min(freq, 4);
  }
  return shared;
}

function isFresh(article: RawArticle, now: Date): boolean {
  const published = Date.parse(article.publishedAt);
  if (!Number.isFinite(published)) return false;
  return now.getTime() - published <= HOT_ISSUE_WINDOW_HOURS * 60 * 60 * 1000;
}

/** 미장(en)·국장(ko) 각 1장 — 여러 소스가 동시에 다루는 사건의 헤드라인+관련 기사(사실만, LLM 없음). */
export async function buildHotIssueCards(): Promise<DeckContentCard[]> {
  const articles = await fetchAllNews().catch((): RawArticle[] => []);
  if (articles.length === 0) return [];
  const now = new Date();
  const cards: DeckContentCard[] = [];
  for (const lang of ["ko", "en"] as const) {
    const pool = articles.filter((article) => article.lang === lang && isFresh(article, now));
    if (pool.length < HOT_ISSUE_MIN_CLUSTER) continue;
    const tokenFreq = new Map<string, number>();
    for (const article of pool) {
      for (const token of new Set(tokenize(article.title))) tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + 1);
    }
    const ranked = [...pool].sort((a, b) => clusterScore(b, tokenFreq) - clusterScore(a, tokenFreq));
    const top = ranked[0]!;
    if (clusterScore(top, tokenFreq) < HOT_ISSUE_MIN_CLUSTER) continue;
    const topTokens = new Set(tokenize(top.title));
    // en 클러스터는 한글 번역(크론 캐시) 우선 — 미번역 en 헤드라인은 노출 금지(2026-07-12).
    const koTitle = (article: (typeof ranked)[number]): string | undefined => (lang === "en" ? koreanTitle(article.url) : article.title);
    const topKo = koTitle(top);
    if (lang === "en" && !topKo) continue; // 번역 없으면 영문 헤드라인 노출하지 않는다
    const related = ranked
      .slice(1)
      .filter((article) => tokenize(article.title).some((token) => topTokens.has(token)))
      .filter((article) => lang === "ko" || koTitle(article))
      .slice(0, 3);
    const facts: DeckContentFact[] = related.map((article) => {
      const title = koTitle(article) ?? article.title;
      return { label: article.source, value: title.length > 60 ? `${title.slice(0, 57)}…` : title };
    });
    cards.push({
      kind: "content",
      id: `content:hot-issue:${lang}:${kstDate()}`,
      contentType: "hot-issue",
      scope: lang === "ko" ? "domestic" : "world",
      headline: topKo ?? top.title,
      facts,
      sourceUrl: top.url,
      source: top.source,
      asOf: kstDate(),
    });
  }
  return cards;
}

// ── term (오늘의 경제용어) ────────────────────────────────────────────────────

interface EconTerm {
  term: string;
  definition: string;
  example: string;
}

/** 사실 서술만 — 판단·조언 없음. 로테이션은 날짜 결정론(같은 날 = 같은 용어). */
const ECON_TERMS: EconTerm[] = [
  { term: "PER (주가수익비율)", definition: "주가를 주당순이익(EPS)으로 나눈 배수. 이익 1원당 시장이 지불하는 가격을 나타낸다.", example: "PER 10배 = 현재 이익이 유지되면 투자금 회수에 10년이 걸린다는 산술적 의미." },
  { term: "PBR (주가순자산비율)", definition: "주가를 주당순자산으로 나눈 배수. 장부가치 대비 주가 수준을 나타낸다.", example: "PBR 1배 미만은 시가총액이 회사 순자산보다 작다는 뜻." },
  { term: "공매도", definition: "주식을 빌려서 먼저 팔고, 나중에 사서 갚는 매매. 가격 하락 시 차익이 발생한다.", example: "공매도 잔고가 많은 종목이 급등하면 되사려는 수요가 몰리는 숏 스퀴즈가 나타나기도 한다." },
  { term: "숏 스퀴즈", definition: "공매도 포지션이 손실을 줄이려 주식을 되사면서 가격 상승이 가속되는 현상.", example: "2021년 게임스톱 급등 구간에서 대규모 숏 스퀴즈가 관측됐다." },
  { term: "서킷브레이커", definition: "지수가 급락할 때 거래를 일시 중단하는 제도. 한국은 3단계(-8%·-15%·-20%)로 발동된다.", example: "코스피가 하루 -8% 도달 시 1단계 서킷브레이커로 20분간 거래가 멈춘다." },
  { term: "사이드카", definition: "선물 가격 급변 시 프로그램 매매를 5분간 정지하는 제도. 서킷브레이커보다 낮은 단계의 완충 장치.", example: "코스피200 선물이 ±5% 이상 1분 지속 시 발동된다." },
  { term: "콘탱고", definition: "선물 가격이 현물 가격보다 높은 상태. 보관비용·이자 등이 반영된 일반적 구조다.", example: "원유 선물 콘탱고가 깊어지면 롤오버 비용이 커져 원유 ETF 수익률이 유가 상승분을 따라가지 못할 수 있다." },
  { term: "백워데이션", definition: "선물 가격이 현물보다 낮은 상태. 단기 공급 부족이나 현물 수요 급증 구간에서 나타난다.", example: "2022년 니켈 시장에서 극단적 백워데이션이 관측됐다." },
  { term: "펀딩비 (Funding Rate)", definition: "무기한 선물에서 롱·숏 사이에 주기적으로 주고받는 수수료. 선물과 현물 가격 차이를 좁히는 장치다.", example: "펀딩비가 양수면 롱이 숏에게 지불한다 — 롱 쏠림의 신호로 읽힌다." },
  { term: "미결제약정 (OI)", definition: "청산되지 않고 남아 있는 파생상품 계약의 총량. 시장에 들어와 있는 자금 규모를 보여준다.", example: "가격 상승 + OI 증가는 신규 자금 유입, 가격 상승 + OI 감소는 숏 청산 중심 상승으로 구분해 읽는다." },
  { term: "VIX (변동성지수)", definition: "S&P500 옵션 가격에서 산출한 향후 30일 기대 변동성. '공포지수'로 불린다.", example: "역사적으로 VIX 30 이상은 시장 스트레스 구간에서 주로 관측됐다." },
  { term: "기준금리", definition: "중앙은행이 시중은행과 거래할 때 적용하는 정책금리. 시중 금리의 기준점이 된다.", example: "미국은 FOMC가 연 8회 회의에서 기준금리를 결정한다." },
  { term: "장단기 금리 역전", definition: "장기 국채 금리가 단기보다 낮아지는 현상. 경기 둔화 우려가 커질 때 나타난다.", example: "미국 2년-10년물 금리 역전은 과거 다수 경기침체에 선행했다." },
  { term: "양적긴축 (QT)", definition: "중앙은행이 보유 채권을 줄여 시중 유동성을 회수하는 정책. 양적완화(QE)의 반대다.", example: "연준은 만기 도래 채권의 재투자를 줄이는 방식으로 QT를 진행한다." },
  { term: "CPI (소비자물가지수)", definition: "가계가 구입하는 상품·서비스 가격의 평균 변동을 측정한 지수. 대표적 인플레이션 지표다.", example: "미국 CPI는 매월 중순 발표되며 발표 직후 금리 기대가 재조정되곤 한다." },
  { term: "PCE 물가지수", definition: "개인소비지출 기준 물가지표. 연준이 공식 물가 목표(2%)의 기준으로 삼는다.", example: "CPI보다 주거비 비중이 낮아 통상 CPI보다 낮게 나온다." },
  { term: "고용보고서 (NFP)", definition: "미국 비농업 부문 신규 고용을 집계한 월간 지표. 매월 첫째 금요일에 발표된다.", example: "고용 서프라이즈는 금리 전망을 흔들어 지수 변동성을 키우는 대표 이벤트다." },
  { term: "어닝 서프라이즈", definition: "실적이 시장 컨센서스(전망 평균)를 크게 웃도는 것. 반대는 어닝 쇼크.", example: "컨센서스 대비 EPS +10% 상회 발표 후 갭 상승이 나타나는 사례가 많다." },
  { term: "가이던스", definition: "기업이 제시하는 다음 분기·연간 실적 전망. 실제 실적만큼 주가에 영향을 준다.", example: "실적이 좋아도 가이던스를 낮추면 주가가 하락하는 경우가 잦다." },
  { term: "유상증자", definition: "기업이 새 주식을 발행해 자금을 조달하는 것. 기존 주주 지분이 희석된다.", example: "대규모 유상증자 공시 후 단기 주가 하락이 나타나는 사례가 많다." },
  { term: "무상증자", definition: "잉여금을 자본금으로 옮겨 주주에게 주식을 무상 배정하는 것. 기업 가치 자체는 변하지 않는다.", example: "유통 주식 수가 늘어 거래가 활발해지는 효과가 관측되기도 한다." },
  { term: "자사주 매입", definition: "회사가 자기 주식을 사들이는 것. 유통 물량이 줄어 주당 지표가 개선된다.", example: "매입 후 소각까지 하면 주당순이익(EPS)이 산술적으로 올라간다." },
  { term: "블록딜", definition: "대량 주식을 장 마감 후 할인가로 기관 간 거래하는 것.", example: "블록딜 소식 다음 날 할인율만큼 주가가 조정되는 사례가 많다." },
  { term: "락업 해제", definition: "상장 후 일정 기간 매도가 금지됐던 주식의 금지 기간이 끝나는 것.", example: "락업 해제일 전후로 물량 부담 우려가 가격에 반영되곤 한다." },
  { term: "수급", definition: "주식을 사려는 힘(수요)과 팔려는 힘(공급)의 균형. 외국인·기관·개인의 순매수가 대표 지표다.", example: "외국인 연속 순매수는 수급 개선의 신호로 읽힌다." },
  { term: "프로그램 매매", definition: "지수 차익거래 등 컴퓨터 알고리즘이 바스켓 단위로 실행하는 매매.", example: "선물·현물 가격 차이가 벌어지면 차익 프로그램 매수·매도가 유입된다." },
  { term: "옵션 만기일", definition: "옵션 계약의 권리가 소멸하는 날. 미국은 매월 셋째 금요일이다.", example: "만기일에는 포지션 정리 물량으로 거래량과 변동성이 커지곤 한다." },
  { term: "네 마녀의 날", definition: "지수선물·지수옵션·개별주식선물·개별주식옵션 만기가 겹치는 날. 한국은 3·6·9·12월 둘째 목요일.", example: "동시만기일 장 막판 프로그램 물량으로 지수가 출렁이는 사례가 많다." },
  { term: "스태그플레이션", definition: "경기 침체와 높은 인플레이션이 동시에 나타나는 상태.", example: "1970년대 오일쇼크 구간이 대표 사례로 꼽힌다." },
  { term: "낙수효과", definition: "대기업·고소득층의 성장 이익이 아래로 흘러 전체 경제가 좋아진다는 가설.", example: "감세 정책 논쟁에서 찬반 근거로 자주 인용된다." },
  { term: "리쇼어링", definition: "해외로 나갔던 생산기지를 자국으로 되돌리는 것.", example: "미국 반도체법은 자국 내 공장 건설에 보조금을 주는 리쇼어링 정책이다." },
  { term: "디커플링", definition: "함께 움직이던 두 시장·자산이 따로 움직이는 현상.", example: "코스피가 미국 지수 상승을 따라가지 못하면 '디커플링됐다'고 말한다." },
  { term: "리스크온 / 리스크오프", definition: "위험자산 선호(리스크온)와 안전자산 선호(리스크오프) 국면을 가리키는 말.", example: "리스크오프 국면에서는 주식에서 국채·달러·금으로 자금이 이동하는 경향이 있다." },
  { term: "달러 인덱스 (DXY)", definition: "주요 6개 통화 대비 달러 가치를 지수화한 것.", example: "달러 인덱스 상승은 신흥국 증시 자금 유출 압력으로 작용하곤 한다." },
  { term: "골든크로스 / 데드크로스", definition: "단기 이동평균이 장기 이동평균을 위로 뚫으면 골든크로스, 아래로 뚫으면 데드크로스.", example: "50일선이 200일선을 상향 돌파하는 골든크로스는 추세 전환 신호로 자주 인용된다." },
  { term: "이동평균선", definition: "일정 기간 종가의 평균을 이어 그린 선. 추세의 방향과 기울기를 보여준다.", example: "20일선은 약 한 달, 200일선은 약 1년의 평균 매수 단가에 해당한다." },
  { term: "거래량", definition: "일정 기간 체결된 주식 수. 가격 움직임의 신뢰도를 뒷받침하는 지표다.", example: "저항 돌파가 평소보다 많은 거래량과 함께 나오면 돌파의 신뢰도가 높다고 본다." },
  { term: "시가총액", definition: "주가 × 발행주식수. 기업의 시장 가치 총액이다.", example: "시총 상위 종목은 지수 영향력이 커서 지수 흐름과 동조하기 쉽다." },
];

/** 오늘의 경제용어 1장 — 날짜 기반 결정론 로테이션(재현 가능). */
export function buildTermCard(): DeckContentCard[] {
  const date = kstDate();
  const dayIndex = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const entry = ECON_TERMS[dayIndex % ECON_TERMS.length]!;
  return [
    {
      kind: "content",
      id: `content:term:${date}`,
      contentType: "term",
      scope: "global",
      headline: `오늘의 경제용어 — ${entry.term}`,
      facts: [
        { label: "정의", value: entry.definition },
        { label: "예시", value: entry.example },
      ],
      source: "FOMO 용어사전",
      asOf: date,
    },
  ];
}

// ── event (시장 일정) ─────────────────────────────────────────────────────────

/**
 * FOMC 2026 회의 일정(이틀째 = 금리 발표일) — Fed가 사전 공개하는 고정 일정.
 * 출처: federalreserve.gov 2026 meeting calendar.
 */
const FOMC_2026_DECISION_DATES = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface MarketEvent {
  date: string;
  label: string;
  detail: string;
}

/** 규칙 계산 + 공개 고정 일정으로 만드는 다가오는 시장 일정 목록. */
export function upcomingMarketEvents(todayIso: string, limit = 3): MarketEvent[] {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const events: MarketEvent[] = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth();
    // 미국 옵션 만기 — 매월 셋째 금요일 (규칙 계산).
    events.push({
      date: isoDate(nthWeekdayOfMonth(year, month, 5, 3)),
      label: "미국 옵션 만기일",
      detail: "매월 셋째 금요일 · 만기 물량으로 변동성이 커지곤 하는 날",
    });
    // 한국 선물·옵션 동시만기 — 3·6·9·12월 둘째 목요일 (규칙 계산).
    if ([2, 5, 8, 11].includes(month)) {
      events.push({
        date: isoDate(nthWeekdayOfMonth(year, month, 4, 2)),
        label: "한국 선물·옵션 동시만기",
        detail: "3·6·9·12월 둘째 목요일 · 네 마녀의 날",
      });
    }
  }
  for (const date of FOMC_2026_DECISION_DATES) {
    events.push({ date, label: "FOMC 금리 결정", detail: "미 연준 통화정책 발표 · 한국시간 새벽" });
  }
  return events
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

function dDayText(todayIso: string, dateIso: string): string {
  const diff = Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / 86_400_000);
  return diff === 0 ? "오늘" : `D-${diff}`;
}

/** 다가오는 시장 일정 1장 — 만기·FOMC 등 사실 일정만(해석·예측 없음). */
export function buildEventCard(): DeckContentCard[] {
  const date = kstDate();
  const events = upcomingMarketEvents(date, 3);
  if (events.length === 0) return [];
  const next = events[0]!;
  return [
    {
      kind: "content",
      id: `content:event:${date}`,
      contentType: "event",
      scope: "global",
      headline: `${next.label} ${dDayText(date, next.date)} — 다가오는 시장 일정`,
      facts: events.map((event) => ({
        label: `${event.date.slice(5).replace("-", "/")} · ${dDayText(date, event.date)}`,
        value: `${event.label} — ${event.detail}`,
      })),
      source: "거래소 규칙 · Fed 공개 일정",
      asOf: date,
    },
  ];
}

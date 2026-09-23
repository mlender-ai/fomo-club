"use client";

/**
 * 부품 견본 (UI-01 완료확인 5).
 *
 * **부품을 눈으로 보는 자리다.** 스토리북을 따로 세우지 않았다 — 부품 12개에
 * 빌드 도구를 하나 더 얹는 것보다, 앱 안에 한 페이지를 두는 쪽이 같은 토큰·같은
 * 폰트·같은 반응형 규칙 아래서 보인다는 점에서 낫다.
 *
 * 여기 숫자는 **전부 가짜다.** 실제 데이터는 `UI-02` 가 붙인다.
 * 가짜인 것이 화면에 적혀 있어야 누가 이걸 보고 성과로 읽지 않는다.
 */
import { useState } from "react";

import {
  AreaChartCard,
  AssetRow,
  Card,
  CompareBar,
  Delta,
  Empty,
  Hero,
  Pill,
  ResearchItem,
  Skeleton,
  SkeletonRows,
  Sparkline,
  StatGroup,
  money,
  num,
  pct,
} from "../../../components/ui";

/** 견본용 시계열. 값과 벤치마크가 갈라지는 모양을 보려고 만든 것. */
const SERIES = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  return {
    at: new Date(Date.UTC(2026, 7, 10) + i * 86_400_000).toISOString(),
    // 중간에 구멍을 하나 넣어 **선이 끊기는지** 본다. 이어 그리면 안 된다.
    value: i === 22 || i === 23 ? null : 50000 - 6000 * t + Math.sin(i / 3) * 1400,
    benchmark: 50000 + 3000 * t + Math.cos(i / 4) * 800,
  };
});

const SPARK_UP = Array.from({ length: 14 }, (_, i) => ({ value: 100 + i * 2 + (i % 3) }));
const SPARK_DN = Array.from({ length: 14 }, (_, i) => ({ value: 140 - i * 3 + (i % 4) }));

const RANGES = [
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "all", label: "전체" },
];

export default function UiSamplePage() {
  const [range, setRange] = useState("30d");

  return (
    <div className="ui-sample">
      <p className="ui-sample-warning">
        <strong>여기 숫자는 전부 가짜다.</strong> 부품을 눈으로 보려고 만든 견본이고,
        실제 데이터는 <code>UI-02</code> 가 붙인다.
      </p>

      <Hero
        label="트랙당 $10,000 환산"
        value={money(46229.3)}
        delta={<Delta amount={-3770.7} percent={-7.54} period="시작 대비" />}
        meta="전부 페이퍼 · 실주문 없음"
      />

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">알약</h2>
        <div className="ui-sample-inline">
          <Pill tone="up">{pct(4.27)}</Pill>
          <Pill tone="dn">{pct(-27.71)}</Pill>
          <Pill tone="warn">표본 부족</Pill>
          <Pill tone="blue">선택됨</Pill>
          <Pill tone="mute">정지</Pill>
          <Pill tone="up" dot>
            운용중
          </Pill>
        </div>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">통계 묶음</h2>
        <StatGroup
          stats={[
            { label: "거래", value: num(147, 0) },
            { label: "승률", value: "51.72%" },
            { label: "손익비", value: num(0.5952, 4) },
            { label: "최대 낙폭", value: pct(-36.89), tone: "dn" },
            { label: "유효일", value: "3/48", note: "달력 48일 중" },
          ]}
        />
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">영역 차트</h2>
        <Card
          title="자산"
          description="구멍 구간은 잇지 않는다 — 중간에 선이 끊긴 곳이 그것이다"
        >
          <AreaChartCard
            data={SERIES}
            ranges={RANGES}
            activeRange={range}
            onRange={setRange}
            baseline={50000}
            benchmarkLabel="BTC 보유"
            format={(v) => money(v)}
          />
        </Card>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">자산 행</h2>
        <Card flush>
          <ul className="ui-rows">
            <AssetRow
              name="크립토"
              subtitle="Binance 무기한 · 3x"
              spark={SPARK_DN}
              sparkTone="dn"
              value={money(6974)}
              subValue="348.68 USDT"
              change={<Pill tone="dn">{pct(-30.26)}</Pill>}
              status={
                <Pill tone="up" dot>
                  운용중
                </Pill>
              }
            />
            <AssetRow
              name="고래 추종"
              subtitle="Hyperliquid 추적"
              spark={SPARK_UP}
              sparkTone="up"
              value={money(9255)}
              subValue="462.73 USDT"
              change={<Pill tone="dn">{pct(-7.45)}</Pill>}
              status={
                <Pill tone="up" dot>
                  운용중
                </Pill>
              }
            />
            <AssetRow
              name="주식 US"
              subtitle="체결 invariant 정지"
              value={money(10000.3)}
              subValue="100,003 USD"
              change={<Pill tone="mute">{pct(0)}</Pill>}
              status={<Pill tone="mute">정지</Pill>}
            />
          </ul>
        </Card>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">비교 막대</h2>
        <Card
          title="전략 비교"
          description="기준선을 넘은 막대만 파랗다 — 넘지 못한 것은 강조하지 않는다"
        >
          <CompareBar
            baseline={0.7}
            items={[
              // C/M 은 손익이 아니다. 색을 주지 않는다(UI-01 A-2).
              { label: "BTC 보유", value: 0.7, display: num(0.7), isBaseline: true },
              { label: "추세 스윙 v1", value: 0.3, display: num(0.3) },
              { label: "평균회귀 v1", value: 0.15, display: num(0.15) },
            ]}
          />
        </Card>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">연구 항목</h2>
        <Card flush>
          <ul className="ui-research">
            <ResearchItem
              no="01"
              title="고래는 65.8% 맞히는데 우리는 왜 32.4%인가"
              status="open"
              summary="두 승률이 같은 모집단인지부터 확인한다"
            />
            <ResearchItem
              no="02"
              title="강제청산을 넣으면 성과가 얼마나 바뀌나"
              status="blocked"
              summary="실매매를 막고 있는 항목"
            />
            <ResearchItem
              no="05"
              title="1배와 3배는 무엇이 다른가"
              status="closed"
              verdict="청산 모델 전엔 같음"
              summary="147건 실측 — 승률·PF 가 소수점까지 같다"
            />
          </ul>
        </Card>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">추이선 · 빈 상태 · 로딩</h2>
        <div className="ui-sample-grid">
          <Card title="추이선">
            <div className="ui-sample-inline">
              <Sparkline data={SPARK_UP} tone="up" />
              <Sparkline data={SPARK_DN} tone="dn" />
              <Sparkline data={SPARK_UP} />
            </div>
          </Card>
          <Card title="로딩">
            <SkeletonRows rows={3} />
            <div style={{ marginTop: "var(--s4)" }}>
              <Skeleton width={180} height={44} />
            </div>
          </Card>
        </div>
        <div style={{ marginTop: "var(--s5)" }}>
          <Empty
            title="닫힌 거래가 아직 없습니다"
            reason="FCE 스냅샷이 한 번도 올라오지 않았습니다."
            action={<code>npm run lab:runner</code>}
          />
        </div>
      </section>

      <section className="ui-sample-block">
        <h2 className="ui-sample-h">숫자 표기</h2>
        <Card description="음수는 유니코드 마이너스 − 이고, 통화 기호는 숫자 앞에 온다">
          <ul className="ui-sample-list">
            <li>
              {money(46229.3)} · {money(-148.73)} · {money(99999340, "KRW")} ·{" "}
              {money(348.68, "USDT")}
            </li>
            <li>
              {pct(4.27)} · {pct(-27.71)} · {pct(0)} · {pct(null)}
            </li>
            <li>
              {num(26373, 0)} · {num(0.5952, 4)} · {num(null)}
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

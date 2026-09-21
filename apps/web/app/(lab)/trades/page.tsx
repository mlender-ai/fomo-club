/**
 * `/trades` — 거래 이력. **FCE 가 실제로 체결한 것들.**
 *
 * 전광판은 트랙 단위 요약이다. 요약만 보면 "승률 32%" 가 어떤 거래들이었는지
 * 알 수 없고, **비용이 성과를 얼마나 먹었는지는 아예 안 보인다.** 이 화면이
 * 그걸 연다.
 *
 * ## 목표가·손절선은 여기에도 없다
 *
 * FCE 는 거래마다 `take_profit_price` · `stop_price` 를 갖고 있지만 랩은
 * **받아오지도 않는다**(`fce-payload.ts`). `LAB-08` 이 화면에서 막은 값이고,
 * DB 에 넣어두면 언젠가 샌다. 여기 있는 것은 결과뿐이다 — 얼마에 들어가 얼마에
 * 나왔고 왜 나왔나.
 *
 * ## 합계는 보이는 줄이 아니라 전부를 센다
 *
 * 표는 최근 60건만 보여준다. 합계를 보이는 줄에서 더하면 화면이 거짓말한다.
 */
import { LEDGER_ROWS, readFceLedger, type FceTradeRow } from "../../../lib/lab/fce-board";

export const dynamic = "force-dynamic";

/**
 * FCE 의 청산 사유 → 사람이 읽는 말.
 *
 * 값은 지어내지 않고 **실제로 오는 것**을 적었다(147건 분포). 처음에는
 * `stop_loss` · `invalidation` 같은 일반명으로 지도를 짰다가 하나도 안 맞아서
 * 화면에 원문이 그대로 나왔다. 모르는 값은 원문 그대로 둔다 — 그게 맞다.
 */
const EXIT_LABEL: Record<string, string> = {
  invalidation_breach: "전제 무효",
  take_profit_1: "목표 1",
  take_profit_2: "목표 2",
  take_profit_pressure: "목표 부근 압력",
  time_decay: "시간 소모",
  time_stop: "시간 만료",
  breakeven_stop: "본전 정지",
  opposite_stance_flip: "반대 전환",
  duplicate_bootstrap_suppressed: "중복 억제",
};

/**
 * 화면에 낼 FCE 태그를 고른다.
 *
 * `exit:invalidation_breach` 처럼 **청산 사유를 그대로 되풀이하는 태그**는 뺀다 —
 * 옆 칸에 이미 있고, 남겨두면 표가 같은 말을 두 번 한다.
 */
function usefulTags(tags: string[], exitReason: string | null): string[] {
  return tags.filter((tag) => {
    if (tag.startsWith("exit:")) return false;
    return tag !== exitReason;
  });
}

function usd(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function price(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function sign(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

function stamp(at: Date | null): string {
  return at ? at.toISOString().slice(5, 16).replace("T", " ") : "—";
}

function TradeRow({ trade }: { trade: FceTradeRow }) {
  return (
    <tr>
      <td className="name">
        {trade.symbol}
        {trade.leverage ? <span className="lab-tag">{trade.leverage}x</span> : null}
      </td>
      <td>{trade.direction === "short" ? "숏" : "롱"}</td>
      <td className="num">{price(trade.entryPrice)}</td>
      <td className="num">{price(trade.exitPrice)}</td>
      <td className={`num ${sign(trade.netReturnPct)}`}>
        {trade.netReturnPct === null ? "—" : `${usd(trade.netReturnPct)}%`}
      </td>
      <td className={`num ${sign(trade.netPnlUsdt)}`}>{usd(trade.netPnlUsdt)}</td>
      {/* 비용은 항상 빠져나간 돈이라 부호를 붙이지 않는다. */}
      <td className="num">{trade.costsUsdt === null ? "—" : trade.costsUsdt.toFixed(2)}</td>
      <td className="l">
        {trade.exitReason ? (EXIT_LABEL[trade.exitReason] ?? trade.exitReason) : "—"}
      </td>
      {/* FCE 내부 태그. 길어서 칸을 넘기므로 잘라 보여준다 — 전문은 FCE 에 있다. */}
      <td className="tags">
        {(() => {
          const tags = usefulTags(trade.lossTags, trade.exitReason);
          return tags.length > 0 ? <span className="lab-nonrank">{tags.join(" · ")}</span> : null;
        })()}
      </td>
      <td className="num">{stamp(trade.exitAt)}</td>
    </tr>
  );
}

export default async function TradesPage() {
  const ledger = await readFceLedger();
  const t = ledger.total;

  if (t.count === 0) {
    return (
      <>
        <h1 className="lab-title">거래 이력</h1>
        <div className="lab-empty">
          <p className="lab-empty-brand">STRATEGY LAB</p>
          <p className="lab-empty-msg">닫힌 거래가 아직 올라오지 않았습니다.</p>
          <p className="lab-empty-note">npm run lab:runner</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">거래 이력</h1>
      </div>
      <p className="lab-summary">
        <span>FCE 거울 · 닫힌 거래 {t.count}건</span>
        <strong>전부 페이퍼</strong>
        <span>
          {stamp(ledger.span.from)} ~ {stamp(ledger.span.to)}
        </span>
      </p>

      {/*
        전광판 N 과 이 표의 건수가 다를 수 있다. **어느 한쪽이 틀린 게 아니다** —
        FCE 채점판은 검증 창 안에서 닫힌 거래만 센다(`all_closed_in_window`).
        화면이 이걸 말하지 않으면 두 화면이 서로를 부정하는 것처럼 보이고,
        그러면 둘 다 못 믿게 된다.
      */}
      {ledger.boardCount !== null && ledger.boardCount !== t.count ? (
        <p className="lab-warning">
          전광판은 <strong>{ledger.boardCount}건</strong>, 이 표는{" "}
          <strong>{t.count}건</strong>이다. 어느 한쪽이 틀린 게 아니라{" "}
          <strong>세는 모집단이 다르다</strong> — 전광판은 FCE 검증 창 안에서 닫힌 거래만
          세고(<code>all_closed_in_window</code>), 이 표는 랩이 받아 쌓은 전부다. 차이{" "}
          {Math.abs(t.count - ledger.boardCount)}건은 창 밖에서 닫힌 것이다.{" "}
          <strong>두 수를 빼서 쓰지 않는다.</strong>
        </p>
      ) : null}

      <section>
        <p className="section-kicker">전부 합쳐서 — 표에 보이는 줄이 아니라 {t.count}건 전부</p>
        <dl className="lab-stats">
          <div>
            <dt>이김 · 짐</dt>
            <dd className="num">
              {t.wins} · {t.losses}
              {t.flat > 0 ? <span className="lab-nonrank"> (0원 {t.flat})</span> : null}
            </dd>
          </div>
          <div>
            <dt>비용 전</dt>
            <dd className={`num ${sign(t.grossUsdt)}`}>{usd(t.grossUsdt)} USDT</dd>
          </div>
          <div>
            <dt>비용</dt>
            <dd className="num down">−{t.costsUsdt.toFixed(2)} USDT</dd>
          </div>
          <div>
            <dt>비용 후</dt>
            <dd className={`num ${sign(t.netUsdt)}`}>{usd(t.netUsdt)} USDT</dd>
          </div>
        </dl>

        {/* 비용이 성과를 먹은 비율. 무기한 선물에서 이건 작은 항이 아니다. */}
        {t.costSharePct !== null ? (
          <p className="lab-warning">
            수수료·펀딩비가 총손익 규모의 <strong>{t.costSharePct.toFixed(1)}%</strong> 다.
            {t.grossUsdt > 0 && t.netUsdt <= 0 ? (
              <>
                {" "}
                <strong>비용 전에는 벌었지만 비용 후에는 잃었다</strong> — 전략이 아니라 비용이
                결과를 정했다.
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      <section>
        <p className="section-kicker">
          최근 {Math.min(LEDGER_ROWS, ledger.trades.length)}건
          {t.count > ledger.trades.length ? (
            <span className="lab-nonrank"> · 나머지 {t.count - ledger.trades.length}건은 위 합계에만</span>
          ) : null}
        </p>
        <div className="lab-board-scroll">
          <table className="lab-board">
            <thead>
              <tr>
                <th className="l">심볼</th>
                <th className="l">방향</th>
                <th>진입가</th>
                <th>청산가</th>
                <th>손익률</th>
                <th>손익</th>
                <th>비용</th>
                <th className="l">왜 나왔나</th>
                <th className="l">FCE 태그</th>
                <th>청산</th>
              </tr>
            </thead>
            <tbody>
              {ledger.trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="lab-note-line">
          손익률은 <strong>증거금 대비</strong>다. 목표가·손절선은 이 표에 없다 — 랩이 FCE 에서
          받아오지도 않는다.
        </p>
      </section>
    </>
  );
}

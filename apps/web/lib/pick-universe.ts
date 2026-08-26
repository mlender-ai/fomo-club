import type { StockDef } from "@fomo/core";
import type { DiscoveryMarketRow } from "./market-source-types";

/**
 * WO-RESET-04 PART D — 픽 엔진이 훑는 **국내 유니버스**를 시세 행에서 만든다.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 픽 엔진은 그동안 `STOCK_VOCAB` 을 유니버스로 썼다(`docs/STATUS.md` §17-A). 그런데 그 배열의
 * 원래 목적은 스캔 대상이 아니다 — 파일 주석이 그렇게 적어뒀다: *"종목 인식 어휘(보수적)…
 * 오인식 1건이 신뢰를 깨므로 별칭은 좁게"*. **뉴스 원문에서 종목명을 찾는 사전**이다.
 * 그것을 유니버스로 쓰는 바람에 국내 상장 ~2,500개 중 80개만 보고 있었다.
 *
 * ## 데이터는 이미 와 있었다
 *
 * `fetchKrMarketRows()` 가 시장당 10페이지를 긁어 **1,627행**(KOSPI 627 · KOSDAQ 1000)을
 * 279ms 에 돌려준다(실측 2026-08-26). 일봉 프리웜도 이미 시총 상위 450종목을 채운다
 * (`kr-candle-prewarm` 의 `UNIVERSE_LIMIT`). 즉 **새로 수집할 것이 없다** — 픽 엔진이
 * 안 보고 있었을 뿐이다.
 *
 * ## 사전은 그대로 둔다
 *
 * `STOCK_VOCAB` 을 늘리지 않는다. 늘리면 뉴스 인식 어휘가 같이 넓어져 오인식이 생긴다.
 * 여기서 만드는 정의는 **스캔용**이고, 사전에 있는 종목은 사전 정의를 그대로 물려받는다
 * (별칭·`marquee`·국가가 유지된다). 사전 밖 종목은 별칭을 `[정식명]` 하나로만 준다 —
 * 인식 어휘를 넓히지 않겠다는 뜻이다.
 */

/**
 * 시장별 상한. KOSPI 400 + KOSDAQ 400 ≈ **800** (WO PART D-1 의 2차 목표).
 *
 * 왜 시장별로 나누나 — 시총 순위는 **시장 안에서만** 비교 가능하다. 두 시장을 섞어 상위 N을
 * 자르면 KOSPI 가 거의 다 먹고 KOSDAQ 은 몇 개 안 남는다. 코스닥이 오히려 "아직 조용한"
 * 종목이 많은 곳이라 그렇게 자르면 이 앱이 찾으려는 것을 스스로 버린다.
 *
 * ## 왜 150에서 400으로 갔나 — 실측이 시켰다
 *
 * 150(총 326)으로 배포하고 재보니 **`mega_cap` 으로만 14후보가 떨어졌다.** 당연하다:
 * 시장별 상위 150을 보는데 "이미 알려진" 판정선이 시총 **100위**(`KR_MEGA_CAP_RANK`)라
 * 유니버스의 3분의 2가 그 선 안이다. 조용한 종목을 찾겠다면서 시끄러운 구간만 훑고 있었다.
 *
 * **판정선을 밀지 않는다** — 그러면 "이미 오른 종목"이 섞인다(WO 하지 말 것). 대신 선 **아래**를
 * 늘린다. 400이면 시장별 300종목이 100위 밖에 놓인다.
 */
export const PICK_UNIVERSE_PER_MARKET = 400;

export interface KrPickUniverse {
  defs: StockDef[];
  /** `market` = 시세 행에서 만듦 · `vocab` = 시세가 비어 사전으로 후퇴. */
  source: "market" | "vocab";
  /** 사전에 이미 있던 종목 수(정의를 그대로 물려받은 것). */
  fromVocab: number;
  /** 사전 밖에서 새로 들어온 종목 수. */
  fromRows: number;
}

/**
 * 시세 행 + 사전 → 스캔 유니버스.
 *
 * ## 시세가 비면 사전으로 후퇴한다
 *
 * `fetchKrMarketRows` 가 실패하면 행이 0개다. 그때 유니버스를 0으로 두면 **덱이 빈다** —
 * `docs/STATUS.md` §12 가 바로 그 사고였다. 비면 종전 동작(사전 필터)으로 돌아가고
 * `source: "vocab"` 을 남겨 진단에서 보이게 한다. 조용히 후퇴하지 않는다.
 *
 * ## `marquee` 는 사전에만 있는 플래그다
 *
 * 손으로 단 21개짜리 플래그라 사전 밖 종목엔 없다. 여기서 시총 컷을 **새로 만들지 않는다** —
 * 감으로 정한 임계를 남기지 않기 위해서다(WO 하지 말 것). 이미 알려진 대형주는 파이프라인
 * 뒤쪽의 **실측 게이트**가 거른다: `mega_cap`(시총 순위) · `turnover_top20`(거래대금) ·
 * `changed_15`(오늘 변동) · `illiquid`(거래대금 하한).
 */
export function buildKrPickUniverse(
  rows: readonly DiscoveryMarketRow[],
  vocab: readonly StockDef[],
  perMarket: number = PICK_UNIVERSE_PER_MARKET
): KrPickUniverse {
  const vocabKr = vocab.filter((def) => def.naverCode && !def.marquee);
  const usable = rows.filter((row) => row.naverCode && (row.market === "KOSPI" || row.market === "KOSDAQ"));
  if (usable.length === 0 || perMarket <= 0) {
    return { defs: [...vocabKr], source: "vocab", fromVocab: vocabKr.length, fromRows: 0 };
  }

  const byCode = new Map(vocab.filter((def) => def.naverCode).map((def) => [def.naverCode!, def]));
  const taken = new Map<string, number>();
  const seen = new Set<string>();
  const defs: StockDef[] = [];
  let fromVocab = 0;
  let fromRows = 0;

  // 행은 시총 순위대로 온다(`fetchKrMarketRows` 가 시장별 rank 를 붙인다). 순서를 그대로 쓴다.
  for (const row of usable) {
    const code = row.naverCode!;
    if (seen.has(code)) continue;
    const used = taken.get(row.market) ?? 0;
    if (used >= perMarket) continue;

    const known = byCode.get(code);
    // 사전이 초대형 대장주로 표시한 종목은 종전대로 뺀다(의외성 0). 자리는 다음 종목이 채운다.
    if (known?.marquee) continue;

    seen.add(code);
    taken.set(row.market, used + 1);
    if (known) {
      defs.push(known);
      fromVocab += 1;
    } else {
      defs.push({
        canonical: row.canonical,
        // 별칭을 넓히지 않는다 — 이 정의는 스캔용이지 뉴스 인식용이 아니다.
        aliases: [row.canonical],
        market: row.market === "KOSPI" ? "KOSPI" : "KOSDAQ",
        country: "KR",
        naverCode: code,
      });
      fromRows += 1;
    }
  }

  /**
   * 사전에는 있는데 시총 상위 컷 밖으로 밀린 종목은 **버리지 않고 뒤에 붙인다.**
   * 지금까지 카드가 나오던 종목이 유니버스 확대로 오히려 사라지면 그건 개선이 아니다.
   */
  for (const def of vocabKr) {
    if (seen.has(def.naverCode!)) continue;
    seen.add(def.naverCode!);
    defs.push(def);
    fromVocab += 1;
  }

  return { defs, source: "market", fromVocab, fromRows };
}

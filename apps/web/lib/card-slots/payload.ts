import {
  RULESET_VERSION,
  buildValuationChart,
  classifyArchetype,
  composeWhereThisIsWrong,
  hasWhereThisIsWrongContent,
  toRenderable,
  type ValuationChartData,
  type WhereThisIsWrongBlock,
} from "@fomo/core";
import { readBusinessContext } from "../business-context/repository";
import { readFeedContent } from "../feed-content-store";
import { kstDate } from "../fomo";
import { readFactSheet } from "../fundamentals/repository";
import { readSymbolRisk } from "../risk/repository";

/**
 * 카드 3슬롯 페이로드 (WO-SUB-08).
 *
 * ## 왜 이 모듈이 필요한가
 *
 * `buildValuationChart` 와 `toRenderable` 이 **테스트에서만 호출되고 있었다.** 프론트로
 * 내보내는 경로가 없어서 WO-SUB-04 의 차트는 픽스처 프리뷰에만 존재했다. 08 의 최소 완료
 * 조건이 "프로덕션 화면에 ①③ 카드가 보이는 것" 이므로, 그 배선을 여기서 만든다.
 *
 * ## 저장된 레코드만 읽는다
 *
 * 팩트시트·사업 실체는 배치가 만들어 저장한 것을 읽는다. 여기서 외부 소스를 두들기지
 * 않는다 — 그것이 `fundamentals/coverage.ts`·`business-context/coverage.ts` 와 같은 패턴이고,
 * INV-14(렌더 경로에서 계산/LLM 임포트 금지)가 요구하는 경계다. 프론트는 이 라우트의
 * 응답만 보고, 조립은 백엔드(BFF)에서 끝난다.
 *
 * **차트 데이터를 배치에서 미리 만들어 저장하는 것(WO-SUB-04 AC#7)은 아직 하지 않았다** —
 * `AC_DEBT_LEDGER.md` 에 등재돼 있다. 지금은 저장 레코드에서 요청 시점에 조립한다.
 * 외부 소스를 부르지 않으므로 결정론이 깨지지는 않지만, 종목 수가 늘면 응답이 느려진다.
 */

/** 슬롯 ② — 카드 앞면에 낼 문장 하나. 배지는 **디테일에만** 두므로 여기서 등급을 내보내되 카드가 쓰지 않는다. */
export interface SubstanceSlot {
  /** 슬롯1(어디서 돈을 버는가) 문장. 카드 앞면 2줄 예산 안에서 쓴다. */
  text: string;
  /** 소스 종류 — 공시/벤더 구분. 카드에는 표시하지 않고 디테일에서 쓴다. */
  kind: string;
  badge: string;
  /** 벤더 요약만으로 만들어졌는가. 디테일의 근거 표기가 이 값을 본다. */
  vendor_only: boolean;
}

export interface CardSlotPayload {
  canonical: string;
  market: string;
  /** ② 없으면 `null` — 카드는 슬롯을 생략하고 아래가 올라온다(빈 공간 금지). */
  substance: SubstanceSlot | null;
  /** ③ 못 그리면 `null` — 차트 영역 자체가 사라진다(빈 박스 금지). */
  valuation: ValuationChartData | null;
  /** 왜 ③ 이 없는지. 화면에는 안 쓰지만 운영에서 "없음"과 "못 그림"을 구분해야 한다. */
  valuation_unavailable_reason: string | null;
  /**
   * "이게 틀리는 경우" 블록 (WO-SUB-06 §6).
   *
   * 팩트시트가 없으면 아키타입을 모르므로 `null` — 그때는 섹션을 그리지 않는다. 반대로 유형
   * 리스크만 있고 종목 고유 리스크가 없는 상태는 `null` 이 아니다. 그건 §5-2 가 설계한 정상
   * 경로이고 화면이 "확보하지 못했어요" 를 표시해야 한다(완료 조건 3).
   *
   * 가격 무효선(`price_text`)은 여기서 채우지 않는다 — `verdict` 에 있고 그건 카드/뎁스가 이미
   * 갖고 있다. 같은 값을 두 경로로 내보내면 어긋난다.
   */
  risk: WhereThisIsWrongBlock | null;
}

export interface CardSlotsResponse {
  date: string;
  ruleset_version: string;
  /** canonical → 슬롯 페이로드. 프론트가 픽 목록과 조인한다. */
  slots: Record<string, CardSlotPayload>;
}

async function payloadFor(market: string, canonical: string): Promise<CardSlotPayload> {
  const [context, record, riskRecord] = await Promise.all([
    readBusinessContext(market, canonical).catch(() => null),
    readFactSheet(market, canonical).catch(() => null),
    readSymbolRisk(market, canonical).catch(() => null),
  ]);

  // ② — `toRenderable` 이 게이트다. 필드가 있어도 배지가 `없음`이거나 미검증이면 화면에 못 낸다.
  const renderable = context === null ? null : toRenderable(context);
  const substance: SubstanceSlot | null = renderable
    ? {
        text: renderable.slot1.text,
        kind: renderable.slot1.kind,
        badge: renderable.badge,
        vendor_only: renderable.vendor_only,
      }
    : null;

  // ③ — 아키타입은 저장돼 있지 않아 팩트시트에서 다시 분류한다.
  let valuation: ValuationChartData | null = null;
  let reason: string | null = record ? null : "no_factsheet";
  let risk: WhereThisIsWrongBlock | null = null;
  if (record) {
    try {
      const archetype = classifyArchetype(record.factsheet).code;
      const chart = buildValuationChart(record.factsheet, archetype, RULESET_VERSION);
      if (chart.renderable) valuation = chart;
      else reason = chart.unavailable_reason ?? "unknown";

      // 리스크 블록은 차트와 독립이다 — 차트를 못 그려도(막대축 부재 등) 리스크는 낼 수 있다.
      const block = composeWhereThisIsWrong({
        archetype,
        storedSymbolRisks: riskRecord?.items ?? null,
        symbolUnavailableReason: riskRecord?.unavailable_reason ?? null,
      });
      risk = hasWhereThisIsWrongContent(block) ? block : null;
    } catch {
      // 독트린에 없는 코드는 `frameOf` 가 던진다 — 카드 하나가 덱 전체를 죽이지 않게 감싼다.
      reason = "build_error";
    }
  }

  return { canonical, market, substance, valuation, valuation_unavailable_reason: reason, risk };
}

interface LiveDeckShape {
  picks?: Array<{ subject?: { canonical?: string; country?: string } }>;
}

/**
 * 오늘 노출 중인 덱의 슬롯 페이로드.
 *
 * 덱에 있는 종목만 만든다 — 365일 유니버스 332종목을 매 요청마다 조립하면 응답이 못 쓸 만큼
 * 느려진다. 덱은 10장 안팎이다.
 */
export async function buildLiveDeckSlots(): Promise<CardSlotsResponse> {
  const live = await readFeedContent<LiveDeckShape>("quiet-pick:active").catch(() => null);
  const targets = (live?.picks ?? [])
    .map((pick) => ({ canonical: pick.subject?.canonical, market: pick.subject?.country }))
    .filter((entry): entry is { canonical: string; market: string } =>
      typeof entry.canonical === "string" && typeof entry.market === "string"
    );

  const slots: Record<string, CardSlotPayload> = {};
  for (const target of targets) {
    slots[target.canonical] = await payloadFor(target.market, target.canonical);
  }
  return { date: kstDate(), ruleset_version: RULESET_VERSION, slots };
}

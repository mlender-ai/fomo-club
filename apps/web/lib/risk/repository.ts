import type { SymbolRisk } from "@fomo/core";
import { readFeedContent, writeFeedContent } from "../feed-content-store";

/**
 * 종목 고유 리스크 저장소 (WO-SUB-06.5).
 *
 * 기존 `FeedContentCache`(JSONB 키-값) 재사용 — **신규 DDL 0**. 팩트시트·사업 실체와 같은 선례다
 * (prod DDL 은 직접 승인 사항이므로 이 범위에서 테이블을 만들지 않는다).
 *
 * 키: `symbol-risk:<market>:<canonical>`
 *
 * ## 왜 렌더가 이걸 읽나
 *
 * INV-14 가 렌더 경로에서 계산·LLM 임포트를 금지한다. 그래서 합성은 배치가 하고 화면은 저장분만
 * 읽는다. 레코드가 없는 것은 결함이 아니라 상태다 — §5-2 의 "확보하지 못함" 경로로 간다.
 */

const PREFIX = "symbol-risk:";

export interface SymbolRiskRecord {
  canonical: string;
  market: string;
  items: SymbolRisk[];
  /**
   * 항목이 0개인 이유. **비어 있으면 안 된다** — "리스크 없음" 과 "확보하지 못함" 을 구분하는
   * 유일한 필드이고, 화면이 이걸 그대로 보여준다.
   */
  unavailable_reason: string | null;
  /** 소스 문서 id 목록(감사용). 항목의 `source_ids` 와 별개로 무엇을 읽었는지 남긴다. */
  source_doc_ids: string[];
  /** 이 레코드를 만든 시각. */
  synthesized_at: string;
  /** 합성에 쓴 프롬프트·모델 — 재합성 판단 입력(WO-SUB-03 결정론 정책과 같은 축). */
  prompt_id: string | null;
  /**
   * 프롬프트 **본문 해시**. 버전 문자열이 아니라 해시를 저장하는 이유: 문안만 고치고 버전을
   * 안 올리면 id 비교로는 재합성이 트리거되지 않는다(WO-SUB-03.5 PART C-2 선례).
   */
  prompt_hash: string | null;
  model: string | null;
}

export function symbolRiskKey(market: string, canonical: string): string {
  return `${PREFIX}${market}:${canonical}`;
}

export async function readSymbolRisk(market: string, canonical: string): Promise<SymbolRiskRecord | null> {
  return readFeedContent<SymbolRiskRecord>(symbolRiskKey(market, canonical)).catch(() => null);
}

export async function writeSymbolRisk(record: SymbolRiskRecord): Promise<void> {
  await writeFeedContent(symbolRiskKey(record.market, record.canonical), record);
}

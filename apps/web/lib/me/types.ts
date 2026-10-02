/**
 * TRADER-03 — 맥 업로더(`scripts/trader/me_upload.py`)가 올리는 모양. **실계좌 데이터다 — 로그인 뒤에서만.**
 *
 * 시각은 전부 ms(UTC). 날짜 키는 KST `YYYY-MM-DD` (거래소 앱 일별 손익과 같은 경계).
 */

export interface MeTrade {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryMs: number;
  exitMs: number;
  /** 수수료 · 펀딩 뺀 손익(USDT). */
  net: number;
  /** 수수료 전 실현 손익. */
  gross: number;
  fees: number;
  /** 낸 펀딩은 음수. */
  funding: number;
  margin: number | null;
  notional: number;
  leverage: number | null;
}

export interface AccountPayload {
  v: 1;
  asOf: number;
  trades: MeTrade[];
  /** KST 날짜 → 그날 지갑 손익(이체 제외 · 장부). */
  daily: Record<string, number>;
  /** KST 날짜 → 시간가중 누적 지수(1 = 시작). 입출금이 섞이지 않는다. */
  twr: Record<string, number>;
  /** 지금 열린 포지션(같은 순간 비교용). */
  open: { symbol: string; side: "long" | "short"; entryMs: number }[];
}

export interface ReplicaPayload {
  v: 1;
  asOf: number;
  startMs: number;
  verdict: string | null;
  liveCandidate: boolean;
  capital: number;
  trades: { symbol: string; side: "long" | "short"; entryMs: number; exitMs: number; net: number; notional: number; margin: number | null }[];
  open: { symbol: string; side: "long" | "short"; entryMs: number }[];
}

export interface RulesPayload {
  v: 1;
  asOf: number;
  statedSealedAt: number | null;
  contamination: string[];
  /** 동결 이력 — 버전(v1 → v2 …). */
  freezes: { at: number; hashes: Record<string, string | null>; afterValidation: boolean }[];
  /** 지금 규칙 두 벌(JSON 그대로). */
  definitions: Record<string, Record<string, unknown>>;
  /** TRADER-02 C 표. */
  compare: { part: string; item: string; said: string; data: string; match: string; kwanghyuk: string }[];
  validation: {
    verdict: string | null;
    table: Record<string, Record<string, unknown>>;
    discretionary: Record<string, { n: number; of: number; net: number; share_of_net: number | null; share_of_gross_profit: number | null }>;
  } | null;
}

/** 엔진 트랙 하나(랩 DB 에서). 공개 데이터다. */
export interface EngineInput {
  key: string;
  label: string;
  startingCapital: number;
  leverage: number | null;
  trades: {
    symbol: string;
    side: "long" | "short";
    entryMs: number;
    exitMs: number;
    net: number;
    gross: number | null;
    costs: number | null;
    margin: number | null;
    returnPct: number | null;
    leverage: number | null;
  }[];
  capital: { at: number; capital: number }[];
}

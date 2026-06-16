import type {
  Evidence,
  InsightSourceRef,
  KeyWording,
  SourceDoc,
  ThemeInsight,
  ThemeInsightConfidence,
  ThemeStance,
} from "./types";
import type { RawEvidence, RawThemeInsight, RawWording } from "./parse";
import { screenWordingRule, type WordingVerdict } from "./wording-filter";

/**
 * 이해 레이어의 핵심 가드 — DATA_ENGINE_STRATEGY §6 / 운영자 강조.
 *
 * LLM 이 뱉은 raw 구조화를 *원문에 박힌 것만* 남기고 조립한다:
 *  1) 환각 차단: 각 근거의 quote 가 인용한 SourceDoc 의 제목/본문에 실제 substring 으로 있어야 통과.
 *     없으면 폐기(일반론·지어낸 근거 제거). sourceId 가 없는 원문을 가리켜도 폐기.
 *  2) 투자조언 가드: claim 이 금칙어(매수/매도/오른다 단정 등) 위반이면 폐기(키워드 엔진 가드 재활용).
 *  3) 균형: 강세/약세 둘 다 살아남으면 balanced, 한쪽뿐이면 그 사실을 stanceNote 로 정직하게.
 *  4) 정직한 빈 상태: grounded 근거가 0이면 confidence "insufficient".
 */

/**
 * 이해 레이어 전용 투자조언/매매신호 가드.
 *
 * 키워드 코멘트 가드(COMMENT_FORBIDDEN)와 *목적이 다르다*: 코멘트는 친구 목소리라 "매수/매도"
 * 단어 자체를 막지만, 이해 레이어의 claim 은 *사실 보도*다("외국인 매수세가 번졌다"는 판단 재료지 신호 아님).
 * 그래서 단어가 아니라 **행동 지시(명령형)·미래 단정·추천**만 막는다 — 사실(과거/현재 매수·매도 동향)은 허용.
 * "판단 재료지 답이 아님" 원칙을 더 정확히 강제한다.
 */
export const INSIGHT_FORBIDDEN: RegExp =
  /사라|팔아라|사세요|파세요|매수\s*(?:해|하세요|하라|추천|타이밍)|매도\s*(?:해|하세요|하라|추천)|매수\s*신호|매도\s*신호|매수신호|매도신호|손절\s*(?:해|하세요|하라)|익절\s*(?:해|하세요|하라)|담아라|담으세요|들어가라|들어가세요|풀매수\s*(?:해|하라|각)|불타기|줍줍|추천|오른다|오를\s*(?:거|것|듯|전망|예정)|내린다|내릴\s*(?:거|것|듯)|급등할|폭등할|폭락할|간다|가즈아|텐배거|떡상|떡락|목표가|지금\s*안\s*사면/;

/** 인용 검증용 정규화 — 공백 제거(LLM 이 띄어쓰기를 다르게 옮겨도 매칭). */
function norm(s: string): string {
  return s.replace(/\s+/g, "");
}

/** quote 가 너무 짧으면(아무 데나 걸림) grounding 으로 인정 안 함. */
const MIN_QUOTE_LEN = 4;

function isGrounded(quote: string, docText: string): boolean {
  const q = norm(quote);
  if (q.length < MIN_QUOTE_LEN) return false;
  return norm(docText).includes(q);
}

/** raw 근거 배열 → grounded + 투자조언 가드 통과 + 중복 제거. */
function groundEvidence(
  raw: readonly RawEvidence[],
  docById: Map<string, SourceDoc>
): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const doc = docById.get(e.sourceId);
    if (!doc) continue; // 존재하지 않는 원문 인용 → 폐기(환각)
    // 출처 종류 분리(§버그2): 강세/약세 근거 = 뉴스/공식(분석·근거)만. community 는 워딩으로만 간다.
    // (워딩=community 전용과 대칭) → 두 섹션 성격이 깨끗이 분리. 커뮤니티 약세가 줄어도 정상.
    if (doc.kind === "community") continue;
    const docText = `${doc.title} ${doc.body ?? ""}`;
    if (!isGrounded(e.quote, docText)) continue; // 원문에 없는 인용 → 폐기(환각)
    if (INSIGHT_FORBIDDEN.test(e.claim)) continue; // 투자조언/매매신호(명령·예측·추천) → 폐기
    const key = norm(e.claim);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ claim: e.claim, sourceId: e.sourceId, quote: e.quote });
  }
  return out;
}

function groundWordings(
  raw: readonly RawWording[],
  docById: Map<string, SourceDoc>
): { wordings: KeyWording[]; audit: WordingVerdict[] } {
  const out: KeyWording[] = [];
  const audit: WordingVerdict[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    const doc = docById.get(w.sourceId);
    if (!doc) continue;
    const docText = `${doc.title} ${doc.body ?? ""}`;
    if (!isGrounded(w.text, docText)) continue; // 워딩도 원문에 실재해야(지어낸 여론 차단)
    const key = norm(w.text);
    if (seen.has(key)) continue;
    seen.add(key);
    // 출처 종류 강제(§3-b): 워딩은 "사람들이 한 말"이므로 community 원문에서만. 뉴스/공식 문장이 워딩으로
    // 통과해 "사람들 워딩"에 매경 등이 섞이던 버그를 차단. 종류 불일치는 폐기(라벨 거짓표기 대신).
    if (doc.kind !== "community") {
      audit.push({ text: w.text, kept: false, reason: `워딩 출처가 community 아님(${doc.kind})`, stage: "rule" });
      continue;
    }
    // 룰 안전 필터(욕설/단정/찌라시 명백한 것 차단). 통과/탈락 모두 감사 로그.
    const verdict = screenWordingRule(w.text);
    audit.push(verdict);
    if (verdict.kept) out.push({ text: w.text, sourceId: w.sourceId });
  }
  return { wordings: out, audit };
}

function decideStance(bull: number, bear: number): { stance: ThemeStance; note: string } {
  if (bull === 0 && bear === 0)
    return { stance: "insufficient", note: "원문에서 강세·약세 근거를 충분히 찾지 못했어." };
  if (bull > 0 && bear === 0)
    return { stance: "bull-dominant", note: "오늘은 강세 의견이 우세하고, 반대(약세) 관점은 원문에서 안 보여." };
  if (bear > 0 && bull === 0)
    return { stance: "bear-dominant", note: "오늘은 약세/리스크 쪽 얘기가 우세하고, 강세 관점은 원문에서 안 보여." };
  return { stance: "balanced", note: "강세와 약세 관점이 원문에 둘 다 있어." };
}

/** 근거가 인용한 원문만 출처 목록으로(검증용). */
function usedSources(
  bull: readonly Evidence[],
  bear: readonly Evidence[],
  wordings: readonly KeyWording[],
  docById: Map<string, SourceDoc>
): InsightSourceRef[] {
  const ids = new Set<string>();
  for (const e of [...bull, ...bear]) ids.add(e.sourceId);
  for (const w of wordings) ids.add(w.sourceId);
  const out: InsightSourceRef[] = [];
  for (const id of ids) {
    const d = docById.get(id);
    if (!d) continue;
    out.push({
      id: d.id,
      kind: d.kind,
      title: d.title,
      ...(d.source ? { source: d.source } : {}),
      ...(d.url ? { url: d.url } : {}),
      ...(d.tier ? { tier: d.tier } : {}),
    });
  }
  return out;
}

/** 원문이 아예 없을 때 등 — 정직한 빈 상태. */
export function emptyThemeInsight(theme: string, reason: string): ThemeInsight {
  return {
    theme,
    stocks: [],
    bull: [],
    bear: [],
    wordings: [],
    stance: "insufficient",
    stanceNote: "보여줄 만큼 원문이 모이지 않았어. 그것도 정상이야.",
    sources: [],
    confidence: "insufficient",
    reason,
  };
}

/**
 * raw(LLM 출력) + 원문 → 검증된 ThemeInsight. raw 가 null(파싱 실패)이면 정직한 빈 상태.
 */
export function assembleThemeInsight(
  theme: string,
  docs: readonly SourceDoc[],
  raw: RawThemeInsight | null
): ThemeInsight {
  if (docs.length === 0) return emptyThemeInsight(theme, "수집된 원문이 없음");
  if (!raw) return emptyThemeInsight(theme, "이해 레이어 응답 파싱 실패 — 정직한 빈 상태");

  const docById = new Map(docs.map((d) => [d.id, d]));
  const bull = groundEvidence(raw.bull, docById);
  const bear = groundEvidence(raw.bear, docById);
  const { wordings, audit: wordingAudit } = groundWordings(raw.wordings, docById);

  // 원문에 언급된 종목만(가벼운 검증 — 종목명이 원문 어딘가 등장).
  const corpus = norm(docs.map((d) => `${d.title} ${d.body ?? ""}`).join(" "));
  const stocks = raw.stocks.filter((s) => corpus.includes(norm(s)));

  const grounded = bull.length + bear.length;
  if (grounded === 0) {
    return {
      ...emptyThemeInsight(theme, "원문 grounded 근거 0건 — 환각 가드가 전부 폐기"),
      stocks,
      wordings,
      sources: usedSources([], [], wordings, docById),
      wordingAudit,
    };
  }

  const { stance, note } = decideStance(bull.length, bear.length);
  // 일방이면 LLM 의 stanceNote 보다 우리가 계산한 정직 표기를 우선(가짜 균형 방지).
  const stanceNote = stance === "balanced" && raw.stanceNote ? raw.stanceNote : note;
  // PoC: 30일 기준선 없음 → 최대 "low"(가짜 high 금지). grounded 만 있으면 low.
  const confidence: ThemeInsightConfidence = "low";

  return {
    theme,
    stocks,
    bull,
    bear,
    wordings,
    stance,
    stanceNote,
    sources: usedSources(bull, bear, wordings, docById),
    confidence,
    reason: `원문 ${docs.length}건 → grounded 강세 ${bull.length} · 약세 ${bear.length} · 워딩 ${wordings.length} (30일 기준선 없어 low)`,
    wordingAudit,
  };
}

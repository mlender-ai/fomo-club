import type { QuietPick } from "./fomoApi";
import { rewriteCompanySummary } from "@fomo/core";
import { repairPickCopy } from "./pickCopyRepair";

/**
 * 카드 근거 블록 · 상세 ② 근거 · ③ 무슨 회사의 **조립부**.
 *
 * 화면이 문장을 되파싱하지 않도록 여기서만 만든다. 확보 안 된 항목은 행을 만들지 않는다 —
 * 빈 라벨은 고장으로 읽힌다.
 *
 * 라벨·순서는 기획자 모킹 기준이다: `누가` → `얼마나 드문가` → `거래량` → `비중` → `이런 패턴`.
 * 카드는 앞 3행, 상세는 5행까지 쓴다.
 */

export interface EvidenceRow {
  label: string;
  value: string;
}

/** `임원 3명` 처럼 인원이 이미 붙은 주체에 인원을 또 붙이지 않는다(중복 출력 결함). */
function actorWithCount(actors: string, insiderCount: number | undefined): string {
  const actor = repairPickCopy(actors).trim();
  if (typeof insiderCount !== "number" || insiderCount <= 0) return actor;
  if (/\d+\s*명/.test(actor)) return actor; // 이미 "임원 3명"
  return `${actor} ${insiderCount}명`;
}

/**
 * 매수 비중은 **20% 이상일 때만** 근거다.
 *
 * `하루 거래량의 1%` 는 근거가 아니라 소음이다 — 실측(휴니드 0.5%)에서 그 행이 그대로
 * 화면에 올라왔다. 이례성 엔진이 쓰는 임계(20%)와 같은 선을 쓴다.
 */
const VOLUME_SHARE_FLOOR = 20;
/** 20일 평균이 60일 평균의 이 값 아래면 "거래가 말라 있었다". */
const VACUUM_CEILING = 0.6;

/**
 * 근거 행 — 최대 5행. 카드는 `.slice(0, 3)`.
 *
 * 결론(훅)이 말한 숫자를 상세에서 반복해도 된다 — 상세는 **확인하는 화면**이다. 카드에서만
 * 중복을 피한다(카드 쪽이 `cardEvidenceRows` 로 한 번 더 걸러 쓴다).
 */
export function evidenceRows(pick: QuietPick): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  const facts = pick.signalFacts;

  const who = [actorWithCount(pick.signal.actors, pick.signal.insiderCount), repairPickCopy(pick.signal.scale).trim()]
    .filter(Boolean)
    .join(" · ");
  if (who) rows.push({ label: "누가", value: who });

  const days = pick.signal.days;
  if (days > 0) {
    rows.push({ label: "언제", value: pick.signal.kind === "insider_cluster" ? `최근 ${days}일` : `${days}일째 이어짐` });
  }

  if (typeof facts?.priorBuys12mo === "number") {
    rows.push({
      label: "얼마나 드문가",
      value: facts.priorBuys12mo === 0 ? "지난 1년 매수 없었음" : `1년 매수 ${facts.priorBuys12mo}건뿐`,
    });
  } else if (facts?.isLongestStreak) {
    rows.push({ label: "얼마나 드문가", value: `${facts.streakWindowDays ?? days}거래일 중 최장` });
  }

  // 거래량 — "조용한 매수" 의 핵심 축. 말라 있었는지가 먼저다.
  if (typeof facts?.volumeVacuumRatio === "number" && facts.volumeVacuumRatio < VACUUM_CEILING) {
    rows.push({ label: "거래량", value: `평소의 ${Math.round(facts.volumeVacuumRatio * 100)}%` });
  } else if (facts?.volumeElevated) {
    rows.push({ label: "거래량", value: "평소보다 많음" });
  } else if (facts) {
    rows.push({ label: "거래량", value: "평소와 같음" });
  }

  if (typeof facts?.volumePct === "number" && facts.volumePct >= VOLUME_SHARE_FLOOR) {
    const value = facts.volumePct >= 100
      ? `하루 거래량의 ${Math.round(facts.volumePct / 100)}배`
      : `하루 거래량의 ${Math.round(facts.volumePct)}%`;
    rows.push({ label: "비중", value });
  } else if (typeof facts?.mcapPct === "number" && facts.mcapPct >= 1) {
    rows.push({ label: "비중", value: `시총의 ${Math.round(facts.mcapPct * 10) / 10}%` });
  }

  /** 이런 패턴의 과거 성적 — 종전 상세의 별도 블록이 한 행으로 들어왔다(6섹션 상한). */
  if (pick.signalStats?.headline) {
    rows.push({ label: "이런 패턴", value: repairPickCopy(pick.signalStats.headline) });
  }

  return rows.slice(0, 5);
}

/**
 * 카드 근거 박스 — 3행. **결론에 이미 나온 숫자를 담은 행은 뺀다**(카드는 한 장면에 놀라움
 * 하나다). 상세와 달리 같은 숫자를 두 번 보여주지 않는다.
 */
export function cardEvidenceRows(pick: QuietPick, hook: string): EvidenceRow[] {
  const hookNumbers = new Set(hook.match(/\d+/g) ?? []);
  const repeats = (value: string) => (value.match(/\d+/g) ?? []).some((n) => hookNumbers.has(n));
  const rows = evidenceRows(pick).filter((row) => row.label !== "이런 패턴");
  const kept: EvidenceRow[] = [];
  for (const row of rows) {
    // `누가` 는 규모(금액·주수)를 담은 유일한 행이라 숫자가 겹쳐도 남긴다.
    if (row.label !== "누가" && repeats(row.value)) continue;
    kept.push(row);
    if (kept.length >= 3) break;
  }
  return kept;
}

/**
 * ③ 무슨 회사 — **최대 2문장, 첫 문장은 무엇을 파는가.**
 *
 * ## 문장 단위로 버린다 (단어를 오려내지 않는다)
 *
 * 1차 구현은 문장 안에서 약어와 등기 표현을 정규식으로 오려냈다. 결과가 이랬다:
 *   `보잉, GA-ASI 등 글로벌 기업과의 제휴를 통한` → `보잉, 제휴로`
 *   `TICN의 HCTRS 체계개발` → `의 HCTRS 체계개발`
 * 조사가 남고 뜻이 깨진다. 그래서 **문장을 고치지 않고, 못 쓰는 문장은 버린다.**
 *
 * 등기 문장 제거와 해요체 변환은 이미 있는 엔진(`rewriteCompanySummary`)에 맡긴다 — 이 화면이
 * 카피 규칙을 따로 갖지 않는다. 그 위에서 **풀 수 없는 약어가 든 문장만** 걸러낸다.
 *
 * 남는 문장이 없으면 `null` → 섹션 전체를 그리지 않는다(DS-03 §6). 왕초보에게 `TICN·HCTRS·
 * FANET` 을 읽히는 것보다 아무 말도 하지 않는 것이 낫다. 무엇을 파는지 못 만드는 종목이 많다는
 * 것은 데이터 과제로 등재돼 있다(DS-03 §14).
 */

/** 풀어 쓸 수 있는 약어 — 그대로 치환한다(문장이 살아남는다). */
const KNOWN_ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bMRO\b/g, "정비·보수"],
  [/\bOEM\b/g, "주문 생산"],
  [/\bODM\b/g, "위탁 개발·생산"],
  [/\bEPC\b/g, "설계·조달·시공"],
  [/\bESS\b/g, "에너지 저장장치"],
  [/\bTICN\b/g, "전술정보통신체계"],
  [/\bPBL\b/g, "성과 기반 군수지원"],
];

/**
 * 남은 대문자 약어 — `HCTRS`, `FANET`, `P5G` 같은 것들. 두 글자(AI 등)는 일반어에 가까워 뺀다.
 *
 * 하나 섞인 문장은 **살린다.** 하나 때문에 문장을 버리면 "뭐 하는 곳인가" 자체가 사라진다
 * (휴니드 실측: `… 보잉, GA-ASI 등 글로벌 기업과의 제휴 …` 는 그 자체로 주력 사업 설명이다).
 * 둘 이상이면 문장이 약어로 이뤄진 것이라 버린다.
 */
const UNKNOWN_ABBREVIATION = /\b[A-Z][A-Z0-9]{2,}(?:-[A-Z0-9]+)*\b/g;
const MAX_UNKNOWN_ABBREVIATIONS = 1;

/** 업종명 나열 — 사업자등록증의 업종이지 회사 설명이 아니다. 엔진은 이걸 걸러주지 않는다. */
const REGISTRY_SENTENCE = /(투자매매업|투자중개업|집합투자업|신탁업|목적사업|영위하고)/;

const SENTENCE_SPLIT = /(?<=[.。!?])\s+/;

export interface CompanyBlurb {
  /** 최대 2문장, 해요체. */
  text: string;
  /** 원문에서 덜어낸 것이 있는가 — `출처 보기` 를 붙일지 판단한다. */
  truncated: boolean;
}

export function companyBlurb(summary: string | undefined): CompanyBlurb | null {
  const raw = summary?.trim();
  if (!raw) return null;

  // 등기 문장 제거 + `동사는` 제거 + 해요체 변환은 엔진이 한다.
  const rewritten = rewriteCompanySummary(raw);
  if (!rewritten.text) return null;

  const usable = rewritten.text
    .split(SENTENCE_SPLIT)
    .map((sentence) => {
      let text = sentence.trim();
      for (const [pattern, replacement] of KNOWN_ABBREVIATIONS) text = text.replace(pattern, replacement);
      return text.replace(/\s{2,}/g, " ").trim();
    })
    .filter((sentence) => sentence.length >= 8)
    .filter((sentence) => !REGISTRY_SENTENCE.test(sentence))
    .filter((sentence) => (sentence.match(UNKNOWN_ABBREVIATION) ?? []).length <= MAX_UNKNOWN_ABBREVIATIONS);

  if (usable.length === 0) return null;
  const text = usable.slice(0, 2).join(" ");
  return { text, truncated: text.replace(/\s+/g, "") !== raw.replace(/\s+/g, "") };
}

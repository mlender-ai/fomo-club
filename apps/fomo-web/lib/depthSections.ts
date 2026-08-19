import type { QuietPick } from "./fomoApi";
import { repairPickCopy } from "./pickCopyRepair";

/**
 * 상세의 ② 근거 · ③ 무슨 회사 조립 (DS-03 §5·§6).
 *
 * 화면이 문장을 되파싱하지 않도록 **여기서만** 조립한다. 확보 안 된 항목은 행을 만들지 않는다
 * — 빈 라벨은 고장으로 읽힌다.
 */

export interface EvidenceRow {
  label: string;
  value: string;
}

/** `임원 3명` 처럼 인원이 이미 붙은 주체에 인원을 또 붙이지 않는다(DS-03 §5 중복 출력 결함). */
function actorWithCount(actors: string, insiderCount: number | undefined): string {
  const actor = repairPickCopy(actors).trim();
  if (typeof insiderCount !== "number" || insiderCount <= 0) return actor;
  if (/\d+\s*명/.test(actor)) return actor; // 이미 "임원 3명"
  return `${actor} ${insiderCount}명`;
}

/**
 * ② 근거 — 라벨-값 최대 5행. 순서는 논증 순서다: 누가 → 언제 → 얼마나 드문가 → 비중.
 * 결론(훅)이 말한 숫자를 여기서 반복해도 된다 — 카드와 달리 상세는 **확인하는 화면**이다.
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
      value: facts.priorBuys12mo === 0 ? "지난 1년 매수 없었음" : `지난 1년 매수 ${facts.priorBuys12mo}건뿐`,
    });
  } else if (facts?.isLongestStreak) {
    rows.push({ label: "얼마나 드문가", value: `최근 ${facts.streakWindowDays ?? days}거래일 중 최장` });
  }

  if (typeof facts?.volumePct === "number") {
    const value = facts.volumePct >= 100
      ? `하루 거래량의 ${Math.round(facts.volumePct / 100)}배`
      : `하루 거래량의 ${Math.round(facts.volumePct)}%`;
    rows.push({ label: "비중", value });
  } else if (typeof facts?.mcapPct === "number") {
    rows.push({ label: "비중", value: `시총의 ${Math.round(facts.mcapPct * 10) / 10}%` });
  }

  /**
   * 이런 패턴의 과거 성적 — 종전 상세의 "이런 신호, 과거엔 어땠나" 블록이 여기 한 행으로
   * 들어왔다(DS-03 은 6섹션을 넘기지 않는다). 표본이 없으면 행이 없다.
   */
  if (pick.signalStats?.headline) {
    rows.push({ label: "이런 패턴", value: repairPickCopy(pick.signalStats.headline) });
  }

  return rows.slice(0, 5);
}

/**
 * 업종명 나열 — 회사 설명이 아니다. `투자매매업, 투자중개업, 집합투자업` 같은 사업자등록증
 * 업종명이 그대로 내려오는 경우가 있다(DS-03 §6 결함).
 */
const REGISTRY_JARGON = /(투자매매업|투자중개업|집합투자업|신탁업|일반사업목적|목적사업)/;

/** 회사 설명에서 걷어내는 약어 — 풀 수 없으면 지운다(DS-03 §6). */
const ABBREVIATIONS = /\b(PBL|MRO|TICN|EPC|OEM|ODM|SI|BM)\b/g;

const SENTENCE_SPLIT = /(?<=[.。!?])\s+|(?<=요\.)\s*/;

export interface CompanyBlurb {
  /** 최대 2문장. */
  text: string;
  /** 원문이 더 길어 잘렸는가 — `출처 보기`를 붙일지 판단한다. */
  truncated: boolean;
}

/**
 * ③ 무슨 회사 — **최대 2문장, 첫 문장은 무엇을 파는가.**
 *
 * 설립연도·법인격·업종명으로 시작하는 문장은 회사 설명이 아니라 등기 정보다. 그런 문장은
 * 버리고 남은 문장으로 만든다. 남는 게 없으면 `null` → **섹션 전체를 그리지 않는다**
 * (DS-00 §1-1: 채울 수 없으면 자리도 만들지 않는다).
 */
export function companyBlurb(summary: string | undefined): CompanyBlurb | null {
  const raw = summary?.trim();
  if (!raw) return null;

  const sentences = raw
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
    // 등기/업종 문장은 버린다 — 설립연도로 시작하는 문장도 같은 부류다.
    .filter((s) => !REGISTRY_JARGON.test(s))
    // 연도로 시작해 설립·상장·분할을 말하는 문장은 등기 정보다 — 무엇을 파는지가 아니다.
    .filter((s) => !(/^\d{4}년/.test(s) && /(설립|창립|상장|분할|합병|편입)/.test(s)))
    .map((s) => s.replace(ABBREVIATIONS, "").replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, "").trim())
    .filter((s) => s.length >= 8);

  if (sentences.length === 0) return null;
  const kept = sentences.slice(0, 2);
  return { text: kept.join(" "), truncated: sentences.length > kept.length || kept.join(" ").length < raw.length };
}

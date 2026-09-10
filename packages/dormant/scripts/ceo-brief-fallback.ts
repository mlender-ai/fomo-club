/**
 * CEO Brief deterministic 폴백 렌더러.
 *
 * idea-proposal.yml 의 ceo_brief job 에서 LLM 브리핑(actions/ai-inference)이
 * 실패하거나 빈 응답일 때, 규칙 기반으로 브리핑을 *항상* 생성한다.
 * (AGENT_BIBLE 규칙 9 "빈 화면 절대 금지 → 폴백" 을 파이프라인 자신에게 적용)
 *
 * 순수 렌더 함수(renderFallbackBrief)와 CLI 엔트리를 분리해 vitest 로 검증 가능.
 * 외부 네트워크/LLM 호출 없음 — 결정론적.
 */

import { readFileSync, writeFileSync } from "node:fs";

export interface DigestEntry {
  number: number;
  lane: string;
  title: string;
  /** score-strong | score-conditional | score-missing | score-none */
  scoreLabel: string;
  rationale: string;
}

export interface FallbackInput {
  digest: DigestEntry[];
  /** 최근 머지된 PR 제목 (반복 탐지용) */
  mergedPrTitles: string[];
  /** 최근 DONE/closed 이슈 제목 (반복 탐지용) */
  doneIssueTitles: string[];
  /** YYYY-MM-DD (KST) */
  today: string;
}

export interface RepeatMatch {
  entry: DigestEntry;
  /** 겹친 것으로 판정된 소스 제목 (PR 또는 DONE 이슈) */
  matchedSource: string;
  sharedTokens: string[];
}

const SCORE_RANK: Record<string, number> = {
  "score-strong": 3,
  "score-conditional": 2,
};

function scoreRank(scoreLabel: string): number {
  return SCORE_RANK[scoreLabel] ?? 1;
}

const SCORE_KO: Record<string, string> = {
  "score-strong": "강함(14+)",
  "score-conditional": "조건부(11-13)",
  "score-missing": "점수 누락",
  "score-none": "미채점",
};

function scoreKo(scoreLabel: string): string {
  return SCORE_KO[scoreLabel] ?? scoreLabel;
}

/** 점수 내림차순, 동점은 이슈 번호 오름차순(결정론적 안정 정렬). */
export function sortByScore(entries: DigestEntry[]): DigestEntry[] {
  return [...entries].sort((a, b) => {
    const diff = scoreRank(b.scoreLabel) - scoreRank(a.scoreLabel);
    if (diff !== 0) return diff;
    return a.number - b.number;
  });
}

const LANE_PREFIX_RE = /^\s*\[[^\]]*\]\s*/;
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
// 의미 없는 공통 토큰 (제목 노이즈) — 겹침 판정에서 제외
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "추가",
  "개선",
  "수정",
  "구현",
  "적용",
  "제안",
  "기능",
  "지원",
  "처리",
  "변경",
  "도입",
]);

/** 제목을 비교 가능한 토큰 집합으로 정규화 — lane 접두사/날짜/기호 제거 후 토큰화. */
export function normalizeTitleTokens(title: string): string[] {
  const stripped = title.replace(LANE_PREFIX_RE, "").replace(DATE_RE, " ");
  const tokens = stripped
    .toLowerCase()
    // 영문/숫자/한글만 남기고 토큰 분리
    .split(/[^a-z0-9가-힣]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

/**
 * 반복(이미 처리된 영역) 의심 탐지 — 결정론적 토큰 겹침.
 * 하드 킬 금지: *플래그만* (의미 기반 dedup 은 Phase 3).
 * 임계값: 공통 의미 토큰 2개 이상 AND 제안 토큰의 40% 이상 겹침.
 */
export function detectRepeats(
  digest: DigestEntry[],
  mergedPrTitles: string[],
  doneIssueTitles: string[],
): RepeatMatch[] {
  const sources = [...mergedPrTitles, ...doneIssueTitles]
    .map((title) => ({ title, tokens: new Set(normalizeTitleTokens(title)) }))
    .filter((s) => s.tokens.size > 0);

  const matches: RepeatMatch[] = [];
  for (const entry of digest) {
    const propTokens = normalizeTitleTokens(entry.title);
    if (propTokens.length === 0) continue;

    let best: RepeatMatch | null = null;
    for (const source of sources) {
      const shared = propTokens.filter((t) => source.tokens.has(t));
      const ratio = shared.length / propTokens.length;
      if (shared.length >= 2 && ratio >= 0.4) {
        if (best === null || shared.length > best.sharedTokens.length) {
          best = { entry, matchedSource: source.title, sharedTokens: shared };
        }
      }
    }
    if (best) matches.push(best);
  }
  return matches;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function laneLabel(lane: string): string {
  return lane && lane.length > 0 ? lane : "unknown";
}

/** 순수 렌더 함수 — 입력만으로 폴백 브리핑 마크다운 문자열을 만든다. */
export function renderFallbackBrief(input: FallbackInput): string {
  const { digest, mergedPrTitles, doneIssueTitles, today } = input;

  const repeats = detectRepeats(digest, mergedPrTitles, doneIssueTitles);
  const repeatNumbers = new Set(repeats.map((r) => r.entry.number));

  const sorted = sortByScore(digest);
  const prioritized = sorted.filter((e) => !repeatNumbers.has(e.number));

  const lines: string[] = [];

  // 1. 상단 경고 배너
  lines.push(
    "> ⚠️ 자동 폴백 — LLM 브리핑 생성 실패로 규칙 기반 생성됨. 점수순 정렬 + 반복 의심 표시만 제공.",
  );
  lines.push("");
  lines.push(`## 📋 CEO Daily Brief (자동 폴백) — ${today}`);
  lines.push("");

  // 2. 오늘 제안 표 (점수순)
  lines.push("### 📊 오늘 제안 (점수순)");
  lines.push("");
  if (sorted.length === 0) {
    lines.push("오늘 사이클 신규 제안 없음.");
  } else {
    lines.push("| 에이전트 | 제안 제목 (#번호) | 점수 라벨 | 근거 |");
    lines.push("|---|---|---|---|");
    for (const e of sorted) {
      lines.push(
        `| ${escapeCell(laneLabel(e.lane))} | ${escapeCell(e.title)} (#${e.number}) | ${escapeCell(
          scoreKo(e.scoreLabel),
        )} | ${escapeCell(e.rationale)} |`,
      );
    }
  }
  lines.push("");

  // 3. 반복 의심 섹션 (플래그만, 하드 킬 금지)
  lines.push("### ⚠️ 반복 의심 (이미 구현/처리된 영역 — 확인 요망)");
  lines.push("");
  if (repeats.length === 0) {
    lines.push("없음.");
  } else {
    lines.push("| 제안 (#번호) | 겹친 기존 작업 | 공통 키워드 |");
    lines.push("|---|---|---|");
    for (const r of repeats) {
      lines.push(
        `| ${escapeCell(r.entry.title)} (#${r.entry.number}) | ${escapeCell(
          r.matchedSource,
        )} | ${escapeCell(r.sharedTokens.join(", "))} |`,
      );
    }
    lines.push("");
    lines.push(
      "> 결정론적 키워드 매칭이라 부정확할 수 있음 — 하드 킬 아님. 실제 중복 여부는 사람이 확인.",
    );
  }
  lines.push("");

  // 4. 처리 우선순위 리스트 (반복 의심 제외, 점수순)
  lines.push("### ✅ 오늘 처리 우선순위 (반복 의심 제외 · 점수순)");
  lines.push("");
  if (prioritized.length === 0) {
    lines.push("처리 대상 없음.");
  } else {
    prioritized.forEach((e, i) => {
      lines.push(
        `${i + 1}. **${e.title}** (#${e.number}) — ${laneLabel(e.lane)} · ${scoreKo(e.scoreLabel)}`,
      );
    });
  }
  lines.push("");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// CLI 엔트리: 파일 경로를 받아 /tmp/brief.md(또는 stdout)에 출력.
//   argv[2] = digest.json 경로 (필수)
//   argv[3] = merged PR 제목 파일 (한 줄에 하나, 선택)
//   argv[4] = DONE/closed 이슈 제목 파일 (한 줄에 하나, 선택)
//   argv[5] = today (YYYY-MM-DD, 선택)
//   argv[6] = 출력 파일 경로 (선택 — 없으면 stdout)
// ─────────────────────────────────────────────────────────────

function readLines(path: string | undefined): string[] {
  if (!path) return [];
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      // gh 출력의 "- #123 제목" 형태에서 접두 기호 제거
      .map((l) => l.replace(/^-\s*(#\d+\s*)?/, ""))
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function parseDigest(path: string): DigestEntry[] {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item): DigestEntry => {
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      number: Number(obj.number ?? 0),
      lane: String(obj.lane ?? ""),
      title: String(obj.title ?? ""),
      scoreLabel: String(obj.scoreLabel ?? "score-none"),
      rationale: String(obj.rationale ?? ""),
    };
  });
}

function main(): void {
  const argv = process.argv;
  const digestPath = argv[2];
  if (!digestPath) {
    console.error("usage: tsx scripts/ceo-brief-fallback.ts <digest.json> [merged.txt] [done.txt] [today] [out.md]");
    process.exit(1);
    return;
  }

  const input: FallbackInput = {
    digest: parseDigest(digestPath),
    mergedPrTitles: readLines(argv[3]),
    doneIssueTitles: readLines(argv[4]),
    today: argv[5] ?? new Date().toISOString().slice(0, 10),
  };

  const output = renderFallbackBrief(input);
  const outPath = argv[6];
  if (outPath) {
    writeFileSync(outPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
}

// tsx/node 로 직접 실행될 때만 CLI 동작 (vitest import 시엔 실행 안 함)
const invokedPath = process.argv[1] ?? "";
if (invokedPath.includes("ceo-brief-fallback")) {
  main();
}

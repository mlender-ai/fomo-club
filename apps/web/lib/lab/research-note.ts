/**
 * 연구 노트 파일 한 장 → 기록 (UI-02 PART E · UI-08 PART D).
 *
 * **파일이 정본이다**(`docs/lab/research/*.md`). 시드(`scripts/lab/research-seed.ts`)와 테스트가 같은 파서를 쓴다 —
 * 테스트가 실제 파일 일곱 장을 이 함수로 읽어 규칙을 검사한다.
 *
 * ## 규칙 — 어기면 시드가 멈춘다 (UI-08 하지 말 것)
 *
 * | 규칙 | |
 * |---|---|
 * | 제목은 질문형 | `…인가` · `…있나` · `…바뀌나` — 명사형(`고래 갭 조사`)이면 거절 |
 * | 결정 없이 닫지 않는다 | `closed` 인데 `## 결정` 이 비면 거절 |
 * | 닫힌 것은 답이 있다 | `closed` 면 `verdict` 필수 |
 * | 근거 없이 "알아낸 것" 을 쓰지 않는다 | `## 지금까지 알아낸 것` 의 줄마다 `| 출처` 가 있어야 한다 |
 *
 * ## 파일 모양
 *
 * ```markdown
 * ## 가설
 * 1. 두 승률은 모집단이 다르다
 * 2. 진입이 늦다
 *
 * ## 지금까지 알아낸 것
 * - ✓ 두 승률은 다른 것을 잰다 | FCE WHALE_FOLLOW.md
 *   → 가설 1 확인
 * - ✗ 지연만으로 갭을 설명하기 어렵다 | FCE exit_comparison.gap
 * - · 지갑 선정 — 미착수 | —
 * ```
 */

export const STATUSES = ["open", "testing", "blocked", "closed"] as const;
export const VERDICTS = ["yes", "no", "inconclusive"] as const;

export interface Evidence {
  label: string;
  value: string;
  source: string;
}

export type FindingMark = "confirmed" | "rejected" | "pending";

export interface Finding {
  mark: FindingMark;
  text: string;
  /** `→ …` 로 이어 쓴 해석. 없으면 null. */
  note: string | null;
  source: string;
}

export interface Related {
  label: string;
  value: string;
}

export interface ResearchNote {
  no: string;
  title: string;
  status: (typeof STATUSES)[number];
  verdict: (typeof VERDICTS)[number] | null;
  summary: string;
  why: string | null;
  hypotheses: string[];
  methods: string[];
  /** 옛 화면이 읽는 문단 — 번호 목록을 줄로 이은 것. */
  hypothesis: string | null;
  method: string | null;
  findings: Finding[];
  evidence: Evidence[];
  decision: string | null;
  related: Related[];
  blocks: string | null;
  liveGate: string | null;
  openedAt: Date;
  closedAt: Date | null;
  trackKeys: string[];
}

/** 아주 작은 frontmatter 파서. 의존성을 하나 더 들이지 않으려는 것뿐이다. */
function frontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith("---\n")) throw new Error("frontmatter 가 없다");
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("frontmatter 가 안 닫혔다");
  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    // 줄 끝 주석(`# …`)은 값이 아니다.
    value = value.replace(/\s+#.*$/, "");
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    meta[key] = value;
  }
  return { meta, body: text.slice(end + 5) };
}

/** `## 제목` 아래 본문. 없으면 null — **빈 문자열로 만들지 않는다.** */
export function section(body: string, heading: string): string | null {
  const re = new RegExp(`^## ${heading}\\s*$`, "m");
  const m = re.exec(body);
  if (!m) return null;
  const from = m.index + m[0].length;
  const next = body.slice(from).search(/^## /m);
  const text = (next < 0 ? body.slice(from) : body.slice(from, from + next)).trim();
  return text.length > 0 ? text : null;
}

/** 번호 목록(`1. …` · `1 …` · `- …`). 목록이 아니면 문단 하나를 한 항목으로. */
export function numbered(block: string | null): string[] {
  if (!block) return [];
  const items: string[] = [];
  for (const line of block.split("\n")) {
    const m = /^\s*(?:\d+[.)]?|[-*])\s+(.+)$/.exec(line);
    if (m) items.push((m[1] as string).trim());
    else if (items.length > 0 && line.trim()) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items.length > 0 ? items : [block.replace(/\s+/g, " ").trim()];
}

const MARK: Record<string, FindingMark> = { "✓": "confirmed", "✗": "rejected", "·": "pending" };

/** `- ✓ 글 | 출처` + 다음 줄 `→ 해석`. */
export function findingsOf(block: string | null, file = ""): Finding[] {
  if (!block) return [];
  const out: Finding[] = [];
  for (const line of block.split("\n")) {
    const m = /^\s*-\s*([✓✗·])\s+(.+)$/.exec(line);
    if (m) {
      const [text, ...rest] = (m[2] as string).split("|");
      const source = rest.join("|").trim();
      if (!source) throw new Error(`${file}: 알아낸 것 "${(text ?? "").trim()}" 에 출처가 없다 — "| 출처" 를 붙인다`);
      out.push({ mark: MARK[m[1] as string] as FindingMark, text: (text ?? "").trim(), note: null, source });
      continue;
    }
    const note = /^\s*→\s*(.+)$/.exec(line);
    if (note && out.length > 0) {
      const last = out[out.length - 1] as Finding;
      last.note = last.note ? `${last.note} ${(note[1] as string).trim()}` : (note[1] as string).trim();
    }
  }
  return out;
}

function pairs(block: string | null): { label: string; value: string; source: string }[] {
  if (!block) return [];
  const out: { label: string; value: string; source: string }[] = [];
  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("-")) continue;
    const parts = line.replace(/^\s*-\s*/, "").split("|");
    if (parts.length < 2) continue;
    out.push({ label: (parts[0] ?? "").trim(), value: (parts[1] ?? "").trim(), source: (parts[2] ?? "").trim() });
  }
  return out;
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function date(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 질문형인가 — 한국어 의문 어미로 끝나거나 `?` 로 끝난다.
 * `고래 갭 조사` 처럼 명사로 끝나면 false.
 */
export function isQuestion(title: string): boolean {
  return /(?:\?|[가나까냐니지])$/.test(title.trim());
}

export function parseNote(text: string, file = ""): ResearchNote {
  const { meta, body } = frontmatter(text);
  const no = meta.no ?? "";
  if (!/^\d{2}$/.test(no)) throw new Error(`${file}: no 는 두 자리여야 한다 (받은 값 "${no}")`);
  const status = (meta.status ?? "") as ResearchNote["status"];
  if (!STATUSES.includes(status)) throw new Error(`${file}: status 가 ${STATUSES.join(" | ")} 중 하나여야 한다`);

  const verdict = (meta.verdict && meta.verdict.length > 0 ? meta.verdict : null) as ResearchNote["verdict"];
  if (verdict && !VERDICTS.includes(verdict)) throw new Error(`${file}: verdict 가 ${VERDICTS.join(" | ")} 중 하나여야 한다`);
  // **닫힌 항목은 답이 있어야 한다.** 답 없이 닫으면 기록이 "끝났다" 고만 말한다.
  if (status === "closed" && !verdict) throw new Error(`${file}: closed 인데 verdict 가 없다`);
  if (status !== "closed" && verdict) throw new Error(`${file}: closed 가 아닌데 verdict 가 있다`);

  const title = meta.title ?? "";
  if (!isQuestion(title)) throw new Error(`${file}: 제목이 질문형이 아니다 — "${title}"`);

  const openedAt = date(meta.opened_at);
  if (!openedAt) throw new Error(`${file}: opened_at 이 필요하다`);

  const decision = section(body, "결정");
  if (status === "closed" && !decision) throw new Error(`${file}: 결정 없이 닫았다 — ## 결정 을 쓴다`);

  const hypothesisBlock = section(body, "가설");
  const methodBlock = section(body, "어떻게 확인하나");
  const hypotheses = numbered(hypothesisBlock);
  const methods = numbered(methodBlock);

  return {
    no,
    title,
    status,
    verdict,
    summary: meta.summary ?? "",
    why: section(body, "왜 궁금한가"),
    hypotheses,
    methods,
    hypothesis: hypotheses.length ? hypotheses.map((h, i) => `${i + 1}. ${h}`).join("\n") : null,
    method: methods.length ? methods.map((h, i) => `${i + 1}. ${h}`).join("\n") : null,
    findings: findingsOf(section(body, "지금까지 알아낸 것"), file),
    evidence: pairs(section(body, "근거")),
    decision,
    related: pairs(section(body, "관련")).map(({ label, value }) => ({ label, value })),
    blocks: meta.blocks && meta.blocks.length > 0 ? meta.blocks : null,
    liveGate: meta.live_gate && meta.live_gate.length > 0 ? meta.live_gate : null,
    openedAt,
    closedAt: date(meta.closed_at),
    trackKeys: list(meta.tracks),
  };
}

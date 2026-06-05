import { describe, it, expect } from "vitest";
import {
  validateProposal,
  extractSection,
  detectConstitutionalChange,
  REQUIRED_SECTIONS,
} from "../northstar-proposal";

function fullNorthStar(over?: { effects?: string; theme?: string }): string {
  return [
    "# 🌟 Agent North Star",
    "",
    `## 🎯 이번 주 테마 (Weekly Theme)`,
    over?.theme ?? "FOMO Index 신뢰성",
    "본문 내용을 충분히 길게 채워서 200자 임계를 넘긴다. ".repeat(8),
    "## ⛔ 절대 제안 금지",
    over?.effects ?? "가짜 숫자·투자 조언·장식 폴리싱 금지",
    "## 🧪 핵심 가설",
    "감정의 정상성 확인",
    "## 📊 측정 지표",
    "FOMO Index 연속성",
    "## 🚫 이번 주 손대지 않을 것",
    "커뮤니티",
    "## 🧭 직군 경계",
    "PM/CTO/Security",
    "## 📐 프로젝트 사실 규약",
    "fomo-core",
    "## ✍️ 제안 작성 절대 규칙",
    "단정형 + 근거",
  ].join("\n");
}

describe("validateProposal", () => {
  it("필수 섹션 모두 있으면 ok", () => {
    expect(validateProposal(fullNorthStar()).ok).toBe(true);
  });
  it("섹션 누락 시 거부 + missing 목록", () => {
    const md = fullNorthStar().replace("## 📊 측정 지표", "## (지움)");
    const r = validateProposal(md);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("## 📊 측정 지표");
  });
  it("거의 빈 제안(헤더만, 200자 미만) 거부", () => {
    const md = REQUIRED_SECTIONS.join("\n");
    expect(validateProposal(md).ok).toBe(false);
  });
});

describe("extractSection", () => {
  it("헤더 prefix 로 섹션 본문 추출", () => {
    const md = fullNorthStar();
    expect(extractSection(md, "## 🧪 핵심 가설")).toContain("감정의 정상성");
    expect(extractSection(md, "## 없는 섹션")).toBe("");
  });
});

describe("detectConstitutionalChange", () => {
  it("헌법 섹션(절대 제안 금지) 변경 → true", () => {
    const cur = fullNorthStar();
    const prop = fullNorthStar({ effects: "완전히 다른 금지 규칙으로 바꿈" });
    expect(detectConstitutionalChange(cur, prop)).toBe(true);
  });
  it("비헌법 섹션(테마)만 변경 → false", () => {
    const cur = fullNorthStar();
    const prop = fullNorthStar({ theme: "다른 테마" });
    expect(detectConstitutionalChange(cur, prop)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCTRINE_PATH, renderDoctrine } from "../../../scripts/archetype-doctrine-render";

/**
 * 독트린 문서는 **생성물**이다 — 정본은 `doctrine.json` 하나다.
 * 문서와 코드에 경고문이 두 벌 있으면 반드시 어긋나므로, 커밋된 마크다운이 최신 렌더와 같은지 검사한다.
 * (WO-SUB-02 완료 조건 8 "경고문이 코드에 하드코딩되어 있지 않고 독트린 소스에서 로드된다")
 */
describe("독트린 문서 동기화", () => {
  it("커밋된 DOCTRINE_archetype_frames.md 가 정본 렌더와 일치한다", () => {
    const committed = readFileSync(join(process.cwd(), DOCTRINE_PATH), "utf8");
    expect(committed).toBe(renderDoctrine());
  });

  it("§7 목차 항목이 전부 있다", () => {
    const md = readFileSync(join(process.cwd(), DOCTRINE_PATH), "utf8");
    for (const heading of [
      "## 1. 왜 유형 분류가 필요한가",
      "## 2. 아키타입 전체 목록",
      "## 3. 유형별 상세",
      "## 4. 분류 규칙 전문",
      "## 5. 임계값 결정 근거",
      "## 6. 히스테리시스 규칙",
      "## 7. 버전 이력",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("유형별 상세가 7개 하위 항목을 갖는다", () => {
    const md = readFileSync(join(process.cwd(), DOCTRINE_PATH), "utf8");
    for (const heading of [
      "#### 표시 지표 (우선순위 순)",
      "#### 금지 지표",
      "#### 밴드 지표",
      "#### 해석 경고문 (최종 문안)",
      "#### 리스크 템플릿 (WO-SUB-06 입력)",
      "#### 대표 종목 예시",
    ]) {
      expect(md).toContain(heading);
    }
  });
});

describe("독트린이 인용하는 실측 원본은 추적돼야 한다", () => {
  it("threshold_study_raw.json 이 저장소에 있다", () => {
    // 렌더러가 이 파일을 읽어 §5 분포·임계값 근거를 채운다. gitignore 하면 CI 에서만 렌더가 달라져
    // 동기화 테스트가 실패한다(실측: PR #986 repo-checks 실패). 근거 원본은 문서와 함께 추적한다.
    const raw = readFileSync(join(process.cwd(), "docs", "archetype", "threshold_study_raw.json"), "utf8");
    const study = JSON.parse(raw) as { labeled?: unknown[]; gateRestricted?: unknown };
    expect(Array.isArray(study.labeled)).toBe(true);
    expect(study.gateRestricted).toBeTruthy();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCTRINE_PATH, renderDoctrine } from "../../../scripts/archetype-doctrine-render";
import { DOCTRINE, DOCTRINE_CHANGELOG } from "../src/archetype/classify";
import { RULESET_VERSION } from "../src/archetype/ruleset";

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

  /**
   * 2026-08-17 실사가 잡은 것: `doctrine.json` 은 `v1.4.0` 인데 §7 이력은 `v1.2.0` 에서 멈춰 있었다.
   * 이력이 렌더 스크립트에 **하드코딩**돼 있어 버전을 올려도 등재가 강제되지 않았기 때문이다.
   * 이력을 정본(JSON)으로 옮기고, 아래 세 단정으로 같은 자리에서 다시 어긋나지 않게 한다.
   */
  it("`version` 과 `changelog` 마지막 항목이 일치한다 — 등재를 잊을 수 없다", () => {
    expect(DOCTRINE_CHANGELOG.length).toBeGreaterThan(0);
    expect(DOCTRINE_CHANGELOG[DOCTRINE_CHANGELOG.length - 1]!.version).toBe(DOCTRINE.version);
  });

  it("changelog 가 버전 오름차순이고 중복이 없다", () => {
    const versions = DOCTRINE_CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    const asTuple = (v: string) => v.replace("archetype-v", "").split(".").map(Number);
    for (let i = 1; i < versions.length; i += 1) {
      const [pMaj, pMin, pPat] = asTuple(versions[i - 1]!);
      const [maj, min, pat] = asTuple(versions[i]!);
      const prev = pMaj! * 1_000_000 + pMin! * 1_000 + pPat!;
      const curr = maj! * 1_000_000 + min! * 1_000 + pat!;
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("모든 changelog 항목이 변경·영향·룰셋을 채운다 — 빈 칸으로 등재 시늉하지 않는다", () => {
    for (const entry of DOCTRINE_CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.change.trim().length).toBeGreaterThan(10);
      expect(entry.impact.trim().length).toBeGreaterThan(5);
      expect(entry.ruleset_version).toMatch(/^archetype-v\d+\.\d+\.\d+$/);
    }
  });

  it("현행 changelog 의 룰셋 버전이 코드의 RULESET_VERSION 과 맞다", () => {
    // 독트린 ≠ 룰셋이지만, **현행 독트린이 함께 쓰이는 룰셋**은 코드와 같아야 한다.
    expect(DOCTRINE_CHANGELOG[DOCTRINE_CHANGELOG.length - 1]!.ruleset_version).toBe(RULESET_VERSION);
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

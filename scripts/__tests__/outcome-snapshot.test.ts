import { describe, it, expect } from "vitest";
import {
  captureSnapshot,
  parseIssueQuery,
  type Registry,
  type Fetcher,
  type Metric,
} from "../outcome-snapshot";

const registry: Registry = {
  metrics: [
    { id: "blockers", okr: "O1/KR3", label: "차단", source: "github-issues", query: "label:launch-blocker state:open", direction: "down", target: 0, auto: true },
    { id: "e2e", okr: "O4/KR1", label: "e2e", source: "repo-files", query: "apps/web/e2e/*.spec.ts", direction: "up", auto: true },
    { id: "crash", okr: "O2/KR3", label: "크래시", source: "manual", query: "", direction: "down", target: 1, auto: false },
    { id: "ci", okr: "O1/KR5", label: "ci", source: "ci-or-test", query: "", direction: "up", auto: true },
  ],
};

describe("parseIssueQuery", () => {
  it("label/state 토큰을 파싱", () => {
    expect(parseIssueQuery("label:launch-blocker state:open")).toEqual({ labels: ["launch-blocker"], state: "open" });
  });
  it("복수 label + 기본 state=open", () => {
    expect(parseIssueQuery("label:a label:b")).toEqual({ labels: ["a", "b"], state: "open" });
  });
});

describe("captureSnapshot", () => {
  it("auto 지표는 fetcher 값, manual 은 null", () => {
    const fetchers: Partial<Record<Metric["source"], Fetcher>> = {
      "github-issues": () => 3,
      "repo-files": () => 1,
    };
    const snap = captureSnapshot(registry, fetchers, "2026-06-04");
    expect(snap.date).toBe("2026-06-04");
    expect(snap.values.blockers).toBe(3);
    expect(snap.values.e2e).toBe(1);
    expect(snap.values.crash).toBeNull(); // manual
    expect(snap.values.ci).toBeNull(); // fetcher 없음(ci-or-test 미주입)
  });

  it("fetcher 가 throw 하면 null degrade", () => {
    const fetchers: Partial<Record<Metric["source"], Fetcher>> = {
      "github-issues": () => {
        throw new Error("gh 실패");
      },
      "repo-files": () => 2,
    };
    const snap = captureSnapshot(registry, fetchers, "2026-06-04");
    expect(snap.values.blockers).toBeNull(); // 취득 실패 → null
    expect(snap.values.e2e).toBe(2);
  });

  it("비유한값(NaN/Infinity) 반환 시 null", () => {
    const fetchers: Partial<Record<Metric["source"], Fetcher>> = {
      "github-issues": () => NaN,
      "repo-files": () => Infinity,
    };
    const snap = captureSnapshot(registry, fetchers, "2026-06-04");
    expect(snap.values.blockers).toBeNull();
    expect(snap.values.e2e).toBeNull();
  });

  it("모든 지표 id 가 values 에 존재(누락 없음)", () => {
    const snap = captureSnapshot(registry, {}, "2026-06-04");
    expect(Object.keys(snap.values).sort()).toEqual(["blockers", "ci", "crash", "e2e"]);
    expect(Object.values(snap.values).every((v) => v === null)).toBe(true);
  });
});

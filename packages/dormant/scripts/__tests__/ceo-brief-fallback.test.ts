import { describe, it, expect } from "vitest";
import {
  renderFallbackBrief,
  sortByScore,
  detectRepeats,
  normalizeTitleTokens,
  type DigestEntry,
} from "../ceo-brief-fallback";

const entry = (over: Partial<DigestEntry>): DigestEntry => ({
  number: 1,
  lane: "pm",
  title: "제목",
  scoreLabel: "score-none",
  rationale: "근거",
  ...over,
});

describe("sortByScore", () => {
  it("점수 내림차순, 동점은 번호 오름차순으로 정렬한다", () => {
    const digest: DigestEntry[] = [
      entry({ number: 10, scoreLabel: "score-conditional" }),
      entry({ number: 5, scoreLabel: "score-strong" }),
      entry({ number: 3, scoreLabel: "score-missing" }),
      entry({ number: 8, scoreLabel: "score-strong" }),
    ];
    const sorted = sortByScore(digest);
    expect(sorted.map((e) => e.number)).toEqual([5, 8, 10, 3]);
  });
});

describe("normalizeTitleTokens", () => {
  it("lane 접두사·날짜·불용어를 제거하고 토큰화한다", () => {
    const tokens = normalizeTitleTokens("[CTO] 2026-06-01 SWR TTL 캐시 정책 개선");
    expect(tokens).toContain("swr");
    expect(tokens).toContain("ttl");
    expect(tokens).toContain("캐시");
    expect(tokens).not.toContain("cto");
    expect(tokens).not.toContain("2026");
    expect(tokens).not.toContain("개선"); // 불용어
  });
});

describe("detectRepeats", () => {
  it("머지된 PR 제목과 키워드가 겹치는 제안을 반복 의심으로 플래그한다", () => {
    const digest: DigestEntry[] = [
      entry({ number: 100, title: "[CTO] SWR TTL 캐시 정책 강화" }),
      entry({ number: 101, title: "[Designer] 온보딩 카드 일러스트 추가" }),
    ];
    const matches = detectRepeats(
      digest,
      ["feat: SWR TTL 캐시 정책 도입"],
      [],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.number).toBe(100);
    expect(matches[0].matchedSource).toContain("SWR TTL 캐시");
  });

  it("겹치는 키워드가 없으면 플래그하지 않는다", () => {
    const digest: DigestEntry[] = [
      entry({ number: 200, title: "[QA] 결제 플로우 회귀 테스트" }),
    ];
    const matches = detectRepeats(digest, ["feat: 뉴스 탭 무한 스크롤"], []);
    expect(matches).toHaveLength(0);
  });
});

describe("renderFallbackBrief", () => {
  it("폴백 배너를 포함한다", () => {
    const out = renderFallbackBrief({
      digest: [entry({})],
      mergedPrTitles: [],
      doneIssueTitles: [],
      today: "2026-06-01",
    });
    expect(out).toContain("⚠️ 자동 폴백");
    expect(out).toContain("(자동 폴백)");
  });

  it("digest 3건을 점수순 표로 렌더하고 반복 의심 1건을 우선순위에서 제외한다", () => {
    const digest: DigestEntry[] = [
      entry({ number: 1, lane: "pm", title: "[PM] 신규 위젯 기획", scoreLabel: "score-conditional" }),
      entry({ number: 2, lane: "cto", title: "[CTO] SWR TTL 캐시 정책 강화", scoreLabel: "score-strong" }),
      entry({ number: 3, lane: "qa", title: "[QA] 차트 회귀 테스트", scoreLabel: "score-missing" }),
    ];
    const out = renderFallbackBrief({
      digest,
      mergedPrTitles: ["feat: SWR TTL 캐시 정책 도입"],
      doneIssueTitles: [],
      today: "2026-06-01",
    });

    // 반복 의심 섹션에 #2 가 들어간다
    const repeatSection = out.split("### ⚠️ 반복 의심")[1].split("### ✅")[0];
    expect(repeatSection).toContain("#2");

    // 우선순위 리스트에서 #2 는 빠지고, score-strong 이 빠졌으니 #1(conditional)이 1순위
    const prioritySection = out.split("### ✅ 오늘 처리 우선순위")[1];
    expect(prioritySection).not.toContain("#2");
    expect(prioritySection).toContain("#1");
    expect(prioritySection).toContain("#3");
    // #1(conditional) 이 #3(missing) 보다 앞
    expect(prioritySection.indexOf("#1")).toBeLessThan(prioritySection.indexOf("#3"));
  });

  it("digest 가 비어도 크래시 없이 렌더한다", () => {
    const out = renderFallbackBrief({
      digest: [],
      mergedPrTitles: [],
      doneIssueTitles: [],
      today: "2026-06-01",
    });
    expect(out).toContain("오늘 사이클 신규 제안 없음");
    expect(out).toContain("처리 대상 없음");
  });
});

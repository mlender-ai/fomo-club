import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

// import 시 main() 자동실행 방지(네트워크/파일 쓰기).
beforeAll(() => {
  process.env["TOOLING_SCOUT_TEST"] = "1";
  process.env["HARDENING_SCOUT_TEST"] = "1";
});

describe("반복 방지 — 카테고리·영역 로테이션 + dedup", async () => {
  const { pickCategory, proposedReposFromIssues, isoWeek } = await import("../agent-tooling-scout");
  const hardening = await import("../hardening-scout");

  it("Ecosystem: 주차가 다르면 카테고리도 순환한다(매주 같은 후보 방지)", () => {
    const keys = new Set<string>();
    for (let w = 0; w < 5; w++) {
      const date = new Date(Date.UTC(2026, 0, 5 + w * 7)); // 5주 연속(월요일)
      keys.add(pickCategory(date).key);
    }
    expect(keys.size).toBeGreaterThanOrEqual(4); // 5주에 4개 이상 서로 다른 카테고리
  });

  it("Ecosystem: override 키가 오면 해당 카테고리를 고정 선택", () => {
    expect(pickCategory(new Date(), "mcp-tooling").key).toBe("mcp-tooling");
  });

  it("Ecosystem: dedup — 과거 이슈 본문의 제안 repo 를 추출한다", () => {
    const bodies = [
      "- 레포: [getzep/graphiti](https://github.com/getzep/graphiti)\n점수 80",
      "다른 후보 https://github.com/comet-ml/opik 참고.",
    ];
    const set = proposedReposFromIssues(bodies);
    expect(set.has("getzep/graphiti")).toBe(true);
    expect(set.has("comet-ml/opik")).toBe(true);
    expect(set.has("never/proposed")).toBe(false);
  });

  it("Hardening: 주차가 다르면 강화 영역이 순환한다(제품 데이터 아닌 축 커버)", () => {
    const areas = new Set<string>();
    for (let w = 0; w < 5; w++) {
      areas.add(hardening.pickArea(new Date(Date.UTC(2026, 0, 5 + w * 7))));
    }
    expect(areas.size).toBe(5); // 5주 = 보안/인프라/API/DB/성능 전부
  });

  it("Hardening: override 영역 강제 선택", () => {
    expect(hardening.pickArea(new Date(), "security")).toBe("security");
    expect(hardening.pickArea(new Date(), "bogus")).not.toBe("bogus");
  });

  it("Hardening DB: unique와 복합 인덱스의 선두 FK는 누락으로 잡지 않는다", () => {
    const schema = `
      model Bot {
        id     String @id
        userId String?
        user   User?  @relation(fields: [userId], references: [id])
      }

      model Strategy {
        id    String @id
        botId String
        key   String
        bot   Bot    @relation(fields: [botId], references: [id])

        @@unique([botId, key])
      }

      model ResearchProfile {
        id     String @id
        userId String @unique
        user   User   @relation(fields: [userId], references: [id])
      }

      model Alert {
        id         String @id
        botId      String
        strategyId String?
        bot        Bot       @relation(fields: [botId], references: [id])
        strategy   Strategy? @relation(fields: [strategyId], references: [id])

        @@index([botId, strategyId])
      }
    `;

    expect(hardening.findUnindexedRelationFields(schema)).toEqual([
      "Bot.userId",
      "Alert.strategyId",
    ]);
  });

  it("Hardening DB: 운영 Prisma 스키마의 모든 관계 FK가 인덱스로 보호된다", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

    expect(hardening.findUnindexedRelationFields(schema)).toEqual([]);
  });

  it("isoWeek 는 연속 주에 증가한다", () => {
    const a = isoWeek(new Date(Date.UTC(2026, 0, 5)));
    const b = isoWeek(new Date(Date.UTC(2026, 0, 12)));
    expect(b).toBe(a + 1);
  });
});

/**
 * LAB-02 완료확인 8 — **마이그레이션이 실행되고 롤백도 확인됐다.**
 *
 * "롤백 SQL 을 썼다"는 확인이 아니다. 실제로 돌려서
 * **레거시 데이터가 살아남는지**까지 봐야 확인이다. 이 스크립트가 그걸 한다.
 *
 * 절차:
 *   1. 스키마를 비운다
 *   2. `prisma migrate deploy` — 프로덕션과 같은 경로로 전부 적용
 *   3. 레거시 페이퍼 행 + 랩 행을 넣는다
 *   4. 롤백 SQL 을 돌린다
 *   5. 랩 테이블이 사라지고, **레거시 테이블이 원래 이름으로 돌아오고,
 *      그 안의 행이 그대로인지** 확인한다
 *   6. 다시 적용해서 개명이 되돌려지는지 확인한다
 *
 * **주의: 스키마를 비운다.** 프로덕션 DATABASE_URL 로 절대 돌리지 말 것 —
 * 아래 가드가 막지만, 가드를 믿기 전에 URL 을 보라.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/migrate-verify.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const ROLLBACK_SQL = "prisma/rollback/20260911000000_lab02_strategy_lab.down.sql";
const LAB02_SQL = "prisma/migrations/20260911000000_lab02_strategy_lab/migration.sql";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 이 없다. 이 스크립트는 버릴 수 있는 DB 에서만 돌린다.");
  process.exit(1);
}

// 스키마를 비우는 스크립트다. 프로덕션에서 돌면 사고다.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!LOCAL_HOSTS.includes(host) && process.env.LAB_MIGRATE_VERIFY_ALLOW_REMOTE !== "yes") {
  console.error(
    `거부: DATABASE_URL 의 호스트가 로컬이 아니다(${host || "파싱 실패"}).\n` +
      "이 스크립트는 스키마를 비운다. 정말 원격에서 돌리려면 " +
      "LAB_MIGRATE_VERIFY_ALLOW_REMOTE=yes 를 명시하라."
  );
  process.exit(1);
}

/** SQL 파일을 문장 단위로 쪼갠다. 이 레포의 마이그레이션에는 함수·달러인용이 없다. */
function statements(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const prisma = new PrismaClient();

async function run(sql: string[]): Promise<void> {
  for (const statement of sql) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function tables(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  return new Set(rows.map((r) => r.table_name));
}

async function count(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "${table}"`
  );
  return Number(rows[0]?.n ?? 0);
}

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  console.log(`DB: ${host}\n`);

  console.log("1. 스키마 비우기");
  await prisma.$executeRawUnsafe("DROP SCHEMA public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  console.log("   ok\n");

  console.log("2. prisma migrate deploy");
  const deploy = execFileSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
  });
  console.log(
    deploy
      .split("\n")
      .filter((l) => /migration|applied|Applying/i.test(l))
      .map((l) => `   ${l.trim()}`)
      .join("\n") || "   (출력 없음)"
  );
  const afterDeploy = await tables();
  check("랩 테이블 6개가 생겼다", ["Strategy", "Run", "Trade", "Equity", "Metric", "Benchmark"].every((t) => afterDeploy.has(t)));
  check("레거시가 개명됐다", afterDeploy.has("LegacyStrategy") && afterDeploy.has("LegacyTrade"));
  console.log("");

  console.log("3. 데이터 넣기 (레거시 + 랩)");
  await run([
    `INSERT INTO "Bot" (id, name, "updatedAt") VALUES ('bot-verify', '검증용', now())`,
    `INSERT INTO "LegacyStrategy" (id, "botId", key, name, symbol, config, "updatedAt")
       VALUES ('ls-verify', 'bot-verify', 'k1', '레거시 전략', 'BTCUSDT', '{}'::jsonb, now())`,
    `INSERT INTO "LegacyTrade" (id, "botId", symbol, action, quantity, price, notional,
       "orderRole", "feeRate", "reasonCode", "reasonText", "reasonMeta")
       VALUES ('lt-verify', 'bot-verify', 'BTCUSDT', 'BUY', 1, 100, 100,
       'TAKER', 0.0005, 'RC', '이유', '{}'::jsonb)`,
    `INSERT INTO "Strategy" (id, name, version, market, definition, status, "createdAt")
       VALUES ('s-verify', '검증 전략', 1, 'CRYPTO', '{}'::jsonb, 'DRAFT', now())`,
    `INSERT INTO "Run" (id, "strategyId", kind, "periodStart", "initialCapital",
       "dataVersion", "paramsVersion", "createdAt")
       VALUES ('r-verify', 's-verify', 'BACKTEST', now(), 10000, 'd1', 'p1', now())`,
  ]);
  const legacyStrategyBefore = await count("LegacyStrategy");
  const legacyTradeBefore = await count("LegacyTrade");
  check("레거시 행이 들어갔다", legacyStrategyBefore === 1 && legacyTradeBefore === 1);
  console.log("");

  console.log("4. 롤백 SQL 실행");
  await run(statements(ROLLBACK_SQL));
  const afterRollback = await tables();
  check(
    "랩 테이블이 사라졌다",
    !["Run", "Equity", "Metric", "Benchmark"].some((t) => afterRollback.has(t))
  );
  check(
    "레거시가 원래 이름으로 돌아왔다",
    afterRollback.has("Strategy") &&
      afterRollback.has("Trade") &&
      !afterRollback.has("LegacyStrategy") &&
      !afterRollback.has("LegacyTrade")
  );
  const strategyRows = await count("Strategy");
  const tradeRows = await count("Trade");
  check(
    "레거시 데이터가 살아남았다",
    strategyRows === legacyStrategyBefore && tradeRows === legacyTradeBefore,
    `Strategy ${strategyRows}행 · Trade ${tradeRows}행`
  );
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='Strategy'`
  );
  const colNames = new Set(cols.map((c) => c.column_name));
  check(
    "되돌아온 Strategy 는 레거시 모양이다",
    colNames.has("botId") && colNames.has("config") && !colNames.has("definition"),
    [...colNames].sort().join(",")
  );
  console.log("");

  console.log("5. 다시 적용");
  await run(statements(LAB02_SQL));
  const afterReapply = await tables();
  check(
    "재적용 후 랩 테이블이 다시 있다",
    ["Strategy", "Run", "Trade", "Equity", "Metric", "Benchmark"].every((t) => afterReapply.has(t))
  );
  check(
    "재적용 후에도 레거시 데이터가 그대로다",
    (await count("LegacyStrategy")) === legacyStrategyBefore &&
      (await count("LegacyTrade")) === legacyTradeBefore
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 통과`);
  if (failed.length > 0) {
    console.error("실패:", failed.map((c) => c.name).join(", "));
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

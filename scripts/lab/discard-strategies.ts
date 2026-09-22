/**
 * LAB 전략을 **폐기한다** (`LAB-BRIDGE` 0-3 · 완료확인 2).
 *
 * ## 폐기는 삭제가 아니다
 *
 * 전략 행의 상태만 `STOPPED` 으로 바꾸고 사유를 적는다. `Run` · `Trade` ·
 * `Equity` · `Metric` 은 **하나도 건드리지 않는다.**
 *
 * 지시서가 같은 줄에서 두 가지를 요구하기 때문이다:
 *
 * > LAB 전략 3종이 폐기되고 **백테스트 결과는 로그에 남았다**
 *
 * 진 결과를 지우면 다음에 같은 걸 또 만든다. 그리고 이긴 것만 남은 표는
 * 생존 편향 그 자체다. 판정은 `docs/lab/BACKTEST_LOG.md` 가 갖는다.
 *
 * ## 왜 이게 실행을 멈추나
 *
 * `paper-tick.ts` 가 `status in (RUNNING, DRAFT)` 만 고른다. `STOPPED` 으로
 * 바꾸는 순간 페이퍼가 이 전략들을 더 이상 돌리지 않는다. 새로 만든 장치가
 * 아니라 **이미 있던 자동 정지 경로와 같은 것**이다.
 *
 * ## 열려 있는 포지션
 *
 * 폐기 시점에 들고 있던 페이퍼 포지션은 **청산하지 않는다.** 거기서 멈춘
 * 것이 사실이고, 마지막에 유리한 값으로 닫아주면 기록이 좋아진다.
 * 몇 건이 열려 있었는지는 찍어서 로그에 남긴다.
 *
 *   npm run lab:discard -- --dry     # 무엇을 폐기할지만
 *   npm run lab:discard -- --confirm # 실제로
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY = process.argv.includes("--dry");
const CONFIRM = process.argv.includes("--confirm");

/** 화면과 표에 그대로 나가는 말. 비어 있으면 화면이 이유를 못 말한다. */
const REASON =
  "LAB-BRIDGE 0-3 — 랩은 엔진을 갖지 않는다. 같은 일을 FCE 가 하고 있어 접었다. " +
  "백테스트 결과는 지우지 않고 보관함과 docs/lab/BACKTEST_LOG.md 에 남는다.";

interface OpenPosition {
  symbol: string;
  side: string;
}

/**
 * 페이퍼 상태에 열린 포지션이 있나.
 *
 * 열쇠는 `open` 이다 — 처음에 `positions` 로 읽었더니 아무것도 안 잡혀서, 폐기
 * 로그에 "보유 없음" 으로 남을 뻔했다. 실제로는 SOL 롱을 들고 있었다.
 * 같은 상태를 읽는 `live-board.ts` 의 `positionsOf` 가 정본이다.
 *
 * **심볼과 방향만 꺼낸다.** 이 상태에는 저장된 진짜 손절선·목표가가 같이 들어
 * 있는데, `LAB-08` 이 그걸 밖으로 내보내지 못하게 막았다. 로그도 밖이다.
 */
function openPositions(state: unknown): OpenPosition[] {
  if (typeof state !== "object" || state === null) return [];
  const raw = (state as Record<string, unknown>).open;
  if (!Array.isArray(raw)) return [];
  const out: OpenPosition[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    out.push({ symbol: String(p.symbol ?? "?"), side: String(p.side ?? "?") });
  }
  return out;
}

async function main(): Promise<void> {
  const strategies = await prisma.strategy.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      version: true,
      status: true,
      stopReason: true,
      runs: {
        select: {
          id: true,
          kind: true,
          paper: { select: { state: true } },
          _count: { select: { trades: true } },
        },
      },
    },
  });

  if (strategies.length === 0) {
    console.log("전략이 없다. 할 일 없음.");
    return;
  }

  let target = 0;
  for (const s of strategies) {
    const trades = s.runs.reduce((sum, r) => sum + r._count.trades, 0);
    const open = s.runs.flatMap((r) => openPositions(r.paper?.state));
    const already = s.status === "STOPPED";
    if (!already) target += 1;

    const held = open.length > 0 ? ` · 폐기 시점 보유 ${open.map((p) => `${p.symbol} ${p.side}`).join(", ")}` : "";
    console.log(
      `  ${already ? "이미 폐기" : "폐기 대상"}  ${s.name} v${s.version}` +
        ` · ${s.status} · 거래 ${trades}건 · Run ${s.runs.length}개${held}`
    );
  }

  console.log("");
  console.log(`폐기 대상 ${target}개 / 전체 ${strategies.length}개`);
  console.log("Run · Trade · Equity · Metric 은 건드리지 않는다 — 결과는 남는다.");

  if (DRY || !CONFIRM) {
    console.log("");
    console.log(DRY ? "(--dry — 바꾸지 않았다)" : "--confirm 이 없어 바꾸지 않았다.");
    return;
  }

  // **이미 폐기된 것은 다시 건드리지 않는다.** 덮어쓰면 언제 접었는지가 오늘로 바뀐다.
  const result = await prisma.strategy.updateMany({
    where: { status: { not: "STOPPED" } },
    data: { status: "STOPPED", stoppedAt: new Date(), stopReason: REASON },
  });
  console.log("");
  console.log(`폐기했다: ${result.count}개`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

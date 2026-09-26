/**
 * 조립본을 지금 다시 만든다 — `lab-collect` `job=snapshot`.
 *
 * ## 왜 있나
 *
 * `SNAPSHOT_VERSION` 을 올려 배포하면 DB 의 조립본은 옛 형식이라 탭이 503 이다. 러너의 다음
 * FCE 업로드(15분 주기)가 고치지만, #1285 배포 뒤에는 그 업로드가 실패하고 있어서 탭이 몇 시간
 * 비었다. **FCE 를 기다리지 않는다** — 조립본은 랩 DB 만 읽어서 만든다.
 *
 *   npm run lab:snapshot
 */
import { buildSnapshots, SNAPSHOT_VERSION } from "../../apps/web/lib/lab/snapshot";
import { prisma } from "../../apps/web/lib/prisma";

async function main(): Promise<void> {
  const started = Date.now();
  const keys = await buildSnapshots();
  console.log(`조립본 v${SNAPSHOT_VERSION} · ${keys.join(" · ")} · ${Date.now() - started}ms`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

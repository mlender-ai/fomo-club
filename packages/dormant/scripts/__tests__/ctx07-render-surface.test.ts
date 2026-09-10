import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { scanForWyckoffTerms, scanForRequestPathImports } from "../../packages/fomo-core/src/invariants/render-scan";

/**
 * CTX-07 INV-C8 · INV-C15 — **실제 저장소 스캔**.
 *
 * 역검증 하네스(`ctx07-falsification.test.ts`)는 검사기가 위반을 잡는지 증명한다. 그것만으로는
 * **이 저장소가 지금 규칙을 지키는지** 알 수 없다 — 잡을 수 있는 검사기와 걸 데 없는 검사기는 다르다.
 * 그래서 같은 순수 함수를 실제 파일에 돌린다. 둘이 짝이다.
 */

const REPO_ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (["node_modules", ".next", ".next-build", "e2e", "__tests__", ".claude"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(REPO_ROOT, file).split(sep).join("/");

// ── INV-C8 — 화면에 와이코프 용어 미노출 ────────────────────────────────────
describe("INV-C8 화면에 와이코프 용어 미노출", () => {
  // 사용자가 실제로 보는 표면. 서버 렌더(apps/web/app)와 클라이언트(apps/fomo-web) 둘 다.
  const files = [...walk(join(REPO_ROOT, "apps", "fomo-web")), ...walk(join(REPO_ROOT, "apps", "web", "app"))];

  it("스캔 대상이 실재한다 — 0개면 가드가 아무것도 지키지 않는다", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("표시 문자열에 와이코프 용어가 없다", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const v of scanForWyckoffTerms(readFileSync(file, "utf8"))) {
        offenders.push(`${rel(file)}:${v.line} — "${v.matched}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── INV-C15 — 조회 경로에서 배치 전용 패키지 미호출 ──────────────────────────
describe("INV-C15 조회 경로에서 배치 전용 패키지 미호출", () => {
  /**
   * 조회 경로 = 요청마다 실행되는 코드. 크론·배치 라우트는 **대상이 아니다**(거기서 계산하는 게 맞다).
   * `apps/web/app/api/**` 중 `cron/` 밑을 뺀 것 + 클라이언트 표면 전체 + 조회 라우트가 쓰는 lib.
   */
  const apiFiles = walk(join(REPO_ROOT, "apps", "web", "app", "api")).filter(
    (file) => !rel(file).includes("/cron/")
  );
  const clientFiles = walk(join(REPO_ROOT, "apps", "fomo-web"));
  const files = [...apiFiles, ...clientFiles];

  it("스캔 대상이 실재한다", () => {
    expect(apiFiles.length).toBeGreaterThan(20);
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it("배치 전용 패키지(flow·structure·materials·background·lab)를 임포트하지 않는다", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const v of scanForRequestPathImports(readFileSync(file, "utf8"))) {
        offenders.push(`${rel(file)}:${v.line} — ${v.matched} (${v.why})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("크론 경로는 대상이 아니다 — 배치가 계산하는 것은 정상이다", () => {
    const cronFiles = walk(join(REPO_ROOT, "apps", "web", "app", "api")).filter((file) =>
      rel(file).includes("/cron/")
    );
    expect(cronFiles.length).toBeGreaterThan(5);
  });
});

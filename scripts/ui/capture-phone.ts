/**
 * UI-FIX PART D — 여섯 탭을 폰(390px)에서 캡처한다.
 *
 * 로컬 `next dev` 를 띄우고, 화면이 부르는 `/api/lab/*` 를 **견본 조립본**
 * (`apps/web/__tests__/fixtures/lab.ts` — 정규 도메인 실측에서 옮긴 값)으로 가로챈다.
 * DB 없이 돌아서 CI·클라우드 세션에서도 같은 화면을 찍는다.
 *
 * 탭마다 다섯 가지를 재서 같이 찍는다(PART D 체크리스트):
 *   가로 스크롤 없음 · 오른쪽 잘림 없음 · 행 이름 세로 쪼개짐 없음 · 행 두 줄 이하 · ⓘ 가 시트를 연다
 *
 *   npm --workspace @fomo/backend run dev   # 다른 창
 *   npx tsx scripts/ui/capture-phone.ts [출력 폴더] [기준 URL]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

import { fixtures } from "../../apps/web/__tests__/fixtures/lab";

const OUT = process.argv[2] ?? "docs/ui/screenshots";
const BASE = process.argv[3] ?? "http://127.0.0.1:3200";

const TABS = [
  { path: "/", key: "overview", name: "overview" },
  { path: "/strategies", key: "strategies", name: "strategies" },
  { path: "/positions", key: "positions", name: "positions" },
  { path: "/whales", key: "whales", name: "whales" },
  { path: "/research", key: "research", name: "research" },
  { path: "/journal", key: "journal", name: "journal" },
  // UI-05 B — 전략 상세. 돌고 있는 것 하나 · 멈춘 것 하나.
  { path: "/strategies/crypto", key: "strategies", name: "strategy-crypto" },
  { path: "/strategies/stock_us", key: "strategies", name: "strategy-stock_us" },
  // UI-06 B — 위험 순 첫 포지션(견본 상세와 같은 것).
  { path: `/positions/${fixtures().positionDetail.position.id}`, key: "positions", name: "position-detail" },
  // 폰 기본은 미니멀이다(UI-06 D) — 차트·정보까지 보려면 프로로 한 장 더.
  { path: `/positions/${fixtures().positionDetail.position.id}`, key: "positions", name: "position-detail-pro", mode: "pro" },
] as const;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const data = fixtures();
  const sync = { level: "fresh", label: "2분 전 동기화", lastAt: new Date().toISOString(), ageMs: 120_000, lastError: null };

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // tsx 가 함수에 이름을 붙이려고 `__name(...)` 을 끼워 넣는다. 브라우저 쪽에는 그게 없다.
  await page.addInitScript({ content: "window.__name = (f) => f;" });

  await page.route("**/api/lab/**", async (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname.replace("/api/lab/", "");
    if (key === "status") {
      return route.fulfill({ json: { sync, collect: { staleSymbols: [], feedAgeMs: 60_000, failing: [] }, ms: 1 } });
    }
    // 포지션 상세(UI-06) — `positions/{id}` 는 상세 견본으로.
    const payload = key.startsWith("positions/") ? data.positionDetail : (data as Record<string, unknown>)[key];
    if (payload === undefined) return route.fulfill({ status: 404, json: { error: "not_found" } });
    return route.fulfill({ json: { data: payload, sync, builtAt: new Date().toISOString(), ms: 1 } });
  });

  const report: string[] = [];
  for (const tab of TABS) {
    const mode = "mode" in tab ? tab.mode : null;
    await page.goto(`${BASE}${tab.path}`, { waitUntil: "networkidle" });
    await page.evaluate((m) => {
      if (m) window.localStorage.setItem("lab.positions.mode", m);
      else window.localStorage.removeItem("lab.positions.mode");
    }, mode);
    if (mode) await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".ui-hero-value", { timeout: 30_000 });
    // 캔들 차트는 브라우저에서 라이브러리를 불러 그린다 — 캔버스가 뜰 때까지.
    if (mode === "pro") await page.waitForSelector(".ui-candles canvas", { timeout: 15_000 }).catch(() => {});
    // `next dev` 의 N 배지가 통계 칸을 가린다 — 배포 화면에는 없는 것.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const rows = [...document.querySelectorAll<HTMLElement>(".ui-row-link")];
      const lineH = (el: Element) => parseFloat(getComputedStyle(el).lineHeight) || 20;
      return {
        hScroll: doc.scrollWidth > doc.clientWidth,
        // 오른쪽이 화면 밖으로 나간 요소
        // 표는 가로로 **민다**(UI-05 A-3) — 스크롤 칸 안의 셀은 잘린 게 아니다.
        clipped: [...document.querySelectorAll<HTMLElement>(".sh-main *")].filter(
          (el) =>
            el.getBoundingClientRect().right > window.innerWidth + 0.5 &&
            el.getClientRects().length > 0 &&
            !el.closest(".ui-table-scroll")
        ).length,
        // 행 이름이 두 줄 이상 = 세로로 쪼개졌다
        brokenNames: rows.filter((r) => {
          const t = r.querySelector(".ui-row-title");
          return t ? t.getBoundingClientRect().height > lineH(t) * 1.5 : false;
        }).length,
        // 행 하나가 이름 + 부제 두 줄을 넘는가
        tallRows: rows.filter((r) => {
          const name = r.querySelector(".ui-row-name");
          return name ? name.getBoundingClientRect().height > 52 : false;
        }).length,
        rows: rows.length,
        infos: document.querySelectorAll(".ui-info").length,
      };
    });

    const file = join(OUT, `uifix-${tab.name}-390.png`);
    await page.screenshot({ path: file, fullPage: true });

    // ⓘ 를 눌러 시트가 뜨는지 (A-3)
    let sheet = "없음";
    const info = page.locator(".ui-info").first();
    if ((await info.count()) > 0) {
      await info.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 5_000 });
      sheet = (await dialog.locator(".ui-sheet-title").innerText()).trim();
      await page.waitForTimeout(400); // 올라오는 애니메이션이 끝난 뒤 찍는다
      if (tab.name === "overview" || tab.name === "strategies") {
        await page.screenshot({ path: join(OUT, `uifix-${tab.name}-sheet-390.png`) });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached", timeout: 5_000 });
    }

    const line =
      `${tab.name.padEnd(10)} 가로스크롤 ${m.hScroll ? "있음 ❌" : "없음"} · 잘림 ${m.clipped} · ` +
      `이름 쪼개짐 ${m.brokenNames}/${m.rows} · 두 줄 넘는 행 ${m.tallRows} · ⓘ ${m.infos} → 시트 "${sheet}"`;
    report.push(line);
    console.log(line);
  }
  await browser.close();

  const bad = report.filter((l) => /있음 ❌|잘림 [1-9]|쪼개짐 [1-9]|넘는 행 [1-9]|시트 "없음"/.test(l));
  process.exit(bad.length > 0 ? 1 : 0);
}

void main();

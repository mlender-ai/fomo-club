import { chromium, type Browser, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";

type Severity = "ok" | "warn" | "critical";

interface JourneyFinding {
  severity: Severity;
  message: string;
}

const DEFAULT_WEB_URL = "https://fomo-web-mlender-ais-projects.vercel.app";
const WEB_URL = (process.env.FOMO_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/$/, "");
const TIMEOUT_MS = positiveInt(process.env.FOMO_WEB_SMOKE_TIMEOUT_MS, 15000);
const HOLD_MS = positiveInt(process.env.FOMO_WEB_SMOKE_HOLD_MS, 4500);
const OUT_JSON = process.env.FOMO_WEB_SMOKE_JSON_OUT ?? "fomo-web-journey-smoke.json";
const OUT_MD = process.env.FOMO_WEB_SMOKE_MD_OUT ?? "fomo-web-journey-smoke.md";
const CHROME_PATH = process.env.FOMO_WEB_SMOKE_CHROME_PATH?.trim();

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
}

function ignoredConsole(text: string): boolean {
  return /favicon|chrome-extension|ResizeObserver loop/i.test(text);
}

async function runJourney(): Promise<{
  findings: JourneyFinding[];
  beforeText: string;
  afterText: string;
  consoleErrors: string[];
  pageErrors: string[];
}> {
  const findings: JourneyFinding[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true, ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}) });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      locale: "ko-KR",
    });

    page.on("console", (message) => {
      if (message.type() === "error" && !ignoredConsole(message.text())) {
        consoleErrors.push(message.text().slice(0, 500));
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message.slice(0, 500));
    });

    await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    const cta = page.getByRole("button", { name: "발견 시작" });
    await cta.waitFor({ state: "visible", timeout: 10000 });

    await page.waitForTimeout(HOLD_MS);
    const beforeText = await bodyText(page);
    const splashStillVisible = await cta.isVisible().catch(() => false);
    if (!splashStillVisible) {
      findings.push({ severity: "critical", message: `CTA를 누르기 전 ${HOLD_MS}ms 안에 스플래쉬가 사라졌습니다.` });
    }
    if (!beforeText.includes("취향투자 클럽") || !beforeText.includes("발견 시작")) {
      findings.push({ severity: "critical", message: "스플래쉬 핵심 문구 또는 CTA가 첫 화면에 없습니다." });
    }

    if (splashStillVisible) {
      await cta.click();
      await page.waitForTimeout(1400);
    }

    const afterText = await bodyText(page);
    const ctaAfterClick = await cta.isVisible().catch(() => false);
    if (ctaAfterClick) {
      findings.push({ severity: "critical", message: "CTA 클릭 후에도 스플래쉬 CTA가 남아 있습니다." });
    }
    if (!afterText || afterText === beforeText) {
      findings.push({ severity: "critical", message: "CTA 클릭 후 메인 화면 텍스트로 전환되지 않았습니다." });
    }
    if (!/(오늘의 시장 온도|관심|카드|FOMO CLUB)/.test(afterText)) {
      findings.push({ severity: "warn", message: "CTA 이후 홈 화면의 핵심 텍스트를 확인하지 못했습니다." });
    }

    for (const error of pageErrors) {
      findings.push({ severity: "critical", message: `브라우저 pageerror: ${error}` });
    }
    for (const error of consoleErrors) {
      findings.push({ severity: "warn", message: `브라우저 console.error: ${error}` });
    }

    if (findings.length === 0) {
      findings.push({ severity: "ok", message: "스플래쉬가 CTA 전까지 유지되고, CTA 후 메인 화면으로 전환됩니다." });
    }

    return { findings, beforeText, afterText, consoleErrors, pageErrors };
  } catch (error) {
    findings.push({ severity: "critical", message: `웹 여정 스모크 실행 실패: ${error instanceof Error ? error.message : String(error)}` });
    return { findings, beforeText: "", afterText: "", consoleErrors, pageErrors };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function renderMarkdown(report: Awaited<ReturnType<typeof runJourney>> & { date: string; webUrl: string }): string {
  return [
    `# FOMO Web Journey Smoke — ${report.date}`,
    "",
    `Web: ${report.webUrl}`,
    "",
    "## Findings",
    ...report.findings.map((finding) => `- ${finding.severity.toUpperCase()}: ${finding.message}`),
    "",
    "## Snapshot",
    `- Before CTA: ${compact(report.beforeText)}`,
    `- After CTA: ${compact(report.afterText)}`,
    "",
  ].join("\n");
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240) || "n/a";
}

async function main(): Promise<void> {
  const date = kstDate();
  const result = await runJourney();
  const report = { date, webUrl: WEB_URL, ...result };
  const md = renderMarkdown(report);
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(OUT_MD, md);
  process.stdout.write(md);

  if (report.findings.some((finding) => finding.severity === "critical")) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[fomo-web-journey-smoke] failed", error);
  process.exitCode = 2;
});

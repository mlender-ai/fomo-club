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
  // upgrade-insecure-requests: report-only CSP에 대한 무해한 브라우저 고지 — 매일 warn 노이즈 방지.
  return /favicon|chrome-extension|ResizeObserver loop|upgrade-insecure-requests.*report-only/i.test(text);
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

    // 현재 여정(#798 이후): 스플래시 없이 홈이 바로 오늘의 30장 덱으로 열린다.
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    const passButton = page.getByRole("button", { name: "덜 관심" });
    await passButton.waitFor({ state: "visible", timeout: 10000 });

    await page.waitForTimeout(HOLD_MS);
    const beforeText = await bodyText(page);
    if (beforeText.includes("오늘의 30장을 불러오지 못했어요")) {
      findings.push({ severity: "critical", message: "오늘의 30장 덱이 에러 상태입니다 (불러오기 실패)." });
    }
    if (!beforeText.includes("FOMO CLUB")) {
      findings.push({ severity: "critical", message: "홈 헤더(FOMO CLUB)가 첫 화면에 없습니다." });
    }
    if (!/(신호 혼조|강세 신호|약세 신호)/.test(beforeText)) {
      findings.push({ severity: "warn", message: "첫 카드의 신호 라벨을 확인하지 못했습니다." });
    }

    // '덜 관심'(pass)은 비로그인에도 서버 부작용 없이 다음 카드로 넘어간다 — 덱 전환 확인.
    await passButton.click();
    await page.waitForTimeout(1400);

    const afterText = await bodyText(page);
    const deckStillAlive = await passButton.isVisible().catch(() => false);
    if (!deckStillAlive) {
      findings.push({ severity: "critical", message: "'덜 관심' 클릭 후 덱이 사라졌습니다." });
    }
    if (!afterText || afterText === beforeText) {
      findings.push({ severity: "critical", message: "'덜 관심' 클릭 후 다음 카드로 전환되지 않았습니다." });
    }

    for (const error of pageErrors) {
      findings.push({ severity: "critical", message: `브라우저 pageerror: ${error}` });
    }
    for (const error of consoleErrors) {
      findings.push({ severity: "warn", message: `브라우저 console.error: ${error}` });
    }

    if (findings.length === 0) {
      findings.push({ severity: "ok", message: "홈이 오늘의 30장 덱으로 열리고, '덜 관심' 후 다음 카드로 전환됩니다." });
    }

    return { findings, beforeText, afterText, consoleErrors, pageErrors };
  } catch (error) {
    // 메시지는 한 줄로 평탄화 — 멀티라인이 md 리스트·GITHUB_OUTPUT 포맷을 깨뜨린다.
    findings.push({ severity: "critical", message: `웹 여정 스모크 실행 실패: ${compact(error instanceof Error ? error.message : String(error))}` });
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
    `- Before pass: ${compact(report.beforeText)}`,
    `- After pass: ${compact(report.afterText)}`,
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

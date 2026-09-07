/**
 * LAUNCH-P1 §A-5 — **링크 공유 그림(og:image)을 굽는다.**
 *
 * ## 왜 정적 PNG 인가
 *
 * 요청 시점에 그리는 방법(`next/og` = Satori)은 이 레포에서 못 쓴다 — 한글을 그리려면
 * 폰트를 넘겨야 하는데 우리가 가진 것은 **woff2** 이고 Satori 는 woff2 를 못 읽는다.
 * 그림은 하루에 한 번도 안 바뀌므로 **미리 한 장 굽는 게 맞다**(빠르고, 런타임에 깨질 일이 없다).
 *
 * ## 왜 텍스트만인가
 *
 * WO 가 못을 박았다 — *"복잡하게 만들지 않는다. 텍스트만으로 충분하다."*
 * 카카오톡·슬랙은 이 그림을 **작게** 띄운다. 그림이 복잡하면 아무것도 안 읽힌다.
 *
 * 쓰는 말은 화면 본문과 **같은 말**이다(`오늘의 조용한 돈` / `뉴스 나오기 전에 돈이 먼저 들어간 곳`).
 * 공유 카드가 앱과 다른 말을 하면 어느 쪽이 거짓이다.
 *
 * ## 실행
 *
 * ```
 * npx tsx scripts/build-og-image.ts
 * ```
 *
 * 결과: `apps/fomo-web/public/og.png` (1200×630). 폰트는 `public/fonts` 의 번들본을 쓴다 —
 * 네트워크를 타지 않으므로 오프라인에서도 같은 그림이 나온다.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const FONT_DIR = resolve(ROOT, "apps/fomo-web/public/fonts");
const OUT = resolve(ROOT, "apps/fomo-web/public/og.png");

/** 앱 DS 와 같은 값 — 공유 카드가 앱과 다른 색이면 다른 제품처럼 보인다. */
const BG = "#0A0A0A";
const INK = "#F5F5F5";
const INK_2 = "#8A8A85";
const ACCENT = "#D4FF3F";

function html(): string {
  const mono = pathToFileURL(resolve(FONT_DIR, "DepartureMono-Regular.woff2")).href;
  const sans = pathToFileURL(resolve(FONT_DIR, "Pretendard-Medium.woff2")).href;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
  @font-face { font-family: "DepartureMono"; src: url("${mono}") format("woff2"); font-weight: 400; }
  @font-face { font-family: "Pretendard"; src: url("${sans}") format("woff2"); font-weight: 500; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: ${BG};
    color: ${INK};
    font-family: "Pretendard", sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 76px 84px;
    -webkit-font-smoothing: antialiased;
  }
  .mark { font-family: "DepartureMono", monospace; font-size: 30px; letter-spacing: .22em; color: ${INK_2}; }
  h1 { font-size: 104px; font-weight: 500; line-height: 1.14; letter-spacing: -.02em; word-break: keep-all; }
  .sub { display: flex; align-items: center; gap: 20px; }
  .sub .rule { width: 44px; height: 3px; background: ${ACCENT}; border-radius: 2px; }
  .sub p { font-size: 34px; color: ${INK_2}; word-break: keep-all; }
</style></head>
<body>
  <p class="mark">FOMO CLUB</p>
  <h1>오늘의<br>조용한 돈</h1>
  <div class="sub"><span class="rule"></span><p>뉴스 나오기 전에 돈이 먼저 들어간 곳</p></div>
</body></html>`;
}

async function main(): Promise<void> {
  for (const file of ["DepartureMono-Regular.woff2", "Pretendard-Medium.woff2"]) {
    const path = resolve(FONT_DIR, file);
    // 폰트가 없으면 조용히 시스템 폰트로 떨어진다 — 그러면 그림이 매번 달라진다. 차라리 멈춘다.
    if (!existsSync(path)) throw new Error(`폰트가 없다: ${path}`);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html(), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, type: "png" });
  await browser.close();
  console.log(`og:image → ${OUT} (1200×630)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

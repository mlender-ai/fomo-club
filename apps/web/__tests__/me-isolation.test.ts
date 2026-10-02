/**
 * TRADER-03 완료 1 · 2 — **화면만 막고 API 를 열어두지 않는다** · **공개 `/api/lab/*` 에 실계좌가 섞이지 않는다.**
 *
 * 실계좌 데이터는 `MeSnapshot` 표에만 있다. 그래서 "공개 경로가 그 표에 닿을 길이 없다" 를 소스로 확인하고,
 * `/api/me/*` 라우트를 직접 불러 쿠키 없이 401 인지 본다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB = join(__dirname, "..");
const REPO = join(WEB, "..", "..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const PRIVATE_ALLOWED = [/^lib\/me\//, /^app\/api\/me\//, /^app\/\(lab\)\/me\//, /^components\/me\//, /^__tests__\/me-/];

describe("완료 2 — 공개 경로는 실계좌 표에 닿지 않는다", () => {
  const all = files(WEB).filter((f) => !f.includes("node_modules") && !f.includes(".next")).map((f) => relative(WEB, f));

  it("MeSnapshot 을 읽는 곳은 lib/me 뿐", () => {
    const touching = all.filter((f) => /meSnapshot|"MeSnapshot"/.test(readFileSync(join(WEB, f), "utf8")));
    expect(touching.filter((f) => !f.startsWith("lib/me/") && !f.startsWith("__tests__/me-"))).toEqual([]);
  });

  it("공개 API(/api/lab/*) · 공개 화면 · 랩 조립(lib/lab)은 lib/me 를 import 하지 않는다", () => {
    const publicFiles = all.filter((f) => !PRIVATE_ALLOWED.some((re) => re.test(f)));
    const leaking = publicFiles.filter((f) => /from\s+["'][^"']*lib\/me\//.test(readFileSync(join(WEB, f), "utf8")));
    // 헤더의 `나` 탭은 표시용 쿠키만 본다 — lib/me 를 부르지 않는다.
    expect(leaking).toEqual([]);
  });

  it("공개 상태 표시(sync)가 보는 표는 LabSnapshot 이지 MeSnapshot 이 아니다", () => {
    const sync = readFileSync(join(WEB, "lib/lab/sync.ts"), "utf8");
    expect(sync).not.toMatch(/MeSnapshot/);
  });

  it("맥 업로더는 /api/me/ingest 로만 올린다 — /api/lab 으로 보내지 않는다", () => {
    const up = readFileSync(join(REPO, "scripts/trader/me_upload.py"), "utf8");
    const urls = [...up.matchAll(/\{LAB\}(\/api\/[a-z/]+)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls)).toEqual(new Set(["/api/me/ingest"]));
  });

  it("실계좌 경로는 서버 로그에 값을 찍지 않는다(console 없음)", () => {
    const priv = all.filter((f) => /^(lib\/me|app\/api\/me)\//.test(f));
    const logging = priv.filter((f) => /console\.(log|info|warn|error|debug)/.test(readFileSync(join(WEB, f), "utf8")));
    expect(logging).toEqual([]);
  });
});

describe("완료 1 — 쿠키 없으면 API 도 401", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.ME_PASSWORD = "correct horse battery";
    process.env.ME_INGEST_TOKEN = "0123456789abcdef0123";
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.doUnmock("../lib/me/load");
    vi.doUnmock("../lib/me/store");
  });

  it("/api/me/compare · /api/me/rules — 쿠키 없음 · 틀린 쿠키 → 401 · 캐시 금지", async () => {
    vi.doMock("../lib/me/load", () => ({ loadCompare: vi.fn(async () => ({ ok: "secret" })), loadRules: vi.fn(async () => ({ ok: "secret" })), periodOf: () => 30 }));
    const compare = await import("../app/api/me/compare/route");
    const rules = await import("../app/api/me/rules/route");
    for (const get of [compare.GET, rules.GET]) {
      const none = await get(new Request("https://x/api/me/compare"));
      expect(none.status).toBe(401);
      expect(none.headers.get("cache-control")).toContain("no-store");
      expect(JSON.stringify(await none.json())).not.toContain("secret");
      const forged = await get(new Request("https://x/api/me/compare", { headers: { cookie: "fomo_me=v1.99999999999999.forged; fomo_me_ui=1" } }));
      expect(forged.status).toBe(401);
      const uiOnly = await get(new Request("https://x/api/me/compare", { headers: { cookie: "fomo_me_ui=1" } }));
      expect(uiOnly.status).toBe(401); // 표시용 쿠키는 인증이 아니다
    }
  });

  it("맞는 쿠키면 통과한다", async () => {
    vi.doMock("../lib/me/load", () => ({ loadCompare: vi.fn(async () => ({ ok: "secret" })), loadRules: vi.fn(async () => ({ ok: "rules" })), periodOf: () => 30 }));
    const { signSession } = await import("../lib/me/auth");
    const { GET } = await import("../app/api/me/compare/route");
    const res = await GET(new Request("https://x/api/me/compare?days=30", { headers: { cookie: `fomo_me=${signSession(Date.now())}` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("비밀번호가 설정 안 됐으면 로그인 자체가 닫힌다", async () => {
    delete process.env.ME_PASSWORD;
    const { POST } = await import("../app/api/me/login/route");
    const res = await POST(new Request("https://x/api/me/login", { method: "POST", body: JSON.stringify({ password: "x" }) }));
    expect(res.status).toBe(503);
  });

  it("업로드 — 토큰 없음 401 · 랩 토큰 아님 · 모르는 key 400 · 맞으면 쓴다", async () => {
    const writeOne = vi.fn(async () => undefined);
    vi.doMock("../lib/me/store", async (orig) => ({ ...(await orig<typeof import("../lib/me/store")>()), writeOne }));
    process.env.LAB_INGEST_TOKEN = "lab-token-lab-token-lab";
    const { POST } = await import("../app/api/me/ingest/route");
    const body = JSON.stringify({ key: "account", payload: { v: 1 } });
    expect((await POST(new Request("https://x", { method: "POST", body }))).status).toBe(401);
    expect((await POST(new Request("https://x", { method: "POST", body, headers: { authorization: "Bearer lab-token-lab-token-lab" } }))).status).toBe(401);
    const auth = { authorization: "Bearer 0123456789abcdef0123" };
    expect((await POST(new Request("https://x", { method: "POST", body: JSON.stringify({ key: "overview", payload: { v: 1 } }), headers: auth }))).status).toBe(400);
    const ok = await POST(new Request("https://x", { method: "POST", body, headers: auth }));
    expect(ok.status).toBe(200);
    expect(writeOne).toHaveBeenCalledWith("account", { v: 1 });
  });
});

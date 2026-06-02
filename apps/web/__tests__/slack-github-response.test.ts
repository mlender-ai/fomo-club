import { describe, it, expect } from "vitest";
import { parseGitHubResponse } from "@/lib/slack/github";

describe("parseGitHubResponse", () => {
  it("204 No Content → null (workflow dispatch 성공 케이스)", async () => {
    const res = new Response(null, { status: 204 });
    expect(await parseGitHubResponse(res)).toBeNull();
  });

  it("205 → null", async () => {
    const res = new Response(null, { status: 205 });
    expect(await parseGitHubResponse(res)).toBeNull();
  });

  it("200 + 빈 본문 → null (Unexpected end of JSON input 방지)", async () => {
    const res = new Response("", { status: 200 });
    expect(await parseGitHubResponse(res)).toBeNull();
  });

  it("200 + 공백 본문 → null", async () => {
    const res = new Response("   \n  ", { status: 200 });
    expect(await parseGitHubResponse(res)).toBeNull();
  });

  it("200 + 유효 JSON → 파싱된 객체", async () => {
    const res = new Response(JSON.stringify({ number: 291, title: "x" }), { status: 200 });
    expect(await parseGitHubResponse(res)).toEqual({ number: 291, title: "x" });
  });

  it("200 + JSON 배열 → 배열", async () => {
    const res = new Response(JSON.stringify([{ a: 1 }]), { status: 200 });
    expect(await parseGitHubResponse(res)).toEqual([{ a: 1 }]);
  });
});

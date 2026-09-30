/**
 * 이 기계의 이름 — 쓰기 요청마다 `x-lab-writer` 로 싣는다 (OPS-04 PART D). **영문·숫자·`-` 만** — HTTP 머리라 한글이 안 들어간다.
 *
 * 랩(`apps/web/lib/lab/writer.ts`)은 Vercel `LAB_WRITER` 와 같은 이름만 쓰게 한다. 맥은 기본값
 * (호스트 이름)으로 두고, 서버는 `LAB_WRITER_ID=seoul-1` 처럼 정해 둔다.
 */
import { hostname } from "node:os";

export const WRITER_ID = process.env.LAB_WRITER_ID?.trim() || hostname();

/** 쓰기 요청 머리. 토큰과 이름을 같이 싣는다. */
export function writeHeaders(token: string, json = true): Record<string, string> {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    authorization: `Bearer ${token}`,
    "x-lab-writer": WRITER_ID,
  };
}

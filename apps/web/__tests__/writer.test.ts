/**
 * 쓰는 쪽은 하나다 (OPS-04 PART D) — 맥과 서버가 동시에 원장에 쓰지 못하게.
 */
import { afterEach, describe, expect, it } from "vitest";

import { WRITER_HEADER, writerRejection } from "../lib/lab/writer";

const req = (writer?: string) =>
  new Request("https://lab.test/api/lab/fce", {
    method: "POST",
    headers: writer === undefined ? {} : { [WRITER_HEADER]: writer },
  });

afterEach(() => {
  delete process.env.LAB_WRITER;
});

describe("쓰는 쪽", () => {
  it("LAB_WRITER 가 없으면 누구든 쓴다 — 맥 한 대 시절과 같다", () => {
    expect(writerRejection(req())).toBeNull();
    expect(writerRejection(req("any-host"))).toBeNull();
  });

  it("정해진 이름만 쓴다", () => {
    process.env.LAB_WRITER = "seoul-1";
    expect(writerRejection(req("seoul-1"))).toBeNull();
  });

  it("다른 기계는 409 — 누가 쓰는 쪽인지 알려준다", async () => {
    process.env.LAB_WRITER = "seoul-1";
    const res = writerRejection(req("cocteau-mac"));
    expect(res?.status).toBe(409);
    expect(await res?.json()).toEqual({ error: "not_primary_writer", primary: "seoul-1", got: "cocteau-mac" });
  });

  it("이름 없이 오면(옛 러너) 막는다", () => {
    process.env.LAB_WRITER = "seoul-1";
    expect(writerRejection(req())?.status).toBe(409);
  });
});

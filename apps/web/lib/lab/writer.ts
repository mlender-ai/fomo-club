/**
 * 쓰는 쪽은 하나다 (OPS-04 PART D).
 *
 * > **맥과 서버가 동시에 업로드하지 않는다.** 겹치면 원장이 오염된다.
 *
 * 러너가 올리는 모든 쓰기 요청은 `x-lab-writer` 머리에 자기 이름(`LAB_WRITER_ID`)을 싣는다.
 * Vercel 환경변수 `LAB_WRITER` 가 있으면 **그 이름만** 쓸 수 있고, 다른 쪽은 `409` 를 받는다.
 *
 * | `LAB_WRITER` | 동작 |
 * |---|---|
 * | 없음 | 누구든 쓴다 — 맥 한 대로 돌던 지금까지와 같다 |
 * | `mac` | 맥만 · 그림자 기간 |
 * | `seoul-1` | 서버만 · 운영 전환 뒤. 맥 러너가 실수로 살아나도 원장에 못 쓴다 |
 *
 * 전환은 **Vercel 값 하나를 바꾸는 것**이다 — 두 기계의 설정을 동시에 맞출 필요가 없다.
 * 그림자 서버는 애초에 올리지 않는다(`scripts/ops/server/` — 로컬 기록만). 이 문은 그게 실수로 뚫렸을 때를 막는다.
 */
import { NextResponse } from "next/server";

export const WRITER_HEADER = "x-lab-writer";

/** 이 요청이 쓸 수 있으면 `null`, 아니면 돌려줄 응답. 토큰 검사 **뒤에** 부른다. */
export function writerRejection(request: Request): NextResponse | null {
  const primary = process.env.LAB_WRITER?.trim();
  if (!primary) return null;
  const got = request.headers.get(WRITER_HEADER)?.trim() ?? "";
  if (got === primary) return null;
  return NextResponse.json(
    {
      error: "not_primary_writer",
      // 누가 쓰는 쪽인지는 알려준다 — 받은 쪽이 "나는 멈춰야 한다" 를 로그에 남길 수 있게.
      primary,
      got: got || null,
    },
    { status: 409 }
  );
}

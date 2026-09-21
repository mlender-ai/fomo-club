/**
 * 헤더에 다는 한 줄.
 *
 * ## LAB-BRIDGE 로 기준이 바뀌었다
 *
 * 전에는 랩 자체 페이퍼 실행기의 마지막 봉을 봤다. 이제 랩은 엔진이 아니고
 * **FCE 를 비추는 창구**라, 헤더가 말해야 하는 것은 "랩이 FCE 를 언제 읽었나" 다.
 *
 * 그래서 `FceUpload` 를 본다 — 업로더가 이 맥에서 돌지 않으면 화면 전체가
 * 과거를 보여주고 있는 것이고, **그 사실이 어느 탭에서든 보여야 한다.**
 */
import { prisma } from "../prisma";

/** 업로더 주기가 15분이라 두 번 거른 값. `fce-board.ts` 와 같은 상수를 쓴다. */
const STALE_MS = 35 * 60 * 1000;

export interface PaperPulse {
  running: boolean;
  /** 헤더에 그대로 나가는 짧은 말. */
  label: string;
  /** 마우스를 올렸을 때 나오는 자세한 말. */
  detail: string;
  lastBarAt: Date | null;
}

function ageText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / (60 * 24))}일 전`;
}

export async function readPaperPulse(now: Date = new Date()): Promise<PaperPulse> {
  const last = await prisma.fceUpload.findFirst({
    where: { ok: true },
    orderBy: { at: "desc" },
    select: { at: true },
  });

  if (!last) {
    return {
      running: false,
      label: "FCE 미연결",
      detail: "FCE 스냅샷이 한 번도 올라오지 않았다 — npm run lab:fce-upload",
      lastBarAt: null,
    };
  }

  const age = now.getTime() - last.at.getTime();
  const stamp = last.at.toISOString().slice(0, 16).replace("T", " ");
  if (age > STALE_MS) {
    return {
      running: false,
      label: "FCE 끊김",
      detail: `마지막 스냅샷 ${stamp} — ${ageText(age)}째 안 들어온다`,
      lastBarAt: last.at,
    };
  }
  return {
    running: true,
    label: `FCE ${ageText(age)}`,
    detail: `마지막 스냅샷 ${stamp}`,
    lastBarAt: last.at,
  };
}

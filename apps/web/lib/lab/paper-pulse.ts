/**
 * LAB-FIX2 PART E-3 — 헤더에 다는 페이퍼 한 줄.
 *
 * **"운용중" 을 전략 상태로 판단하지 않는다.** `Strategy.status = RUNNING` 은
 * 사람이 끄지 않았다는 뜻일 뿐, 실행기가 실제로 돌고 있다는 뜻이 아니다.
 * 크론이 멈춰도 상태는 계속 RUNNING 이다 — 그게 이 배치 직전에 실제로 일어난 일이다.
 *
 * 그래서 **마지막으로 처리한 봉 시각**으로 판정한다. 그건 실행기가 실제로 돈 흔적이다.
 */
import { prisma } from "../prisma";

/** 이 시간 넘게 새 봉을 못 받았으면 멈춘 것으로 본다. 봉이 1시간이라 두 배다. */
const STALE_MS = 2 * 60 * 60 * 1000;

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
  if (minutes < 60) return `${minutes}분`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간`;
  return `${Math.floor(minutes / (60 * 24))}일`;
}

export async function readPaperPulse(now: Date = new Date()): Promise<PaperPulse> {
  const runs = await prisma.run.findMany({
    where: { kind: "PAPER" },
    select: { paper: { select: { lastBarAt: true } } },
  });

  if (runs.length === 0) {
    return {
      running: false,
      label: "페이퍼 없음",
      detail: "페이퍼 Run 이 아직 만들어지지 않았다",
      lastBarAt: null,
    };
  }

  const lastBarAt = runs.reduce<Date | null>((latest, run) => {
    const at = run.paper?.lastBarAt ?? null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);

  if (!lastBarAt) {
    return {
      running: false,
      label: "페이퍼 정지",
      detail: "실행기가 아직 봉을 한 번도 처리하지 않았다",
      lastBarAt: null,
    };
  }

  const age = now.getTime() - lastBarAt.getTime();
  const stamp = lastBarAt.toISOString().slice(0, 16).replace("T", " ");
  if (age > STALE_MS) {
    return {
      running: false,
      label: "페이퍼 정지",
      detail: `마지막 처리 봉 ${stamp} — ${ageText(age)}째 멈춰 있다`,
      lastBarAt,
    };
  }
  return {
    running: true,
    label: "페이퍼 운용중",
    detail: `마지막 처리 봉 ${stamp}`,
    lastBarAt,
  };
}

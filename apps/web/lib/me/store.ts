/**
 * TRADER-03 — 비공개 저장소(`MeSnapshot`). **`lib/me` · `app/api/me` · `app/me` 만 이 파일을 쓴다**
 * (`__tests__/me-isolation.test.ts` 가 지킨다).
 *
 * 값을 로그에 찍지 않는다 — 실계좌 손익 · 잔고가 서버 로그에 남으면 그것도 공개다(지시서 F).
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import type { LockBook } from "./auth";

export type MeKey = "account" | "replica" | "rules" | "auth";
export const INGEST_KEYS = ["account", "replica", "rules"] as const;

/** 표가 아직 없다(마이그레이션 전). 화면은 '준비 중' 을 그린다 — 터지지 않는다. */
export class MeStoreMissing extends Error {}

function missingTable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022");
}

export async function readMany(keys: MeKey[]): Promise<Partial<Record<MeKey, unknown>>> {
  try {
    const rows = await prisma.meSnapshot.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.payload]));
  } catch (err) {
    if (missingTable(err)) throw new MeStoreMissing("MeSnapshot 표가 없다 — 마이그레이션 20261002000000_trader03_me 적용 전");
    throw err;
  }
}

export async function writeOne(key: MeKey, payload: unknown): Promise<void> {
  try {
    await prisma.meSnapshot.upsert({
      where: { key },
      create: { key, payload: payload as Prisma.InputJsonValue },
      update: { payload: payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (missingTable(err)) throw new MeStoreMissing("MeSnapshot 표가 없다");
    throw err;
  }
}

export async function readLocks(): Promise<LockBook> {
  try {
    return ((await readMany(["auth"])).auth as LockBook | undefined) ?? {};
  } catch (err) {
    if (err instanceof MeStoreMissing) return {};
    throw err;
  }
}

export async function writeLocks(book: LockBook): Promise<void> {
  try {
    await writeOne("auth", book);
  } catch (err) {
    // 표가 없으면 잠금을 못 센다 — 그때는 로그인도 열지 않는다(login 라우트가 503).
    if (!(err instanceof MeStoreMissing)) throw err;
  }
}

import type { KeywordCard, KeywordConfidence } from "@fomo/core";
import { prisma } from "./prisma";

/**
 * KeywordCardSnapshot 읽기/쓰기. KEYWORD_ENGINE_SPEC §4.5 / Phase 4.
 *
 * 라우트(읽기)와 cron 스크립트(쓰기)가 공유. cards 는 KeywordCard[] 를 Json 으로 저장.
 *
 * db push 게이트: 테이블이 아직 prod 에 없을 수 있다(운영 규약 — DDL 직접 승인).
 *   그 동안에도 라우트가 죽지 않게, 읽기는 실패하면 null 을 돌려 라이브로 폴백한다.
 */

export interface KeywordSnapshot {
  date: string;
  cards: readonly KeywordCard[];
  confidence: KeywordConfidence;
}

/** 오늘(KST) 스냅샷. 없거나 테이블 미생성(db push 전)이면 null → 라우트가 라이브로 폴백. */
export async function readKeywordSnapshot(date: string): Promise<KeywordSnapshot | null> {
  try {
    const row = await prisma.keywordCardSnapshot.findUnique({ where: { date } });
    if (!row) return null;
    return {
      date: row.date,
      cards: row.cards as unknown as KeywordCard[],
      confidence: row.confidence as KeywordConfidence,
    };
  } catch (err) {
    // 테이블 미생성(P2021) 등 — 조용히 라이브 폴백. 빈 화면 금지.
    console.warn("[keyword-snapshot] read skipped (table missing?)", (err as Error)?.message);
    return null;
  }
}

/** 가장 최근(KST date 이하) 스냅샷. 오늘 스냅샷이 없어도 유저 요청에서 라이브 산출로 빠지지 않게 한다. */
export async function readLatestKeywordSnapshot(date: string): Promise<KeywordSnapshot | null> {
  try {
    const row = await prisma.keywordCardSnapshot.findFirst({
      where: { date: { lte: date } },
      orderBy: { date: "desc" },
    });
    if (!row) return null;
    return {
      date: row.date,
      cards: row.cards as unknown as KeywordCard[],
      confidence: row.confidence as KeywordConfidence,
    };
  } catch (err) {
    console.warn("[keyword-snapshot] latest read skipped (table missing?)", (err as Error)?.message);
    return null;
  }
}

/** 스냅샷 upsert(날짜 unique). cron 전용. 실패 시 throw — 스크립트가 비정상 종료로 가시화. */
export async function writeKeywordSnapshot(
  date: string,
  snapshot: Omit<KeywordSnapshot, "date">
): Promise<void> {
  await prisma.keywordCardSnapshot.upsert({
    where: { date },
    create: {
      date,
      cards: snapshot.cards as unknown as object,
      confidence: snapshot.confidence,
    },
    update: {
      cards: snapshot.cards as unknown as object,
      confidence: snapshot.confidence,
    },
  });
}

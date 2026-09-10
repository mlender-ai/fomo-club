/**
 * 키워드 카드 일일 스냅샷 생성. KEYWORD_ENGINE_SPEC §4.8 / Phase 4.
 *
 * 라우트와 동일한 공유 파이프라인(computeKeywordCards)으로 산출 → KeywordCardSnapshot upsert.
 * cron(keyword-cards-pipeline.yml)이 하루 1~3회 실행 → 사용자 접속 없이도 매일 스냅샷이 채워진다.
 *
 * DATABASE_URL 없으면 계산만 하고 로그(드라이런). 절대 에러로 죽지 않는다(라이브 산출까지는).
 * 저장 단계 실패만 비정상 종료로 가시화(정직한 숫자: 스냅샷 누락을 숨기지 않음).
 *
 * 환경변수: DATABASE_URL(저장), AI_API_URL/KEY/MODEL/TEMPERATURE(코멘트 LLM — 미설정 시 룰 폴백).
 */
import { writeFileSync } from "node:fs";
import { computeKeywordCards } from "../apps/web/lib/keyword-pipeline";
import { writeKeywordSnapshot } from "../apps/web/lib/keyword-snapshot";
import { kstDate } from "../apps/web/lib/fomo";

async function main() {
  const date = kstDate();

  const { cards, confidence } = await computeKeywordCards();
  console.log(`[keywords:generate] ${date} — ${cards.length}개 카드, confidence=${confidence}`);
  for (const c of cards) {
    console.log(`  ${c.emoji} ${c.keyword} (${c.fomoScore})`);
  }

  // 운영 관측용 건강 리포트(워크플로 Slack 알림이 읽음).
  writeFileSync(
    "keyword-cards-health.json",
    JSON.stringify({ date, count: cards.length, confidence }, null, 2)
  );

  if (!process.env.DATABASE_URL) {
    console.log("[keywords:generate] DATABASE_URL 없음 — 드라이런(저장 안 함).");
    return;
  }

  // db push 게이트: 테이블이 아직 없으면 여기서 throw → 워크플로 실패로 가시화(누락을 숨기지 않음).
  await writeKeywordSnapshot(date, { cards, confidence });
  console.log(`[keywords:generate] 스냅샷 저장 완료: ${date}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[keywords:generate] 실패", err);
    process.exit(1);
  });

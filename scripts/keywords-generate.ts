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

  // 정직한 숫자: confidence="fallback" = 실 키워드 0건 → mock 카드다(KEYWORD_ENGINE_SPEC §5).
  // 이걸 오늘 스냅샷으로 저장하면 (a) 마지막 정상 스냅샷을 mock 으로 덮어써 사용자가 보는 카드 신뢰도가 떨어지고,
  // (b) 라우트 path 1 이 이 mock 을 stale=false 로 서빙해 "오늘 신선한 데이터"로 위장된다.
  // → 저장을 건너뛰고 비정상 종료로 가시화한다. API 는 readLatestKeywordSnapshot(path 2)로
  //   마지막 정상 스냅샷을 stale=true 로 계속 서빙하고, 파이프라인은 빨간불 + Slack 실패 알림으로 원인(수집 저하)을 노출한다.
  if (confidence === "fallback") {
    throw new Error(
      `confidence=fallback (실 키워드 0건) — 스냅샷 저장 건너뜀(마지막 정상 스냅샷 보존). 수집 소스 점검 필요.`
    );
  }

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

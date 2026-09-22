-- 화면 조립본. 표 하나만 만든다 — DROP 이 없다.
--
-- 원격 DB 왕복 한 번이 ~900ms 라서(정규 도메인 실측: 쿼리 2개 1,793ms · 1개 904ms)
-- 쿼리 수가 곧 응답 시간이다. API 하나가 쿼리 하나가 되게 만들려고 조립본을 둔다.

CREATE TABLE "LabSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSnapshot_pkey" PRIMARY KEY ("key")
);

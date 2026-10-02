-- TRADER-03 — 광혁 실계좌 비교(로그인 뒤). 표 하나 추가만 한다(DROP 없음).
CREATE TABLE "MeSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeSnapshot_pkey" PRIMARY KEY ("key")
);

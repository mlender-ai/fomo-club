-- UI-04 C-2 — FCE 가 관측 부족으로 판정한 날. 표 하나만 만든다 — DROP 이 없다.
--
-- 자본 곡선의 평평한 구간에는 "아무 일도 없었다" 와 "안 보고 있었다" 가 섞여 있다.
-- 크립토는 78일 중 49일이 관측 임계 90% 에 못 미쳤다. 차트가 그 구간을 회색으로 칠한다.

CREATE TABLE "FceLostDay" (
    "trackKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "coveragePct" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "FceLostDay_pkey" PRIMARY KEY ("trackKey","day")
);

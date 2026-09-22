-- 유효일. 칸 두 개를 더한다 — DROP 이 없다.
--
-- 호스트가 자면 그 하루는 검증에 안 들어간다. 달력으로 48일이 지났어도 유효일이
-- 3일이면 표본은 3일치다. 이걸 안 적으면 화면이 두 달치 성과처럼 보인다.
--
-- NULL 을 허용한다. FCE 가 크립토·고래·폴리마켓 트랙에는 이 값을 내지 않는다 —
-- 0 으로 채우면 "전부 유실" 로 읽힌다.

ALTER TABLE "FceTrack" ADD COLUMN "elapsedDays" INTEGER;
ALTER TABLE "FceTrack" ADD COLUMN "calendarDays" INTEGER;

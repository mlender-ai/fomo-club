-- OPS-03 A-2 — 맥 밖에서 5분마다 감시한다.
--
-- Vercel 은 Hobby 라 크론이 하루 1회뿐이고, GitHub Actions 의 */5 스케줄은 실측 몇 시간씩 건너뛴다
-- (lab-collect: 15:56 → 15:14 → 12:47 → 07:37). 그래서 DB(Supabase)의 pg_cron 이 랩 엔드포인트를 부른다.
-- 엔드포인트는 멱등이다 — 상태 전이로만 알림을 보내고, 아침 리포트는 하루 한 번만 보낸다.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('lab-watch', 'lab-morning');

SELECT cron.schedule(
  'lab-watch',
  '*/5 * * * *',
  $$SELECT net.http_get(url := 'https://fomo-web-mlender-ais-projects.vercel.app/api/lab/cron/watch', timeout_milliseconds := 55000)$$
);

-- 07:30 KST = 22:30 UTC
SELECT cron.schedule(
  'lab-morning',
  '30 22 * * *',
  $$SELECT net.http_get(url := 'https://fomo-web-mlender-ais-projects.vercel.app/api/lab/cron/morning', timeout_milliseconds := 55000)$$
);

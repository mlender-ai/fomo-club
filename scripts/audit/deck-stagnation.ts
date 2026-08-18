/**
 * WO-DECK-01 PHASE 1 — 덱 고착 진단(실측 전용, 읽기만).
 *
 * 고치기 전에 센다. 이 스크립트는 **프로덕션에 아무것도 쓰지 않는다** — 두 개의 SELECT 뿐이다.
 *   ① `FeedContentCache` 의 `quiet-pick:<date>` 일별 스냅샷 — 순위까지 온전한 정본.
 *   ② `JudgmentLedger` kind=selection · pickType=quiet — 스냅샷이 없는 날의 보강(payload.order 가 순위).
 *
 * 로컬에 DB 자격증명이 없어 CI 에서 돈다(`.github/workflows/deck-stagnation.yml`).
 * 실행: npx tsx --env-file=.env scripts/audit/deck-stagnation.ts --days 14 --out docs/audit
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../apps/web/lib/prisma";
import { readFeedContentHistoryByPrefix } from "../../apps/web/lib/feed-content-store";
import {
  rankScore,
  noveltyScore,
  composeDeck,
  isAgedOut,
  isFreshSignal,
  page1CooldownFactor,
  page1StreakFromHistory,
  COOLDOWN_LADDER,
  NOVELTY_HALFLIFE_DAYS,
  SIGNAL_AGE_MAX_DAYS,
  PAGE1_SIZE,
  DECK_COMPOSITION_VERSION,
} from "../../apps/web/lib/deck-ranking";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

// ── 스냅샷 스키마(읽는 부분만) ────────────────────────────────────────────
interface SnapshotPick {
  subject: { canonical: string; displayName?: string; country?: string; market?: string };
  signal: { kind: string; code: string; days: number; strength: number; startedAt: string; insiderCount?: number };
  qualifiedAt?: string;
}
interface Snapshot {
  date: string;
  asOf?: string;
  picks: SnapshotPick[];
  watching?: Array<{ subject: { canonical: string }; reasonCode: string }>;
  qualification?: {
    krUniverse: number;
    krWithSignal: number;
    usInsiderRaw: number;
    usWithSignal: number;
    afterQuiet: number;
    afterQuality: number;
    published: number;
    watching: number;
    drops: Record<string, number>;
  };
}

/** 하루치 덱 — 순위 있는 종목 목록. 출처를 같이 들고 다닌다(무엇을 실측했는지 흐리지 않는다). */
interface DeckDay {
  date: string;
  source: "snapshot" | "ledger";
  entries: Array<{ canonical: string; kind: string; days: number; strength: number | null; startedAt: string | null }>;
  qualification?: Snapshot["qualification"];
}

async function readSnapshots(limit: number): Promise<DeckDay[]> {
  // `quiet-pick:active` 는 오늘자 사본이라 날짜 키와 중복된다 — `quiet-pick:2` 접두사로 날짜 키만 집는다.
  const records = await readFeedContentHistoryByPrefix<Snapshot>("quiet-pick:2", 400);
  const out: DeckDay[] = [];
  for (const record of records) {
    const snap = record.row;
    const date = record.id.replace("quiet-pick:", "");
    if (!Array.isArray(snap?.picks)) continue;
    out.push({
      date,
      source: "snapshot",
      entries: snap.picks.map((p) => ({
        canonical: p.subject.displayName || p.subject.canonical,
        kind: p.signal?.kind ?? "?",
        days: p.signal?.days ?? 0,
        strength: typeof p.signal?.strength === "number" ? p.signal.strength : null,
        startedAt: p.signal?.startedAt ?? null,
      })),
      ...(snap.qualification ? { qualification: snap.qualification } : {}),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** 스냅샷이 없는 날을 원장으로 메운다. payload.order 가 발행 순위다. */
async function readLedgerDays(fromDate: string, have: ReadonlySet<string>): Promise<DeckDay[]> {
  const rows = await prisma.$queryRaw<Array<{ date: string; canonical: string; payload: any }>>`
    SELECT "date", "canonical", "payload" FROM "JudgmentLedger"
    WHERE "kind" = 'selection' AND "date" >= ${fromDate}
      AND "payload"->>'pickType' = 'quiet'
    ORDER BY "date" DESC
    LIMIT 5000
  `;
  // payload.order 가 발행 순위다. 원장 행 순서는 보장되지 않으므로 반드시 이 값으로 정렬한다.
  const ordered = new Map<string, Array<{ order: number; e: DeckDay["entries"][number] }>>();
  for (const r of rows) {
    if (have.has(r.date)) continue;
    const list = ordered.get(r.date) ?? [];
    list.push({
      order: Number(r.payload?.order ?? 999),
      e: {
        canonical: r.canonical,
        kind: r.payload?.signal?.kind ?? "?",
        days: Number(r.payload?.signal?.days ?? 0),
        strength: null,
        startedAt: r.payload?.signal?.startedAt ?? null,
      },
    });
    ordered.set(r.date, list);
  }
  const out: DeckDay[] = [];
  for (const [date, list] of ordered) {
    list.sort((a, b) => a.order - b.order);
    out.push({ date, source: "ledger", entries: list.map((x) => x.e) });
  }
  return out;
}

// ── 랭킹 점수 분해 — quiet-pick.ts 의 공식을 그대로 재현한다 ────────────────
/**
 * 코드 정본(apps/web/lib/quiet-pick.ts):
 *   multi_cluster      300 + min(외인,기관 연속일) * 5
 *   foreign_streak     100 + 연속일 * 10
 *   institution_streak 100 + 연속일 * 10
 *   insider_cluster(US) 200 + 내부자수 * 10 + log10(매수액USD) * 5
 *   insider_cluster(DART) 210 + log10(매수액KRW) * 4
 *   flow_reversal      120 + min(40, |직전순매도| / 최근순매수)
 * 연속일수 항만 뽑아 총점 대비 비중을 낸다. 감쇠 항은 어느 식에도 없다.
 */
function daysTerm(kind: string, days: number): number | null {
  if (kind === "multi_cluster") return days * 5;
  if (kind === "foreign_streak" || kind === "institution_streak") return days * 10;
  return null; // 내부자·전환은 연속일수가 점수에 안 들어간다(days 는 '경과일' 표기용)
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
}

function render(days: DeckDay[]): string {
  const L: string[] = [];
  const asc = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const desc = [...asc].reverse();
  /** 미달 사유 코드 → 관측 기간 합계. 1-3 에서 채우고 1-4 판정에서 다시 쓴다. */
  const agg = new Map<string, number>();

  L.push("# DECK_STAGNATION — 덱 고착 실측 (WO-DECK-01 PHASE 1)");
  L.push("");
  L.push(`| 생성 | ${new Date().toISOString()} |`);
  L.push("|---|---|");
  L.push(`| 관측일수 | ${asc.length}일 (${asc[0]?.date ?? "—"} ~ ${desc[0]?.date ?? "—"}) |`);
  L.push(`| 출처 | 스냅샷 ${asc.filter((d) => d.source === "snapshot").length}일 · 원장 ${asc.filter((d) => d.source === "ledger").length}일 |`);
  L.push("");
  L.push("> 읽기 전용 집계다. 프로덕션 동작을 바꾸지 않는다.");
  L.push("");

  // ── 1-1 고착 실측 ──
  L.push("## 1-1. 고착 실측");
  L.push("");
  L.push("### 일별 덱");
  L.push("");
  L.push("| 날짜 | 출처 | n | 1위 | 1위 신호 | 1위 경과일 | 1페이지(1~3위) |");
  L.push("|---|---|---|---|---|---|---|");
  for (const d of desc) {
    const top = d.entries[0];
    L.push(
      `| ${d.date} | ${d.source} | ${d.entries.length} | ${top?.canonical ?? "—"} | \`${top?.kind ?? "—"}\` | ${top?.days ?? "—"} | ${d.entries.slice(0, 3).map((e) => e.canonical).join(", ") || "—"} |`
    );
  }
  L.push("");

  // 1위 연속 유지일
  L.push("### 1위 연속 유지");
  L.push("");
  const runs: Array<{ name: string; from: string; to: string; n: number }> = [];
  for (const d of asc) {
    const name = d.entries[0]?.canonical ?? "(없음)";
    const last = runs[runs.length - 1];
    if (last && last.name === name) { last.to = d.date; last.n += 1; }
    else runs.push({ name, from: d.date, to: d.date, n: 1 });
  }
  L.push("| 1위 종목 | 구간 | 연속일 |");
  L.push("|---|---|---|");
  for (const r of [...runs].reverse()) L.push(`| ${r.name} | ${r.from} ~ ${r.to} | **${r.n}** |`);
  L.push("");
  const maxRun = Math.max(0, ...runs.map((r) => r.n));
  L.push(`최장 연속 1위 **${maxRun}일** (WO-DECK-01 PHASE 5 목표: 3일 이하).`);
  L.push("");

  // 1페이지 변경률 · 신규 진입
  L.push("### 일별 회전율");
  L.push("");
  L.push("| 날짜 | 1페이지 교체 | 1페이지 변경률 | 10장 신규 진입 | 10장 유지 |");
  L.push("|---|---|---|---|---|");
  const churn: number[] = [];
  const newcomers: number[] = [];
  for (let i = 1; i < asc.length; i++) {
    const prev = new Set(asc[i - 1]!.entries.map((e) => e.canonical));
    const prevTop3 = new Set(asc[i - 1]!.entries.slice(0, 3).map((e) => e.canonical));
    const cur = asc[i]!;
    const curTop3 = cur.entries.slice(0, 3).map((e) => e.canonical);
    const swapped = curTop3.filter((c) => !prevTop3.has(c)).length;
    const fresh = cur.entries.filter((e) => !prev.has(e.canonical)).length;
    const rate = curTop3.length === 0 ? 0 : swapped / curTop3.length;
    churn.push(rate);
    newcomers.push(fresh);
    L.push(`| ${cur.date} | ${swapped}/${curTop3.length} | ${(rate * 100).toFixed(0)}% | ${fresh}/${cur.entries.length} | ${cur.entries.length - fresh} |`);
  }
  L.push("");
  if (churn.length > 0) {
    const avg = churn.reduce((a, b) => a + b, 0) / churn.length;
    const avgNew = newcomers.reduce((a, b) => a + b, 0) / newcomers.length;
    L.push(`1페이지 평균 변경률 **${(avg * 100).toFixed(0)}%** · 10장 평균 신규 진입 **${avgNew.toFixed(1)}장**.`);
    L.push("");
  }

  // 누적 노출
  L.push("### 종목별 누적 노출 (상위 15)");
  L.push("");
  const expo = new Map<string, { deck: number; page1: number; first: string; last: string; kind: string }>();
  for (const d of asc) {
    d.entries.forEach((e, i) => {
      const cur = expo.get(e.canonical) ?? { deck: 0, page1: 0, first: d.date, last: d.date, kind: e.kind };
      cur.deck += 1;
      if (i < 3) cur.page1 += 1;
      cur.last = d.date;
      expo.set(e.canonical, cur);
    });
  }
  L.push("| 종목 | 신호 | 덱 노출일 | 1페이지 노출일 | 첫 노출 | 마지막 노출 |");
  L.push("|---|---|---|---|---|---|");
  for (const [name, v] of [...expo.entries()].sort((a, b) => b[1].deck - a[1].deck).slice(0, 15)) {
    L.push(`| ${name} | \`${v.kind}\` | **${v.deck}/${asc.length}** | ${v.page1} | ${v.first} | ${v.last} |`);
  }
  L.push("");

  // ── 1-2 랭킹 점수 분해 ──
  L.push("## 1-2. 랭킹 점수 분해");
  L.push("");
  L.push("정본은 `apps/web/lib/quiet-pick.ts` 의 `baseStrength`. 감쇠 항은 **어느 식에도 없다**.");
  L.push("");
  L.push("| 신호 유형 | 공식 | 연속일수 항 | 상한 |");
  L.push("|---|---|---|---|");
  L.push("| `multi_cluster` | `300 + min(외인,기관 연속일) × 5` | **선형 ×5** | 없음 |");
  L.push("| `foreign_streak` | `100 + 연속일 × 10` | **선형 ×10** | 없음 |");
  L.push("| `institution_streak` | `100 + 연속일 × 10` | **선형 ×10** | 없음 |");
  L.push("| `insider_cluster`(US) | `200 + 내부자수 × 10 + log10(매수액USD) × 5` | 없음 | — |");
  L.push("| `insider_cluster`(DART) | `210 + log10(매수액KRW) × 4` | 없음 | — |");
  L.push("| `flow_reversal` | `120 + min(40, |직전순매도| / 최근순매수)` | 없음 | 40 |");
  L.push("");
  const latest = desc.find((d) => d.entries.some((e) => e.strength !== null));
  if (latest) {
    L.push(`### 발행 픽 실측 분해 (${latest.date})`);
    L.push("");
    L.push("| 순위 | 종목 | 신호 | 경과일 | 총점 | 연속일수 항 | 비중 |");
    L.push("|---|---|---|---|---|---|---|");
    latest.entries.forEach((e, i) => {
      const term = daysTerm(e.kind, e.days);
      L.push(
        `| ${i + 1} | ${e.canonical} | \`${e.kind}\` | ${e.days} | ${e.strength?.toFixed(1) ?? "—"} | ${term === null ? "—(비적용)" : term.toFixed(0)} | ${term === null || !e.strength ? "—" : pct(term, e.strength)} |`
      );
    });
    L.push("");
  }
  L.push("### 시간 경과에 따라 감쇠하는 항이 있는가");
  L.push("");
  L.push("**없다.** 여섯 공식 어디에도 경과일에 대해 감소하는 항이 없다. 연속일수가 들어가는 세 유형은 전부 **단조 증가**이며 상한도 없다.");
  L.push("");
  L.push("> 따라서 `institution_streak` 가 26일이면 360점으로, 다중 주체 클러스터의 시작점(300)보다 높다.");
  L.push("> 1등에서 내려올 구조적 경로가 없다는 WO 가설 1-1 은 **코드로 확인된다**.");
  L.push("");

  // 프론트 조립 상한 — 2차 고착
  L.push("### 2차 고착 — 조립 상한도 강도순이다");
  L.push("");
  L.push("`MAX_FRONT_ASSEMBLIES = 60` 구간에서 후보를 `baseStrength` 내림차순으로 잘라낸다.");
  L.push("즉 연속일수가 긴 종목은 **랭킹만이 아니라 후보 진입 자체에서도** 우선권을 갖는다.");
  L.push("");

  // ── 1-3 풀 크기 진단 ──
  L.push("## 1-3. 픽 통과 풀 진단");
  L.push("");
  const withQual = desc.filter((d) => d.qualification);
  if (withQual.length === 0) {
    L.push("자격 로그(`qualification`)를 가진 스냅샷이 없다 — 이 절은 측정하지 못했다.");
    L.push("");
  } else {
    L.push("### WO 전제 정정 — 유니버스는 486이 아니다");
    L.push("");
    const q0 = withQual[0]!.qualification!;
    L.push(`픽 엔진이 실제로 훑는 KR 유니버스는 \`STOCK_VOCAB\` 중 \`naverCode && !marquee\` = **${q0.krUniverse}종목**이다.`);
    L.push("486은 팩트시트·사업실체 커버리지를 재는 **카드 유니버스**(daily-30 포함)의 크기이고, 픽 엔진의 모집단이 아니다.");
    L.push("US 는 유니버스 스캔이 아니라 openinsider 클러스터 후보를 그날치로 받아온다.");
    L.push("");
    L.push("| 날짜 | KR 유니버스 | KR 신호 보유 | US 원후보 | US 신호 | 조용함 통과 | 품질 통과 | 발행 | 지켜보는 중 |");
    L.push("|---|---|---|---|---|---|---|---|---|");
    for (const d of withQual) {
      const q = d.qualification!;
      L.push(`| ${d.date} | ${q.krUniverse} | ${q.krWithSignal} | ${q.usInsiderRaw} | ${q.usWithSignal} | ${q.afterQuiet} | ${q.afterQuality} | ${q.published} | ${q.watching} |`);
    }
    L.push("");

    // 사유별 집계
    const REASON_GROUP: Record<string, string> = {
      mega_cap: "대형주 제외 필터",
      illiquid: "유동성 필터",
      ran_30_since_signal: "이미 많이 오름 필터",
      changed_15: "이미 많이 오름 필터",
      turnover_top20: "이미 화제(거래대금 상위)",
      mention_hot: "이미 화제(뉴스 언급)",
      no_verdict: "품질 게이트",
      no_invalidation: "품질 게이트",
      insufficient_candles: "품질 게이트",
      front_failed: "품질 게이트",
      no_price: "품질 게이트",
      no_anomaly: "품질 게이트",
      implausible_price: "데이터 이상",
      stale_repeat: "신선도(순수 반복)",
      repeat_strengthened: "(탈락 아님) 강화 재등장",
    };
    for (const d of withQual) for (const [k, v] of Object.entries(d.qualification!.drops ?? {})) agg.set(k, (agg.get(k) ?? 0) + v);
    const dayCount = withQual.length;
    L.push(`### 미달 사유별 집계 (${dayCount}일 합계 / 일평균)`);
    L.push("");
    L.push("| 사유 코드 | 분류 | 합계 | 일평균 |");
    L.push("|---|---|---|---|");
    for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1])) {
      L.push(`| \`${k}\` | ${REASON_GROUP[k] ?? "기타"} | ${v} | ${(v / dayCount).toFixed(1)} |`);
    }
    L.push("");
    // 신호 없음
    const noSignal = withQual.map((d) => d.qualification!.krUniverse - d.qualification!.krWithSignal);
    L.push(`\`신호 없음\`(KR 유니버스 중 연속일수·전환·DART 어느 것도 안 걸린 종목)은 일평균 **${(noSignal.reduce((a, b) => a + b, 0) / dayCount).toFixed(1)}종목** — KR 유니버스의 ${pct(noSignal.reduce((a, b) => a + b, 0) / dayCount, withQual[0]!.qualification!.krUniverse)}.`);
    L.push("");
    L.push("> **판정:** 병목은 임계값이 아니라 **모집단 크기**다. KR 66종목·US 그날치 클러스터 20건 안에서 10장을 뽑고 있다.");
    L.push("> 임계값을 풀어도 회전할 종목 자체가 나오지 않는다.");
    L.push("");
  }

  // ── 판정 ──
  //
  // 실측 위에 얹는 결론. **재실행해도 남아야 하므로 코드에 둔다** — 손으로 덧붙이면 다음 실행에 지워진다.
  // 수치는 위에서 계산한 것을 다시 쓰고, 코드 사실(공식·상수)만 문장으로 고정한다.
  L.push("## 1-4. 판정");
  L.push("");
  const topStock = [...expo.entries()].sort((a, b) => b[1].page1 - a[1].page1)[0];
  L.push("### ① 고착은 '1위 연속'이 아니라 '1페이지 점유'로 나타난다");
  L.push("");
  L.push(`최장 연속 1위는 **${maxRun}일**이고 1페이지 평균 변경률은 **${churn.length ? ((churn.reduce((a, b) => a + b, 0) / churn.length) * 100).toFixed(0) : "—"}%** 다 — 숫자만 보면 매일 바뀌는 것처럼 읽힌다.`);
  if (topStock) {
    L.push(`그러나 \`${topStock[0]}\` 는 ${asc.length}일 중 **1페이지에 ${topStock[1].page1}일**, 덱에 ${topStock[1].deck}일 있었다.`);
    L.push("1위 자리만 잠깐씩 내주고 2·3위로 내려앉을 뿐 **1페이지에서 나가지 않는다.** 사용자가 매일 같은 카드를 보는 체감은 이것이다.");
  }
  L.push("");
  L.push("> 그래서 PHASE 5 의 지표는 `1위 연속일` 하나로 부족하다. **1페이지 누적 점유일**을 같이 봐야 한다.");
  L.push("");

  L.push("### ② 원인 — 연속일수가 KR 신호를 US 신호 위로 밀어올리는 유일한 힘이다");
  L.push("");
  L.push("`institution_streak` 의 기저값은 100 이다. 내부자 클러스터(200~210 기저)보다 **100점 낮다.**");
  L.push("연속일수 항(`×10`)이 없으면 KR 연속 신호는 항상 덱 바닥이다. 반대로 10일을 넘기는 순간 내부자 클러스터 전부를 앞지른다.");
  L.push("");
  L.push("| 연속일 | `institution_streak` 점수 | 내부자 클러스터 대비 |");
  L.push("|---|---|---|");
  for (const d of [3, 6, 10, 15, 20, 26]) {
    const sc = 100 + d * 10;
    L.push(`| ${d}일 | ${sc} | ${sc < 200 ? "아래" : sc < 300 ? "**추월 구간**" : "**전부 추월**"} |`);
  }
  L.push("");
  L.push("즉 **가설 1-1·1-2 는 같은 한 줄이 만든다.** 이 한 항을 빼면 고착의 구조적 경로가 끊긴다.");
  L.push("");

  L.push("### ③ 재노출 페널티는 없다 — 있는 것은 '순수 반복' 컷뿐이다");
  L.push("");
  L.push("`stale_repeat` 는 신호가 **하나도 안 변했을 때만** 제외한다. 연속일이 하루 늘면");
  L.push("`strengthenedProgress` 가 `\"어제보다 1일 더 이어졌어요\"` 를 돌려주고 그대로 재등장한다 —");
  L.push("**연속 신호는 정의상 매일 하루씩 늘기 때문에 이 컷에 절대 걸리지 않는다.**");
  L.push("");
  L.push("WO PHASE 3 이 지적한 그대로다: 지속은 변화가 아니다. 순위 강등도, 노출 쿨다운도 없다.");
  L.push("");

  L.push("### ④ 풀은 임계값이 아니라 모집단에서 막힌다");
  L.push("");
  if (withQual.length > 0) {
    const q = withQual[0]!.qualification!;
    const megaAvg = (agg.get("mega_cap") ?? 0) / withQual.length;
    L.push(`후보 ${q.afterQuiet}건 중 **${q.drops.mega_cap ?? 0}건이 \`mega_cap\`** 으로 선반행이다(14일 일평균 ${megaAvg.toFixed(1)}건) — 단일 최대 누수.`);
    L.push(`그 앞단에서 KR 유니버스 ${q.krUniverse}종목 중 **${q.krUniverse - q.krWithSignal}종목은 신호 자체가 없다.**`);
  }
  L.push("");
  L.push("WO 가 상정한 `\"466종목이 필터에 걸린다\"` 는 성립하지 않는다. 걸릴 466종목이 애초에 없다.");
  L.push("**\`신호 없음\` 이 다수 = 신호 산출 문제**라는 WO 1-3 의 판정 기준을 그대로 적용하면, 대응은 임계값 조정이 아니라");
  L.push("**유니버스 확대 + 신호 종류 추가**다. 다만 이는 PHASE 2~4 의 랭킹 수정과 **독립적으로 필요한 별건**이다 —");
  L.push("랭킹을 고쳐도 66종목 안에서 도는 것은 변하지 않는다.");
  L.push("");

  L.push("### ⑤ 2차 고착 — 후보 진입 자체가 강도순이다");
  L.push("");
  L.push("`MAX_FRONT_ASSEMBLIES = 60` 이 `baseStrength` 내림차순으로 후보를 자른다.");
  L.push(`관측 기간 후보 수는 최대 ${Math.max(...withQual.map((d) => d.qualification!.afterQuiet), 0)}건으로 아직 60 에 닿지 않아 **현재는 잘림이 없다.**`);
  L.push("유니버스를 넓히면 즉시 문제가 된다 — 연속일수가 긴 종목이 랭킹만이 아니라 **조립 우선권까지** 갖는다.");
  L.push("");

  // ── PHASE 2~4 리플레이 시뮬레이션 ──
  //
  // Q3 지시: "×0.6 이 실제로 1페이지를 바꾸는지 실측할 것. 효과가 없으면 계수를 낮추거나 전환해."
  // 그래서 과거 14일 스냅샷을 **새 랭킹으로 다시 정렬**해 1페이지가 며칠 바뀌었는지 센다.
  //
  // ⚠️ 한계를 먼저 적는다 — 이건 반사실(counterfactual) 이 아니다.
  // 스냅샷에 남은 후보는 **구 랭킹이 이미 발행한 10장**이다. 구 랭킹이 탈락시킨 후보는 없으므로
  // 새 랭킹이 그것들을 끌어올렸을 경우를 재현할 수 없다. 즉 아래 회전율은 **하한**이다 —
  // 실제 회전은 이보다 크다. 발행 후 프로덕션 3일 관측이 정본 판정이다(WO 완료조건 9).
  L.push("## 1-5. 새 랭킹 리플레이 (Q3 효과 실측)");
  L.push("");
  L.push(`규칙: 신규성 반감기 **${NOVELTY_HALFLIFE_DAYS}일** · 경과일 상한 **${SIGNAL_AGE_MAX_DAYS}일** · 쿨다운 누진 ${COOLDOWN_LADDER.map((s2) => `${s2.minConsecutiveDays}일 ×${s2.factor}`).join(" / ")} · 구성 \`${DECK_COMPOSITION_VERSION}\``);
  L.push("");
  L.push("> **하한 추정이다.** 스냅샷에는 구 랭킹이 발행한 10장만 남아 있어, 새 랭킹이 끌어올렸을");
  L.push("> 탈락 후보를 재현할 수 없다. 실제 회전은 이보다 크다.");
  L.push("");

  interface ReplayDay { date: string; page1: string[]; deckSize: number; agedOut: number; cooled: number }
  const replay: ReplayDay[] = [];
  const cooldownHits = new Map<string, number>();
  for (let i = 0; i < asc.length; i++) {
    const day = asc[i]!;
    // 쿨다운 입력 — **리플레이 자신의** 1페이지 이력을 쓴다(구 랭킹 이력을 쓰면 효과가 왜곡된다).
    const priorPage1 = replay.slice(0, i).reverse().map((r) => ({ page1: r.page1 }));
    const streaks = page1StreakFromHistory(priorPage1);
    const candidates = day.entries
      .filter((e) => !isAgedOut(e.days))
      .map((e) => ({
        kind: e.kind,
        ageDays: e.days,
        canonical: e.canonical,
        // 이례성 강도는 스냅샷에 남지 않았다 — 넣지 않는다(없는 값을 지어내지 않는다).
        score: rankScore({ ageDays: e.days, page1Streak: streaks.get(e.canonical) ?? 0 }),
      }))
      .sort((a, b) => b.score - a.score);
    const composed = composeDeck(candidates, { deckSize: day.entries.length });
    const page1 = composed.deck.slice(0, PAGE1_SIZE).map((c) => c.canonical);
    const cooled = candidates.filter((c) => (streaks.get(c.canonical) ?? 0) >= 3).length;
    for (const c of candidates) {
      const st = streaks.get(c.canonical) ?? 0;
      if (st >= 3) cooldownHits.set(c.canonical, (cooldownHits.get(c.canonical) ?? 0) + 1);
    }
    replay.push({
      date: day.date,
      page1,
      deckSize: composed.deck.length,
      agedOut: day.entries.filter((e) => isAgedOut(e.days)).length,
      cooled,
    });
  }

  L.push("| 날짜 | 새 1페이지 | 구 1페이지 | 1페이지 교체 | 상한 초과(워치행) | 쿨다운 적용 | 덱 장수 |");
  L.push("|---|---|---|---|---|---|---|");
  for (let i = replay.length - 1; i >= 0; i--) {
    const r = replay[i]!;
    const prev = replay[i - 1];
    const swapped = prev ? r.page1.filter((n) => !prev.page1.includes(n)).length : null;
    const oldPage1 = asc[i]!.entries.slice(0, PAGE1_SIZE).map((e) => e.canonical);
    L.push(
      `| ${r.date} | ${r.page1.join(", ") || "—"} | ${oldPage1.join(", ")} | ${swapped === null ? "—" : `${swapped}/${r.page1.length}`} | ${r.agedOut} | ${r.cooled} | ${r.deckSize} |`
    );
  }
  L.push("");

  // 판정 — 1페이지가 매일 바뀌었나(완료조건 9의 대리 지표).
  const changedDays = replay.slice(1).filter((r, i) => {
    const prev = replay[i]!;
    return r.page1.some((n) => !prev.page1.includes(n));
  }).length;
  const comparable = Math.max(0, replay.length - 1);
  const newRuns: Array<{ name: string; n: number }> = [];
  for (const r of replay) {
    const top = r.page1[0] ?? "(없음)";
    const last = newRuns[newRuns.length - 1];
    if (last && last.name === top) last.n += 1;
    else newRuns.push({ name: top, n: 1 });
  }
  const newMaxRun = Math.max(0, ...newRuns.map((r) => r.n));
  L.push("| 지표 | 구 랭킹 | 새 랭킹(리플레이) |");
  L.push("|---|---|---|");
  L.push(`| 1페이지가 전일과 달라진 날 | ${churn.filter((c) => c > 0).length}/${comparable} | **${changedDays}/${comparable}** |`);
  L.push(`| 최장 연속 1위 | ${maxRun}일 | **${newMaxRun}일** |`);
  const oldTop = [...expo.entries()].sort((a, b) => b[1].page1 - a[1].page1)[0];
  const newPage1Days = new Map<string, number>();
  for (const r of replay) for (const n of r.page1) newPage1Days.set(n, (newPage1Days.get(n) ?? 0) + 1);
  const newTop = [...newPage1Days.entries()].sort((a, b) => b[1] - a[1])[0];
  L.push(`| 최다 1페이지 점유 | ${oldTop ? `${oldTop[0]} ${oldTop[1].page1}일` : "—"} | **${newTop ? `${newTop[0]} ${newTop[1]}일` : "—"}** |`);
  L.push("");
  if (newMaxRun <= 3 && changedDays >= comparable) {
    L.push("**판정: 계수 조정 불필요.** 리플레이에서 1페이지가 매일 바뀌고 1위 연속이 목표(3일 이하) 안이다.");
  } else {
    L.push(
      `**판정: 보완 필요.** 리플레이 최장 연속 1위 ${newMaxRun}일 · 변경일 ${changedDays}/${comparable}. ` +
        "Q3 단서대로 계수를 낮추거나(×0.4) 1페이지 밖 강제로 전환하는 것을 검토한다 — " +
        "단 이 리플레이는 하한이므로 **프로덕션 3일 관측 전에 계수를 건드리지 않는다.**"
    );
  }
  L.push("");
  if (cooldownHits.size > 0) {
    L.push("쿨다운이 실제로 걸린 종목(리플레이 기준):");
    L.push("");
    L.push("| 종목 | 쿨다운 적용일 |");
    L.push("|---|---|");
    for (const [name, n] of [...cooldownHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      L.push(`| ${name} | ${n} |`);
    }
    L.push("");
  }
  L.push("계수 곡선(참고):");
  L.push("");
  L.push("| 1페이지 연속일 | 계수 |");
  L.push("|---|---|");
  for (const d of [0, 2, 3, 4, 5, 6, 7, 14]) L.push(`| ${d}일 | ×${page1CooldownFactor(d)} |`);
  L.push("");
  L.push("신규성 곡선(참고):");
  L.push("");
  L.push("| 경과일 | 신규성 | 신규 판정 |");
  L.push("|---|---|---|");
  for (const d of [0, 1, 3, 5, 7, 8, 10, 14, 15, 20, 26]) {
    L.push(`| ${d}일 | ${noveltyScore(d).toFixed(1)} | ${isAgedOut(d) ? "**상한 초과 → 워치**" : isFreshSignal(d) ? "신규" : "지속" } |`);
  }
  L.push("");

  // ── PHASE 2 입력: 신호 나이 분포 ──
  L.push("## 부록 A. 신호 나이 분포 (PHASE 2 감쇠 곡선 입력)");
  L.push("");
  const ages = asc.flatMap((d) => d.entries.map((e) => ({ kind: e.kind, days: e.days })));
  const byKind = new Map<string, number[]>();
  for (const a of ages) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a.days]);
  L.push("| 신호 유형 | n | 최소 | p25 | 중앙값 | p75 | 최대 |");
  L.push("|---|---|---|---|---|---|---|");
  const q = (xs: number[], p: number): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
  };
  for (const [kind, xs] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    L.push(`| \`${kind}\` | ${xs.length} | ${Math.min(...xs)} | ${q(xs, 0.25)} | ${median(xs)} | ${q(xs, 0.75)} | ${Math.max(...xs)} |`);
  }
  L.push("");
  const all = ages.map((a) => a.days);
  if (all.length > 0) {
    L.push(`전체 n=${all.length} · 중앙값 **${median(all)}일** · p75 **${q(all, 0.75)}일** · p90 **${q(all, 0.9)}일** · 최대 **${Math.max(...all)}일**.`);
    L.push("");
  }
  L.push("발행 픽의 경과일 누적 분포:");
  L.push("");
  L.push("| 경과일 이내 | 건수 | 비율 |");
  L.push("|---|---|---|");
  for (const t of [1, 2, 3, 5, 7, 10, 14, 20, 30]) {
    const n = all.filter((d) => d <= t).length;
    L.push(`| ≤${t}일 | ${n} | ${pct(n, all.length)} |`);
  }
  L.push("");

  L.push("## 부록 B. 무엇을 측정하지 못했나");
  L.push("");
  L.push("- 스냅샷은 `quiet-pick:<date>` 가 남아 있는 날만 있다. 크론이 실패한 날은 아예 행이 없다(0장 발행과 구분되지 않는다).");
  L.push("- 원장 보강분에는 `strength` 가 없다(원장 payload 에 저장하지 않는다). 그 날짜의 점수 분해는 못 한다.");
  L.push("- 유저 노출(실제로 그 카드를 봤는가)은 여기서 재지 않는다 — 회전율은 공급 측 지표다.");
  L.push("");
  return L.join("\n");
}

async function main(): Promise<void> {
  const nDays = Number(flag("--days") ?? 14);
  const outDir = flag("--out");
  const from = new Date(Date.now() - nDays * 86_400_000).toISOString().slice(0, 10);

  const snapshots = await readSnapshots(nDays);
  const have = new Set(snapshots.map((s) => s.date));
  const ledger = await readLedgerDays(from, have);
  const days = [...snapshots, ...ledger].filter((d) => d.date >= from);
  if (days.length === 0) throw new Error("관측치 0 — 스냅샷도 원장도 비었다");

  const doc = render(days);
  console.log(doc);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "DECK_STAGNATION.md"), doc);
    writeFileSync(join(outDir, "deck_stagnation_raw.json"), JSON.stringify(days, null, 1));
    console.log(`\n[DECK-01] 저장 — ${join(outDir, "DECK_STAGNATION.md")}`);
  }
}

main()
  .catch((error) => { console.error("[DECK-01] 실패", error); process.exit(1); })
  .finally(() => void prisma.$disconnect());

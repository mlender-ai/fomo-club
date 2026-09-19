"use client";

/**
 * LAB-08 PART D — 갱신.
 *
 * > **1분마다 갱신. 깜빡이지 않게 값만 바꾼다. 전체 리렌더 금지.**
 * > **바뀐 값만 잠깐(0.3초) 밝아졌다 돌아온다. 그 외 애니메이션 없음.**
 *
 * 그래서 이 화면은 보통의 리액트 폴링 화면과 다르게 만들었다. `setState` 로 새 표를
 * 그리면 표 전체가 다시 그려지고, 스크롤·선택·포커스가 흔들린다. 여기서는:
 *
 * | | 방식 |
 * |---|---|
 * | 숫자가 바뀐다 | 해당 **텍스트 노드만** 직접 고쳐 쓴다 (`Cell`) — 리렌더 없음 |
 * | 전략이 늘거나 멈춘다 | 그때만 리렌더한다 (`shapeKey` 가 바뀐 경우) |
 *
 * 즉 **평소에는 리렌더가 0회**고, 표의 뼈대가 실제로 달라졌을 때만 다시 그린다.
 * 깜빡임은 리렌더가 아니라 `is-flash` 클래스 0.3초로 만든다.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LiveBoard as LiveBoardData, LiveRow } from "../../lib/lab/live-board";

/** PART D — 1분. */
const POLL_MS = 60_000;
/** 값이 바뀐 자리가 밝아져 있는 시간. */
const FLASH_MS = 300;

// ── 값 저장소 ────────────────────────────────────────────────────────────────

interface CellValue {
  text: string;
  /** 색 — 상승/하락/강조. 값이 부호를 넘나들면 색도 같이 바뀐다. */
  tone: string;
}

type Listener = (value: CellValue) => void;

/**
 * 셀 값만 들고 있는 아주 작은 저장소.
 *
 * 리액트 상태가 아니다 — 여기 값이 바뀌어도 **컴포넌트는 다시 그려지지 않는다.**
 * 구독 중인 `Cell` 이 자기 DOM 노드만 고쳐 쓴다.
 */
class CellStore {
  private values = new Map<string, CellValue>();
  private subs = new Map<string, Set<Listener>>();

  seed(key: string, value: CellValue): void {
    if (!this.values.has(key)) this.values.set(key, value);
  }

  get(key: string): CellValue {
    return this.values.get(key) ?? { text: "—", tone: "" };
  }

  /** 값이 **실제로 달라졌을 때만** 알린다 — 안 바뀐 자리는 깜빡이면 안 된다. */
  set(key: string, value: CellValue): void {
    const previous = this.values.get(key);
    if (previous && previous.text === value.text && previous.tone === value.tone) return;
    this.values.set(key, value);
    if (!previous) return; // 첫 심기는 알리지 않는다 — 처음 뜰 때 전체가 번쩍이면 안 된다.
    for (const listener of this.subs.get(key) ?? []) listener(value);
  }

  subscribe(key: string, listener: Listener): () => void {
    const set = this.subs.get(key) ?? new Set<Listener>();
    set.add(listener);
    this.subs.set(key, set);
    return () => set.delete(listener);
  }
}

function Cell({
  store,
  cellKey,
  base = "",
}: {
  store: CellStore;
  cellKey: string;
  base?: string;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const initial = store.get(cellKey);

  useEffect(() => {
    let timer = 0;
    const unsubscribe = store.subscribe(cellKey, (value) => {
      const el = ref.current;
      if (!el) return;
      el.textContent = value.text;
      el.className = `${base} ${value.tone}`.trim();
      // 같은 자리가 연달아 바뀌어도 다시 밝아지도록 클래스를 떼고 리플로우를 한 번 준다.
      el.classList.remove("is-flash");
      void el.offsetWidth;
      el.classList.add("is-flash");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove("is-flash"), FLASH_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [store, cellKey, base]);

  return (
    <span ref={ref} className={`${base} ${initial.tone}`.trim()}>
      {initial.text}
    </span>
  );
}

// ── 표시 형식 ────────────────────────────────────────────────────────────────

function pct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function num(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function tone(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

function days(value: number | null): string {
  if (value === null) return "—";
  return `${Math.floor(value) + 1}일째`;
}

function clock(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

/** 이 응답으로 셀 값이 어떻게 되어야 하는지. 첫 렌더와 폴링이 **같은 함수**를 쓴다. */
function cellsOf(board: LiveBoardData): Record<string, CellValue> {
  const out: Record<string, CellValue> = {
    "head.at": { text: clock(board.at), tone: "" },
    "head.days": { text: days(board.days), tone: "" },
    "bench.equity": { text: money(board.benchmark.equity), tone: "" },
    "bench.ret": { text: pct(board.benchmark.returnPct), tone: tone(board.benchmark.returnPct) },
    "bench.mdd": { text: pct(board.benchmark.mdd), tone: tone(board.benchmark.mdd) },
    "bench.cm": { text: num(board.benchmark.cagrMdd), tone: "" },
  };

  for (const row of [...board.ranked, ...board.unranked, ...board.stopped]) {
    const id = row.strategyId;
    out[`${id}.equity`] = { text: money(row.equity), tone: "" };
    out[`${id}.ret`] = { text: pct(row.returnPct), tone: tone(row.returnPct) };
    out[`${id}.mdd`] = { text: pct(row.mdd), tone: tone(row.mdd) };
    out[`${id}.cm`] = { text: num(row.cagrMdd), tone: "" };
    out[`${id}.trades`] = { text: `${row.trades}`, tone: "" };
    out[`${id}.pos`] = { text: row.positions.length === 0 ? "—" : `${row.positions.length}`, tone: "" };
  }
  return out;
}

/**
 * 표의 **뼈대**가 같은지. 값이 아니라 구조만 본다 —
 * 행이 늘거나, 순서가 바뀌거나, 전략이 멈추거나, 경고가 생겼을 때만 다시 그린다.
 */
function shapeKey(board: LiveBoardData): string {
  const rows = [
    ...board.ranked.map((r) => `R:${r.strategyId}`),
    ...board.unranked.map((r) => `U:${r.strategyId}`),
    ...board.stopped.map((r) => `S:${r.strategyId}:${r.stopReason ?? ""}`),
  ];
  return [
    rows.join("|"),
    board.warnings.map((w) => `${w.kind}:${w.text}`).join("|"),
    board.startedAt ?? "",
  ].join("#");
}

// ── 표 ───────────────────────────────────────────────────────────────────────

function Row({
  row,
  rank,
  store,
}: {
  row: LiveRow;
  rank: number | null;
  store: CellStore;
}): React.JSX.Element {
  return (
    <tr className={row.stopped ? "is-stopped" : ""}>
      <td className="num rank">{rank ?? ""}</td>
      <td>
        <span className={`lab-dot ${row.stopped ? "is-off" : "is-on"}`} aria-hidden>
          {row.stopped ? "○" : "●"}
        </span>
        <Link href={`/strategy/${row.strategyId}`} className="lab-row-link">
          {row.label}
        </Link>
        {row.stopped ? <span className="lab-tag">정지</span> : null}
        {!row.stopped && !row.ranked ? <span className="lab-tag">표본 부족</span> : null}
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.equity`} base="num" />
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.ret`} base="num" />
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.mdd`} base="num" />
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.cm`} base="num" />
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.trades`} base="num" />
      </td>
      <td className="num">
        <Cell store={store} cellKey={`${row.strategyId}.pos`} base="num" />
      </td>
    </tr>
  );
}

export function LiveBoard({ initial }: { initial: LiveBoardData }): React.JSX.Element {
  // PART D 의 "전체 리렌더 금지" 는 **눈으로 확인할 수 없는 약속**이라 세어 둔다.
  // 개발 모드에서만 센다. 폴링을 몇 번 돌려도 이 숫자가 안 늘면 지켜진 것이다.
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const w = window as typeof window & { __labBoardRenders?: number };
    w.__labBoardRenders = (w.__labBoardRenders ?? 0) + 1;
  }

  // 뼈대. **값이 바뀌었다고 여기를 건드리지 않는다.**
  const [board, setBoard] = useState(initial);
  const storeRef = useRef<CellStore | null>(null);
  if (storeRef.current === null) {
    const store = new CellStore();
    for (const [key, value] of Object.entries(cellsOf(initial))) store.seed(key, value);
    storeRef.current = store;
  }
  const store = storeRef.current;
  const shapeRef = useRef(shapeKey(initial));
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/lab/live", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as LiveBoardData;

      const key = shapeKey(next);
      if (key !== shapeRef.current) {
        // 표의 뼈대가 달라졌다 — 이때만 다시 그린다.
        shapeRef.current = key;
        for (const [cellKey, value] of Object.entries(cellsOf(next))) {
          // 새로 생긴 자리는 심고, 원래 있던 자리는 평소처럼 바꾼다(바뀌었으면 깜빡인다).
          store.seed(cellKey, value);
          store.set(cellKey, value);
        }
        setBoard(next);
      } else {
        // 값만 바꾼다. 리렌더 없음.
        for (const [cellKey, value] of Object.entries(cellsOf(next))) store.set(cellKey, value);
      }
      setError(null);
    } catch (cause) {
      // **실패를 조용히 넘기지 않는다.** 화면이 언제 멈췄는지 모르면 옛날 숫자를 믿게 된다.
      setError(cause instanceof Error ? cause.message : "갱신 실패");
    }
  }, [store]);

  useEffect(() => {
    const timer = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  const all = [...board.ranked, ...board.unranked, ...board.stopped];
  if (all.length === 0) {
    return (
      <div className="lab-empty">
        <p className="lab-empty-brand">STRATEGY LAB</p>
        <p className="lab-empty-msg">운용 중인 전략이 없습니다.</p>
        <p className="lab-empty-note">npm run lab:paper</p>
      </div>
    );
  }

  return (
    <>
      <p className="lab-subline">
        시작 자본 전략당 ${board.initialCapital.toLocaleString("en-US")} · 가장 오래된 전략{" "}
        <Cell store={store} cellKey="head.days" /> · 무레버리지 · 갱신{" "}
        <Cell store={store} cellKey="head.at" /> UTC
      </p>

      {/* A-2 — 경고는 **표 위**다. 표 안에 섞으면 숫자를 먼저 읽는다. */}
      {/* 같은 종류의 경고가 둘일 수 있다(페이퍼 정지 + 워밍업 재생) — 문구로 구분한다. */}
      {board.warnings.map((warning) => (
        <p key={`${warning.kind}:${warning.text}`} className="lab-warning">
          {warning.text}
        </p>
      ))}
      {error ? <p className="lab-warning">화면 갱신이 멈췄다 — {error}</p> : null}

      <div className="lab-board-scroll">
        <table className="lab-board">
          <thead>
            <tr>
              <th className="rank">순위</th>
              <th>전략</th>
              <th>자산</th>
              <th>수익률</th>
              <th>MDD</th>
              <th>C/M</th>
              <th>거래</th>
              <th>보유</th>
            </tr>
          </thead>
          {/*
            벤치마크가 **맨 위**다 (LAB-FIX2 PART A-1).

            종전에는 맨 아래였다. 그랬더니 표본 2건짜리 C/M 25.53 이 BTC 0.13 위에
            앉아 "평균회귀가 압도한다" 로 읽혔다 — `표본 부족` 표를 달아도
            **사람은 위에 있는 숫자를 먼저 읽는다.** 기준이 먼저 보여야 미달이 미달이다.
          */}
          <tbody className="lab-benchmark is-top">
            <tr>
              <td className="num rank">
                <span className="lab-nonrank">기준</span>
              </td>
              <td>{board.benchmark.label}</td>
              <td className="num">
                <Cell store={store} cellKey="bench.equity" base="num" />
              </td>
              <td className="num">
                <Cell store={store} cellKey="bench.ret" base="num" />
              </td>
              <td className="num">
                <Cell store={store} cellKey="bench.mdd" base="num" />
              </td>
              <td className="num">
                <Cell store={store} cellKey="bench.cm" base="num" />
              </td>
              <td className="num">—</td>
              <td className="num">—</td>
            </tr>
          </tbody>

          <tbody>
            {board.ranked.map((row, i) => (
              <Row key={row.strategyId} row={row} rank={i + 1} store={store} />
            ))}
            {board.unranked.map((row) => (
              <Row key={row.strategyId} row={row} rank={null} store={store} />
            ))}
          </tbody>

          {/* 정지된 전략 — 회색으로 **남는다.** 지우면 나머지가 전부 거짓이 된다. */}
          {board.stopped.length > 0 ? (
            <tbody className="lab-stopped-group">
              {board.stopped.map((row) => (
                <Row key={row.strategyId} row={row} rank={null} store={store} />
              ))}
            </tbody>
          ) : null}
        </table>
      </div>

      {board.stopped.map((row) =>
        row.stopReason ? (
          <p key={row.strategyId} className="lab-stop-reason">
            <span className="lab-dot is-off" aria-hidden>
              ○
            </span>{" "}
            {row.label} — {row.stopReason}
          </p>
        ) : null
      )}

      {/* 하지 말 것 4 — **페이퍼 한계를 화면에 적는다.** */}
      <p className="lab-caveat">{board.caveat}</p>
    </>
  );
}

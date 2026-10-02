"""보고서(마크다운) — **비공개 자리에만** 쓴다. 레포 · 공개 사이트에 올리지 않는다."""
from __future__ import annotations

from .timeutil import iso


def _n(v, digits: int = 2, unit: str = "") -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:,.{digits}f}{unit}"
    return f"{v}{unit}"


def _usdt(v) -> str:
    return "—" if v is None else f"{v:+,.2f} USDT"


def render(r: dict) -> str:
    m = r["metrics"]
    t = m["trade"]
    d = m["daily"]
    tw = m["twr"]
    rc = r["reconcile"]
    cov = r["coverage"]
    s = r["structure"]
    th = r["thirty_day"]
    lines: list[str] = []
    add = lines.append
    add("# TRADER-01 보고 — 실계좌 거래 수집")
    add("")
    add(f"> 생성 {iso(r['at'])} · **비공개** — 레포 · 공개 사이트에 올리지 않는다.")
    add("")
    add("## 완료 확인")
    add("")
    add("| # | 항목 | 결과 | 근거 |")
    add("|---|---|---|---|")
    for c in r["checks"]:
        add(f"| {c['no']} | {c['item']} | {'✅' if c['ok'] else '❌'} | {c['detail']} |")
    add("")
    gate = rc.get("status") == "ok"
    add("**E-1 이 맞아야 다음(TRADER-02)으로 간다.** " + ("맞았다." if gate else "**안 맞았다 — 여기서 멈춘다.**"))
    add("")

    add("## 기간 · 거래 수 · 누락")
    add("")
    p = r["period"]
    add(f"- 기간: {p['first_fill'] or '—'} ~ {p['last_fill'] or '—'} (**{p['days']:.0f}일**)")
    src = r["sources"]
    add(f"- 체결 원본: {', '.join(f'{k} {v}' for k, v in src['fills'].items()) or '없음'} · 주문 {src['orders']} · 포지션 이력 {src['positions']} · 장부 {src['bills']}")
    add(f"- 거래: **{r['trades']}건** · 아직 열린 포지션 {len(r['open_positions'])} · 짝 없는 청산 체결 {r['unmatched_close_fills']} · 거래에 못 붙인 펀딩 {_usdt(r['funding_unattributed'])}")
    lc = r["ledger_check"]
    add(
        f"- 장부 자기 검증(잔고 변화 = 금액 + 수수료): {lc['fits_amount_plus_fee']}/{lc['checked']} 줄 맞음"
        + (" · **수수료 부호가 반대로 보인다 — 순손익 계산을 고쳐야 한다**" if lc["fee_sign_flipped"] else "")
        + (f" · 어느 쪽도 안 맞는 줄 {lc['neither']}" if lc["neither"] else "")
    )
    add(f"- 청산 장부는 있는데 청산 체결이 없는 날: {len(cov['close_bill_days_without_fills'])}일 {_days(cov['close_bill_days_without_fills'])}")
    add(f"- 청산 체결은 있는데 장부가 없는 날: {len(cov['close_fill_days_without_bills'])}일 {_days(cov['close_fill_days_without_bills'])}")
    errs = cov["fetch_errors"]
    if errs:
        kinds: dict[str, int] = {}
        for e in errs:
            kinds[e["kind"].split(":")[0]] = kinds.get(e["kind"].split(":")[0], 0) + 1
        add(f"- 조회 실패 구간: {', '.join(f'{k} {v}' for k, v in kinds.items())} (대부분 거래소 보관 기간 밖이면 정상)")
    add("")

    add("## 계좌 지표 (D-2)")
    add("")
    add("| 지표 | 값 |")
    add("|---|---|")
    add(f"| 순손익 (입출금 제외 · 장부) | {_usdt(m['net_pnl_bills'])} |")
    add(f"| 순손익 (거래 합 · 펀딩 포함) | {_usdt(t['net_pnl'])} |")
    add(f"| 입금 / 출금 | {_usdt(m['deposits'])} / {_usdt(m['withdrawals'])} |")
    if tw.get("status") == "ok":
        add(f"| **시간가중수익률** | **{_n(tw['twr_pct'], 2, '%')}** ({tw['segments']}구간 · {tw['basis']}) |")
        add(f"| MDD (시간가중) | {_n(tw['mdd_pct'], 2, '%')} |")
    else:
        add(f"| 시간가중수익률 | 산출 못 함 — {tw.get('note') or tw.get('status')} |")
    add(f"| PF | {_n(t['pf'])} |")
    add(f"| 승률 | {_n(t['win_rate_pct'], 1, '%')} |")
    add(f"| 평균 이익 / 평균 손실 | {_usdt(t['avg_win'])} / {_usdt(t['avg_loss'])} (손익비 {_n(t['payoff'])}) |")
    add(f"| 이긴 날 / 진 날 | {d['win_days']} / {d['loss_days']} (손익 있던 {d['active_days']}일) |")
    add(f"| 일별 손익 p10 · 중앙 · p90 | {_usdt(d['p10'])} · {_usdt(d['median'])} · {_usdt(d['p90'])} |")
    add(f"| 최대 일손실 | {_usdt(d['max_daily_loss'])} |")
    add(f"| 최대 연속 손실일 | {d['max_losing_streak_days']}일 · {d['streak_basis']} |")
    add(f"| 거래 수 / 일 | {_n(m['trades_per_day'])} |")
    add(f"| 수수료 · 펀딩 | {_usdt(-t['fees'])} · {_usdt(t['funding'])} |")
    add(f"| 비용 비중 (비용 ÷ 비용 전 총손익) | {_n(t['cost_share_pct'], 1, '%')} — 엔진 크립토 트랙은 85% |")
    add("")

    add("## 거래소 손익과 대조 (E)")
    add("")
    add("| # | 확인 | 결과 |")
    add("|---|---|---|")
    if rc.get("status") in ("ok", "mismatch", "no_close_bills"):
        add(
            f"| 1 | 재구성 실현 손익 {_usdt(rc.get('reconstructed'))} vs 장부 청산 손익 {_usdt(rc.get('exchange'))} "
            f"(구간 {iso(rc['window'][0])} ~ {iso(rc['window'][1])}) | 차이 {_usdt(rc.get('diff'))} · **{_n(rc.get('diff_pct'), 3, '%')}** "
            f"{'✅' if rc['status'] == 'ok' else '❌'} (허용 ±{rc['tolerance_pct']}%) · 대조 {rc['trades_compared']}건 · "
            f"장부 보관 기간 밖이라 대조 불가 {rc['outside_ledger']}건 · 구간 안 짝 없는 청산 {rc['unmatched_close_fills_in_window']}건 |"
        )
    else:
        add(f"| 1 | 재구성 vs 거래소 | {rc.get('status')} |")
    app = th.get("app")
    add(
        f"| 2 | 최근 30일 잔고 손익 {_usdt(th['ours_net'])} (청산 손익만 {_usdt(th['ours_realized_before_costs'])}) vs 앱 30D PnL "
        f"{_usdt(app) if app is not None else '— (`--app-30d-pnl` 로 넣는다)'} | "
        + (f"차이 {_usdt(th.get('diff'))} ({_n(th.get('diff_pct'), 2, '%')})" if app is not None else "미대조")
        + " |"
    )
    add(f"| 3 | 거래 수 · 기간 · 누락 | {r['trades']}건 · {p['days']:.0f}일 · 누락 의심 {len(cov['close_bill_days_without_fills'])}일 |")
    add("")

    add("## 월별 — 우위가 유지됐나")
    add("")
    add("| 월 | 거래 | 순손익(거래 합) | 순손익(장부) | 시간가중 | PF | 승률 | 장부 대비 |")
    add("|---|---|---|---|---|---|---|---|")
    for mo in r["monthly"]:
        add(
            f"| {mo['month']} | {mo['trades']} | {_usdt(mo['net_pnl'])} | {_usdt(mo['net_pnl_bills'])} | {_n(mo['twr_pct'], 1, '%')} | {_n(mo['pf'])} | "
            f"{_n(mo['win_rate_pct'], 0, '%')} | {_n(mo['share_of_total_pct'], 0, '%')} |"
        )
    pos = [mo for mo in r["monthly"] if mo["net_pnl"] > 0]
    add("")
    add(f"거래 합 기준 플러스인 달 {len(pos)}/{len(r['monthly'])}. 장부 칸이 — 인 달은 거래소 장부 보관 기간 밖이다.")
    add("")

    # 매매 습관(분할 · MFE · 청산 방식)은 **여기에 싣지 않는다.** TRADER-02 PART A — 광혁이 매매법을
    # 먼저 말로 쓰기 전에 이걸 보면 말한 매매법이 데이터에 끌려간다. 진술 봉인 뒤 TRADER-02 분석에서 본다.
    return "\n".join(lines) + "\n"


def _days(days: list[str]) -> str:
    if not days:
        return ""
    shown = ", ".join(days[:8])
    return f"({shown}{' …' if len(days) > 8 else ''})"

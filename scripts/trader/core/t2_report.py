"""TRADER-02 보고서(마크다운). **비공개 자리에만** 쓴다 — 레포 · 공개 사이트에 올리지 않는다."""
from __future__ import annotations

from .timeutil import iso


def n(x, unit: str = "", d: int = 2) -> str:
    return "—" if x is None else f"{x:,.{d}f}{unit}"


def usdt(x) -> str:
    return "—" if x is None else f"{x:+,.2f}"


def pct(x) -> str:
    return "—" if x is None else f"{x * 100:.0f}%"


def head(title: str, warnings: list[str]) -> list[str]:
    out = [f"# {title}", "", "> **비공개** — 레포 · 공개 사이트에 올리지 않는다.", ""]
    if warnings:
        out += ["## ⚠ 순서 기록", ""] + [f"- {w}" for w in warnings] + [""]
    return out


def cond_text(c: dict) -> str:
    base = c["indicator"] + "".join(f" {k}={c[k]}" for k in sorted(c) if k not in ("indicator", "min", "max"))
    return f"{base} ≥ {c['min']}" if "min" in c else f"{base} ≤ {c['max']}"


def analysis_md(a: dict, warnings: list[str]) -> str:
    L = head("TRADER-02 B — 실제 매매법 (앞 70%)", warnings)
    s = a["split"]
    d = a["describe"]
    L += [
        f"- 분할: {iso(s['start'])} ~ **{iso(s['cut'])}** ~ {iso(s['end'])} · 앞 {s['train']}건 / 뒤 {s['test']}건 / 걸친 거래 {s['straddle']}건(어느 쪽에도 안 넣음)",
        f"- 앞 70% 거래 {d['n']}건 · 이김 {d['wins']} · 짐 {d['losses']} · 롱 {d['sides']['long']} · 숏 {d['sides']['short']} · 하루 {n(d['trades_per_day'])}번",
        "",
        "## B-2 진입 시점 — 이긴 거래 vs 진 거래 (중앙값 [p25 ~ p75])",
        "",
        "| 특징 | 이긴 거래 | 진 거래 |",
        "|---|---|---|",
    ]
    for f in d["entry_features"]:
        w, l = f["win"], f["loss"]
        if not w["n"] and not l["n"]:
            continue
        L.append(f"| {f['feature']} | {n(w['median'])} [{n(w['p25'])} ~ {n(w['p75'])}] (n={w['n']}) | {n(l['median'])} [{n(l['p25'])} ~ {n(l['p75'])}] (n={l['n']}) |")
    for c in d["categories"]:
        L.append(f"| {c['feature']} | " + " · ".join(f"{k} {v['win']}" for k, v in c["counts"].items()) + " | " + " · ".join(f"{k} {v['loss']}" for k, v in c["counts"].items()) + " |")
    L += ["", "## B-2 보유 중", "", "| | 이긴 거래 | 진 거래 |", "|---|---|---|"]
    for key, label in (("mfe", "MFE %"), ("mae", "MAE %")):
        w, l = d[key]["win"], d[key]["loss"]
        L.append(f"| {label} p10 · 중앙 · p90 | {n(w['p10'])} · {n(w['median'])} · {n(w['p90'])} | {n(l['p10'])} · {n(l['median'])} · {n(l['p90'])} |")
    L.append(f"| 보유(분) 중앙 · p90 | {n(d['hold_min']['win']['median'], '', 0)} · {n(d['hold_min']['win']['p90'], '', 0)} | {n(d['hold_min']['loss']['median'], '', 0)} · {n(d['hold_min']['loss']['p90'], '', 0)} |")
    L.append(f"| 잡은 몫(실현÷MFE) 중앙 | {n(d['capture']['win']['median'])} | |")
    L += ["", "## B-2 분할 · 크기 · 청산 방식", ""]
    L.append(f"- 분할 진입 {pct(d['split_entry_share'])} · 분할 청산 {pct(d['split_exit_share'])} (이긴 거래 중 {pct(d['split_exit_share_wins'])}) · 청산 다리 수 중앙 {n(d['exit_legs']['median'], '', 0)}")
    for leg in d["leg_stats"][:4]:
        L.append(f"  - {leg['leg']}번째 다리 (n={leg['n']}): 물량 중앙 {n(leg['qty_pct']['median'], '%', 0)} · 수익 중앙 {n(leg['return_pct']['median'], '%')}")
    L.append(f"- 동시 보유(진입 순간 열린 포지션 수) 중앙 {n(d['concurrent']['median'], '', 0)} · p90 {n(d['concurrent']['p90'], '', 0)}")
    L.append(f"- 레버리지 중앙 {n(d['leverage']['median'], '배', 1)} [{n(d['leverage']['p25'], '', 1)} ~ {n(d['leverage']['p75'], '', 1)}] · 증거금 비율 중앙 {n(d['margin_pct']['median'], '%', 1)}")
    total = sum(d["exit_methods"].values()) or 1
    L.append("- 청산 방식: " + " · ".join(f"{k} {v / total:.0%}" for k, v in sorted(d["exit_methods"].items(), key=lambda x: -x[1])))
    L += ["", "## B-2 연속 손실 뒤 행동", "", "| 뒤 | 건 | 다음 진입까지(분) 중앙 | 다음 크기 ÷ 최근 10건 중앙 |", "|---|---|---|---|"]
    for r in d["after_losses"]:
        L.append(f"| {r['after']} | {r['n']} | {n(r['gap_min']['median'], '', 0)} | {n(r['size_ratio']['median'])} |")
    L += ["", "## B-3 진입 규칙 후보 (재현율 · 정밀도 — 둘 다 본다)", ""]
    L.append("> 재현율 = 광혁 진입 중 규칙이 잡은 비율 · 정밀도 = 규칙이 '들어가라' 한 봉 중 광혁이 다음 1시간 안에 실제로 들어간 비율.")
    L.append("> 기준 = 아무 봉에서나 들어갔다고 칠 때의 정밀도(광혁 진입 빈도). 올림 = 정밀도 ÷ 기준. 임계는 광혁 진입 봉의 분위수에서만 뽑았다.")
    L.append("> 앞 70% 안에서 여러 후보를 견줬으므로 이 숫자는 **낙관적**이다 — 뒤 30% 가 진짜 시험이다.")
    for direction, c in a["candidates"].items():
        L += ["", f"### {'롱' if direction == 'long' else '숏'}", ""]
        if "skipped" in c:
            L.append(f"- {c['skipped']}")
            continue
        L.append(f"- 진입 {c['entries']}건(격자에 잡힌 것 {c['entries_on_grid']}) · 봉 {c['bars']:,} · 기준 정밀도 {pct(c['base_rate'])} · 견준 후보 {c['tested']}개")
        L += ["", "| # | 조건 | 재현율 | 정밀도 | 올림 | 참인 봉 |", "|---|---|---|---|---|---|"]
        for i, t in enumerate(c["top"], 1):
            mark = " ◀ 고름" if c["chosen"] and t["conditions"] == c["chosen"]["conditions"] else ""
            L.append(f"| {i} | {' AND '.join(cond_text(x) for x in t['conditions'])}{mark} | {pct(t['recall'])} | {pct(t['precision'])} | {n(t['lift'], '배', 1)} | {t['fired_bars']:,} |")
    e = a["exits"]
    L += ["", "## B-4 청산 규칙 후보", ""]
    L.append(f"- 손절 {n(e['stop']['stop_pct'], '%')} — {e['stop']['basis']} · 진 거래 {e['stop']['losses']}건 중 이보다 깊이 간 것 {e['stop']['losses_beyond']}")
    if "scale_out" in e:
        so = e["scale_out"]
        L.append(f"- 분할: {so['legs']} — {so['basis']} · 본절 {('예' if so['breakeven_after_first'] else '아니오')} (뒷 다리 중 ±0.15% 안에서 나간 비율 {pct(so['breakeven_share'])})")
    if "target" in e:
        L.append(f"- 목표 {n(e['target']['target_pct'], '%')} — {e['target']['basis']}")
    L.append(f"- 최대 보유 {n(e['max_hold_days'], '일', 3)} (보유 p90)")
    L.append("- 마지막 몫 팔 때 직전 4시간에 바뀐 것: " + (", ".join(f"{k} {v}" for k, v in e["last_leg_signals"]) or "—"))
    sz = a["sizing"]
    L += ["", "## B-5 사이징", "", f"- 레버리지 중앙 {n(sz['leverage'], '배', 1)} · 증거금 중앙 {n(sz['margin_pct'], '%', 1)} · 명목 ÷ 잔고 중앙 {n(sz['notional_pct'], '%', 0)}", ""]
    L += ["| 크기 | 같이 움직이나 | 순위상관 | n |", "|---|---|---|---|"]
    for r in sz["correlations"]:
        L.append(f"| {r['size']} | {r['factor']} | {n(r['rho'])} | {r['n']} |")
    L.append(f"\n{sz['note']}")
    p = a["pause"]
    L += ["", "## 쉬는 규칙", "", f"- {p['rule'] or p.get('basis')}"]
    for t in p["tried"]:
        L.append(f"  - {t['k']}연패 뒤 {t['n']}번 · 다음 진입까지 중앙 {n(t['gap_median_min'], '분', 0)} (이긴 뒤 {n(t['baseline_min'], '분', 0)})")
    if a["whales_symbols"]:
        L.append(f"\n고래 데이터가 있는 종목: {', '.join(a['whales_symbols'])}")
    else:
        L.append("\n고래 데이터 없음 — 고래 조건은 후보에서 빠졌다(FCE DB 를 못 읽었거나 기록 시작 전).")
    L.append("\nBTC 추세 · 펀딩 · 미결제약정 · FCE 패턴 판정은 B-2 에는 있지만 **랩 엔진 지표가 아니라 규칙 후보에서 뺐다.**")
    return "\n".join(L) + "\n"


def compare_md(rows: list[dict], warnings: list[str]) -> str:
    L = head("TRADER-02 C — 말한 것 vs 실제", warnings)
    L += [
        "> '일치' 는 숫자 칸끼리만 기계가 매겼다(상대 차이 25% 안 일치 · 60% 안 부분). 서술은 '광혁 판단'.",
        "> 불일치면 둘 중 하나다 — **말한 게 맞고 안 지켰다**(지키면 나아질 수 있다) · **실제가 맞다**(말하지 못한 규칙이 있다). 마지막 칸은 광혁이 채운다.",
        "",
        "| | 항목 | 말한 것 | 데이터(앞 70%) | 일치 | 광혁: 말이 맞다 / 실제가 맞다 |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        L.append(f"| {r['part']} | {r['item']} | {r['said']} | {r['data']} | {r['match']} | {r['kwanghyuk']} |")
    return "\n".join(L) + "\n"


def validation_md(v: dict) -> str:
    L = head("TRADER-02 E — 뒤 30% 검증", v["contamination"])
    L += [
        f"- 기간 {iso(v['period'][0])} ~ {iso(v['period'][1])} · 처음 증거금 {usdt(v['capital'])} USDT · 수수료율(한 쪽) {v['fee_rate'] * 100:.3f}%",
        f"- 규칙 동결 {iso(v['frozen']['at'])} — 이 검증은 동결된 지문 그대로 돌았다",
        "",
        "## E-1 손익 구조 (USDT · %는 쓰지 않는다)",
        "",
    ]
    cols = list(v["table"].keys())
    L += ["| | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)]
    rows = (
        ("거래 수", "trades", lambda x: f"{x}"),
        ("순손익", "net", usdt),
        ("PF", "pf", lambda x: n(x)),
        ("승률", "win_rate", pct),
        ("평균 이익", "avg_win", usdt),
        ("평균 손실", "avg_loss", usdt),
        ("평균이익/평균손실", "payoff", lambda x: n(x)),
        ("최대 일손실", "max_daily_loss", usdt),
        ("이긴 날 / 진 날", None, None),
        ("재현율", "recall", pct),
        ("정밀도", "precision", pct),
    )
    for label, key, fmt in rows:
        cells = []
        for c in cols:
            r = v["table"][c]
            if "error" in r:
                cells.append("스키마 실패")
            elif key is None:
                cells.append(f"{r.get('win_days', '—')} / {r.get('loss_days', '—')}")
            else:
                cells.append(fmt(r.get(key)) if r.get(key) is not None else "—")
        L.append(f"| {label} | " + " | ".join(cells) + " |")
    f = v.get("follows")
    if f:
        L += ["", f"## 광혁-데이터가 실계좌 손익 구조를 따라가나 → **{f['verdict']}** ({f['passed']}/4)", ""]
        L += [f"- {'✅' if c['ok'] else '❌'} {c['check']}" for c in f["checks"]]
    L += ["", "## E-2 재량 거래 — 규칙으로 설명 안 되는 광혁 거래(지우지 않고 표시)", ""]
    for name, d in v["discretionary"].items():
        L.append(
            f"- **{name} 기준**: {d['n']}/{d['of']}건 · 손익 {usdt(d['net'])} · 순손익 중 {pct(d['share_of_net'])} · 이익(플러스 거래 합) 중 {pct(d['share_of_gross_profit'])} · 보유 중앙 {n(d['hold_median_min'], '분', 0)}"
        )
    main = v["discretionary"].get("광혁-데이터")
    if main and main["share_of_gross_profit"] is not None and main["share_of_gross_profit"] >= 0.5:
        L.append("\n**재량 거래가 이익의 절반 이상이다** — 우위가 규칙이 아니라 판단에 있을 수 있다. 그것도 답이다(TRADER-00).")
    return "\n".join(L) + "\n"


def paper_md(p: dict) -> str:
    if not p.get("started"):
        return "# 광혁 복제 페이퍼\n\n아직 시작 전.\n"
    m = p["meta"]
    a, r = p["actual"], p["replica"]
    L = [
        "# 광혁 복제 페이퍼 — 실계좌와 나란히",
        "",
        "> **비공개.** 랩 DB · 공개 사이트에 쓰지 않는다. 화면에 올리는 방식은 TRADER-03 이 정한다.",
        "",
        f"- 시작 {p['since']} · 규칙 {m['version']} · 검증 판정 **{m['verdict']}** · 실매매 후보 {'예' if m['live_candidate'] else '**아니오**(비교 대상으로만)'}",
        "",
        "| | 광혁 실계좌 | 광혁 복제 |",
        "|---|---|---|",
        f"| 거래 | {a['trades']} | {r['trades']} |",
        f"| 순손익 | {usdt(a['net'])} | {usdt(r['net'])} |",
        f"| PF | {n(a['pf'])} | {n(r['pf'])} |",
        f"| 평균이익/평균손실 | {n(a['payoff'])} | {n(r['payoff'])} |",
        f"| 최대 일손실 | {usdt(a['max_daily_loss'])} | {usdt(r['max_daily_loss'])} |",
        f"| 같은 진입(±1시간) | {p['matched']} | |",
    ]
    return "\n".join(L) + "\n"

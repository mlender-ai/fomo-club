"use client";

import { CardShell, CardCta } from "@/components/CardShell";
import { FlowBar } from "@/components/DepthSteps";
import { sectorDisplayName } from "@fomo/core/keyword-cards/sector-display";
import { flowEyebrow, formatKrwShort } from "@fomo/core/keyword-cards/sector-flow";
import type { QuietPickFlowCard } from "@/lib/fomoApi";

/** 업종 셋 한 묶음. 재료가 없으면 아무것도 그리지 않는다 — 빈 제목을 남기지 않는다. */
function BarGroup({
  title,
  rows,
  tone,
  max,
  testId,
}: {
  title: string;
  rows: ReadonlyArray<{ sector: string; net: number }>;
  tone: "out" | "in";
  max: number;
  testId: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid={testId}>
      <p className="font-mono text-ds-label text-ds-text-3">{title}</p>
      {rows.map((row) => (
        <FlowBar
          key={row.sector}
          label={sectorDisplayName(row.sector)}
          amount={formatKrwShort(row.net)}
          ratio={max > 0 ? Math.abs(row.net) / max : 0}
          tone={tone}
        />
      ))}
    </section>
  );
}

/**
 * WO-RESET-08 §B — **자금 흐름 카드.** 종목 카드가 아니라 시장 카드다.
 *
 * ## 그림은 막대와 화살표. 그게 전부다 (§B-2)
 *
 * WO 가 못을 박았다 — *"3D·애니메이션·산키 다이어그램 쓰지 않는다."* 흐름을 화려하게
 * 그리면 그림이 주인공이 되고 숫자가 장식이 된다. 여기서 보여줄 것은 **어디서 빠져
 * 어디로 들어왔나** 하나다.
 *
 * 위(빠진 곳)는 회색, 아래(들어간 곳)는 라임 — 다른 카드와 같은 문법이다.
 * accent 는 언제나 "지금 무슨 일이 벌어지고 있는가" 를 가리킨다.
 *
 * ## 이름을 자르지 않는다 (FLOW-01 §A-1·§A-2)
 *
 * 종전에는 라벨을 막대 **왼쪽 72px 칸**에 두고 `truncate` 했다. 프로덕션 실측에서
 * `반도체와반...` `전자장비와...` 로 잘렸다 — 무슨 업종인지 읽을 수 없는 카드였다.
 *
 * 두 가지를 바꿨다.
 *  ① 분류 원문 대신 **표시명**(`반도체` · `전자부품`)을 쓴다.
 *  ② 라벨을 막대 **위**에 두고 금액과 양 끝에 놓는다. 왼쪽 고정폭 칸은 이름 길이가
 *     제각각이라 반드시 어딘가에서 잘린다 — 칸을 없애면 자를 일도 없다.
 *
 * 그림은 상세 1걸음과 **같은 조각**(`FlowBar`)을 쓴다. 카드와 상세가 다르게 생기면
 * 눌러 들어간 사람이 같은 것을 보고 있는지 확신하지 못한다.
 *
 * ## 한 쌍만 보여주지 않는다 (FLOW-02 §D-2 · 완료 확인 8)
 *
 * 종전에는 막대가 **둘**이었다. 한 쌍만 보여주면 그것만 움직인 것처럼 보인다 —
 * 실제로는 그날 여섯 업종이 같은 방향으로 움직이고 있었다. 상세 1걸음이 이미 셋씩
 * 그리고 있었으므로, **같은 재료를 카드에서도 셋씩** 그린다. 재료가 없는 날에는
 * (오래된 응답) 카드가 짚은 한 쌍으로 되돌아간다 — 빈 그림을 만들지 않는다.
 *
 * ## 인과로 말하지 않는다 (§E-1)
 *
 * 문장은 서버가 만들어 보낸다(`hook`). 화면이 「이동」·「옮겨갔다」 같은 말을 덧붙이지
 * 않는다 — 같은 돈인지 우리는 모른다. 맨 위 라벨도 종류마다 서버가 정한다.
 */
export function FlowCard({ card, onDetail }: { card: QuietPickFlowCard; onDetail?: () => void }) {
  /**
   * 셋씩 그린다(§D-2). 상세 1걸음과 **같은 재료**를 쓴다 — 카드와 상세가 다른 숫자를
   * 말하면 눌러 들어간 사람이 같은 것을 보고 있는지 확신하지 못한다.
   */
  const outflows = card.depth?.outflows ?? [];
  const inflows = card.depth?.inflows ?? [];
  const hasGroups = outflows.length > 0 || inflows.length > 0;
  /** 재료가 없는 응답에서는 카드가 짚은 한 쌍으로 되돌아간다. */
  const pairOut = card.fromSector && typeof card.fromNet === "number" ? [{ sector: card.fromSector, net: card.fromNet }] : [];
  const pairIn = card.toSector && typeof card.toNet === "number" ? [{ sector: card.toSector, net: card.toNet }] : [];
  const outRows = hasGroups ? outflows : pairOut;
  const inRows = hasGroups ? inflows : pairIn;
  /** 두 묶음이 같은 축을 쓴다(§D-1) — 통틀어 가장 큰 절대값이 100% 폭이다. */
  const scale = Math.max(0, ...[...outRows, ...inRows].map((row) => Math.abs(row.net)));

  return (
    <CardShell
      kind="flow"
      testId="flow-card"
      /* 종목 카드가 아니라는 것을 맨 위에서 밝힌다 — 가릴 종목명도 없다(§B-4). */
      eyebrow={<p className="font-mono text-ds-label text-ds-text-3">{flowEyebrow(card.kind ?? "rotation")}</p>}
      cta={onDetail ? <CardCta label="어떤 종목들인지 보기" onClick={onDetail} testId="flow-cta" /> : undefined}
    >

      <p
        className="mt-[20px] whitespace-pre-line break-keep text-ds-hook text-ds-text-1"
        data-testid="flow-hook"
      >
        {card.hook}
      </p>

      {/* ── 그림: 빠진 곳 셋 · 들어온 곳 셋. 같은 축을 쓴다(§D-1) ── */}
      <div className="mt-[14px] space-y-s3" data-testid="flow-figure">
        <BarGroup title="돈이 빠진 곳" rows={outRows} tone="out" max={scale} testId="flow-figure-out" />
        {/* 방향은 화살표 하나로. 애니메이션 없음(§B-2). */}
        {outRows.length > 0 && inRows.length > 0 && (
          <p className="text-center font-mono text-ds-label text-ds-text-3" aria-hidden>
            ↓
          </p>
        )}
        <BarGroup title="돈이 들어온 곳" rows={inRows} tone="in" max={scale} testId="flow-figure-in" />
      </div>

      {card.support.length > 0 && (
        <div className="mt-[18px] space-y-[2px]" data-testid="flow-support">
          {card.support.map((line) => (
            <p key={line} className="break-keep text-ds-label text-ds-text-2">
              {line}
            </p>
          ))}
        </div>
      )}

    </CardShell>
  );
}

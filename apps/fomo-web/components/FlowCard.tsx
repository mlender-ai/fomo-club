"use client";

import { CardShell, CardCta } from "@/components/CardShell";
import { FlowBar } from "@/components/DepthSteps";
import { sectorDisplayName } from "@fomo/core/keyword-cards/sector-display";
import { formatKrwShort } from "@fomo/core/keyword-cards/sector-flow";
import type { QuietPickFlowCard } from "@/lib/fomoApi";

/**
 * WO-RESET-08 §B — **자금 흐름 카드.** 종목 카드가 아니라 시장 카드다.
 *
 * ## 그림은 막대 두 개와 화살표. 그게 전부다 (§B-2)
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
 * ## 인과로 말하지 않는다 (§E-1)
 *
 * 문장은 서버가 만들어 보낸다(`hook`). 화면이 「이동」·「옮겨갔다」 같은 말을 덧붙이지
 * 않는다 — 같은 돈인지 우리는 모른다.
 */
export function FlowCard({ card, onDetail }: { card: QuietPickFlowCard; onDetail?: () => void }) {
  const scale = Math.max(Math.abs(card.fromNet), Math.abs(card.toNet));

  return (
    <CardShell
      kind="flow"
      testId="flow-card"
      /* 종목 카드가 아니라는 것을 맨 위에서 밝힌다 — 가릴 종목명도 없다(§B-4). */
      eyebrow={<p className="font-mono text-ds-label text-ds-text-3">돈이 옮겨가고 있어요</p>}
      cta={onDetail ? <CardCta label="어떤 종목들인지 보기" onClick={onDetail} testId="flow-cta" /> : undefined}
    >

      <p
        className="mt-[20px] whitespace-pre-line break-keep text-ds-hook text-ds-text-1"
        data-testid="flow-hook"
      >
        {card.hook}
      </p>

      {/* ── 그림: 막대 둘. 두 막대가 같은 축을 쓴다(§B-2) ── */}
      <div className="mt-[14px]" data-testid="flow-figure">
        <FlowBar
          label={sectorDisplayName(card.fromSector)}
          amount={formatKrwShort(card.fromNet)}
          ratio={scale > 0 ? Math.abs(card.fromNet) / scale : 0}
          tone="out"
        />
        {/* 방향은 화살표 하나로. 애니메이션 없음(§B-2). */}
        <p className="mt-s2 text-center font-mono text-ds-label text-ds-text-3" aria-hidden>
          ↓
        </p>
        <FlowBar
          label={sectorDisplayName(card.toSector)}
          amount={formatKrwShort(card.toNet)}
          ratio={scale > 0 ? Math.abs(card.toNet) / scale : 0}
          tone="in"
        />
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

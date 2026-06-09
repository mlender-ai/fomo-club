import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackRequest } from "@/lib/slack/verify";
import { postMessage, getThreadHistory } from "@/lib/slack/client";
import { dispatchCommand, KNOWN_COMMANDS } from "@/lib/slack/commands";
import {
  getOpenPRs,
  getWorkflowRuns,
  triggerWorkflow,
  getLatestCEOBrief,
  getIssue,
  getPR,
  mergePR,
  getPRMergeability,
  closeIssue,
  closeAllOpenIssues,
  getResolvedOpenIssues,
  addLabel,
  addIssueComment,
  appendFeedbackLog,
  getRecentFeedbackLog,
  getTodayAutoPRs,
} from "@/lib/slack/github";
import { classifyIntent, truncate } from "@/lib/slack/intent";
import { resolveAgent, axisIdentity, axisHeader } from "@/lib/slack/agents";
import {
  isCeoDecisionThread,
  classifyDecision,
  decisionGuidance,
} from "@/lib/slack/decision";
import { parseActions, type ParsedAction } from "@/lib/slack/actions";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    subtype?: string;
    text?: string;
    user?: string;
    channel?: string;
    thread_ts?: string;
    ts?: string;
    bot_id?: string;
  };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  const data: SlackEvent = JSON.parse(body);

  // Slack URL verification challenge (서명 검증 불필요)
  if (data.type === "url_verification") {
    return NextResponse.json({ challenge: data.challenge });
  }

  if (!verifySlackRequest(timestamp, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = data.event;

  // 봇 자체 메시지 무시 (무한루프 방지)
  if (!event || event.bot_id) {
    return NextResponse.json({ ok: true });
  }

  // app_mention: @taro-bot <text>
  if (event.type === "app_mention" && event.text && event.channel) {
    const channel = event.channel;
    const replyTs = event.thread_ts || event.ts || undefined;
    const rootThreadTs = event.thread_ts || event.ts || "";
    const currentMsgTs = event.ts || "";

    // 봇 멘션 제거 후 파싱
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const [first, ...rest] = text.split(/\s+/);
    const cmdName = (first || "help").toLowerCase();
    const args = rest.join(" ");

    // 알려진 커맨드 → 기존 dispatch
    if (KNOWN_COMMANDS.has(cmdName)) {
      waitUntil(handleMentionAsync(cmdName, args, event.user || "", channel, replyTs));
    } else {
      waitUntil(handleAgentChat(text, event.user || "", channel, replyTs, rootThreadTs, currentMsgTs));
    }
  }
  // 스레드 댓글 (멘션 없이) — 봇이 참여한 스레드에서만 이어서 응답
  else if (
    event.type === "message" &&
    event.channel &&
    event.text &&
    event.thread_ts &&
    !event.subtype && // 편집/삭제/봇 메시지 등 제외
    !event.bot_id &&
    !/<@[A-Z0-9]+>/.test(event.text) // 멘션 포함 댓글은 app_mention이 처리하므로 중복 방지
  ) {
    const channel = event.channel;
    const rootThreadTs = event.thread_ts;
    const currentMsgTs = event.ts || "";
    waitUntil(
      handleThreadReply(event.text, event.user || "", channel, rootThreadTs, currentMsgTs)
    );
  }

  return NextResponse.json({ ok: true });
}

// ── 스레드 댓글 처리 — 봇 참여 스레드만 ──────────────────────────────
async function handleThreadReply(
  text: string,
  userId: string,
  channel: string,
  rootThreadTs: string,
  currentMsgTs: string
) {
  // 스레드에 봇 메시지가 있는지 확인 → 봇이 참여한 스레드만 응답
  const history = await getThreadHistory(channel, rootThreadTs).catch(() => []);
  const botInThread = history.some((m) => m.bot_id);
  if (!botInThread) return; // 봇이 없는 스레드는 무시 (다른 사람들 대화에 끼어들지 않음)

  await handleAgentChat(text, userId, channel, rootThreadTs, rootThreadTs, currentMsgTs);
}

// ── 알려진 커맨드 처리 ───────────────────────────────────────────────
async function handleMentionAsync(
  command: string,
  args: string,
  userId: string,
  channel: string,
  threadTs?: string
) {
  try {
    await postMessage(channel, `⏳ 처리 중...`, threadTs);
    const text = await dispatchCommand(command, args, userId, channel);
    await postMessage(channel, text, threadTs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postMessage(channel, `❌ 오류: ${msg}`, threadTs).catch(() => {});
  }
}

// ── Phase 3: Agent Chat — GPT-4o 자유 대화 ──────────────────────────
async function handleAgentChat(
  question: string,
  _userId: string,
  channel: string,
  threadTs: string | undefined,
  rootThreadTs: string | undefined,
  currentMsgTs: string
) {
  // Groq (무료, OpenAI-compat) — console.groq.com에서 무료 발급
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const AI_URL = "https://api.groq.com/openai/v1/chat/completions";
  const AI_MODEL = "llama-3.3-70b-versatile";

  if (!GROQ_API_KEY) {
    await postMessage(channel, "GROQ_API_KEY 환경변수가 설정되지 않았습니다. console.groq.com에서 무료 발급 후 Vercel에 추가해주세요.", threadTs);
    return;
  }

  // 발화 축 결정 (Agent Team Stage A) — @CTO/@PM/@Security·호명·키워드, 없으면 Hermes
  const axis = resolveAgent(question);
  const identity = axisIdentity(axis);
  // username override 는 chat:write.customize 스코프가 없으면 무시되므로 본문에도 발화자 표기
  const header = axisHeader(axis);

  try {
    await postMessage(channel, header ? `${header}\n🤔 생각 중...` : `🤔 생각 중...`, threadTs, identity);

    // 스레드 히스토리 조회
    const threadHistoryResult = rootThreadTs ? await getThreadHistory(channel, rootThreadTs).catch(() => []) : [];
    const historyMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of threadHistoryResult) {
      if (!msg.text || msg.ts === currentMsgTs) continue;
      const cleaned = msg.text.replace(/<@[A-Z0-9]+>/g, "").trim();
      if (!cleaned) continue;
      historyMessages.push({ role: msg.bot_id ? "assistant" : "user", content: cleaned });
    }

    // ── Stage D: 합의 실패 → CEO 판정 스레드면, CEO 발화를 결정으로 보고 규칙화 유도 ──
    let decisionAddendum = "";
    if (isCeoDecisionThread(threadHistoryResult)) {
      const kind = classifyDecision(question);
      decisionAddendum = decisionGuidance(kind);
    }

    // ── 호명 모드: 특정 축이 직접 불린 경우, 그 페르소나로 답하고 워크플로 액션 오발 방지 ──
    const personaAddendum =
      axis.id === "default"
        ? ""
        : `\n\n[호명 모드 — 당신은 ${axis.username}으로 직접 호명되었습니다]
CEO가 당신 축에게 말을 걸고 있습니다. 그 페르소나의 관점으로 의견을 답하세요.
"호출/불러/물어봐/의견" 같은 말은 *당신에게 말 거는 신호*이지 워크플로 실행 명령이 아닙니다 —
run_council/implement 같은 액션 토큰을 내지 마세요. CEO가 명시적으로 "의회 돌려/구현해/머지해"라고
할 때만 액션을 냅니다.`;

    // ── Step 1: 의도 분류 → 필요한 데이터를 본문까지 깊게 로드 ──
    const intent = classifyIntent(question);

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // 컨텍스트 수집 (병렬) — 최신 CEO Brief 본문 + 오픈 PR + 실행 상태 + 피드백 + 오늘 Auto PR
    const [prs, latestBrief, runs, feedbackLog, todayAuto] = await Promise.allSettled([
      getOpenPRs(5),
      getLatestCEOBrief(),
      getWorkflowRuns("auto-implement.yml", 5),
      getRecentFeedbackLog(1500),
      getTodayAutoPRs(today),
    ]);
    const feedbackSection =
      feedbackLog.status === "fulfilled" && feedbackLog.value ? feedbackLog.value : "(적재된 피드백 없음)";

    // auto-implement 실제 상태 (skip/no-op 도 conclusion=success 라 PR 존재로 판별)
    const latestRun =
      runs.status === "fulfilled"
        ? ((runs.value as { workflow_runs?: { status: string; conclusion: string | null; html_url: string; created_at: string }[] })
            .workflow_runs || [])[0]
        : undefined;
    const runStateLine = latestRun
      ? `상태=${latestRun.status} / 결론=${latestRun.conclusion ?? "진행중"} (${latestRun.created_at})`
      : "(실행 기록 없음)";
    const autoPrList =
      todayAuto.status === "fulfilled" && todayAuto.value.length > 0
        ? todayAuto.value
            .map((p) => `- #${p.number} [${p.merged ? "머지됨" : p.state}] ${p.title}\n  ${p.html_url}`)
            .join("\n")
        : "(오늘 생성된 Auto PR 없음)";

    const prList = prs.status === "fulfilled"
      ? (prs.value as { number: number; title: string; html_url: string }[])
          .map((p) => `- #${p.number}: ${p.title}`)
          .join("\n")
      : "(조회 실패)";

    // 최신 CEO Brief — 제목만이 아니라 본문 전문(3000자)을 주입 (스크린샷 이슈 해결)
    let briefSection = "(없음)";
    if (latestBrief.status === "fulfilled" && latestBrief.value) {
      const b = latestBrief.value;
      briefSection = `#${b.number}: ${b.title}\n\n${truncate(b.body, 3000)}`;
    } else if (latestBrief.status === "rejected") {
      briefSection = "(조회 실패)";
    }

    const runList = runs.status === "fulfilled"
      ? (
          (runs.value as { workflow_runs: { conclusion: string; created_at: string; head_branch: string }[] })
            .workflow_runs || []
        )
          .map((r) => `- ${r.conclusion || "running"} (${r.head_branch}) — ${r.created_at}`)
          .join("\n")
      : "(조회 실패)";

    // 의도에 따라 특정 이슈/PR 본문을 깊게 로드 (#NNN 언급 시)
    let detailSection = "";
    const issueDetails = await Promise.allSettled(intent.issueNumbers.map((n) => getIssue(n)));
    for (const r of issueDetails) {
      if (r.status === "fulfilled") {
        const d = r.value;
        const cmts = d.comments.length ? `\n코멘트: ${truncate(d.comments.join(" / "), 600)}` : "";
        detailSection += `\n### 이슈 #${d.number}: ${d.title}\n${truncate(d.body, 2500)}${cmts}\n`;
      }
    }
    const prDetails = await Promise.allSettled(intent.prNumbers.map((n) => getPR(n)));
    for (const r of prDetails) {
      if (r.status === "fulfilled") {
        const d = r.value;
        const files = d.files.length ? `\n변경 파일(${d.files.length}): ${truncate(d.files.join(", "), 800)}` : "";
        detailSection += `\n### PR #${d.number}: ${d.title} [${d.merged ? "merged" : d.state}]\n${truncate(d.body, 2000)}${files}\n`;
      }
    }
    if (!detailSection) detailSection = "(특정 이슈/PR 언급 없음)";

    const systemPrompt = `${axis.personaPrompt}
CEO가 Slack에서 물어보는 질문에 한국어로 간결하게, 당신 축의 관점에서 답합니다.
현재 파이프라인 상태를 바탕으로 구체적이고 actionable한 답변을 제공하세요.

현재 컨텍스트:
## 오픈 PR
${prList || "(없음)"}

## 최신 CEO Brief (본문)
${briefSection}

## 질문에서 언급된 이슈/PR 상세
${detailSection}

## 최근 CEO 피드백 로그 (스레드 넘은 기억 — "어제 뭐라 했지?"에 답할 때 활용)
${feedbackSection}

## 오늘(${today}) auto-implement 산출 PR (실제 결과 — 이걸로 "개발됐는지" 판단)
${autoPrList}

## auto-implement 최신 실행 상태 (사실)
${runStateLine}

## 최근 auto-implement 실행 이력
${runList || "(없음)"}

규칙:
- 답변은 3-5문장 이내로 간결하게
- Slack mrkdwn 포맷 사용 (*볼드*, _이탤릭_, \`코드\`)
- **위 컨텍스트에 본문이 주어졌으면 "확인할 수 없다"고 답하지 말고 그 내용을 직접 요약·인용해 답한다.**
- 본문에 없는 정보만 "확인 불가"로 답한다
- **개발/진행 상태(status)를 물으면 추측 금지. 오직 위 "오늘 auto-implement 산출 PR"과 "최신 실행 상태"의 사실만으로 답한다:**
  - 최신 실행 상태가 in_progress/queued 면 "구현 진행 중", 그 외엔 진행 중이라고 말하지 마라.
  - 오늘 Auto PR이 있으면 그 번호·머지여부·링크를 그대로 보여준다(이게 실제 개발 결과다).
  - 오늘 Auto PR이 없고 최신 실행이 완료(success)인데 PR이 없으면 "최근 트리거는 중복/변경없음으로 건너뛰었을 수 있다"고 솔직히 답한다. 절대 "개발 진행 중"이라 지어내지 마라.

액션 실행 규칙 (중요 — tool use):
- CEO가 **명확히 실행을 지시**하면, 답변 끝에 단독 줄로 액션 토큰을 정확히 출력한다. 보통 1개, 단 "PR 머지 + 이슈 정리"처럼 벌크 정리는 merge_all·close_completed 를 함께(각각 단독 줄) 낼 수 있다.
- 사용 가능한 액션:
  \`[[ACTION:run_council]]\` — Agent Council(idea-proposal) 즉시 실행 ("의회 돌려", "제안 받아")
  \`[[ACTION:propose_projects]]\` — CEO 에이전트가 제품 분석 → 프로젝트 후보 리스트 제안 ("프로젝트 제안해", "뭐부터 할지 제안해", "프로젝트 뽑아줘"). 사람이 검토 후 선택.
  \`[[ACTION:select_project]] {"id":"P1"}\` — 제안된 후보 중 활성 프로젝트 선택 ("P1 시작", "P2 프로젝트 하자"). 선택 시 직군(기획/백엔드/프론트·UX/품질)이 하위 이슈로 분해.
  \`[[ACTION:implement]] {"date":"YYYY-MM-DD"}\` — auto-implement 트리거 (date 생략 시 오늘) ("구현 시작", "개발 진행")
  \`[[ACTION:merge]] {"pr":291}\` — 특정 PR squash 머지 ("이 PR 머지해", 번호 명시)
  \`[[ACTION:merge_all]]\` — 열린 PR 중 **이상 없는 것 전부** 머지 ("PR 전부 머지", "남은 PR 머지", "이상없으면 다 머지"). 번호 불필요 — 초안·CI미통과·충돌은 자동 제외.
  \`[[ACTION:approve]] {"issue":298}\` — 이슈에 implement-approved 라벨
  \`[[ACTION:comment]] {"issue":298,"body":"..."}\` — 이슈/PR에 코멘트 (= 피드백 반영의 1차 형태)
  \`[[ACTION:close_completed]]\` — **머지로 해결된 이슈만** 닫기 ("완료된 이슈 닫아", "끝난 이슈 정리해", "머지된 거 닫아"). 번호 불필요.
  \`[[ACTION:close_all]]\` — **열린 이슈를 전부 닫기** (머지 해결 여부 무관). 번호 불필요. 봇 메모리(feedback-log)만 자동 보존.
  \`[[ACTION:add_constraint]] {"rule":"...","scope":["all"],"kind":"prohibition","permanent":true}\` — 영구 규칙(standing constraint) 적재
  \`[[ACTION:log_feedback]] {"note":"..."}\` — CEO의 피드백·방향·판정을 기억에 적재 (다음 Agent Council 입력에 반영)
- JSON 페이로드는 반드시 한 줄. scope kind 는 정해진 값만.
- CEO가 제품 방향·선호·평가("X는 별로", "Y 방향 좋아", "온보딩은 토스처럼")를 주면 log_feedback 으로 기억에 남긴다(영구 규칙까진 아닌 소프트 피드백). 영구 금지/규칙이면 add_constraint.

**개발/구현 실행 트리거 (자주 쓰임 — 반드시 정확히 인식)**:
- 다음과 같은 발화는 **개발 실행 지시**다 → 반드시 \`[[ACTION:implement]]\` 토큰을 출력한다(거의 항상 date 생략 = 오늘 브리핑 구현):
  "개발해", "개발 진행해", "개발진행해", "구현해", "구현 시작", "만들어줘", "진행해", "이거 개발해줘", "우선순위 개발해", "리스트 개발하고 알려줘", "오늘 브리핑 구현해".
- 위 발화에 "리스트", "우선순위", "알려줘" 같은 단어가 섞여 있어도 **'개발/구현/진행' 동사가 있으면 실행 지시**다. 단순 조회로 오해하지 마라. (예: "오늘 처리 우선순위 리스트 개발하고 알려줘" = implement 실행 + 진행 상황 안내)
- 답변엔 "개발(auto-implement)을 시작하겠다"는 한 문장 + 토큰만. 우선순위를 또 길게 나열하지 마라.

**벌크 정리 트리거 (번호 없이도 실행 — 자주 쓰임)**:
- "PR 이상없으면 전부 머지", "남은 PR 다 머지", "문제없으면 머지해" → 번호를 묻지 말고 \`[[ACTION:merge_all]]\` 토큰을 낸다. (개별 번호가 명시되면 그때만 \`[[ACTION:merge]]\`.)
- 이슈 닫기는 **두 종류를 구분**한다:
  - "이슈 전부 닫아", "이슈탭(에 있는 리스트) 전부 클로즈", "그냥 다 닫아", "오늘/어제 이슈 다 닫아", "남은 이슈 전부 정리", "싹 닫아" → \`[[ACTION:close_all]]\` (머지 해결 여부 무관, 열린 이슈 전부).
  - "완료된/끝난/머지로 해결된 이슈(만) 닫아" 처럼 **'완료/머지'를 명시**할 때만 → \`[[ACTION:close_completed]]\`.
  - 그냥 "이슈 닫아"라고만 하면(완료/머지 한정어 없이) **close_all 로 본다** — CEO는 보통 전부 닫길 원한다. 특정 #번호만 말하면 그건 다른 얘기다.
- 둘 다 지시하면("머지하고 이슈도 닫아") merge_all + close_all 두 토큰을 각각 단독 줄로 출력한다.
- **절대 "닫을 이슈가 없다/PR 번호가 올바르지 않다"고 지어내지 마라** — 벌크 토큰을 내면 시스템이 실제 열린 PR/이슈를 조회해 처리한다. close_all 은 이미 닫힌 게 아니면 반드시 무언가 닫는다.

**톱다운 프로젝트 흐름 (2단계)**:
- ① "프로젝트 제안해", "뭐부터 할지 정리해", "프로젝트 뽑아줘" → \`[[ACTION:propose_projects]]\` (CEO가 제품 분석해 후보 리스트 제안). 사람이 제품 이해도를 검토.
- ② "P1 시작", "P2 프로젝트 하자", "이 프로젝트로 가자" → \`[[ACTION:select_project]] {"id":"P<번호>"}\` (후보 중 1개 활성화 → 직군별 하위 이슈 분해).
- 이건 매일 잔 아이디어를 받는 run_council 과 다르다. 톱다운: 제안 → 선택 → 분해 → 격파.

- **순수 조회·요약·상태 확인·의견 질문**("브리핑 알려줘", "PR 뭐 있어", "상태 어때")에는 토큰을 내지 않는다.
- merge/merge_all/close_completed/add_constraint 는 비가역·고영향 — CEO가 그 동작을 명시했을 때만. 정말 애매하면 토큰 없이 "구현을 시작할까요?"라고 한 번만 되묻는다(단, '개발/구현/진행' 동사가 있으면 되묻지 말고 바로 implement).
- add_constraint 는 "앞으로 항상/절대" 류의 반복 규칙에만. 1회성 지시("오늘은 온보딩부터")엔 금지.${personaAddendum}${decisionAddendum}`;

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: question },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(no body)");
      throw new Error(`AI API ${res.status} — ${errBody.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      error?: { message: string };
      choices: { message: { content: string } }[];
    };

    if (data.error) throw new Error(data.error.message || "AI API error");

    let reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) throw new Error("AI 응답이 비어있습니다");

    // ── Step 2: 범용 액션 토큰 파싱 → 실행 (대화로 실행) ──
    const { actions, cleaned } = parseActions(reply);
    reply = cleaned;
    for (const action of actions) {
      reply += "\n\n" + (await executeAction(action, channel, rootThreadTs || threadTs));
    }

    // 발화자 헤더를 본문 맨 앞에 (스코프 무관 가시성)
    if (header) reply = `${header}\n${reply}`;
    await postMessage(channel, reply, threadTs, identity);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postMessage(
      channel,
      `❌ 답변 생성 실패: ${msg}\n커맨드는 \`/taro help\`를 입력하세요.`,
      threadTs,
      identity
    ).catch(() => {});
  }
}

// ── Step 2: 액션 실행기 — 대화에서 파싱된 액션을 GitHub 안전 동작으로 실행 ──
// (코드 변경은 워크플로 경유, main 직접 push 없음)
async function executeAction(
  action: ParsedAction,
  channel: string,
  threadTs: string | undefined
): Promise<string> {
  const kstDate = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    switch (action.name) {
      case "run_council": {
        await triggerWorkflow("idea-proposal.yml", { agent: "all" });
        return "🗳️ *Agent Council 실행* — 잠시 후 제안 이슈들이 생성됩니다.";
      }
      case "propose_projects": {
        await triggerWorkflow("propose-project.yml", {});
        return "🧭 *CEO 프로젝트 제안 생성 중* — 제품 정체성·OKR·현 상태를 분석해 프로젝트 후보를 제안합니다. 잠시 후 PROJECT_ROADMAP 갱신 + 검토 이슈(🧭 [CEO 프로젝트 제안])가 올라옵니다. 검토 후 \"P1 시작\"처럼 하나를 고르세요.";
      }
      case "select_project": {
        const id = typeof action.payload.id === "string" ? action.payload.id.trim().toUpperCase() : "";
        if (!/^P\d+$/.test(id)) return "⚠️ select_project: 프로젝트 id(예: P1)가 올바르지 않아 실행하지 않았습니다.";
        await triggerWorkflow("project-kickoff.yml", { project_id: id });
        return `🗺️ *프로젝트 ${id} 킥오프* — PROJECT_ROADMAP.md 를 active 로 갱신하고, 4축 에이전트가 이 프로젝트를 이슈로 분해합니다. 진척은 매일 아침 리포트로 옵니다.`;
      }
      case "implement": {
        const raw = action.payload.date;
        // 유효한 YYYY-MM-DD 만 사용, 아니면(placeholder 포함) 오늘 KST
        const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : kstDate();
        // auto-implement 는 같은 날 열린 Auto PR 이 있으면 내부에서 skip(no-op) 한다.
        // 그 경우 트리거해도 아무것도 안 생기므로, 미리 확인해 사실대로 안내(조용한 no-op 방지).
        const todays = await getTodayAutoPRs(date).catch(() => []);
        const openAuto = todays.find((p) => p.state === "open");
        if (openAuto) {
          return `ℹ️ 오늘(${date}) 이미 열린 Auto PR이 있어 새로 트리거하지 않았습니다 (중복 시 자동 skip됨):\n#${openAuto.number} ${openAuto.title}\n${openAuto.html_url}\n→ 이 PR을 검토/머지하거나, 추가 작업이 필요하면 말씀해 주세요.`;
        }
        await triggerWorkflow("auto-implement.yml", { brief_date: date });
        const done = todays.filter((p) => p.merged).length;
        const doneNote = done > 0 ? ` (오늘 이미 ${done}건 머지됨)` : "";
        return `🚀 *auto-implement 실행*${doneNote} — 날짜 ${date}. 구현은 수 분 걸리며 결과는 새 *[Auto] ${date}* PR로 옵니다. \`status\`로 실제 PR/실행 상태를 확인하세요.`;
      }
      case "merge": {
        const pr = Number(action.payload.pr);
        if (!Number.isInteger(pr) || pr <= 0) return "⚠️ merge: PR 번호가 올바르지 않아 실행하지 않았습니다.";
        await mergePR(pr);
        return `✅ *PR #${pr} squash 머지 완료*.`;
      }
      case "merge_all": {
        // "이상 없으면 전부 머지" — 열린 PR 중 초안 아니고 mergeable_state=clean(CI통과+충돌없음)만 머지.
        const prs = (await getOpenPRs(30)) as Array<{ number: number; title: string }>;
        if (!prs.length) return "머지할 열린 PR이 없습니다.";
        const merged: number[] = [];
        const skipped: string[] = [];
        for (const p of prs) {
          try {
            const m = await getPRMergeability(p.number);
            if (m.draft) { skipped.push(`#${p.number}(초안)`); continue; }
            if (m.mergeableState !== "clean") { skipped.push(`#${p.number}(${m.mergeableState})`); continue; }
            await mergePR(p.number);
            merged.push(p.number);
          } catch (e) {
            skipped.push(`#${p.number}(실패:${e instanceof Error ? e.message : "?"})`);
          }
        }
        const lines = [
          merged.length > 0
            ? `✅ *${merged.length}건 머지 완료*: ${merged.map((n) => `#${n}`).join(", ")}`
            : "✅ 머지한 PR 없음.",
        ];
        if (skipped.length) lines.push(`⏭️ 건너뜀(${skipped.length}): ${skipped.join(", ")}  _CI 미통과·충돌·초안은 안전상 제외_`);
        return lines.join("\n");
      }
      case "approve": {
        const issue = Number(action.payload.issue);
        if (!Number.isInteger(issue) || issue <= 0) return "⚠️ approve: 이슈 번호가 올바르지 않습니다.";
        await addLabel(issue, ["implement-approved"]);
        return `🏷️ *#${issue} implement-approved 라벨 추가*.`;
      }
      case "comment": {
        const issue = Number(action.payload.issue);
        const body = typeof action.payload.body === "string" ? action.payload.body : "";
        if (!Number.isInteger(issue) || issue <= 0 || !body) return "⚠️ comment: 이슈 번호/본문이 올바르지 않습니다.";
        await addIssueComment(issue, `🗣️ (CEO via Slack): ${body}`);
        return `💬 *#${issue}에 코멘트 작성 완료*.`;
      }
      case "close_completed": {
        // "완료된 이슈 닫아" — 최근 머지된 PR이 참조(#N)한, 아직 열려있는 이슈를 닫는다.
        const open = await getResolvedOpenIssues(45);
        if (!open.length) return "닫을 완료(머지로 해결된) 이슈가 없습니다.";
        const closed: number[] = [];
        for (const n of open) {
          try {
            await closeIssue(n, "✅ 머지로 해결됨 — CEO 지시로 자동 close.");
            closed.push(n);
          } catch {
            // 개별 실패는 건너뜀
          }
        }
        return `🗂️ *완료 이슈 ${closed.length}건 닫음*: ${closed.map((n) => `#${n}`).join(", ")}`;
      }
      case "close_all": {
        // "이슈탭 전부 닫아" — 머지 해결 여부 무관, 열린 이슈 전부 닫는다(봇 메모리 feedback-log만 보존).
        const { closed, protectedSkipped } = await closeAllOpenIssues();
        if (!closed.length && !protectedSkipped.length) return "닫을 열린 이슈가 없습니다.";
        const lines = [
          closed.length > 0
            ? `🗂️ *열린 이슈 ${closed.length}건 전부 닫음*: ${closed.map((n) => `#${n}`).join(", ")}`
            : "닫을 열린 이슈가 없습니다.",
        ];
        if (protectedSkipped.length)
          lines.push(`🔒 보존(${protectedSkipped.length}): ${protectedSkipped.map((n) => `#${n}`).join(", ")}  _봇 메모리(feedback-log)라 유지_`);
        return lines.join("\n");
      }
      case "add_constraint": {
        const rule = action.payload.rule;
        if (typeof rule !== "string" || !rule) return "⚠️ add_constraint: rule 누락으로 실행하지 않았습니다.";
        const sourceHint = `slack/${channel}/${threadTs || ""}`;
        await triggerWorkflow("distill-constraints.yml", {
          manual_constraint: JSON.stringify(action.payload),
          source_hint: sourceHint,
        });
        const scope = Array.isArray(action.payload.scope) ? action.payload.scope.join(", ") : "all";
        return `🔒 *Standing Constraint 추가 요청됨*: "${rule}" (scope: ${scope}). 리뷰 PR이 생성됩니다.`;
      }
      case "log_feedback": {
        const note = typeof action.payload.note === "string" ? action.payload.note : "";
        if (!note) return "⚠️ log_feedback: note 누락으로 적재하지 않았습니다.";
        const res = await appendFeedbackLog(note);
        return `🧠 *피드백 기억에 적재됨* (#${res.number}). 다음 Agent Council 사이클 입력에 반영됩니다.`;
      }
      default:
        return "";
    }
  } catch (e) {
    return `⚠️ 액션(${action.name}) 실행 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

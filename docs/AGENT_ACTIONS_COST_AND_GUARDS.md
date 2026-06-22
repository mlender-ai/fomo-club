# Agent Actions Cost and Guards

FOMO Club의 GitHub Actions 에이전트 비용은 이 Codex 대화 토큰에서 나가지 않는다.

## 비용/토큰 출처

| 경로 | 주 사용 인증 | 비용/사용량이 잡히는 곳 |
|---|---|---|
| `auto-implement.yml`, `implement-task.yml` | `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth/구독 또는 연결된 Anthropic 사용량 |
| `idea-proposal.yml`, `propose-project.yml`, `project-kickoff.yml`, `project-decompose.yml`, `propose-northstar.yml`, `distill-constraints.yml` | GitHub `models: read`, `actions/ai-inference@v1` | GitHub Models/Actions 쪽 사용량 |
| Slack 자유대화 | `GROQ_API_KEY` | Groq API 사용량 |
| Codex 로컬 작업 | 현재 Codex 세션 | 이 대화의 Codex 토큰 |

## 안전장치

- 자율기획 계열 워크플로는 기본 실행되지 않는다.
- `idea-proposal.yml`, `propose-project.yml`, `propose-northstar.yml`은 `approval_token=SSOT_EXECUTION_ONLY`가 없으면 job이 skip된다.
- Slack에서는 `run_council`, `propose_projects` 액션을 실제 workflow dispatch로 연결하지 않는다.
- 에이전트는 새 제품 방향을 제안하지 않고, 광혁이 지정한 방향 안에서 실행·검증·소스발굴·모니터링만 한다.
- 실제 외부 소스 연동, prod DDL, 유료 서비스, 개인정보 처리 변경은 광혁 승인 후 별도 PR로만 진행한다.

# EAS Update OTA — Expo Go 자동 업데이트 설정

main 브랜치에 모바일 변경이 머지되면 GitHub Actions가 EAS Update를 자동 발행한다. Expo Go 앱은 동일 SDK runtime을 사용하므로 사용자가 앱을 재시작하면 최신 JS 번들을 자동 수령한다.

## 사용자가 1회 수동으로 해야 할 작업

### 1) Expo 프로젝트 초기화 (projectId 발급)

로컬에서:

```bash
cd apps/tarot-mobile
npx eas login          # Expo 계정으로 로그인
npx eas init           # 새 EAS 프로젝트 생성 → projectId 발급
```

발급된 projectId(UUID)를 메모해둔다.

### 2) GitHub Repository Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret:

| Secret 이름      | 값                                            |
| ---------------- | --------------------------------------------- |
| `EXPO_TOKEN`     | expo.dev → Account Settings → Access Tokens   |
| `EAS_PROJECT_ID` | 위 1단계에서 발급된 UUID                      |

두 secret이 모두 설정되어야 워크플로우가 동작한다. 하나라도 빠지면 자동으로 skip되며 워크플로우 로그에 경고만 남는다.

## 동작 흐름

1. main에 모바일 변경 푸시(`apps/tarot-mobile/**`, `packages/shared/**`, `packages/tarot-core/**`)
2. GitHub Actions `eas-update.yml` 워크플로우 실행
3. `eas update --branch production --channel production --message "<커밋 메시지>"` 발행
4. Expo Go에서 앱 재시작 → 자동으로 새 번들 다운로드 후 적용

## 수동 발행

특정 변경을 즉시 배포하려면:

```bash
gh workflow run eas-update.yml -f message="hotfix: <설명>"
```

또는 GitHub Actions UI → "EAS Update (Mobile OTA)" → "Run workflow".

## 채널 구조

| 채널            | 용도                                       | 트리거                    |
| --------------- | ------------------------------------------ | ------------------------- |
| `development`   | 로컬 dev build                             | `eas build --profile development` |
| `preview`       | 내부 테스트                                | `eas build --profile preview`     |
| `production`    | 일반 사용자 + Expo Go OTA                  | main 머지 시 자동         |

## 주의사항

- **runtimeVersion 정책은 `sdkVersion`**. Expo SDK 메이저 업그레이드 시(54 → 55) Expo Go가 새 SDK 빌드로 들어와야 OTA가 동작. 그 사이엔 빌드 재발행 필요.
- 네이티브 코드 변경(새 native module 추가, AndroidManifest 수정 등)은 OTA로 배포 불가 — `eas build` 후 스토어 재제출 필요.
- JS·이미지·React 코드 변경만 OTA로 배포된다.

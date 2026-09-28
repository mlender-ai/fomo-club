/**
 * FCE 가 어디 있나 (OPS-01).
 *
 * `~/Documents` 는 macOS 가 지키는 폴더라 launchd 로 뜬 러너가 못 읽는다(TCC · `Operation not permitted`).
 * 그래서 FCE 를 `~/fce` 로 옮긴다 — FCE 는 경로를 전부 상대로 쓰므로 FCE 코드는 그대로다.
 *
 * 순서: `FCE_HOME` → `~/fce`(있으면) → 옛 자리 `~/Documents/Fomo club engine`.
 * 옮기기 전후 어느 쪽이든 같은 코드가 돈다 — 러너를 다시 올릴 필요가 없다.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FCE_HOME =
  process.env.FCE_HOME ??
  (existsSync(join(homedir(), "fce", "backend")) ? join(homedir(), "fce") : join(homedir(), "Documents", "Fomo club engine"));

export const FCE_BACKEND = process.env.FCE_BACKEND_DIR ?? join(FCE_HOME, "backend");
export const FCE_DB = process.env.FCE_DB_PATH ?? join(FCE_BACKEND, "fomo_control_engine.db");
export const FCE_PYTHON = process.env.FCE_PYTHON ?? "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3";

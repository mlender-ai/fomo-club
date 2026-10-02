"""비공개 저장 위치 (TRADER-00 원칙 1 · TRADER-01 §0).

> 저장 위치는 비공개. **레포에 거래 데이터 커밋 금지**

fomo-club 과 fomo-control-engine 은 **둘 다 공개 레포**다. 그래서 거래 데이터는 어느 레포의
작업 트리 안에도 쓰지 않는다 — `.gitignore` 에 기대지 않는다(규칙 한 줄이 바뀌면 새어 나간다).
기본 자리는 `~/.fomo/trader/` 이고, 그 경로나 상위 어디에 `.git` 이 있으면 **멈춘다**.
"""
from __future__ import annotations

import os
import stat
from pathlib import Path

DEFAULT_DIR = "~/.fomo/trader"


class PrivacyError(RuntimeError):
    pass


def private_dir() -> Path:
    return Path(os.environ.get("FOMO_TRADER_DIR") or DEFAULT_DIR).expanduser().resolve()


def git_root_of(path: Path) -> Path | None:
    """`path` 또는 그 상위에 `.git` 이 있으면 그 자리. 없으면 None."""
    probe = path
    while True:
        if (probe / ".git").exists():
            return probe
        if probe.parent == probe:
            return None
        probe = probe.parent


def ensure_private_dir(path: Path | None = None) -> Path:
    target = (path or private_dir()).expanduser().resolve()
    root = git_root_of(target)
    if root is not None:
        raise PrivacyError(
            f"거래 데이터 자리({target})가 git 작업 트리({root}) 안이다. 레포 밖으로 옮겨라 — FOMO_TRADER_DIR."
        )
    target.mkdir(parents=True, exist_ok=True)
    os.chmod(target, stat.S_IRWXU)  # 700 — 나만 읽는다
    return target


def lock_file(path: Path) -> None:
    if path.exists():
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 600

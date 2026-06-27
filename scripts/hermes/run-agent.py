#!/usr/bin/env python3
"""
Portable Hermes agent runner — Dvoiniki v2.

Loads a task prompt from a file and runs it through the Hermes AIAgent API.
Designed to be committed to the repo and reused by any contributor.

USAGE
    python scripts/hermes/run-agent.py <prompt-file> [--model MODEL] [--provider P] [--base-url U] [--max-iterations N] [--background]

ENVIRONMENT (fallbacks if flags omitted)
    HERMES_MODEL           default model id        (default: agy/gemini-3.5-flash-low)
    HERMES_PROVIDER        provider name           (default: custom)
    HERMES_BASE_URL        custom OpenAI-style URL (default: http://localhost:20128/v1)
    HERMES_MAX_ITERATIONS  tool-call cap           (default: 140)

HERMES INSTALL DETECTION (auto)
    1. HERMES_PYTHON env var (explicit override)
    2. `hermes` on PATH (preferred for global installs)
    3. Venv guessed from common locations:
       - Windows: %LOCALAPPDATA%\\hermes\\hermes-agent\\venv\\Scripts\\python.exe
       - macOS:   ~/.hermes/venv/bin/python  AND  /opt/homebrew/share/hermes/venv/bin/python
       - Linux:   ~/.hermes/venv/bin/python  AND  /usr/local/share/hermes/venv/bin/python

REQUIREMENTS
    The resolved Python must have `run_agent` importable (the Hermes package).
    If not, the script prints install instructions and exits non-zero.
"""

from __future__ import annotations

import io
import os
import platform
import shutil
import subprocess
import sys


def _set_utf8_stdio() -> None:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("NO_COLOR", "1")


def _candidate_pythons() -> list[str]:
    cands: list[str] = []
    explicit = os.environ.get("HERMES_PYTHON")
    if explicit:
        cands.append(explicit)
    system = platform.system()
    home = os.path.expanduser("~")
    if system == "Windows":
        local = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
        cands.append(os.path.join(local, "hermes", "hermes-agent", "venv", "Scripts", "python.exe"))
    else:
        cands += [
            os.path.join(home, ".hermes", "venv", "bin", "python"),
            "/usr/local/share/hermes/venv/bin/python",
            "/opt/homebrew/share/hermes/venv/bin/python",
        ]
    on_path = shutil.which("hermes")
    if on_path:
        cands.append(on_path)
    return cands


def _resolve_hermes() -> str:
    last_err = ""
    for cand in _candidate_pythons():
        if not os.path.exists(cand) and not shutil.which(cand):
            continue
        try:
            res = subprocess.run(
                [cand, "-c", "import run_agent; print('ok')"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if res.returncode == 0 and "ok" in res.stdout:
                return cand
            last_err = res.stderr.strip() or res.stdout.strip()
        except Exception as exc:
            last_err = str(exc)
    print(
        "ERROR: could not find a Hermes installation with `run_agent` importable.\n"
        "Tried: " + ", ".join(_candidate_pythons()) + "\n"
        "Last error: " + last_err + "\n\n"
        "Install Hermes, then either:\n"
        "  - set HERMES_PYTHON=/path/to/venv/python, or\n"
        "  - ensure `hermes` is on PATH.",
        file=sys.stderr,
    )
    sys.exit(2)


def _agent_body(prompt_path: str) -> str:
    model = os.environ.get("HERMES_MODEL", "agy/gemini-3.5-flash-low")
    provider = os.environ.get("HERMES_PROVIDER", "custom")
    base_url = os.environ.get("HERMES_BASE_URL", "http://localhost:20128/v1")
    max_iter = int(os.environ.get("HERMES_MAX_ITERATIONS", "140"))
    skip_memory = os.environ.get("HERMES_SKIP_MEMORY", "0") == "1"
    return f'''
import io, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("NO_COLOR", "1")

with open({prompt_path!r}, "r", encoding="utf-8") as f:
    prompt = f.read()

from run_agent import AIAgent

agent = AIAgent(
    model={model!r},
    provider={provider!r},
    base_url={base_url!r},
    quiet_mode=True,
    skip_memory={skip_memory!r},
    max_iterations={max_iter},
    platform="cli",
)

response = agent.chat(prompt)
if isinstance(response, (list, tuple)):
    response = "\\n".join(str(x) for x in response)
sys.stdout.write(str(response))
sys.stdout.write("\\n")
sys.stdout.flush()
'''


def main() -> None:
    _set_utf8_stdio()
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    prompt_file = args[0]
    if not os.path.isfile(prompt_file):
        print(f"ERROR: prompt file not found: {prompt_file}", file=sys.stderr)
        sys.exit(2)

    python = _resolve_hermes()
    body = _agent_body(os.path.abspath(prompt_file))
    result = subprocess.run([python, "-c", body])
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()

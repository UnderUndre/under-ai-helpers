import sys
import subprocess

with open(".hermes-prompt.txt", "r", encoding="utf-8") as f:
    prompt = f.read()

print("Invoking Hermes with prompt...", flush=True)
result = subprocess.run(["hermes", "chat", "-q", prompt, "-Q", "--source", "claude-orch", "--max-turns", "50"])
sys.exit(result.returncode)

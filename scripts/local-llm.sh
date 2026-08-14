#!/bin/bash
# Bridge to the local Ollama server — lets agents delegate candidate-generation
# work to a local model (default gemma4:31b, the only local model that passed
# the planted-bug probe with 2/2 found and 0 hallucinations; qwen3-coder failed it).
#
# Usage: local-llm.sh <prompt-file> [model]
# Prints the model's reply to stdout. Exits non-zero if Ollama is unreachable
# or the request fails — callers must treat that as "lane unavailable", never
# as an application error.
set -euo pipefail

PROMPT_FILE="${1:?usage: local-llm.sh <prompt-file> [model]}"
MODEL="${2:-gemma4:31b}"

python3 - "$PROMPT_FILE" "$MODEL" <<'EOF'
import json, sys, urllib.request

prompt = open(sys.argv[1]).read()
body = json.dumps({
    "model": sys.argv[2],
    "messages": [{"role": "user", "content": prompt}],
    "stream": False,
    "options": {"temperature": 0.1, "num_ctx": 16384},
}).encode()
req = urllib.request.Request(
    "http://localhost:11434/api/chat", data=body,
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=900) as r:
    print(json.load(r)["message"]["content"])
EOF

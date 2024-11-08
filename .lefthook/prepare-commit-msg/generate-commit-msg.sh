#!/bin/bash

openai_model=gpt-4o
# openai_model=gpt-4o-mini

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

function generate_with() {
  echo $diff | sgpt --no-cache --model $openai_model --role commit-msg | sed 's/^\s*```//;s/```\s*$//' | awk 'NF {p=1} p; {if (NF) {p=1}}'
}

if [ -z "$COMMIT_SOURCE" ]; then
    diff=$(git diff --cached -- . ':(exclude)pnpm-lock.yaml' | head -c 5000)

    generate_with $openai_model | fold -w 100 > "$COMMIT_MSG_FILE"
fi

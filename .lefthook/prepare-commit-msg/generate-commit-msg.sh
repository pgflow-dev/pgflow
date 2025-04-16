#!/bin/bash

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Default to openai API
API_TYPE="openai"

README_MD=$(cat README.md)
ADDITIONAL_PROMPT="
- make your commit concise and clear
- do not explain basics, do not mindlessly repeat things or names
"

if [ -z "$COMMIT_SOURCE" ]; then
    diff=$(git diff --cached --no-ext-diff --unified -- . ':(exclude)pnpm-lock.yaml' | head -c 20000)

    echo $diff |
      ./.lefthook/diff-to-commit-msg.sh "$API_TYPE" "$ADDITIONAL_PROMPT" |
      sed 's/^\s*```//;s/```\s*$//' | # remove code fences
      awk 'NF {p=1} p; {if (NF) {p=1}}' | # remove empty lines
      sed 's/\. /.\n/g' | # add newlines between sentences
      fmt --split-only --width=100 > "$COMMIT_MSG_FILE"
fi

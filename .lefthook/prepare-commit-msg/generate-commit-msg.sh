#!/bin/bash

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
PROMPT_TEXT="
Based on the changes above, generate commit message that adheres to Conventional Commit specification.
Do not write anything about generating commits or any meta informations. The only thing required from you is the content of the commit itself, starting with commit type, as in Conventional Commit.

DO NOT include backticks
DO NOT include markdown formatting
DO NOT write about generating commits

DO start with the commit type based on conventional commit
"

if [ -z "$COMMIT_SOURCE" ]; then
    diff=$(git diff --cached)
    diff_length=${#diff}

    if [ $diff_length -lt 5000 ]; then
        echo "$diff" |
            sgpt --model gpt-4o "$PROMPT_TEXT" \
            > "$COMMIT_MSG_FILE"
    else
        echo "<<< DIFF TOO LONG - message generation skipped >>>" > "$COMMIT_MSG_FILE"
    fi
fi

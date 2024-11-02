#!/bin/bash

openai_model=gpt-4o
# openai_model=gpt-4o-mini

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

if [ -z "$COMMIT_SOURCE" ]; then
    diff=$(git diff --cached)
    diff_length=${#diff}

    function generate_with() {
        local model=${1:$weak_model}

        echo $diff | sgpt --model $model --role commit-msg | sed 's/^\s*```//;s/```\s*$//' | awk 'NF {p=1} p; {if (NF) {p=1}}'
    }

    if [ $diff_length -lt 100000 ]; then # ~50k input tokens, 0.0075$
        generate_with $openai_model | fold -w 100 > "$COMMIT_MSG_FILE"
    else
        echo "<<< DIFF TOO LONG - message generation skipped >>>" > "$COMMIT_MSG_FILE"
    fi
fi

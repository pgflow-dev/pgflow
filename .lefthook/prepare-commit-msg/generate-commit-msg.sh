#!/bin/bash

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
PROMPT_TEXT="
Based on the changes above, generate commit message that adheres to Conventional Commit specification.
Do not write anything about generating commits or any meta informations. The only thing required from you is the content of the commit itself, starting with commit type, as in Conventional Commit.

If the change is broad and you want to provide more explanation, provide it as description after the title.

If you do not understand the change or think it would be good to include more information than you were able to guess based on diff, write a placeholder in description for me to fill in: <<< FILL ME IN >>>

Do not include any backticks or markdown formatting at all. Just text of the commit itself.
"

# Only pre-fill if it's a regular commit (not an amend, merge, etc.)
if [ -z "$COMMIT_SOURCE" ]; then
    diff=$(git diff --cached)
    diff_length=${#diff}

    if [ $diff_length -lt 5000 ]; then
        echo "$diff" |
            sgpt "$PROMPT_TEXT" \
            > "$COMMIT_MSG_FILE"
    else
        echo "<<< DIFF TOO LONG - message generation skipped >>>" > "$COMMIT_MSG_FILE"
    fi
fi

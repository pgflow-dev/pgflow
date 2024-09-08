#!/bin/bash

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Only pre-fill if it's a regular commit (not an amend, merge, etc.)
if [ -z "$COMMIT_SOURCE" ]; then
    git diff --cached |
        sgpt 'Based on the changes above, generate commit message that adheres to Conventional Commit specification. Do not output any description or additional informations. Start your message immediately with a proper type. Do not include any backticks or markdown formatting at all. Just text. Start with the commit type immediately.' \
        > "$COMMIT_MSG_FILE"
fi

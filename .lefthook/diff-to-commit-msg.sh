#!/bin/bash

DIFF=$(cat)

# Check if diff argument is provided
if [ -z "$DIFF" ]; then
    echo "Error: Please provide the diff on stdin!"
    echo "Usage: git diff --cached | ./commit.sh"
    exit 1
fi

API_KEY="${ANTHROPIC_API_KEY}"
MODEL_NAME="claude-3-5-haiku-latest"

if [ -z "$API_KEY" ]; then
    echo "Error: Please set the ANTHROPIC_API_KEY environment variable."
    exit 1
fi

if [ -n "$1" ]; then
    ADDITIONAL_CONTEXT="
Make sure to analyze the diff using additional description of the project/codebase:
<additional_context>
${1}
</additional_context>
"
fi

# Create the message content with $1 replacing {{DIFF}}
MESSAGE_CONTENT="You are an AI assistant skilled in writing commit messages that adhere to the Conventional Commits standard. Your task is to create a single commit message summarizing all changes in a given diff, even if the changes are not atomic or include unrelated modifications.


Here's the diff you need to analyze:

<diff>
$DIFF
</diff>

Follow these guidelines to create the commit message:

1. Conventional Commits format: <type>[optional scope]: <description>

   [optional body]

   [optional footer(s)]

2. Analyze the entire diff carefully, identifying all changes made.

3. Create only ONE commit message that summarizes all changes together. Do not write multiple commit messages.

4. Start with the commit type, optionally followed by a scope in parentheses. Choose the most appropriate type based on the majority of changes:
   - feat: New feature
   - fix: Bug fix
   - docs: Documentation changes
   - style: Code style changes (formatting, missing semi-colons, etc.)
   - refactor: Code refactoring
   - test: Adding or modifying tests
   - chore: Changes to the build process, dev environment, CI, or other non-code changes

5. After the type (and optional scope), add a colon and space, then write a brief description of the changes.

6. If necessary, add a more detailed explanation in the commit body, listing individual changes.

7. Ensure each line of the commit message does not exceed 100 characters.

8. Mark any changes related to dev environment, CI, builds, etc., as 'chore'.

9. Do not include any formatting, backticks, or other markdown syntax in the commit message.

${ADDITIONAL_CONTEXT}

Provide your commit message within <commit_message> tags. Remember to think carefully about the most appropriate type and description that summarizes all changes effectively."

# Escape the message content for JSON
MESSAGE_CONTENT_ESCAPED=$(echo "$MESSAGE_CONTENT" | jq -Rs .)

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "model": "${MODEL_NAME}",
  "max_tokens": 1024,
  "temperature": 0,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": ${MESSAGE_CONTENT_ESCAPED}
        }
      ]
    }
  ]
}
EOF
)

# Send request using curl and parse response with jq
curl -s -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$JSON_PAYLOAD" \
  | jq -r '.content[0].text' \
  | sed -n '/<commit_message>/,/<\/commit_message>/p' \
  | sed 's/<commit_message>//;s/<\/commit_message>//' \
  | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'

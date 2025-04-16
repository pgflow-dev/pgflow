#!/bin/bash

# Get API type from first argument or default to anthropic
API_TYPE="${1:-openai}"
shift 2>/dev/null || true  # Shift to remove the first argument if it exists

# API configuration
ANTHROPIC_MODEL="claude-3-5-haiku-latest"
OPENAI_MODEL="gpt-4.1-nano"

DIFF=$(cat)

# Check if diff argument is provided
if [ -z "$DIFF" ]; then
    echo "Error: Please provide the diff on stdin!"
    echo "Usage: git diff --cached | ./commit.sh"
    exit 1
fi

# Function to call Anthropic API
call_anthropic() {
    local message_content="$1"
    local model_name="$ANTHROPIC_MODEL"
    local api_key="$ANTHROPIC_API_KEY"

    if [ -z "$api_key" ]; then
        echo "Error: Please set the ANTHROPIC_API_KEY environment variable."
        exit 1
    fi


    # Escape the message content for JSON
    local message_content_escaped=$(echo "$message_content" | jq -Rs .)

    # Create JSON payload
    local json_payload=$(cat <<EOF
{
  "model": "${model_name}",
  "max_tokens": 1024,
  "temperature": 0,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": ${message_content_escaped}
        }
      ]
    }
  ]
}
EOF
    )

    # Send request using curl and parse response with jq
    curl -s -X POST "https://api.anthropic.com/v1/messages" \
      -H "x-api-key: $api_key" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "$json_payload" \
      | jq -r '.content[0].text' \
      | sed -n '/<commit_message>/,/<\/commit_message>/p' \
      | sed 's/<commit_message>//;s/<\/commit_message>//' \
      | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Function to call OpenAI API
call_openai() {
    local message_content="$1"
    local model_name="$OPENAI_MODEL"
    local api_key="$OPENAI_API_KEY"

    if [ -z "$api_key" ]; then
        echo "Error: Please set the OPENAI_API_KEY environment variable."
        exit 1
    fi

    # Escape the message content for JSON
    local message_content_escaped=$(echo "$message_content" | jq -Rs .)

    # Create JSON payload
    local json_payload=$(cat <<EOF
{
  "model": "${model_name}",
  "max_tokens": 1024,
  "temperature": 0,
  "messages": [
    {
      "role": "user",
      "content": ${message_content_escaped}
    }
  ]
}
EOF
    )

    # Send request using curl and parse response with jq
    curl -s -X POST "https://api.openai.com/v1/chat/completions" \
      -H "Authorization: Bearer $api_key" \
      -H "Content-Type: application/json" \
      -d "$json_payload" \
      | jq -r '.choices[0].message.content' \
      | sed -n '/<commit_message>/,/<\/commit_message>/p' \
      | sed 's/<commit_message>//;s/<\/commit_message>//' \
      | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Validate API type
if [ "$API_TYPE" != "anthropic" ] && [ "$API_TYPE" != "openai" ]; then
    echo "Error: API_TYPE must be either 'anthropic' or 'openai'. Got: $API_TYPE"
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

# Call the appropriate API
if [ "$API_TYPE" = "anthropic" ]; then
    call_anthropic "$MESSAGE_CONTENT"
else
    call_openai "$MESSAGE_CONTENT"
fi

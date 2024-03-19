#!/bin/bash
source .env

URL=http://localhost:8081/proxy/openai/chat/completions

# curl "$URL" \
curl -N -H "Accept: text/event-stream" "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant that is extremely verbose. Your answers are always very long."
      },
      {
        "role": "user",
        "content": "Hello! what is the meaning of life?"
      }
    ],
    "stream": true
  }'

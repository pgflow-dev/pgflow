#!/bin/bash

echo "Testing article_flow_worker Edge Function locally..."
echo ""
echo "Make sure you've started Supabase with: supabase start"
echo "And served the function with: supabase functions serve article_flow_worker"
echo ""
echo "Testing with a sample HN article URL..."
echo ""

curl -i --location --request POST 'http://localhost:54321/functions/v1/article_flow_worker' \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://news.ycombinator.com/item?id=35629516"}'
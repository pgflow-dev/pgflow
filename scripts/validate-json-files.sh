#!/usr/bin/env bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
RESET='\033[0m'

# Find all JSON files matching the pattern
# Excluding node_modules and only including direct package files
JSON_FILES=$(find pkgs examples -maxdepth 2 -type f \( -name "project.json" -o -name "package.json" -o -name "tsconfig*.json" -o -name "deno*.json" \) | grep -v "node_modules")

# Track validation failures
INVALID_FILES=()

echo "Validating JSON files..."

# Validate each JSON file
for file in $JSON_FILES; do
  if ! jq empty "$file" 2>/dev/null; then
    INVALID_FILES+=("$file")
    echo -e "${RED}Error in ${file}${RESET}"
  fi
done

# Output results
if [ ${#INVALID_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}Success: All JSON files are valid!${RESET}"
  exit 0
else
  echo -e "\n${RED}Failed validation:${RESET}"
  for file in "${INVALID_FILES[@]}"; do
    echo -e "${RED}- $file${RESET}"
  done
  echo -e "\n${RED}Found ${#INVALID_FILES[@]} invalid JSON file(s)${RESET}"
  exit 1
fi
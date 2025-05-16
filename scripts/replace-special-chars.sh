#!/bin/bash

# Replace special characters in a given file with simpler alternatives
# Usage: ./scripts/replace-special-chars.sh <file_path>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <file_path>"
    exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found"
    exit 1
fi

# Replace em-dash with hyphen
sed -i 's/—/-/g' "$FILE"

# Replace curly quotes with straight quotes
sed -i 's/"/"/g' "$FILE"
sed -i 's/"/"/g' "$FILE"

# Replace curly apostrophes with straight apostrophes
sed -i "s/'/'/g" "$FILE"
sed -i "s/'/'/g" "$FILE"

# Replace ellipsis character with three periods
sed -i 's/…/.../g' "$FILE"

# Replace non-breaking spaces with regular spaces
sed -i 's/ / /g' "$FILE"

echo "Special characters replaced in $FILE"
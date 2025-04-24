#!/bin/bash

# Find all directories within pkgs/ that contain both package.json and jsr.json files
find ./pkgs -type f -name "package.json" | while read -r package_file; do
  dir=$(dirname "$package_file")
  deno_file="$dir/jsr.json"

  # Check if jsr.json exists in the same directory
  if [ -f "$deno_file" ]; then
    echo "Processing $dir"

    # Get version from package.json
    currentVersion=$(jq -r '.version' "$package_file")

    # Update version in jsr.json
    jq --arg version "$currentVersion" '.version = $version' "$deno_file" > "$dir/tmp.json" \
      && mv "$dir/tmp.json" "$deno_file"

    echo "Updated $deno_file to version $currentVersion"
  fi
done

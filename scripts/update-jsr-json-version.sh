#!/bin/bash
set -euo pipefail

# Find all directories within pkgs/ that contain both package.json and jsr.json files
find ./pkgs -type f -name "package.json" -print0 | while IFS= read -r -d '' package_file; do
  dir=$(dirname "$package_file")
  jsr_file="$dir/jsr.json"

  # Check if jsr.json exists in the same directory
  if [ -f "$jsr_file" ]; then
    echo "Processing $dir"

    # Get version from package.json
    current_version=$(jq -r '.version' "$package_file")
    echo "Package version: $current_version"

    # Create a proper temporary file
    tmp_file=$(mktemp "${jsr_file}.XXXXXX")

    # First update the package version in jsr.json
    if jq --arg version "$current_version" '.version = $version' "$jsr_file" > "$tmp_file"; then
      mv "$tmp_file" "$jsr_file"
    else
      echo "Error: Failed to update version in $jsr_file"
      rm -f "$tmp_file"
      exit 1
    fi

    # Now update any pgflow dependencies in the imports section to match the same version
    if jq -e '.imports' "$jsr_file" > /dev/null 2>&1; then
      # Find all dependencies containing "pgflow"
      for pgflow_dep in $(jq -r '.imports | keys[] | select(contains("pgflow"))' "$jsr_file"); do
        echo "Updating $pgflow_dep to version $current_version"
        
        # Create a new temporary file for each update
        tmp_file=$(mktemp "${jsr_file}.XXXXXX")
        # Update the dependency version
        if jq --arg dep "$pgflow_dep" --arg version "$current_version" \
          '.imports[$dep] = "npm:" + $dep + "@" + $version' "$jsr_file" > "$tmp_file"; then
          mv "$tmp_file" "$jsr_file"
        else
          echo "Error: Failed to update $pgflow_dep in $jsr_file"
          rm -f "$tmp_file"
          exit 1
        fi
      done
    fi

    echo "Updated $jsr_file to version $current_version"
  fi
done
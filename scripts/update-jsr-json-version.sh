#!/bin/bash

# Find all directories within pkgs/ that contain both package.json and jsr.json files
find ./pkgs -type f -name "package.json" | while read -r package_file; do
  dir=$(dirname "$package_file")
  jsr_file="$dir/jsr.json"

  # Check if jsr.json exists in the same directory
  if [ -f "$jsr_file" ]; then
    echo "Processing $dir"

    # Get version from package.json
    current_version=$(jq -r '.version' "$package_file")
    echo "Package version: $current_version"

    # First update the package version in jsr.json
    jq --arg version "$current_version" '.version = $version' "$jsr_file" > "$dir/tmp.json" \
      && mv "$dir/tmp.json" "$jsr_file"

    # Now update any pgflow dependencies in the imports section to match the same version
    if jq -e '.imports' "$jsr_file" > /dev/null 2>&1; then
      # Find all dependencies containing "pgflow"
      for pgflow_dep in $(jq -r '.imports | keys[] | select(contains("pgflow"))' "$jsr_file"); do
        echo "Updating $pgflow_dep to version $current_version"
        
        # Update the dependency version
        jq --arg dep "$pgflow_dep" --arg version "$current_version" \
          '.imports[$dep] = "npm:" + $dep + "@" + $version' "$jsr_file" > "$dir/tmp.json" \
          && mv "$dir/tmp.json" "$jsr_file"
      done
    fi

    echo "Updated $jsr_file to version $current_version"
  fi
done
#!/bin/bash
# Build Open Graph image from logo-with-text.svg
# Creates a 1280x640 image with dark background and centered logo
#
# Requirements:
#   - ImageMagick (magick or convert command)
#
# Usage:
#   ./scripts/build-og-image.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

INPUT_SVG="$ROOT_DIR/logo-with-text.svg"
OUTPUT_JPG="$ROOT_DIR/pkgs/website/public/og-image.jpg"

# Configuration
CANVAS_WIDTH=1280
CANVAS_HEIGHT=640
BACKGROUND_COLOR="#121a19"
LOGO_SCALE_PERCENT=90  # Logo will be 90% of canvas width
HORIZONTAL_OFFSET=40   # Shift logo right to visually center (positive = right)

# Check if ImageMagick is installed (prefer 'magick' for v7, fallback to 'convert')
if command -v magick &> /dev/null; then
    MAGICK_CMD="magick"
elif command -v convert &> /dev/null; then
    MAGICK_CMD="convert"
else
    echo "Error: ImageMagick is not installed."
    echo "Install it with: sudo pacman -S imagemagick (Arch) or brew install imagemagick (macOS)"
    exit 1
fi

# Check if input file exists
if [ ! -f "$INPUT_SVG" ]; then
    echo "Error: Input file not found: $INPUT_SVG"
    exit 1
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_JPG")"

echo "Building OG image from $INPUT_SVG"

# Create a temporary SVG with dark-mode colors
# (The original SVG uses light-mode colors by default, which blend into our dark background)
TEMP_SVG=$(mktemp --suffix=.svg)
trap "rm -f $TEMP_SVG" EXIT

# Replace the light-mode primary color (#121a19) with white for dark background
sed -e 's/.primary { fill: #121a19; }/.primary { fill: #ffffff; }/g' \
    -e 's/.secondary { fill: #007b6e; }/.secondary { fill: #007a6d; }/g' \
    "$INPUT_SVG" > "$TEMP_SVG"

# Calculate logo width (percentage of canvas)
LOGO_WIDTH=$((CANVAS_WIDTH * LOGO_SCALE_PERCENT / 100))

# Build the OG image:
# 1. Render SVG at high density for quality
# 2. Resize to desired logo width (maintaining aspect ratio)
# 3. Create canvas with background color
# 4. Composite logo centered on canvas
# 5. Export as optimized JPG
$MAGICK_CMD \
    -density 300 \
    -background none \
    "$TEMP_SVG" \
    -resize "${LOGO_WIDTH}x" \
    \( -size ${CANVAS_WIDTH}x${CANVAS_HEIGHT} xc:"$BACKGROUND_COLOR" \) \
    +swap \
    -gravity center \
    -geometry +${HORIZONTAL_OFFSET}+0 \
    -composite \
    -quality 90 \
    "$OUTPUT_JPG"

# Report file size
FILE_SIZE=$(du -h "$OUTPUT_JPG" | cut -f1)
echo "Created: $OUTPUT_JPG ($FILE_SIZE)"

# Warn if file is too large
FILE_BYTES=$(stat -c%s "$OUTPUT_JPG" 2>/dev/null || stat -f%z "$OUTPUT_JPG")
if [ "$FILE_BYTES" -gt 307200 ]; then
    echo "Warning: File size exceeds 300KB. Consider reducing quality."
fi

echo "Done! Logo scaled to ${LOGO_WIDTH}px width (${LOGO_SCALE_PERCENT}% of canvas)"

#!/bin/bash

# Download required binaries for development
# Run this after cloning the repository

echo "Downloading required binaries..."

RESOURCES_DIR="src-tauri/resources"

# Create resources directory if it doesn't exist
mkdir -p "$RESOURCES_DIR"

# Download yt-dlp
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o "$RESOURCES_DIR/yt-dlp"
chmod +x "$RESOURCES_DIR/yt-dlp"

# Download ffmpeg (Universal binary for macOS)
echo "Downloading ffmpeg..."
curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o "$RESOURCES_DIR/ffmpeg.zip"
unzip -o "$RESOURCES_DIR/ffmpeg.zip" -d "$RESOURCES_DIR"
rm "$RESOURCES_DIR/ffmpeg.zip"
chmod +x "$RESOURCES_DIR/ffmpeg"

# Download Whisper model
echo "Downloading Whisper model..."
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin -o "$RESOURCES_DIR/ggml-base.en.bin"

# Download Whisper binary (you'll need to build this from source or provide a URL)
echo "Note: Whisper binary needs to be built from source or downloaded separately"
echo "Visit: https://github.com/ggerganov/whisper.cpp"

echo "Done! Binaries downloaded to $RESOURCES_DIR"
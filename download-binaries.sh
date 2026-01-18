#!/bin/bash

# Download required binaries for development
# Run this after cloning the repository

echo "Downloading required binaries..."

RESOURCES_DIR="src-tauri/resources"

# Create resources directory if it doesn't exist
mkdir -p "$RESOURCES_DIR"

# Download yt-dlp (stable release - nightly builds require Node.js)
echo "Downloading yt-dlp stable..."
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

# Ensure Whisper binary exists, or offer to build from source
if [ ! -x "$RESOURCES_DIR/whisper" ]; then
  echo "Whisper binary not found at $RESOURCES_DIR/whisper"
  read -r -p "Do you want to clone and build whisper.cpp now? [y/N]: " reply
  case $reply in
    [Yy]*)
      if ! command -v git >/dev/null 2>&1; then
        echo "Error: git is required to build whisper.cpp"; exit 1
      fi
      if ! command -v make >/dev/null 2>&1; then
        echo "Error: make is required to build whisper.cpp (install Xcode Command Line Tools)"; exit 1
      fi
      TMP_DIR="$(mktemp -d)"
      ABS_RESOURCES_DIR="$(realpath "$RESOURCES_DIR")"
      echo "Building whisper.cpp (this may take a few minutes)..."
      (
        cd "$TMP_DIR" || exit 1
        git clone --depth=1 https://github.com/ggml-org/whisper.cpp.git
        cd whisper.cpp || exit 1
        make -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)" || make || exit 1
        # Locate built binary (upstream may place it in bin/)
        CANDIDATES=(
          "./main"
          "./bin/main"
          "./build/bin/main"
          "./build/main"
          "./whisper"
          "./bin/whisper"
          "./bin/whisper-cli"
          "./whisper-cli"
        )
        FOUND=""
        for f in "${CANDIDATES[@]}"; do
          if [ -f "$f" ]; then
            FOUND="$f"; break
          fi
        done
        if [ -z "$FOUND" ]; then
          echo "Build finished but whisper binary not found (checked: ${CANDIDATES[*]}).";
          echo "Contents of ./bin (if exists):"; ls -la ./bin 2>/dev/null || true
          exit 1
        fi
        cp "$FOUND" "$ABS_RESOURCES_DIR/whisper"
        chmod +x "$ABS_RESOURCES_DIR/whisper"
        echo "Installed whisper binary from $FOUND to $RESOURCES_DIR/whisper"
      )
      RC=$?
      rm -rf "$TMP_DIR"
      if [ $RC -ne 0 ]; then
        echo "Failed to build whisper.cpp automatically."
        echo "Manual steps: git clone https://github.com/ggml-org/whisper.cpp; cd whisper.cpp; make; cp ./bin/main \"$RESOURCES_DIR/whisper\" 2>/dev/null || cp ./main \"$RESOURCES_DIR/whisper\"; chmod +x \"$RESOURCES_DIR/whisper\""
        exit 1
      fi
      ;;
    *)
      echo "Skipping whisper.cpp build. The app build will fail until $RESOURCES_DIR/whisper exists."
      echo "Manual steps: git clone https://github.com/ggml-org/whisper.cpp; cd whisper.cpp; make; cp ./bin/main \"$RESOURCES_DIR/whisper\" 2>/dev/null || cp ./main \"$RESOURCES_DIR/whisper\"; chmod +x \"$RESOURCES_DIR/whisper\""
      ;;
  esac
else
  echo "Whisper binary already present."
fi

echo "Done! Binaries are in $RESOURCES_DIR"
<div align="center">
  <img src="public/icon.png" alt="Grably Logo" width="120" height="120">
  
  # Grably
  
  ### Download & Transcribe Any Media from the Web
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Platform](https://img.shields.io/badge/Platform-macOS-blue)]()
  [![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-24C8DB)]()
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
  
  **Free • Open Source • Privacy-First • No Ads • No Tracking**
  
  [Download Latest Release](https://github.com/yourusername/grably/releases) • [Report Bug](https://github.com/yourusername/grably/issues) • [Request Feature](https://github.com/yourusername/grably/issues)
</div>

---

## ✨ Features

### 🎥 **Universal Media Downloader**
- Download videos, audio, and media from **1000+ websites**
- Support for YouTube, Instagram, TikTok, Twitter, and more
- Multiple quality options (4K, 1080p, 720p, etc.)
- Playlist and batch download support

### 🎙️ **AI-Powered Transcription**
- Convert any audio/video to text using Whisper AI
- Speaker detection and diarization
- Multiple language support
- Export to TXT, SRT, VTT formats

### 🔒 **Privacy & Security**
- **100% offline processing** - no data leaves your device
- No analytics, no tracking, no telemetry
- Open source and auditable code
- No account or registration required

### ⚡ **Performance**
- Native macOS app built with Rust & Tauri
- Lightning-fast downloads with parallel processing
- Minimal resource usage
- Small app size (~200MB)
- Universal binary (Intel + Apple Silicon)

---

## 🚀 Quick Start

### Download Pre-built App

1. Go to [Releases](https://github.com/yourusername/grably/releases)
2. Download for macOS:
   - **macOS**: `Grably-Universal.dmg` (Universal - Intel + Apple Silicon)
3. Open the DMG and drag Grably to Applications
4. Launch and enjoy!

> **Windows & Linux**: Coming soon! Star the repo to get notified.

### Build from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (latest stable)
- **macOS**: Xcode Command Line Tools

#### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/grably.git
cd grably

# Install dependencies
npm install

# Download required binaries
./download-binaries.sh

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

---

## 📖 Usage

### Downloading Media

1. **Paste URL**: Copy any video URL and paste it into Grably
2. **Choose Format**: Select video quality or audio-only
3. **Download**: Click download and choose save location
4. **Done!** Your media is saved locally

### Transcribing Media

1. **Select File**: Choose a video/audio file or use a downloaded one
2. **Choose Method**: 
   - **Whisper AI**: High-quality offline transcription
   - **Native Captions**: Extract existing subtitles
3. **Export**: Save as TXT, SRT, or VTT format

---

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Media Processing**: 
  - [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Media downloading
  - [FFmpeg](https://ffmpeg.org/) - Audio/video processing
  - [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) - AI transcription
- **UI**: Tailwind CSS + Lucide Icons

---

## 🤝 Contributing

We love contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev

# Run tests
npm test

# Build for production
npm run tauri build
```

### Project Structure

```
grably/
├── src/                    # React frontend
│   ├── components/        # React components
│   ├── lib/              # Utilities
│   └── App.tsx           # Main app
├── src-tauri/            # Rust backend
│   ├── src/             # Rust source
│   └── resources/       # Binaries (ffmpeg, yt-dlp, whisper)
└── public/              # Static assets
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for media extraction
- [OpenAI Whisper](https://github.com/openai/whisper) for transcription models
- [Tauri](https://tauri.app) for the amazing framework
- All our contributors and users!

---

## ⚠️ Disclaimer

Grably is a tool for downloading content that you have the right to access. Please respect copyright laws and terms of service of the websites you download from. The developers are not responsible for any misuse of this software.

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/grably/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/grably/discussions)
- **Email**: support@grably.app

---

<div align="center">
  Made with ❤️ by the Grably Team
  
  If you find this project useful, please consider giving it a ⭐!
  
  **Windows & Linux support coming soon!**
</div>

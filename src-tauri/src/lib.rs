use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::fs;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, Window};


#[derive(Debug, Serialize, Deserialize, Clone)]
struct VideoFormat {
    format_id: String,
    ext: String,
    resolution: Option<String>,
    fps: Option<f32>,
    vcodec: Option<String>,
    acodec: Option<String>,
    filesize: Option<i64>,
    format_note: Option<String>,
    quality: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VideoInfo {
    title: String,
    duration: Option<f32>,
    thumbnail: Option<String>,
    uploader: Option<String>,
    view_count: Option<i64>,
    formats: Vec<VideoFormat>,
}

#[derive(Debug, Serialize, Clone)]
struct DownloadProgress {
    percent: f32,
    downloaded: String,
    total: String,
    speed: String,
    eta: String,
    id: Option<String>,
    filename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlaylistVideo {
    id: String,
    title: String,
    duration: Option<f32>,
    thumbnail: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlaylistInfo {
    title: String,
    uploader: Option<String>,
    video_count: usize,
    videos: Vec<PlaylistVideo>,
    thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct HistoryEntry {
    id: String,
    #[serde(rename = "entryType")]
    entry_type: String,
    title: String,
    #[serde(rename = "sourceUrl")]
    source_url: String,
    #[serde(rename = "filePath")]
    file_path: Option<String>,
    #[serde(rename = "transcriptText")]
    transcript_text: Option<String>,
    #[serde(rename = "siteType")]
    site_type: Option<String>,
    #[serde(rename = "fileSizeBytes")]
    file_size_bytes: Option<u64>,
    timestamp: u64,
}

fn get_history_path() -> Result<PathBuf, String> {
    let mut dir = dirs::config_dir()
        .ok_or_else(|| "config dir not found".to_string())?;
    dir.push("com.grably.desktop");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("history.json");
    Ok(dir)
}

fn read_history_entries() -> Vec<HistoryEntry> {
    match get_history_path() {
        Ok(p) if p.exists() => {
            fs::read_to_string(&p)
                .ok()
                .and_then(|s| serde_json::from_str::<Vec<HistoryEntry>>(&s).ok())
                .unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

fn write_history_entries(entries: &[HistoryEntry]) -> Result<(), String> {
    let path = get_history_path()?;
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn append_history(entry: HistoryEntry) {
    let mut entries = read_history_entries();
    entries.insert(0, entry);
    if entries.len() > 1000 {
        entries.truncate(1000);
    }
    let _ = write_history_entries(&entries);
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn parse_destination_from_line(line: &str) -> Option<String> {
    if let Some(idx) = line.find("[download] Destination: ") {
        return Some(line[idx + "[download] Destination: ".len()..].trim().to_string());
    }
    if line.contains("[Merger] Merging formats into ") {
        if let Some(start) = line.find('"') {
            if let Some(end_rel) = line[start + 1..].find('"') {
                return Some(line[start + 1..start + 1 + end_rel].to_string());
            }
        }
    }
    if let Some(idx) = line.find("[ExtractAudio] Destination: ") {
        return Some(line[idx + "[ExtractAudio] Destination: ".len()..].trim().to_string());
    }
    None
}

fn record_transcription_history(source: &str, transcript: &str, site_type: Option<&str>) {
    let title = std::path::Path::new(source)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| source.to_string());
    append_history(HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        entry_type: "transcription".to_string(),
        title,
        source_url: source.to_string(),
        file_path: None,
        transcript_text: Some(transcript.to_string()),
        site_type: site_type.map(|s| s.to_string()),
        file_size_bytes: None,
        timestamp: now_unix(),
    });
}

// Emit the download-complete UI event ASAP at 100% progress (do NOT record
// history yet — yt-dlp may still run post-processors like [ExtractAudio]
// that rewrite the destination filename, e.g. .webm → .mp3).
fn emit_download_complete_event(
    window: &Window,
    download_id: &str,
    fallback_filename: &str,
    fallback_path: &str,
    final_dest: &Option<String>,
) {
    let final_path = final_dest.clone().unwrap_or_else(|| fallback_path.to_string());
    let final_name = std::path::Path::new(&final_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| fallback_filename.to_string());

    window.emit("download-complete", serde_json::json!({
        "filename": final_name,
        "path": final_path,
        "id": download_id,
    })).ok();
}

// Append the FINAL history entry after the yt-dlp process closes its stdout
// (all post-processors are done). Uses the latest captured destination so
// audio extracts record the .mp3 path, not the intermediate .webm.
fn record_download_in_history(
    fallback_filename: &str,
    fallback_path: &str,
    final_dest: &Option<String>,
    source_url: &str,
    site_type: Option<&str>,
) {
    let final_path = final_dest.clone().unwrap_or_else(|| fallback_path.to_string());
    let final_name = std::path::Path::new(&final_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| fallback_filename.to_string());
    let size = fs::metadata(&final_path).ok().map(|m| m.len());
    append_history(HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        entry_type: "download".to_string(),
        title: final_name,
        source_url: source_url.to_string(),
        file_path: Some(final_path),
        transcript_text: None,
        site_type: site_type.map(|s| s.to_string()),
        file_size_bytes: size,
        timestamp: now_unix(),
    });
}

// Helper function to get the path to bundled yt-dlp binary (cached after first call)
fn get_ytdlp_path() -> String {
    static CACHED_PATH: OnceLock<String> = OnceLock::new();
    CACHED_PATH.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            if let Ok(exe_path) = std::env::current_exe() {
                // For bundled macOS app: executable is at Contents/MacOS/Grably
                // Resources are at Contents/Resources/resources/
                if let Some(macos_dir) = exe_path.parent() {
                    if let Some(contents_dir) = macos_dir.parent() {
                        let bundled_ytdlp = contents_dir.join("Resources").join("resources").join("yt-dlp");
                        if bundled_ytdlp.exists() {
                            println!("Using bundled yt-dlp: {:?}", bundled_ytdlp);
                            return bundled_ytdlp.to_string_lossy().to_string();
                        }

                        let bundled_ytdlp_py = contents_dir.join("Resources").join("resources").join("yt-dlp.py");
                        if bundled_ytdlp_py.exists() {
                            println!("Using Python yt-dlp fallback: {:?}", bundled_ytdlp_py);
                            return format!("PYTHON:{}", bundled_ytdlp_py.to_string_lossy());
                        }
                    }
                }

                // For development
                if let Some(parent) = exe_path.parent() {
                    let dev_ytdlp = parent.join("resources").join("yt-dlp");
                    if dev_ytdlp.exists() {
                        println!("Using dev yt-dlp: {:?}", dev_ytdlp);
                        return dev_ytdlp.to_string_lossy().to_string();
                    }
                }
            }
        }

        println!("Using system yt-dlp");
        "yt-dlp".to_string()
    }).clone()
}

// Helper function to get the path to bundled deno binary
fn get_deno_path() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(macos_dir) = exe_path.parent() {
                if let Some(contents_dir) = macos_dir.parent() {
                    let bundled_deno = contents_dir.join("Resources").join("resources").join("deno");
                    if bundled_deno.exists() {
                        return Some(bundled_deno.to_string_lossy().to_string());
                    }
                }
            }
            // For development
            if let Some(parent) = exe_path.parent() {
                let dev_deno = parent.join("resources").join("deno");
                if dev_deno.exists() {
                    return Some(dev_deno.to_string_lossy().to_string());
                }
            }
        }
    }
    // Fallback to system deno
    None
}

// Get js-runtimes args for yt-dlp to use bundled deno
fn get_js_runtime_args() -> Vec<String> {
    if let Some(deno_path) = get_deno_path() {
        vec!["--js-runtimes".to_string(), format!("deno:{}", deno_path)]
    } else {
        vec![]
    }
}

// Helper function to get the path to bundled ffmpeg binary (cached after first call)
fn get_ffmpeg_path() -> String {
    static CACHED_PATH: OnceLock<String> = OnceLock::new();
    CACHED_PATH.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            if let Ok(exe_path) = std::env::current_exe() {
                if let Some(macos_dir) = exe_path.parent() {
                    if let Some(contents_dir) = macos_dir.parent() {
                        let bundled_ffmpeg = contents_dir.join("Resources").join("resources").join("ffmpeg");
                        if bundled_ffmpeg.exists() {
                            println!("Using bundled ffmpeg: {:?}", bundled_ffmpeg);
                            return bundled_ffmpeg.to_string_lossy().to_string();
                        }
                    }
                }

                if let Some(parent) = exe_path.parent() {
                    let dev_ffmpeg = parent.join("resources").join("ffmpeg");
                    if dev_ffmpeg.exists() {
                        println!("Using dev ffmpeg: {:?}", dev_ffmpeg);
                        return dev_ffmpeg.to_string_lossy().to_string();
                    }
                }
            }
        }

        println!("Using system ffmpeg");
        "ffmpeg".to_string()
    }).clone()
}

// Helper function to get the path to bundled whisper binary
fn get_whisper_path() -> Result<(PathBuf, PathBuf), String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            println!("Executable path for whisper: {:?}", exe_path);
            
            // For bundled macOS app: executable is at Contents/MacOS/Grably
            // Resources are at Contents/Resources/resources/
            if let Some(macos_dir) = exe_path.parent() {
                if let Some(contents_dir) = macos_dir.parent() {
                    let bundled_whisper = contents_dir.join("Resources").join("resources").join("whisper");
                    let bundled_model = contents_dir.join("Resources").join("resources").join("ggml-base.en.bin");
                    println!("Checking bundled whisper at: {:?}", bundled_whisper);
                    if bundled_whisper.exists() && bundled_model.exists() {
                        println!("Found bundled whisper and model!");
                        return Ok((bundled_whisper, bundled_model));
                    }
                }
            }
            
            // For development
            if let Some(parent) = exe_path.parent() {
                let dev_whisper = parent.join("resources").join("whisper");
                let dev_model = parent.join("resources").join("ggml-base.en.bin");
                println!("Checking dev whisper at: {:?}", dev_whisper);
                if dev_whisper.exists() && dev_model.exists() {
                    println!("Found dev whisper and model!");
                    return Ok((dev_whisper, dev_model));
                }
            }
        }
    }
    
    // Try CARGO_MANIFEST_DIR for development
    let dev_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
    let dev_whisper = dev_dir.join("whisper");
    let dev_model = dev_dir.join("ggml-base.en.bin");
    if dev_whisper.exists() && dev_model.exists() {
        println!("Found whisper in CARGO_MANIFEST_DIR!");
        return Ok((dev_whisper, dev_model));
    }
    
    Err("whisper.cpp or model not found in resources".to_string())
}


// Get playlist info
#[tauri::command]
async fn get_playlist_info(url: String) -> Result<PlaylistInfo, String> {
    println!("Getting playlist info for URL: {}", url);
    println!("This is a playlist URL, fetching playlist data...");
    let mut cmd = Command::new(&get_ytdlp_path());
    cmd.args(&get_js_runtime_args());
    cmd.args(&["--flat-playlist", "-J", &url]);
    let output = cmd.output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Extract playlist entries
    let videos: Vec<PlaylistVideo> = data["entries"].as_array()
        .map(|arr| {
            arr.iter().filter_map(|entry| {
                Some(PlaylistVideo {
                    id: entry["id"].as_str()?.to_string(),
                    title: entry["title"].as_str().unwrap_or("Unknown").to_string(),
                    duration: entry["duration"].as_f64().map(|d| d as f32),
                    thumbnail: entry["thumbnail"].as_str().map(|s| s.to_string()),
                    url: entry["url"].as_str().map(|s| s.to_string())
                        .or_else(|| entry["id"].as_str().map(|id| format!("https://youtube.com/watch?v={}", id))),
                })
            }).collect()
        })
        .unwrap_or_default();
    
    Ok(PlaylistInfo {
        title: data["title"].as_str().unwrap_or("Unknown Playlist").to_string(),
        uploader: data["uploader"].as_str().map(|s| s.to_string()),
        video_count: data["playlist_count"].as_u64().unwrap_or(videos.len() as u64) as usize,
        videos: videos.into_iter().take(100).collect(), // Limit to first 100 videos
        thumbnail: data["thumbnail"].as_str().map(|s| s.to_string()),
    })
}

// Check if URL is a playlist
#[tauri::command]
async fn is_playlist(url: String) -> Result<bool, String> {
    Ok(url.contains("playlist?list=") || url.contains("&list="))
}

// Get video info and available formats
#[tauri::command]
async fn get_youtube_info(url: String) -> Result<VideoInfo, String> {
    println!("Getting info for URL: {}", url);
    let mut args = vec!["-j", "--no-playlist"];


    args.push(&url);

    let mut cmd = Command::new(&get_ytdlp_path());
    cmd.args(&get_js_runtime_args());
    cmd.args(&args);
    let output = cmd.output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Extract formats
    let formats = data["formats"].as_array()
        .map(|arr| {
            println!("Total formats from yt-dlp: {}", arr.len());
            let parsed_formats: Vec<VideoFormat> = arr.iter().filter_map(|f| {
                let format_id = f["format_id"].as_str().unwrap_or("").to_string();
                let ext = f["ext"].as_str().unwrap_or("unknown").to_string();
                let vcodec = f["vcodec"].as_str().map(|s| s.to_string());
                let resolution = f["resolution"].as_str().map(|s| s.to_string());
                
                // Debug log each format
                println!("Processing format {}: ext={}, vcodec={:?}, resolution={:?}", 
                    format_id, ext, vcodec, resolution);
                
                let format = VideoFormat {
                    format_id,
                    ext,
                    resolution,
                    fps: f["fps"].as_f64().map(|n| n as f32)
                        .or_else(|| f["fps"].as_i64().map(|n| n as f32)),
                    vcodec,
                    acodec: f["acodec"].as_str().map(|s| s.to_string()),
                    filesize: f["filesize"].as_i64()
                        .or_else(|| f["filesize"].as_f64().map(|n| n as i64))
                        .or_else(|| f["filesize_approx"].as_i64()),
                    format_note: f["format_note"].as_str().map(|s| s.to_string()),
                    quality: f["quality"].as_f64().map(|n| n as f32)
                        .or_else(|| f["quality"].as_i64().map(|n| n as f32)),
                };
                
                // Debug log MP4 formats with video
                if format.ext == "mp4" && format.vcodec.is_some() && format.vcodec != Some("none".to_string()) {
                    println!("Found MP4 video format: {} - {:?} - {:?}", 
                        format.format_id, format.resolution, format.format_note);
                }
                
                Some(format)
            }).collect();
            println!("Parsed formats count: {}", parsed_formats.len());
            parsed_formats
        })
        .unwrap_or_default();
    
    Ok(VideoInfo {
        title: data["title"].as_str().unwrap_or("Unknown").to_string(),
        duration: data["duration"].as_f64().map(|d| d as f32),
        thumbnail: data["thumbnail"].as_str().map(|s| s.to_string()),
        uploader: data["uploader"].as_str().map(|s| s.to_string()),
        view_count: data["view_count"].as_i64(),
        formats,
    })
}

// Get simplified format list
#[tauri::command]
async fn get_youtube_formats(url: String) -> Result<Vec<String>, String> {
    let args = vec!["-F", "--no-playlist", &url];
    
    let mut cmd = Command::new(&get_ytdlp_path());
    cmd.args(&get_js_runtime_args());
    cmd.args(&args);
    let output = cmd.output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let formats: Vec<String> = output_str
        .lines()
        .skip_while(|line| !line.contains("ID"))
        .skip(1)
        .map(|s| s.to_string())
        .collect();
    
    Ok(formats)
}

// Download YouTube video with progress tracking
#[tauri::command]
async fn download_youtube(
    window: Window, 
    url: String, 
    format: Option<String>, 
    output_path: Option<String>,
    download_playlist: Option<bool>
) -> Result<String, String> {
    let downloads_dir = dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    
    // Create Grably folder in Downloads
    let grably_dir = downloads_dir.join("Grably");
    if !grably_dir.exists() {
        std::fs::create_dir_all(&grably_dir).ok();
    }
    
    let output = output_path.unwrap_or_else(|| {
        grably_dir.join("%(title)s.%(ext)s").to_string_lossy().to_string()
    });
    
    let mut args = vec![];
    
    // Add ffmpeg location if using bundled binary
    let ffmpeg_path = get_ffmpeg_path();
    if ffmpeg_path != "ffmpeg" {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg_path.clone());
    }
    
    // Only add --no-playlist if we're not downloading a playlist
    if !download_playlist.unwrap_or(false) {
        args.push("--no-playlist".to_string());
    }
    
    args.extend(vec![
        "--progress".to_string(),
        "--newline".to_string(),
        "--force-overwrites".to_string(),  // Allow re-downloading existing files
        "-o".to_string(),
        output.clone(),
    ]);
    
    // Add format if specified, with smart audio merging
    if let Some(fmt) = format {
        // Handle audio format conversions
        if fmt == "mp3" {
            args.push("-f".to_string());
            args.push("bestaudio".to_string());
            args.push("-x".to_string()); // Extract audio
            args.push("--audio-format".to_string());
            args.push("mp3".to_string());
            args.push("--audio-quality".to_string());
            args.push("0".to_string()); // Best quality
        } else if fmt == "wav" {
            args.push("-f".to_string());
            args.push("bestaudio".to_string());
            args.push("-x".to_string()); // Extract audio
            args.push("--audio-format".to_string());
            args.push("wav".to_string());
        } else if fmt.parse::<i32>().is_ok() {
            // For video-only formats (like 4K), always merge with best audio
            args.push("-f".to_string());
            // Try multiple fallback options for maximum compatibility
            args.push(format!("{}+bestaudio[ext=m4a]/{}+bestaudio/best", fmt, fmt));
            // Always merge into mp4 for consistency
            args.push("--merge-output-format".to_string());
            args.push("mp4".to_string());
            // Re-encode if needed (for WebM to MP4 conversion)
            args.push("--recode-video".to_string());
            args.push("mp4".to_string());
        } else {
            // For pre-muxed formats
            args.push("-f".to_string());
            args.push(fmt);
        }
    } else {
        args.push("-f".to_string());
        // Default: best quality mp4 with audio
        args.push("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string());
    }
    
    args.push(url.clone());
    
    // Generate unique ID for this download
    use uuid::Uuid;
    let download_id = Uuid::new_v4().to_string();
    
    // Use a temporary filename first - we'll update it later
    let temp_filename = "YouTube Video".to_string();
    
    // Immediately emit download started with status - NO DELAY
    window.emit("download-status", serde_json::json!({
        "id": download_id.clone(),
        "filename": temp_filename.clone(),
        "status": "Initializing download...",
        "percent": 0.0
    })).ok();
    
    // Get the actual title in background (don't wait for it)
    let url_for_title = url.clone();
    let window_for_title = window.clone();
    let download_id_for_title = download_id.clone();
    std::thread::spawn(move || {
        let mut title_args = vec!["--get-title"];
        title_args.push(&url_for_title);

        let mut title_cmd = Command::new(&get_ytdlp_path());
        title_cmd.args(&get_js_runtime_args());
        title_cmd.args(&title_args);
        if let Ok(output) = title_cmd.output() {
            if let Ok(title) = String::from_utf8(output.stdout) {
                let title = title.trim().to_string();
                if !title.is_empty() {
                    // Update with real title
                    window_for_title.emit("download-status", serde_json::json!({
                        "id": download_id_for_title,
                        "filename": title,
                        "status": "Connecting to YouTube...",
                        "percent": 0.0
                    })).ok();
                }
            }
        }
    });
    
    let filename = temp_filename; // Use temp filename for now
    
    // Spawn the download process
    let mut child = Command::new(&get_ytdlp_path());
    child.args(&get_js_runtime_args());
    child.args(&args);
    let mut child = child
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start download: {}", e))?;

    // Get download path for completion notification
    let download_path = grably_dir.join(&filename);
    let download_path_str = download_path.to_string_lossy().to_string();
    
    let url_for_history = url.clone();

    // Read all output in background
    if let Some(stdout) = child.stdout.take() {
        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut completed = false;
            let mut current_dest: Option<String> = None;

            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some(dest) = parse_destination_from_line(&line) {
                        current_dest = Some(dest);
                    }
                    // Stream all output for real-time status
                    if line.starts_with("[") {
                        // Parse different yt-dlp status messages
                        let status = if line.contains("youtube") || line.contains("Extracting URL") {
                            "Connecting to YouTube..."
                        } else if line.contains("Downloading webpage") {
                            "Loading video page..."
                        } else if line.contains("Downloading API") || line.contains("Downloading JSON") {
                            "Fetching video info..."
                        } else if line.contains("Downloading m3u8") || line.contains("manifest") {
                            "Processing video streams..."
                        } else if line.contains("[Merger]") || line.contains("Merging") {
                            // Skip merging status - don't emit it
                            continue;
                        } else if line.contains("[download] Destination:") {
                            "Starting download..."
                        } else if line.contains("[download]") && line.contains("%") {
                            // This is actual progress
                            if let Some(mut progress) = parse_progress(&line) {
                                progress.filename = Some(filename.clone());
                                progress.id = Some(download_id.clone());
                                window.emit("download-progress", &progress).ok();

                                // Emit the UI event as soon as percent hits 100,
                                // but DO NOT record history yet — yt-dlp may still
                                // run post-processors that change the destination.
                                if !completed && progress.percent >= 100.0 {
                                    completed = true;
                                    emit_download_complete_event(
                                        &window,
                                        &download_id,
                                        &filename,
                                        &download_path_str,
                                        &current_dest,
                                    );
                                }
                            }
                            continue; // Skip status update for progress lines
                        } else if line.contains("has already been downloaded") {
                            if !completed {
                                completed = true;
                                emit_download_complete_event(
                                    &window,
                                    &download_id,
                                    &filename,
                                    &download_path_str,
                                    &current_dest,
                                );
                            }
                            continue;
                        } else {
                            // Skip other technical messages
                            continue;
                        };

                        // Emit status update
                        window.emit("download-status", serde_json::json!({
                            "id": download_id.clone(),
                            "filename": filename.clone(),
                            "status": status,
                            "percent": 0.0
                        })).ok();
                    }
                }
            }

            // stdout closed — yt-dlp + post-processors are done. Record the
            // FINAL destination (e.g. .mp3 after [ExtractAudio]) to history.
            if completed {
                record_download_in_history(
                    &filename,
                    &download_path_str,
                    &current_dest,
                    &url_for_history,
                    None,
                );
            }

            // Also read stderr for any error messages
            if let Some(stderr) = stderr {
                let stderr_reader = BufReader::new(stderr);
                for line in stderr_reader.lines() {
                    if let Ok(line) = line {
                        // Skip non-critical errors
                        if line.contains("The downloaded file is empty") {
                            continue;
                        }
                        if line.contains("ERROR") {
                            // Only show critical errors
                            if !line.contains("has already been downloaded") {
                                window.emit("download-status", serde_json::json!({
                                    "id": download_id.clone(),
                                    "filename": filename.clone(),
                                    "status": format!("Error: {}", line),
                                    "percent": 0.0
                                })).ok();
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Return immediately - fire and forget
    Ok(format!("Download started"))
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    // Parse yt-dlp progress: [download]  50.0% of 10.00MiB at 500.00KiB/s ETA 00:10
    let parts: Vec<&str> = line.split_whitespace().collect();
    
    let percent = parts.iter()
        .find(|s| s.contains("%"))
        .and_then(|s| s.trim_end_matches('%').parse::<f32>().ok())?;
    
    let total = parts.iter()
        .position(|&s| s == "of")
        .and_then(|i| parts.get(i + 1))
        .map(|s| s.to_string())
        .unwrap_or_default();
    
    let speed = parts.iter()
        .position(|&s| s == "at")
        .and_then(|i| parts.get(i + 1))
        .map(|s| s.to_string())
        .unwrap_or_default();
    
    let eta = parts.iter()
        .position(|&s| s == "ETA")
        .and_then(|i| parts.get(i + 1))
        .map(|s| s.to_string())
        .unwrap_or_default();
    
    Some(DownloadProgress {
        percent,
        downloaded: format!("{}%", percent),
        total,
        speed,
        eta,
        id: None,
        filename: None,
    })
}

// Transcribe YouTube video (subtitles first, then Whisper)
#[tauri::command]
async fn transcribe_youtube(url: String) -> Result<String, String> {
    println!("Transcribing YouTube video: {}", url);

    // Try to get YouTube subtitles ONLY - no fallback
    match get_youtube_subtitles(&url).await {
        Ok(transcript) => {
            println!("Got subtitles from YouTube");
            record_transcription_history(&url, &transcript, Some("youtube"));
            Ok(transcript)
        }
        Err(e) => {
            println!("YouTube subtitles not available: {}", e);
            // Return clear error message for the user
            Err(format!("YouTube captions not available for this video. {}. Try using 'Whisper AI' option instead.", e))
        }
    }
}

async fn get_youtube_subtitles(url: &str) -> Result<String, String> {
    // First get the video ID
    let mut id_cmd = Command::new(&get_ytdlp_path());
    id_cmd.args(&get_js_runtime_args());
    id_cmd.args(&["--print", "id", url]);
    let id_output = id_cmd.output()
        .map_err(|e| format!("Failed to get video ID: {}", e))?;
    
    if !id_output.status.success() {
        return Err("Could not get video ID".to_string());
    }
    
    let video_id = String::from_utf8_lossy(&id_output.stdout).trim().to_string();
    
    if video_id.is_empty() {
        return Err("Could not get video ID".to_string());
    }
    
    // Now actually download the subtitles
    let subtitle_path = format!("/tmp/{}.en.vtt", video_id);
    
    let mut sub_cmd = Command::new(&get_ytdlp_path());
    sub_cmd.args(&get_js_runtime_args());
    sub_cmd.args(&[
        "--skip-download",
        "--write-auto-subs",
        "--sub-lang", "en",
        "--convert-subs", "vtt",
        "--output", &format!("/tmp/{}", video_id),
        url
    ]);
    let download_output = sub_cmd.output()
        .map_err(|e| format!("Failed to download subtitles: {}", e))?;
    
    if !download_output.status.success() {
        return Err("No subtitles available".to_string());
    }
    
    if let Ok(content) = fs::read_to_string(&subtitle_path) {
        // Parse VTT to plain text
        let transcript = parse_vtt_to_text(&content);
        
        // Clean up file
        let _ = fs::remove_file(&subtitle_path);
        
        if !transcript.trim().is_empty() {
            return Ok(transcript);
        }
    }
    
    Err("No subtitle files found".to_string())
}

fn parse_vtt_to_text(vtt_content: &str) -> String {
    let mut transcript = String::new();
    let mut last_text = String::new();
    
    for line in vtt_content.lines() {
        // Skip headers, timestamps, and metadata
        if !line.contains("-->") 
            && !line.starts_with("WEBVTT")
            && !line.starts_with("NOTE")
            && !line.starts_with("Kind:")
            && !line.starts_with("Language:")
            && !line.trim().is_empty()
            && !line.chars().all(|c| c.is_numeric() || c == ':' || c == '.')
        {
            // Remove all timestamp tags and HTML tags
            let mut clean_text = line.to_string();
            
            // Remove timestamp tags like <00:00:00.800>
            while let Some(start) = clean_text.find('<') {
                if let Some(end) = clean_text.find('>') {
                    if end > start {
                        clean_text.replace_range(start..=end, "");
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            
            clean_text = clean_text.trim().to_string();
            
            // Avoid duplicates and empty lines
            if !clean_text.is_empty() && clean_text != last_text {
                transcript.push_str(&clean_text);
                transcript.push(' ');
                last_text = clean_text;
            }
        }
    }
    
    transcript.trim().to_string()
}

async fn transcribe_with_whisper(url: &str) -> Result<String, String> {
    // Download audio first
    println!("Downloading audio from: {}", url);
    
    // Use atomic counter for unique temp files (avoids collision in bulk mode)
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let id = COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let audio_path = format!("/tmp/audio_temp_{}_{}.mp3", timestamp, id);
    let audio_path_str = audio_path.as_str();
    
    // Convert Facebook URLs to mobile version for better compatibility
    let mut processed_url = url.to_string();
    if url.contains("facebook.com/reel/") {
        // Extract video ID from reel URL and convert to mobile format
        if let Some(video_id) = url.split("/reel/").nth(1) {
            let clean_id = video_id.split('?').next().unwrap_or(video_id);
            processed_url = format!("https://m.facebook.com/watch/?v={}", clean_id);
            println!("Converted Facebook URL to mobile: {}", processed_url);
        }
    } else if url.contains("www.facebook.com") {
        // Convert www to m for mobile version
        processed_url = url.replace("www.facebook.com", "m.facebook.com");
    }
    
    let final_url = processed_url.as_str();
    
    // Add proper headers and user-agent for social media sites
    let mut args = vec![];
    
    // Add ffmpeg location if using bundled binary
    let ffmpeg_path = get_ffmpeg_path();
    if ffmpeg_path != "ffmpeg" {
        args.push("--ffmpeg-location");
        args.push(&ffmpeg_path);
    }
    
    args.extend(vec![
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "5",
        "-o", audio_path_str,
    ]);

    // For other platforms, let yt-dlp use its defaults
    
    // Check for cookies file
    let cookies_path = PathBuf::from("/tmp/cookies.txt");
    if cookies_path.exists() {
        args.push("--cookies");
        args.push("/tmp/cookies.txt");
    }
    
    // Add the URL at the end
    args.push(final_url);
    
    let mut audio_cmd = Command::new(&get_ytdlp_path());
    audio_cmd.args(&get_js_runtime_args());
    audio_cmd.args(&args);
    let output = audio_cmd.output()
        .map_err(|e| format!("Failed to download audio: {}", e))?;
    
    if !output.status.success() {
        // Clean up even on download failure
        let _ = fs::remove_file(&audio_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to download audio: {}", stderr));
    }
    
    // Get the path to the whisper.cpp binary and model
    let (whisper_path, model_path) = get_whisper_path().map_err(|e| {
        let _ = fs::remove_file(&audio_path);
        e
    })?;
    
    println!("Using whisper.cpp at: {:?}", whisper_path);
    
    // Create a temporary output file for transcript
    let output_file = format!("/tmp/whisper_output_{}", timestamp);
    
    // Use whisper.cpp to transcribe
    let output = Command::new(whisper_path)
        .args(&[
            "-m", model_path.to_str().ok_or("Invalid model path")?,
            "-f", audio_path_str,
            "-otxt",
            "-of", &output_file,
            "--no-timestamps",
            "-l", "en"
        ])
        .output()
        .map_err(|e| format!("whisper.cpp failed: {}", e))?;
    
    if output.status.success() {
        // Read the transcript file
        let transcript_path = format!("{}.txt", output_file);
        let transcript = fs::read_to_string(&transcript_path)
            .map_err(|e| format!("Failed to read transcript: {}", e))?;
        
        // ALWAYS clean up temp files
        let _ = fs::remove_file(&audio_path);
        let _ = fs::remove_file(&transcript_path);
        
        Ok(transcript.trim().to_string())
    } else {
        // Clean up on whisper.cpp failure
        let _ = fs::remove_file(&audio_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("whisper.cpp transcription failed: {}", stderr))
    }
}

// Universal download for any supported site
#[tauri::command]
async fn download_universal(window: Window, url: String, site_type: Option<String>) -> Result<String, String> {
    println!("Universal download: {} (type: {:?})", url, site_type);
    
    let downloads_dir = dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    
    // Create Grably folder in Downloads
    let grably_dir = downloads_dir.join("Grably");
    if !grably_dir.exists() {
        std::fs::create_dir_all(&grably_dir).ok();
    }
    
    let mut args = vec![
        "--no-playlist",
        "--progress",
        "--newline",
        "--force-overwrites",  // Allow re-downloading existing files
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "--add-header",
        "Accept-Language:en-US,en;q=0.9",
        "--add-header",
        "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "--add-header",
        "Sec-Fetch-Mode:navigate",
        "--no-check-certificate",
        "--no-warnings",
    ];
    
    // Check if cookies file exists
    let cookies_path = PathBuf::from("/tmp/cookies.txt");
    if cookies_path.exists() {
        args.push("--cookies");
        args.push("/tmp/cookies.txt");
    }
    
    // Add timestamp to prevent conflicts with simultaneous downloads
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() % 10000; // Use last 4 digits of timestamp
    
    // Site-specific handling
    let output_template = match site_type.as_deref() {
        Some("instagram") => {
            // Instagram mobile headers - for public content
            args.push("--add-header");
            args.push("X-IG-App-ID:936619743392459");  // Instagram mobile app ID
            args.push("--add-header");
            args.push("X-IG-WWW-Claim:0");
            args.push("--add-header");
            args.push("X-ASBD-ID:129477");
            args.push("--add-header");
            args.push("X-Requested-With:XMLHttpRequest");
            args.push("--add-header");
            args.push("Referer:https://www.instagram.com/");
            args.push("--extractor-args");
            args.push("instagram:app_id=936619743392459");
            format!("instagram_%(id)s_{}.%(ext)s", timestamp)
        }
        Some("tiktok") => {
            // TikTok mobile headers work best
            args.push("--add-header");
            args.push("Referer:https://www.tiktok.com/");
            args.push("--extractor-args");
            args.push("tiktok:app_version=33.6.3");
            format!("tiktok_%(id)s_{}.%(ext)s", timestamp)
        }
        Some("twitter") | Some("x") => {
            // Twitter needs guest token - yt-dlp handles this automatically
            args.push("--add-header");
            args.push("Referer:https://x.com/");
            args.push("--add-header");
            args.push("Origin:https://x.com");
            format!("twitter_%(id)s_{}.%(ext)s", timestamp)
        }
        Some("facebook") => {
            // Facebook needs auth nowadays
            args.push("--add-header");
            args.push("Referer:https://www.facebook.com/");
            format!("facebook_%(id)s_{}.%(ext)s", timestamp)
        }
        _ => {
            // Generic output template
            format!("%(title)s_{}.%(ext)s", timestamp)
        }
    };
    
    let output_path = grably_dir.join(output_template);
    
    // Generate unique ID for this download
    use uuid::Uuid;
    let download_id = Uuid::new_v4().to_string();
    
    // Use temporary filename - we'll update it later with real title
    let temp_filename = format!("{} Download", site_type.as_deref().unwrap_or("Media"));
    
    // Immediately emit download started with status - NO DELAY!
    window.emit("download-status", serde_json::json!({
        "id": download_id.clone(),
        "filename": temp_filename.clone(),
        "status": "Initializing download...",
        "percent": 0.0
    })).ok();
    
    // Get the actual title in background (don't block!)
    let url_for_title = url.clone();
    let window_for_title = window.clone();
    let download_id_for_title = download_id.clone();
    let _site_type_for_title = site_type.clone();
    std::thread::spawn(move || {
        let mut title_args = vec!["--get-title"];
        title_args.push(&url_for_title);

        let mut title_cmd2 = Command::new(&get_ytdlp_path());
        title_cmd2.args(&get_js_runtime_args());
        title_cmd2.args(&title_args);
        if let Ok(output) = title_cmd2.output() {
            if let Ok(title) = String::from_utf8(output.stdout) {
                let title = title.trim().to_string();
                if !title.is_empty() {
                    // Update with real title
                    window_for_title.emit("download-status", serde_json::json!({
                        "id": download_id_for_title,
                        "filename": title,
                        "status": "Connecting...",
                        "percent": 0.0
                    })).ok();
                }
            }
        }
    });
    
    let filename = temp_filename; // Use temp filename for now
    
    let url_for_history = url.clone();
    let site_type_for_history = site_type.clone();

    let mut owned_args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    owned_args.push("-o".to_string());
    owned_args.push(output_path.to_string_lossy().to_string());
    owned_args.push(url);
    
    // Get download path for completion notification
    let download_path_str = output_path.to_string_lossy().to_string();
    
    // Spawn the download process
    let mut dl_cmd = Command::new(&get_ytdlp_path());
    dl_cmd.args(&get_js_runtime_args());
    dl_cmd.args(&owned_args);
    let mut child = dl_cmd
        .current_dir(&grably_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start download: {}", e))?;

    // Read all output in background
    if let Some(stdout) = child.stdout.take() {
        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut completed = false;
            let mut current_dest: Option<String> = None;

            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some(dest) = parse_destination_from_line(&line) {
                        current_dest = Some(dest);
                    }
                    // Stream all output for real-time status
                    if line.starts_with("[") {
                        // Parse different yt-dlp status messages
                        let status = if line.contains("Extracting URL") {
                            "Extracting URL..."
                        } else if line.contains("Downloading webpage") {
                            "Fetching webpage..."
                        } else if line.contains("Downloading API") || line.contains("Downloading JSON") {
                            "Accessing API..."
                        } else if line.contains("Downloading video information") {
                            "Getting video info..."
                        } else if line.contains("Downloading m3u8") {
                            "Processing video streams..."
                        } else if line.contains("[Merger]") || line.contains("Merging") {
                            // Skip merging status - don't emit it
                            continue;
                        } else if line.contains("[download] Destination:") {
                            "Starting download..."
                        } else if line.contains("[download]") && line.contains("%") {
                            // This is actual progress
                            if let Some(mut progress) = parse_progress(&line) {
                                progress.filename = Some(filename.clone());
                                progress.id = Some(download_id.clone());
                                window.emit("download-progress", &progress).ok();

                                // Emit UI event at 100% but defer history append.
                                if !completed && progress.percent >= 100.0 {
                                    completed = true;
                                    emit_download_complete_event(
                                        &window,
                                        &download_id,
                                        &filename,
                                        &download_path_str,
                                        &current_dest,
                                    );
                                }
                            }
                            continue; // Skip status update for progress lines
                        } else if line.contains("has already been downloaded") {
                            if !completed {
                                completed = true;
                                emit_download_complete_event(
                                    &window,
                                    &download_id,
                                    &filename,
                                    &download_path_str,
                                    &current_dest,
                                );
                            }
                            continue;
                        } else {
                            // Skip other technical messages
                            continue;
                        };

                        // Emit status update
                        window.emit("download-status", serde_json::json!({
                            "id": download_id.clone(),
                            "filename": filename.clone(),
                            "status": status,
                            "percent": 0.0
                        })).ok();
                    }
                }
            }

            // stdout closed — yt-dlp + post-processors are done. Record FINAL
            // destination (e.g. .mp3 after [ExtractAudio]) to history.
            if completed {
                record_download_in_history(
                    &filename,
                    &download_path_str,
                    &current_dest,
                    &url_for_history,
                    site_type_for_history.as_deref(),
                );
            }

            // Also read stderr for any error messages
            if let Some(stderr) = stderr {
                let stderr_reader = BufReader::new(stderr);
                for line in stderr_reader.lines() {
                    if let Ok(line) = line {
                        // Skip non-critical errors
                        if line.contains("The downloaded file is empty") {
                            // This happens when file already exists, ignore it
                            continue;
                        }
                        if line.contains("ERROR") {
                            // Only show critical errors
                            if !line.contains("has already been downloaded") {
                                window.emit("download-status", serde_json::json!({
                                    "id": download_id.clone(),
                                    "filename": filename.clone(),
                                    "status": format!("Error: {}", line),
                                    "percent": 0.0
                                })).ok();
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Return immediately - fire and forget
    Ok(format!("Download started"))
}

// Transcribe TikTok video
#[tauri::command]
async fn transcribe_tiktok(url: String) -> Result<String, String> {
    println!("Transcribing TikTok video: {}", url);
    // TikTok goes straight to Whisper
    let result = transcribe_with_whisper(&url).await;
    if let Ok(ref transcript) = result {
        record_transcription_history(&url, transcript, Some("tiktok"));
    }
    result
}

// Transcribe any universal URL
#[tauri::command]
async fn transcribe_universal(url: String) -> Result<String, String> {
    println!("Transcribing universal URL: {}", url);
    // Universal URLs go straight to Whisper
    let result = transcribe_with_whisper(&url).await;
    if let Ok(ref transcript) = result {
        record_transcription_history(&url, transcript, Some("universal"));
    }
    result
}

// Transcribe any audio/video file
#[tauri::command]
#[allow(non_snake_case)]
async fn transcribe_file(filePath: String) -> Result<String, String> {
    println!("Transcribing file: {}", filePath);
    
    let path = PathBuf::from(&filePath);
    if !path.exists() {
        println!("File not found at path: {:?}", path);
        return Err(format!("File not found: {}", filePath));
    }
    
    println!("File exists at: {:?}", path);
    
    // Get the path to the whisper.cpp binary and model
    let (whisper_path, model_path) = get_whisper_path()?;
    
    // Create temporary files
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let wav_file = format!("/tmp/whisper_audio_{}.wav", timestamp);
    let output_file = format!("/tmp/whisper_file_output_{}", timestamp);
    
    // First convert the file to WAV using ffmpeg
    println!("Converting to WAV: {} -> {}", filePath, wav_file);
    let ffmpeg_output = Command::new(get_ffmpeg_path())
        .args(&[
            "-i", path.to_str().ok_or("Invalid file path")?,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            &wav_file,
            "-y"
        ])
        .output()
        .map_err(|e| format!("FFmpeg conversion failed: {}", e))?;
    
    if !ffmpeg_output.status.success() {
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr);
        return Err(format!("FFmpeg conversion failed: {}", stderr));
    }
    
    println!("Conversion successful, running whisper on WAV file");
    
    // Use whisper.cpp to transcribe the WAV file
    println!("Running whisper with output file: {}", output_file);
    let output = Command::new(&whisper_path)
        .args(&[
            "-m", model_path.to_str().ok_or("Invalid model path")?,
            "-f", &wav_file,
            "-otxt",
            "-of", &output_file,
            "--no-timestamps",
            "-l", "en"
        ])
        .output()
        .map_err(|e| format!("whisper.cpp failed: {}", e))?;
    
    println!("Whisper exit status: {}", output.status);
    if !output.stderr.is_empty() {
        println!("Whisper stderr: {}", String::from_utf8_lossy(&output.stderr));
    }
    if !output.stdout.is_empty() {
        println!("Whisper stdout: {}", String::from_utf8_lossy(&output.stdout));
    }
    
    if output.status.success() {
        // Read the transcript file
        let transcript_path = format!("{}.txt", output_file);
        println!("Looking for transcript at: {}", transcript_path);
        
        // Check if file exists
        if !PathBuf::from(&transcript_path).exists() {
            // Try without .txt extension
            println!("File not found at {}, trying without .txt", transcript_path);
            if PathBuf::from(&output_file).exists() {
                println!("Found file at {}", output_file);
                let transcript = fs::read_to_string(&output_file)
                    .map_err(|e| format!("Failed to read transcript: {}", e))?;
                let _ = fs::remove_file(&output_file);
                return Ok(transcript.trim().to_string());
            }
            
            // List files in /tmp to debug
            println!("Files in /tmp matching pattern:");
            if let Ok(entries) = fs::read_dir("/tmp") {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        if path.to_string_lossy().contains("whisper_file_output") {
                            println!("  Found: {:?}", path);
                        }
                    }
                }
            }
            
            return Err(format!("Transcript file not found at {} or {}", transcript_path, output_file));
        }
        
        let transcript = fs::read_to_string(&transcript_path)
            .map_err(|e| format!("Failed to read transcript: {}", e))?;
        
        // Clean up
        let _ = fs::remove_file(&transcript_path);
        let _ = fs::remove_file(&wav_file);

        let final_transcript = transcript.trim().to_string();
        record_transcription_history(&filePath, &final_transcript, Some("file"));
        Ok(final_transcript)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Clean up WAV file even on error
        let _ = fs::remove_file(&wav_file);
        Err(format!("whisper.cpp transcription failed: {}", stderr))
    }
}






#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn get_history() -> Result<Vec<HistoryEntry>, String> {
    Ok(read_history_entries())
}

#[tauri::command]
async fn delete_history_entry(id: String) -> Result<(), String> {
    let mut entries = read_history_entries();
    entries.retain(|e| e.id != id);
    write_history_entries(&entries)
}

#[tauri::command]
async fn clear_history() -> Result<(), String> {
    write_history_entries(&[])
}

#[tauri::command]
async fn reveal_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open path: {}", e))?;
    Ok(())
}




#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_youtube_info,
            get_youtube_formats,
            get_playlist_info,
            is_playlist,
            download_youtube,
            download_universal,
            transcribe_youtube,
            transcribe_tiktok,
            transcribe_universal,
            transcribe_file,
            show_main_window,
            quit_app,
            get_history,
            delete_history_entry,
            clear_history,
            reveal_in_finder,
            open_path,
        ])
        .setup(|_app| {
            println!("Grably Desktop initialized - using bundled yt-dlp binary");
            
            // Pre-warm the binaries on app startup to avoid first-run delays
            std::thread::spawn(|| {
                println!("Pre-warming yt-dlp binary...");
                let ytdlp_path = get_ytdlp_path();
                let _ = Command::new(&ytdlp_path)
                    .arg("--version")
                    .output();
                println!("yt-dlp pre-warmed!");
                
                println!("Pre-warming ffmpeg binary...");
                let ffmpeg_path = get_ffmpeg_path();
                let _ = Command::new(&ffmpeg_path)
                    .arg("-version")
                    .output();
                println!("ffmpeg pre-warmed!");
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

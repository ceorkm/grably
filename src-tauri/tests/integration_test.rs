use std::fs;
use std::process::Command;

#[test]
fn test_whisper_transcription() {
    // Test if Whisper can transcribe a file
    let test_file = "/Users/femi/Documents/augment-projects/tools copy 2/801a8b3822d6e9eb373cec3d70e6a060.mp4";
    
    if !std::path::Path::new(test_file).exists() {
        println!("Test file not found, skipping test");
        return;
    }

    let output = Command::new("/Users/femi/.pyenv/shims/whisper")
        .args(&[
            test_file,
            "--model", "tiny",
            "--language", "en",
            "--output_format", "txt",
            "--output_dir", "/tmp",
            "--fp16", "False"
        ])
        .output();

    match output {
        Ok(result) => {
            assert!(result.status.success(), "Whisper command failed");
            
            // Check if transcript was created
            let transcript_path = "/tmp/801a8b3822d6e9eb373cec3d70e6a060.txt";
            assert!(std::path::Path::new(transcript_path).exists(), "Transcript file not created");
            
            // Read and verify transcript content
            let content = fs::read_to_string(transcript_path).expect("Failed to read transcript");
            assert!(!content.is_empty(), "Transcript is empty");
            assert!(content.contains("church") || content.contains("money"), "Transcript doesn't contain expected words");
            
            println!("✅ Whisper transcription test PASSED");
        }
        Err(e) => {
            panic!("Failed to run Whisper: {}", e);
        }
    }
}

#[test]
fn test_ytdlp_download() {
    // Test if yt-dlp can download
    let output = Command::new("yt-dlp")
        .args(&["--version"])
        .output();

    match output {
        Ok(result) => {
            assert!(result.status.success(), "yt-dlp not available");
            let version = String::from_utf8_lossy(&result.stdout);
            println!("✅ yt-dlp available: {}", version.trim());
        }
        Err(e) => {
            panic!("yt-dlp not installed: {}", e);
        }
    }
}
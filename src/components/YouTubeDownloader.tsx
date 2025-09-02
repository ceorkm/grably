import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Loader2, Youtube, ArrowLeft, Check, Music, Video, CheckSquare, Square } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface VideoFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  format_note?: string;
  quality?: number;
  abr?: string | number;
}

interface VideoInfo {
  title: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  view_count?: number;
  formats: VideoFormat[];
}

interface PlaylistVideo {
  id: string;
  title: string;
  duration?: number;
  thumbnail?: string;
  url?: string;
}

interface PlaylistInfo {
  title: string;
  uploader?: string;
  video_count: number;
  videos: PlaylistVideo[];
  thumbnail?: string;
}

interface DownloadProgress {
  percent: number;
  downloaded: string;
  total: string;
  speed: string;
  eta: string;
}

// Extract YouTube video ID from URL
const extractVideoId = (url: string): string | null => {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// Check if URL is a playlist
const isPlaylistUrl = (url: string): boolean => {
  return url.includes('playlist?list=') || url.includes('&list=');
};

// Format file size with proper units
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);
  const kb = bytes / 1024;
  
  if (gb >= 1) {
    return `${gb.toFixed(1)}GB`;
  } else if (mb >= 1) {
    return `${mb.toFixed(1)}MB`;
  } else {
    return `${kb.toFixed(0)}KB`;
  }
};

// Format duration
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Helper functions for playlist video selection
const toggleVideoSelection = (videoId: string, selectedVideos: Set<string>, setSelectedVideos: (videos: Set<string>) => void) => {
  const newSelection = new Set(selectedVideos);
  if (newSelection.has(videoId)) {
    newSelection.delete(videoId);
  } else {
    newSelection.add(videoId);
  }
  setSelectedVideos(newSelection);
};

const selectAllVideos = (playlistInfo: PlaylistInfo | null, setSelectedVideos: (videos: Set<string>) => void) => {
  if (playlistInfo) {
    setSelectedVideos(new Set(playlistInfo.videos.map(v => v.id)));
  }
};

const deselectAllVideos = (setSelectedVideos: (videos: Set<string>) => void) => {
  setSelectedVideos(new Set());
};

export const YouTubeDownloader: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [formatType, setFormatType] = useState<'video' | 'audio'>('video');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [currentPlayingVideo, setCurrentPlayingVideo] = useState<string | null>(null);
  const [downloadMode, setDownloadMode] = useState<'single' | 'playlist'>('single');

  // Helper to parse resolution
  const parseResolution = (resolution?: string, formatNote?: string): string => {
    if (resolution) {
      // Convert resolution like "1920x1080" to "1080p"
      const height = resolution.split('x')[1];
      if (height) {
        const heightNum = parseInt(height);
        if (heightNum >= 2160) return '4K';
        if (heightNum >= 1440) return '1440p';
        if (heightNum >= 1080) return '1080p';
        if (heightNum >= 720) return '720p';
        if (heightNum >= 480) return '480p';
        if (heightNum >= 360) return '360p';
        if (heightNum >= 240) return '240p';
        if (heightNum >= 144) return '144p';
      }
    }
    // Fallback to format_note if it contains resolution info
    if (formatNote) {
      // Check for resolution patterns in format_note (like "2160p60 HDR")
      if (formatNote.includes('4K') || formatNote.includes('2160')) return '4K';
      if (formatNote.includes('1440')) return '1440p';
      if (formatNote.includes('1080')) return '1080p';
      if (formatNote.includes('720')) return '720p';
      if (formatNote.includes('480')) return '480p';
      if (formatNote.includes('360')) return '360p';
      if (formatNote.includes('240')) return '240p';
      if (formatNote.includes('144')) return '144p';
    }
    return '';
  };

  // Split and filter formats - MP4 only for video, standard resolutions
  const standardResolutions = ['4K', '1440p', '1080p', '720p', '480p', '360p', '240p'];
  
  const videoFormats = videoInfo?.formats
    .filter(f => {
      const res = parseResolution(f.resolution, f.format_note);
      const isHighRes = res === '4K' || res === '1440p';
      
      if (f.ext !== 'mp4' && !(isHighRes && f.ext === 'webm')) return false;
      if (!f.resolution && !f.format_note) return false;
      if (f.vcodec === 'none' || !f.vcodec) return false;
      
      return standardResolutions.includes(res);
    })
    .map(f => ({
      ...f,
      cleanResolution: parseResolution(f.resolution, f.format_note)
    }))
    .reduce((acc, format) => {
      const existing = acc.find(f => f.cleanResolution === format.cleanResolution);
      if (!existing) {
        acc.push(format);
      } else {
        const preferCurrent = 
          (existing.vcodec?.includes('av01') && format.vcodec?.includes('avc1')) ||
          ((format.quality || 0) > (existing.quality || 0) && 
           !existing.vcodec?.includes('avc1')) ||
          ((format.filesize || 0) > (existing.filesize || 0) && 
           format.vcodec?.includes(existing.vcodec?.split('.')[0] || ''));
        
        if (preferCurrent) {
          const index = acc.indexOf(existing);
          acc[index] = format;
        }
      }
      return acc;
    }, [] as any[])
    .sort((a, b) => {
      const order = ['4K', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
      return order.indexOf(a.cleanResolution) - order.indexOf(b.cleanResolution);
    }) || [];

  // Audio formats - create MP3 and WAV options from best audio
  const bestAudio = videoInfo?.formats
    .filter(f => {
      if (f.vcodec && f.vcodec !== 'none') return false;
      if (!f.acodec || f.acodec === 'none') return false;
      return f.ext === 'm4a' || f.ext === 'webm';
    })
    .sort((a, b) => {
      if (a.quality && b.quality) return b.quality - a.quality;
      if (a.abr && b.abr) return Number(b.abr) - Number(a.abr);
      return 0;
    })?.[0];
  
  const audioFormats = bestAudio ? [
    {
      ...bestAudio,
      format_id: 'mp3',
      ext: 'mp3',
      format_note: 'MP3 Audio',
      filesize: bestAudio.filesize ? bestAudio.filesize * 0.9 : undefined
    },
    {
      ...bestAudio,
      format_id: 'wav',
      ext: 'wav', 
      format_note: 'WAV Audio (Lossless)',
      filesize: bestAudio.filesize ? bestAudio.filesize * 10 : undefined
    }
  ] : [];

  useEffect(() => {
    if (!window.__TAURI__) {
      return;
    }
    
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const fetchVideoInfo = async () => {
    if (!url) return;
    
    setLoading(true);
    setVideoInfo(null);
    setPlaylistInfo(null);
    setSelectedFormat('');
    setShowPlayer(false);
    setSelectedVideos(new Set());
    
    // Check if it's a playlist
    const playlist = isPlaylistUrl(url);
    console.log('URL:', url, 'Is playlist?', playlist);
    setIsPlaylist(playlist);
    
    try {
      if (!window.__TAURI__) {
        console.error('Video fetching requires the desktop app');
        setLoading(false);
        return;
      }
      
      if (playlist) {
        try {
          // Try to fetch playlist info
          const playlistData = await invoke<PlaylistInfo>('get_playlist_info', { url });
          
          // Check if we got valid playlist data
          if (!playlistData || !playlistData.videos || playlistData.videos.length === 0) {
            console.log('No videos found in playlist, falling back to single video mode');
            // Fall back to single video mode
            setIsPlaylist(false);
            
            // Treat as single video
            const info = await invoke<VideoInfo>('get_youtube_info', { url });
            setVideoInfo(info);
            
            const id = extractVideoId(url);
            if (id) {
              setVideoId(id);
              setShowPlayer(true);
            }
          } else {
            // Valid playlist data
            setPlaylistInfo(playlistData);
            
            // Select all videos by default
            setSelectedVideos(new Set(playlistData.videos.map(v => v.id)));
            
            // Set first video as current playing
            if (playlistData.videos.length > 0) {
              setCurrentPlayingVideo(playlistData.videos[0].id);
              setVideoId(playlistData.videos[0].id);
              
              // Get formats for the first video if available
              if (playlistData.videos[0].url) {
                const info = await invoke<VideoInfo>('get_youtube_info', { url: playlistData.videos[0].url });
                setVideoInfo(info);
              }
            }
            
            setShowPlayer(true);
          }
        } catch (playlistError) {
          console.error('Playlist fetch error (falling back to single video):', playlistError);
          // If playlist fails (e.g., YouTube Mix), fall back to single video
          setIsPlaylist(false);
          
          // Treat as single video
          const info = await invoke<VideoInfo>('get_youtube_info', { url });
          setVideoInfo(info);
          
          const id = extractVideoId(url);
          if (id) {
            setVideoId(id);
            setShowPlayer(true);
          }
        }
      } else {
        // Single video
        const info = await invoke<VideoInfo>('get_youtube_info', { url });
        setVideoInfo(info);
        
        // Extract video ID and show player AFTER getting info
        const id = extractVideoId(url);
        if (id) {
          setVideoId(id);
          setShowPlayer(true); // Show player together with formats
        }
      }
      
      // Auto-select best format with audio if possible (only if we have video info)
      if (videoInfo) {
        // First try to find 1080p or 720p with audio
        const bestWithAudio = videoInfo.formats.find(f => 
          (f.resolution?.includes('1920x1080') || f.format_note?.includes('1080')) && 
          f.acodec && f.acodec !== 'none' && f.ext === 'mp4'
        ) || videoInfo.formats.find(f => 
          (f.resolution?.includes('1280x720') || f.format_note?.includes('720')) && 
          f.acodec && f.acodec !== 'none' && f.ext === 'mp4'
        );
        
        // If no format with audio, get best video-only (will be merged with audio)
        const bestVideo = bestWithAudio || 
                         videoInfo.formats.find(f => f.resolution?.includes('1920x1080') && f.ext === 'mp4') ||
                         videoInfo.formats.find(f => f.resolution?.includes('1280x720') && f.ext === 'mp4') ||
                         videoInfo.formats.find(f => f.ext === 'mp4') ||
                         videoInfo.formats[0];
                         
        if (bestVideo) {
          setSelectedFormat(bestVideo.format_id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch video info:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = async () => {
    if (!url || !selectedFormat) return;
    
    setDownloading(true);
    setProgress(null);
    
    try {
      if (!window.__TAURI__) {
        console.error('Downloads require the desktop app');
        setDownloading(false);
        return;
      }
      
      if (isPlaylist && downloadMode === 'playlist') {
        // Download selected videos from playlist
        const videosToDownload = playlistInfo?.videos.filter(v => selectedVideos.has(v.id)) || [];
        
        for (const video of videosToDownload) {
          if (video.url) {
            await invoke<string>('download_youtube', { 
              url: video.url, 
              format: selectedFormat,
              downloadPlaylist: false
            });
          }
        }
      } else {
        // Single video download or specific video from playlist
        const downloadUrl = currentPlayingVideo && playlistInfo 
          ? playlistInfo.videos.find(v => v.id === currentPlayingVideo)?.url || url
          : url;
          
        // Start download in background (fire and forget)
        invoke<string>('download_youtube', { 
          url: downloadUrl, 
          format: selectedFormat,
          downloadPlaylist: false
        }).then(result => {
          console.log('Download completed:', result);
          setProgress(null);
        }).catch(error => {
          console.error('Download failed:', error);
          toast.error('Download failed');
          setProgress(null);
        });
      }
      
      // Show brief loading state then reset
      setTimeout(() => {
        setDownloading(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to start download:', error);
      toast.error('Failed to start download');
      setDownloading(false);
      setProgress(null);
    }
  };


  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bungee&family=Space+Mono:wght@400;700&family=Archivo+Black&family=Bebas+Neue&family=Russo+One&display=swap');
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #fb923c;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ea580c;
        }
      `}</style>
      
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 p-4">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
        >
          <ArrowLeft className="h-5 w-5 text-orange-500 group-hover:-translate-x-1 transition-transform" />
        </button>

        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 mb-4">
              <Youtube className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bungee, cursive' }}>
              YOUTUBE DOWNLOADER
            </h1>
            <p className="text-lg text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
              Download videos and audio locally • No server needed
            </p>
          </div>

          {/* URL Input */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Youtube className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-red-500" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube video URL..."
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-base rounded-xl"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                  disabled={loading}
                />
              </div>
              <button
                onClick={fetchVideoInfo}
                disabled={loading || !url}
                className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 transform
                  ${loading || !url
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600 hover:scale-105 active:scale-95'
                }`}
                style={{ fontFamily: 'Bungee, cursive' }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'GRAB IT'
                )}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && !videoInfo && (
            <div className="mt-8 flex flex-col items-center justify-center animate-fadeIn">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <p className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Bungee, cursive' }}>
                  Getting Video Information...
                </p>
              </div>
            </div>
          )}

          {/* Main Content Area */}
          {showPlayer && (
            <div className={`grid ${isPlaylist ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'} gap-6 animate-fadeIn`}>
              
              {/* Left Side - Video Player */}
              <div className={`space-y-4 ${isPlaylist ? 'lg:col-span-2' : ''}`}>
                {videoId ? (
                  <div className="relative rounded-2xl overflow-hidden shadow-xl">
                    <div 
                      className="aspect-video bg-gray-900 cursor-pointer relative group"
                      onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
                    >
                      <img 
                        src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                        alt="Video thumbnail"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all">
                        <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded-lg text-sm">
                        Click to watch on YouTube
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Video Info */}
                {videoInfo && (
                  <div className="bg-white rounded-xl p-5 border-2 border-gray-100 shadow-md">
                    <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Archivo Black, sans-serif' }}>
                      {videoInfo.title}
                    </h3>
                    {videoInfo.duration && (
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
                        <p className="text-sm text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
                          Duration: {formatDuration(videoInfo.duration)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
              </div>

              {/* Right Side - Playlist Panel (only when playlist) */}
              {isPlaylist && playlistInfo && (
                <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-xl shadow-md p-5 border border-orange-200">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: 'Bebas Neue, cursive' }}>
                      PLAYLIST: {playlistInfo.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {playlistInfo.video_count} videos • By {playlistInfo.uploader || 'Unknown'}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => selectAllVideos(playlistInfo, setSelectedVideos)}
                        className="px-3 py-1 text-xs font-bold bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => deselectAllVideos(setSelectedVideos)}
                        className="px-3 py-1 text-xs font-bold bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Video List */}
                  <div className="max-h-[400px] overflow-y-auto space-y-2 mb-4 custom-scrollbar">
                    {playlistInfo.videos.map((video, index) => (
                      <div
                        key={video.id}
                        className={`playlist-item p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          currentPlayingVideo === video.id 
                            ? 'border-orange-500 bg-gradient-to-r from-orange-100 to-amber-100' 
                            : 'border-orange-200 bg-white/80 hover:border-orange-300 hover:bg-orange-50/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVideoSelection(video.id, selectedVideos, setSelectedVideos);
                            }}
                            className="mt-1"
                          >
                            {selectedVideos.has(video.id) ? (
                              <CheckSquare className="w-5 h-5 text-orange-500" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <div 
                            className="flex-1"
                            onClick={() => {
                              setCurrentPlayingVideo(video.id);
                              setVideoId(video.id);
                              if (video.url) {
                                invoke<VideoInfo>('get_youtube_info', { url: video.url })
                                  .then(info => setVideoInfo(info))
                                  .catch(console.error);
                              }
                            }}
                          >
                            <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                              {index + 1}. {video.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDuration(video.duration)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Format Selection for Playlist - Compact Style */}
                  {videoInfo && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-orange-700 uppercase tracking-wider">
                          Choose Format
                        </label>
                        <div className="relative">
                          <select
                            value={selectedFormat}
                            onChange={(e) => setSelectedFormat(e.target.value)}
                            className="w-full appearance-none px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg focus:border-orange-500 focus:outline-none transition-all text-gray-800 font-medium cursor-pointer hover:border-orange-400"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ea580c' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                              backgroundPosition: 'right 0.75rem center',
                              backgroundRepeat: 'no-repeat',
                              backgroundSize: '1.25em 1.25em',
                              paddingRight: '2.5rem'
                            }}
                          >
                            <option value="" disabled>Select Format</option>
                            <optgroup label="Video">
                              {videoFormats.slice(0, 5).map(f => (
                                <option key={f.format_id} value={f.format_id}>
                                  {f.cleanResolution} • MP4 • {formatFileSize(f.filesize)}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Audio">
                              <option value="mp3">
                                MP3 Audio • {formatFileSize(3100000)}
                              </option>
                              <option value="wav">
                                WAV Audio (Lossless) • {formatFileSize(37000000)}
                              </option>
                            </optgroup>
                          </select>
                        </div>
                      </div>

                      {/* Download Mode Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setDownloadMode('single')}
                          className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${
                            downloadMode === 'single' 
                              ? 'bg-orange-500 text-white' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Download Current
                        </button>
                        <button
                          onClick={() => setDownloadMode('playlist')}
                          className={`flex-1 px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${
                            downloadMode === 'playlist' 
                              ? 'bg-orange-500 text-white' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Download Selected ({selectedVideos.size})
                        </button>
                      </div>

                      {/* Download Button */}
                      <button
                        onClick={downloadVideo}
                        disabled={downloading || !selectedFormat}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 transform
                          ${downloading || !selectedFormat
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:scale-105 active:scale-95 shadow-lg'
                          }`}
                        style={{ fontFamily: 'Bungee, cursive' }}
                      >
                        {downloading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            DOWNLOADING...
                          </span>
                        ) : (
                          'DOWNLOAD NOW'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Right Side - Format Selection (single video only, not playlist) */}
              {!isPlaylist && videoInfo && (
                <div className="bg-white rounded-xl p-5 shadow-md space-y-4">
                  {/* Format Type Tabs */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFormatType('video')}
                      className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all duration-300 ${
                        formatType === 'video' 
                          ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white scale-105 shadow-lg' 
                          : 'bg-white text-gray-600 hover:bg-gray-50 border-2 border-gray-200'
                      }`}
                      style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px' }}
                    >
                      <Video className="w-5 h-5 inline mr-2" />
                      VIDEO
                    </button>
                    <button
                      onClick={() => setFormatType('audio')}
                      className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all duration-300 ${
                        formatType === 'audio' 
                          ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white scale-105 shadow-lg' 
                          : 'bg-white text-gray-600 hover:bg-gray-50 border-2 border-gray-200'
                      }`}
                      style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px' }}
                    >
                      <Music className="w-5 h-5 inline mr-2" />
                      AUDIO
                    </button>
                  </div>

                  {/* Format Options */}
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {formatType === 'video' ? (
                      <>
                        {videoFormats.map((format) => (
                          <button
                            key={format.format_id}
                            onClick={() => setSelectedFormat(format.format_id)}
                            className={`w-full p-3 rounded-xl border-2 transition-all duration-300 ${
                              selectedFormat === format.format_id
                                ? 'border-orange-500 bg-gradient-to-r from-orange-50 to-red-50 shadow-md'
                                : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Video className="w-5 h-5 text-orange-500" />
                                <div className="text-left">
                                  <p className="font-bold text-gray-900 text-sm">
                                    {format.cleanResolution} • {format.fps || 30}fps
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    MP4 • {formatFileSize(format.filesize)}
                                  </p>
                                </div>
                              </div>
                              {selectedFormat === format.format_id && (
                                <Check className="w-5 h-5 text-orange-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        {audioFormats.map((format) => (
                          <button
                            key={format.format_id}
                            onClick={() => setSelectedFormat(format.format_id)}
                            className={`w-full p-3 rounded-xl border-2 transition-all duration-300 ${
                              selectedFormat === format.format_id
                                ? 'border-orange-500 bg-gradient-to-r from-orange-50 to-red-50 shadow-md'
                                : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Music className="w-5 h-5 text-orange-500" />
                                <div className="text-left">
                                  <p className="font-bold text-gray-900 text-sm">
                                    {format.quality ? `${Math.round(format.quality)}kbps` : format.format_note || 'High Quality Audio'}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {format.ext.toUpperCase()} • {formatFileSize(format.filesize)}
                                  </p>
                                </div>
                              </div>
                              {selectedFormat === format.format_id && (
                                <Check className="w-5 h-5 text-orange-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Download Progress */}
                  {downloading && progress && (
                    <div className="space-y-3 p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-700" style={{ fontFamily: 'Space Mono, monospace' }}>
                          {progress.percent?.toFixed(1) || 0}%
                        </span>
                        <span className="text-xs text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
                          {progress.speed} • ETA: {progress.eta}
                        </span>
                      </div>
                      <div className="w-full bg-orange-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-orange-400 to-orange-500 h-full transition-all duration-300 ease-out"
                          style={{ width: `${progress.percent || 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
                        <span>{progress.downloaded}</span>
                        <span>{progress.total}</span>
                      </div>
                    </div>
                  )}

                  {/* Download Button */}
                  <button
                    onClick={downloadVideo}
                    disabled={downloading || !selectedFormat}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform
                      ${downloading || !selectedFormat
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:scale-105 active:scale-95 shadow-lg'
                      }`}
                    style={{ fontFamily: 'Bungee, cursive' }}
                  >
                    {downloading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        DOWNLOADING...
                      </span>
                    ) : (
                      'DOWNLOAD NOW'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
};
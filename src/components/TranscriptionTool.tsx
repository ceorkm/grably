import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileVideo, Youtube, Mic, Loader2, Check, Copy, Download, Sparkles, Globe, X, Clock, CheckCircle, AlertCircle, Upload, Headphones, Brain, Activity, FileText, Link, Cloud, Settings, FileAudio, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// Check if we're in Tauri context
const isTauri = () => {
  try {
    return window.__TAURI__ !== undefined;
  } catch {
    return false;
  }
};

// Custom TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const platforms = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'from-orange-500 to-red-500' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, color: 'from-red-500 to-orange-500' },
  { id: 'video', name: 'Upload Video', icon: FileVideo, color: 'from-amber-500 to-orange-500' },
  { id: 'universal', name: 'Any URL', icon: Globe, color: 'from-orange-400 to-amber-400' },
];

const transcriptionMethods = [
  { id: 'native', name: 'Native Captions', description: 'Extract existing subtitles (faster)', available: ['youtube'] },
  { id: 'whisper', name: 'Whisper AI', description: 'Advanced AI transcription (more accurate)', available: ['youtube', 'tiktok', 'video', 'universal'] },
];

interface TranscriptionJob {
  id: string;
  platform: string;
  url?: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  status: 'queued' | 'processing' | 'completed' | 'error';
  statusMessage?: string;
  statusIcon?: any;
  transcription?: string;
  videoInfo?: any;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

export const TranscriptionTool: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selectedPlatform, setSelectedPlatform] = useState('youtube');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<{path: string, name: string, size?: number}[]>([]);
  const [method, setMethod] = useState('whisper');
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const generateJobId = () => `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const processTranscription = async (job: TranscriptionJob) => {
    // Update job status to processing
    setJobs(prev => prev.map(j => 
      j.id === job.id ? { ...j, status: 'processing', statusMessage: 'Starting...' } : j
    ));

    // Set up status update intervals for realistic progress feedback
    const statusUpdates: { [key: string]: { message: string; icon: any }[] } = {
      video: [
        { message: 'Uploading file...', icon: Upload },
        { message: 'Extracting audio track...', icon: Headphones },
        { message: 'Processing with Whisper AI...', icon: Brain },
        { message: 'Analyzing speech patterns...', icon: Activity },
        { message: 'Generating transcript...', icon: FileText }
      ],
      youtube: method === 'native' ? [
        { message: 'Connecting to YouTube...', icon: Youtube },
        { message: 'Fetching video metadata...', icon: Cloud },
        { message: 'Extracting captions...', icon: FileText },
        { message: 'Processing subtitles...', icon: Settings }
      ] : [
        { message: 'Connecting to YouTube...', icon: Youtube },
        { message: 'Downloading audio stream...', icon: Cloud },
        { message: 'Converting audio format...', icon: Headphones },
        { message: 'Processing with Whisper AI...', icon: Brain },
        { message: 'Generating transcript...', icon: FileText }
      ],
      tiktok: [
        { message: 'Connecting to TikTok...', icon: TikTokIcon },
        { message: 'Downloading video...', icon: Cloud },
        { message: 'Extracting audio track...', icon: Headphones },
        { message: 'Processing with Whisper AI...', icon: Brain },
        { message: 'Generating transcript...', icon: FileText }
      ],
      universal: [
        { message: 'Analyzing URL...', icon: Link },
        { message: 'Downloading media...', icon: Cloud },
        { message: 'Extracting audio track...', icon: Headphones },
        { message: 'Processing with Whisper AI...', icon: Brain },
        { message: 'Generating transcript...', icon: FileText }
      ]
    };

    const messages = statusUpdates[job.platform] || statusUpdates.universal;
    let messageIndex = 0;

    // Update status messages at intervals
    const statusInterval = setInterval(() => {
      if (messageIndex < messages.length) {
        const current = messages[messageIndex];
        setJobs(prev => prev.map(j => 
          j.id === job.id && j.status === 'processing' 
            ? { ...j, statusMessage: current.message, statusIcon: current.icon } 
            : j
        ));
        messageIndex++;
      }
    }, 2500); // Update every 2.5 seconds

    try {
      // Call the actual backend API
      let result: any;
      
      if (!isTauri()) {
        throw new Error('Transcription requires the desktop app. Please use Tauri.');
      }
      
      if (job.platform === 'video' && job.filePath) {
        // Transcribe local file
        result = await invoke('transcribe_file', { filePath: job.filePath });
      } else if (job.platform === 'youtube') {
        // Transcribe YouTube
        result = await invoke('transcribe_youtube', { url: job.url });
      } else if (job.platform === 'tiktok') {
        // Transcribe TikTok
        result = await invoke('transcribe_tiktok', { url: job.url });
      } else if (job.platform === 'universal') {
        // Transcribe any URL
        result = await invoke('transcribe_universal', { url: job.url });
      }
      
      // Clear status interval
      clearInterval(statusInterval);
      
      // Update job with results
      const transcriptionText = typeof result === 'string' ? result : (result as any).transcript || (result as any).transcription || (result as any).text || '';
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? {
              ...j,
              status: 'completed',
              statusMessage: 'Completed',
              transcription: transcriptionText,
              videoInfo: typeof result === 'object' ? {
                title: (result as any).title || (result as any).videoTitle || 'Video',
                duration: (result as any).duration || '',
                ...(result as any)
              } : { title: job.fileName || 'Video' },
              endTime: new Date()
            }
          : j
      ));
      
      console.log(`Transcription completed for ${job.fileName || job.url}`);
      toast.success(`Transcribed: ${job.fileName || job.url}`);
    } catch (error: any) {
      // Clear status interval on error
      clearInterval(statusInterval);
      
      // Update job with error
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? {
              ...j,
              status: 'error',
              error: error.message || 'Failed to transcribe',
              endTime: new Date()
            }
          : j
      ));
      
      console.error('Transcription error:', error.message || 'Failed to transcribe');
      toast.error(`Failed: ${job.fileName || job.url}`);
    }
  };

  const addTranscriptionJobs = async () => {
    if (selectedPlatform === 'video' && files.length === 0) {
      return;
    }
    if (selectedPlatform !== 'video' && !url) {
      return;
    }

    if (selectedPlatform === 'video') {
      // Create a job for each file
      const newJobs: TranscriptionJob[] = files.map(file => ({
        id: generateJobId(),
        platform: selectedPlatform,
        fileName: file.name,
        filePath: file.path,
        fileSize: file.size,
        status: 'queued' as const,
        statusMessage: 'Waiting...',
        startTime: new Date(),
      }));

      setJobs(prev => [...prev, ...newJobs]);
      
      // Start processing each file
      newJobs.forEach((job) => {
        processTranscription(job);
      });

      // Clear files
      setFiles([]);
    } else {
      // Process single URL
      const newJob: TranscriptionJob = {
        id: generateJobId(),
        platform: selectedPlatform,
        url: url,
        status: 'queued',
        statusMessage: 'Waiting...',
        startTime: new Date(),
      };

      setJobs(prev => [...prev, newJob]);
      processTranscription(newJob);
      
      // Clear URL
      setUrl('');
    }
  };

  const selectFiles = async () => {
    try {
      if (!isTauri()) {
        toast.error('File selection requires the desktop app');
        return;
      }
      
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: ['mp4', 'mp3', 'wav', 'avi', 'mov', 'mkv', 'm4a', 'webm']
        }]
      });
      
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const fileInfos = paths.map(path => ({
          path,
          name: path.split('/').pop() || path.split('\\').pop() || path,
        }));
        setFiles(fileInfos);
        toast.success(`Selected ${fileInfos.length} file${fileInfos.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Failed to select files:', error);
      toast.error('Failed to select files');
    }
  };

  const copyTranscription = (transcription: string) => {
    navigator.clipboard.writeText(transcription);
    toast.success('Copied to clipboard!');
  };

  const downloadTranscription = (job: TranscriptionJob) => {
    if (!job.transcription) return;
    
    const blob = new Blob([job.transcription], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${job.fileName || job.url?.replace(/[^a-z0-9]/gi, '-') || job.id}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Downloaded transcription!');
  };

  const removeJob = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
    if (activeJobId === jobId) {
      setActiveJobId(null);
    }
  };

  const activeJob = jobs.find(j => j.id === activeJobId);
  const processingCount = jobs.filter(j => j.status === 'processing').length;
  const queuedCount = jobs.filter(j => j.status === 'queued').length;

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(251, 191, 36, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #fbbf24, #f59e0b);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #f59e0b, #ea580c);
        }
      `}</style>
      
      <div className="min-h-screen p-4">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
      >
        <ArrowLeft className="h-5 w-5 text-orange-500 group-hover:-translate-x-1 transition-transform" />
      </button>
      
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 mb-4 shadow-xl transform hover:scale-110 transition-transform duration-300">
            <FileAudio className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-black mb-3 text-gray-800" style={{ fontFamily: 'Bungee, cursive' }}>
            TRANSCRIBE ANYTHING
          </h1>
          <p className="text-lg font-bold text-gray-600" style={{ fontFamily: 'Bebas Neue, cursive', letterSpacing: '1px' }}>
            Extract text from YouTube, TikTok & video files
          </p>
          {(processingCount > 0 || queuedCount > 0) && (
            <div className="flex items-center justify-center gap-4 mt-4">
              {processingCount > 0 && (
                <span className="px-3 py-1 rounded-full bg-orange-200 text-orange-700 text-sm">
                  {processingCount} processing
                </span>
              )}
              {queuedCount > 0 && (
                <span className="px-3 py-1 rounded-full bg-amber-200 text-amber-700 text-sm">
                  {queuedCount} queued
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Input Section */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 backdrop-blur-xl border-2 border-orange-300 rounded-3xl p-6">
            <h3 className="text-lg font-black text-gray-800 mb-3" style={{ fontFamily: 'Archivo Black, sans-serif' }}>NEW TRANSCRIPTION</h3>
            
            {/* Platform Selection */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {platforms.map((platform) => {
                const Icon = platform.icon;
                const isActive = selectedPlatform === platform.id;
                
                return (
                  <button
                    key={platform.id}
                    onClick={() => setSelectedPlatform(platform.id)}
                    className={`
                      relative p-3 rounded-xl border-2 transition-all duration-300 transform
                      ${isActive 
                        ? 'border-orange-500 scale-[1.02] shadow-md' 
                        : 'border-orange-200 hover:border-orange-400 hover:shadow-sm'
                      }
                    `}
                    style={{
                      background: isActive 
                        ? 'linear-gradient(135deg, #fed7aa, #fb923c)'
                        : 'linear-gradient(135deg, #fff5eb, #ffedd5)'
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-orange-800' : 'text-orange-600'}`} />
                      <div className={`text-xs font-bold uppercase ${isActive ? 'text-orange-900' : 'text-orange-700'}`} 
                           style={{ fontFamily: 'Bebas Neue, cursive' }}>
                        {platform.name}
                      </div>
                    </div>
                    {isActive && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Input Field */}
            {selectedPlatform === 'video' ? (
              <div className="mb-4">
                <label className="block text-xs font-black text-orange-800 uppercase tracking-wider mb-2" style={{ fontFamily: 'Bebas Neue, cursive' }}>
                  Select Videos
                  {files.length > 0 && (
                    <span className="ml-2 text-red-600">({files.length} selected)</span>
                  )}
                </label>
                <button
                  onClick={selectFiles}
                  className="w-full px-4 py-3 bg-gradient-to-r from-white to-orange-50 border-2 border-orange-300 rounded-xl text-gray-800 font-bold hover:border-orange-500 transition-colors flex items-center justify-center gap-2"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                >
                  <Upload className="w-5 h-5 text-orange-600" />
                  {files.length > 0 
                    ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                    : 'Click to select files'}
                </button>
                {files.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {files.map((file, index) => (
                      <div key={index} className="p-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-800 font-medium truncate">{file.name}</p>
                        </div>
                        <button
                          onClick={() => {
                            setFiles(prev => prev.filter((_, i) => i !== index));
                          }}
                          className="p-1 rounded hover:bg-red-500/20 transition-colors ml-2"
                        >
                          <X className="w-3 h-3 text-gray-600 hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-xs font-black text-orange-800 uppercase tracking-wider mb-2" style={{ fontFamily: 'Bebas Neue, cursive' }}>Video URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                    selectedPlatform === 'youtube' ? 'https://youtube.com/watch?v=...' :
                    selectedPlatform === 'tiktok' ? 'https://tiktok.com/@user/video/...' :
                    'Enter any video URL...'
                  }
                  className="w-full px-4 py-3 bg-gradient-to-r from-white to-orange-50 border-2 border-orange-300 rounded-xl text-gray-800 font-bold placeholder-orange-300 focus:border-orange-500 focus:outline-none focus:shadow-lg transition-all duration-300"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                />
              </div>
            )}

            {/* Method Selection */}
            <div className="mb-4">
              <label className="block text-xs font-black text-orange-800 uppercase tracking-wider mb-2" style={{ fontFamily: 'Bebas Neue, cursive' }}>Transcription Method</label>
              <div className="space-y-2">
                {transcriptionMethods.map((m) => {
                  const isAvailable = m.available.includes(selectedPlatform);
                  const isSelected = method === m.id;
                  
                  return (
                    <button
                      key={m.id}
                      onClick={() => isAvailable && setMethod(m.id)}
                      disabled={!isAvailable}
                      className={`
                        w-full p-3 rounded-xl border-2 text-left transition-all duration-300 transform
                        ${!isAvailable 
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' 
                          : isSelected 
                            ? 'border-orange-500 scale-[1.02] shadow-md' 
                            : 'border-orange-200 hover:border-orange-400 hover:scale-[1.01] hover:shadow-sm'
                        }
                      `}
                      style={{
                        background: !isAvailable ? '#f9fafb' : isSelected 
                          ? 'linear-gradient(135deg, #fed7aa, #fb923c)' 
                          : 'linear-gradient(135deg, #fff5eb, #ffedd5)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`text-sm font-black ${isSelected ? 'text-orange-900' : 'text-orange-700'}`} 
                               style={{ fontFamily: 'Bebas Neue, cursive', letterSpacing: '1px' }}>
                            {m.name}
                          </div>
                          <div className="text-xs font-medium mt-0.5" style={{ color: isSelected ? '#7c2d12' : '#9ca3af' }}>
                            {m.description}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-orange-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add to Queue Button */}
            <button
              onClick={addTranscriptionJobs}
              disabled={selectedPlatform === 'video' ? files.length === 0 : !url}
              className={`
                w-full py-4 px-6 rounded-xl font-black text-lg
                transition-all duration-300 transform shadow-lg
                ${(selectedPlatform === 'video' ? files.length === 0 : !url)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 hover:scale-105 hover:shadow-xl active:scale-95'
                }
              `}
              style={{ fontFamily: 'Bungee, cursive' }}
            >
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span>
                  {selectedPlatform === 'video' && files.length > 1 
                    ? `Add ${files.length} Files to Queue`
                    : 'Add to Queue'
                  }
                </span>
              </div>
            </button>
          </div>

          {/* Queue Section */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 backdrop-blur-xl border-2 border-amber-300 rounded-3xl p-6">
            <h3 className="text-lg font-black text-gray-800 mb-3" style={{ fontFamily: 'Archivo Black, sans-serif' }}>QUEUE</h3>
            
            {jobs.length === 0 ? (
              <div className="h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">No transcriptions yet</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    className={`
                      w-full p-3 rounded-lg border-2 transition-all duration-200 text-left cursor-pointer
                      ${activeJobId === job.id 
                        ? 'border-amber-500' 
                        : 'border-amber-300 hover:border-amber-400'
                      }
                    `}
                    style={{
                      background: activeJobId === job.id 
                        ? 'linear-gradient(135deg, #fde68a, #fbbf24)' 
                        : 'linear-gradient(135deg, #fef3c7, #fde68a)'
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate pr-2" style={{ fontFamily: 'Space Mono, monospace', color: '#92400e' }}>
                          {job.fileName || job.url || 'Transcription'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {job.status === 'processing' && (
                            <>
                              {job.statusIcon ? (
                                <job.statusIcon className="w-3 h-3 text-orange-500 animate-pulse" />
                              ) : (
                                <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                              )}
                              <span className="text-xs text-orange-600">{job.statusMessage || 'Processing...'}</span>
                            </>
                          )}
                          {job.status === 'queued' && (
                            <>
                              <Clock className="w-3 h-3 text-amber-500" />
                              <span className="text-xs text-amber-600">{job.statusMessage || 'Queued'}</span>
                            </>
                          )}
                          {job.status === 'completed' && (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-green-600">Completed</span>
                            </>
                          )}
                          {job.status === 'error' && (
                            <>
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              <span className="text-xs text-red-600">Error</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeJob(job.id);
                        }}
                        className="p-1 rounded-lg hover:bg-red-500/20 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-600 hover:text-red-500" />
                      </button>
                    </div>
                    {job.status === 'processing' && (
                      <div className="mt-2">
                        <div className="h-1 bg-orange-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-400 to-amber-500 animate-pulse"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 backdrop-blur-xl border-2 border-red-300 rounded-3xl p-6">
            <h3 className="text-lg font-black text-gray-800 mb-3" style={{ fontFamily: 'Archivo Black, sans-serif' }}>RESULT</h3>
            
            {!activeJob ? (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <Mic className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm">Select a transcription to view</p>
                </div>
              </div>
            ) : activeJob.status === 'processing' ? (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  {activeJob.statusIcon ? (
                    <activeJob.statusIcon className="w-12 h-12 text-orange-500 animate-pulse mx-auto mb-3" />
                  ) : (
                    <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-3" />
                  )}
                  <p className="text-orange-600">{activeJob.statusMessage || 'Processing...'}</p>
                </div>
              </div>
            ) : activeJob.status === 'error' ? (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <p className="text-red-500 text-sm">{activeJob.error}</p>
                </div>
              </div>
            ) : activeJob.transcription ? (
              <div className="space-y-3">
                {activeJob.videoInfo && (
                  <div className="p-4 bg-gradient-to-r from-red-100 to-orange-100 border-2 border-red-300 rounded-xl">
                    <h4 className="font-black text-red-800 text-base mb-1 break-all" style={{ fontFamily: 'Archivo Black, sans-serif' }}>
                      {activeJob.videoInfo.title}
                    </h4>
                    {activeJob.videoInfo.duration && (
                      <p className="text-xs font-bold text-orange-700" style={{ fontFamily: 'Space Mono, monospace' }}>
                        Duration: {activeJob.videoInfo.duration}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="relative">
                  <div className="h-80 overflow-y-auto p-4 bg-gradient-to-br from-white to-red-50 border-2 border-red-200 rounded-xl shadow-inner">
                    <p className="text-gray-800 text-sm whitespace-pre-wrap font-medium" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.8' }}>
                      {activeJob.transcription}
                    </p>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button
                      onClick={() => copyTranscription(activeJob.transcription!)}
                      className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 transition-all duration-300 transform hover:scale-110 shadow-md"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => downloadTranscription(activeJob)}
                      className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 transition-all duration-300 transform hover:scale-110 shadow-md"
                      title="Download as text"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400 rounded-xl">
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-black text-green-700 uppercase tracking-wider" style={{ fontFamily: 'Bebas Neue, cursive' }}>
                    Transcription Complete
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <p className="text-amber-600 text-sm">Waiting in queue...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
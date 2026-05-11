import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

export type TranscriptionStatus = 'queued' | 'processing' | 'completed' | 'error';
export type TranscriptionMethod = 'whisper' | 'native';

export interface TranscriptionJob {
  id: string;
  platform: string;
  url?: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  status: TranscriptionStatus;
  statusMessage?: string;
  transcription?: string;
  videoInfo?: any;
  error?: string;
  startTime: Date;
  endTime?: Date;
  method: TranscriptionMethod;
}

interface TranscriptionState {
  jobs: TranscriptionJob[];
  activeCount: number;
  pendingQueue: TranscriptionJob[];
  enqueueJob: (job: TranscriptionJob) => void;
  updateJob: (id: string, patch: Partial<TranscriptionJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
}

const MAX_CONCURRENT = 3;

const getRotatingMessages = (platform: string, method: TranscriptionMethod): string[] => {
  const engineLabel = 'Whisper AI';
  if (platform === 'video') {
    return [
      'Reading file...',
      'Extracting audio track...',
      `Processing with ${engineLabel}...`,
      'Analyzing speech patterns...',
      'Generating transcript...',
    ];
  }
  if (platform === 'youtube') {
    return method === 'native'
      ? [
          'Connecting to YouTube...',
          'Fetching video metadata...',
          'Extracting captions...',
          'Processing subtitles...',
        ]
      : [
          'Connecting to YouTube...',
          'Downloading audio stream...',
          'Converting audio format...',
          `Processing with ${engineLabel}...`,
          'Generating transcript...',
        ];
  }
  if (platform === 'tiktok') {
    return [
      'Connecting to TikTok...',
      'Downloading video...',
      'Extracting audio track...',
      `Processing with ${engineLabel}...`,
      'Generating transcript...',
    ];
  }
  return [
    'Analyzing URL...',
    'Downloading media...',
    'Extracting audio track...',
    `Processing with ${engineLabel}...`,
    'Generating transcript...',
  ];
};

const runJob = async (job: TranscriptionJob) => {
  const { updateJob, processNext } = bindInternalActions();
  updateJob(job.id, { status: 'processing', statusMessage: 'Starting...' });

  const messages = getRotatingMessages(job.platform, job.method);
  let messageIndex = 0;
  const statusInterval = setInterval(() => {
    if (messageIndex < messages.length) {
      updateJob(job.id, { statusMessage: messages[messageIndex] });
      messageIndex++;
    }
  }, 2500);

  try {
    let result: any;
    if (job.platform === 'video' && job.filePath) {
      result = await invoke('transcribe_file', { filePath: job.filePath });
    } else if (job.platform === 'youtube') {
      if (job.method === 'native') {
        result = await invoke('transcribe_youtube', { url: job.url });
      } else {
        result = await invoke('transcribe_universal', { url: job.url });
      }
    } else if (job.platform === 'tiktok') {
      result = await invoke('transcribe_tiktok', { url: job.url });
    } else {
      result = await invoke('transcribe_universal', { url: job.url });
    }

    const transcriptionText =
      typeof result === 'string'
        ? result
        : (result as any).transcript || (result as any).transcription || (result as any).text || '';

    updateJob(job.id, {
      status: 'completed',
      statusMessage: 'Completed',
      transcription: transcriptionText,
      videoInfo:
        typeof result === 'object'
          ? {
              title: (result as any).title || (result as any).videoTitle || 'Video',
              duration: (result as any).duration || '',
              ...(result as any),
            }
          : { title: job.fileName || 'Video' },
      endTime: new Date(),
    });

    clearInterval(statusInterval);
    toast.success(`Transcribed: ${job.fileName || job.url}`);
  } catch (error: any) {
    clearInterval(statusInterval);
    updateJob(job.id, {
      status: 'error',
      error: error?.message || String(error) || 'Failed to transcribe',
      endTime: new Date(),
    });
    toast.error(`Failed: ${error?.message || 'Unknown error'}`);
  } finally {
    useTranscriptionStore.setState((s) => ({ activeCount: Math.max(0, s.activeCount - 1) }));
    processNext();
  }
};

// Forward declaration helpers so runJob can call into the store without circular issues
const bindInternalActions = () => ({
  updateJob: (id: string, patch: Partial<TranscriptionJob>) =>
    useTranscriptionStore.getState().updateJob(id, patch),
  processNext: () => {
    const { activeCount, pendingQueue } = useTranscriptionStore.getState();
    if (activeCount >= MAX_CONCURRENT || pendingQueue.length === 0) return;
    const next = pendingQueue[0];
    useTranscriptionStore.setState((s) => ({
      pendingQueue: s.pendingQueue.slice(1),
      activeCount: s.activeCount + 1,
    }));
    void runJob(next);
    // Try to start more
    bindInternalActions().processNext();
  },
});

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  jobs: [],
  activeCount: 0,
  pendingQueue: [],

  enqueueJob: (job) => {
    set((s) => ({ jobs: [...s.jobs, job] }));
    const { activeCount } = useTranscriptionStore.getState();
    if (activeCount < MAX_CONCURRENT) {
      set((s) => ({ activeCount: s.activeCount + 1 }));
      void runJob(job);
    } else {
      set((s) => ({ pendingQueue: [...s.pendingQueue, job] }));
    }
  },

  updateJob: (id, patch) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),

  removeJob: (id) =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.id !== id),
      pendingQueue: s.pendingQueue.filter((j) => j.id !== id),
    })),

  clearCompleted: () =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.status !== 'completed' && j.status !== 'error'),
    })),

  clearAll: () => set({ jobs: [], pendingQueue: [], activeCount: 0 }),
}));

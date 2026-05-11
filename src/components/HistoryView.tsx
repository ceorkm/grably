import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Download,
  FileText,
  Folder,
  Play,
  Copy,
  Trash2,
  Eye,
  Inbox,
  Trash,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

interface HistoryEntry {
  id: string;
  entryType: 'download' | 'transcription';
  title: string;
  sourceUrl: string;
  filePath?: string | null;
  transcriptText?: string | null;
  siteType?: string | null;
  fileSizeBytes?: number | null;
  timestamp: number; // unix seconds
}

interface HistoryViewProps {
  onClose: () => void;
}

type Filter = 'all' | 'downloads' | 'transcriptions';

const formatBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(value >= 10 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
};

const formatRelative = (unixSec: number): string => {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString();
};

const getDateBucket = (unixSec: number): string => {
  const now = new Date();
  const entryDate = new Date(unixSec * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400_000;
  const startOfWeek = startOfToday - 86400_000 * 6;
  const entryMs = entryDate.getTime();
  if (entryMs >= startOfToday) return 'TODAY';
  if (entryMs >= startOfYesterday) return 'YESTERDAY';
  if (entryMs >= startOfWeek) return 'THIS WEEK';
  return 'EARLIER';
};

const getHostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.length > 30 ? `${url.slice(0, 30)}…` : url;
  }
};

export const HistoryView: React.FC<HistoryViewProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [viewingTranscript, setViewingTranscript] = useState<HistoryEntry | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await invoke<HistoryEntry[]>('get_history');
      setEntries(data);
    } catch (e) {
      console.error('Failed to load history', e);
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'downloads') return entries.filter((e) => e.entryType === 'download');
    return entries.filter((e) => e.entryType === 'transcription');
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const map: Record<string, HistoryEntry[]> = {};
    for (const entry of filtered) {
      const bucket = getDateBucket(entry.timestamp);
      if (!map[bucket]) map[bucket] = [];
      map[bucket].push(entry);
    }
    return map;
  }, [filtered]);

  const bucketOrder = ['TODAY', 'YESTERDAY', 'THIS WEEK', 'EARLIER'];

  const handleOpen = async (entry: HistoryEntry) => {
    if (entry.entryType === 'transcription') {
      setViewingTranscript(entry);
      return;
    }
    if (!entry.filePath) {
      toast.error('No file path recorded');
      return;
    }
    try {
      await invoke('open_path', { path: entry.filePath });
    } catch (e) {
      toast.error(`Could not open file: ${e}`);
    }
  };

  const handleReveal = async (entry: HistoryEntry) => {
    if (!entry.filePath) return;
    try {
      await invoke('reveal_in_finder', { path: entry.filePath });
    } catch (e) {
      toast.error(`Could not reveal: ${e}`);
    }
  };

  const handleCopyUrl = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.sourceUrl);
      toast.success('URL copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Transcript copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_history_entry', { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast.error(`Delete failed: ${e}`);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Clear all history? Files on disk are not deleted.')) return;
    try {
      await invoke('clear_history');
      setEntries([]);
      toast.success('History cleared');
    } catch (e) {
      toast.error(`Clear failed: ${e}`);
    }
  };

  const counts = useMemo(
    () => ({
      all: entries.length,
      downloads: entries.filter((e) => e.entryType === 'download').length,
      transcriptions: entries.filter((e) => e.entryType === 'transcription').length,
    }),
    [entries]
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-orange-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2
              className="text-3xl text-gray-900 leading-none"
              style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px' }}
            >
              HISTORY
            </h2>
            <p
              className="text-gray-600 mt-1 text-sm"
              style={{ fontFamily: 'Courier Prime, monospace' }}
            >
              All your downloads and transcriptions
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-2 rounded-full text-sm text-gray-600 hover:bg-orange-200 hover:text-gray-900 transition-colors flex items-center gap-1"
                style={{ fontFamily: 'Space Mono, monospace' }}
                title="Clear all entries (does not delete files)"
              >
                <Trash className="h-4 w-4" />
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-orange-200 transition-colors"
            >
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          {(
            [
              ['all', 'ALL', counts.all],
              ['downloads', 'DOWNLOADS', counts.downloads],
              ['transcriptions', 'TRANSCRIPTS', counts.transcriptions],
            ] as [Filter, string, number][]
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-full text-xs transition-all ${
                filter === key
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={{ fontFamily: 'Space Mono, monospace', letterSpacing: '0.5px' }}
            >
              {label} · {count}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-center py-16 text-gray-400" style={{ fontFamily: 'Space Mono, monospace' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500" style={{ fontFamily: 'Space Mono, monospace' }}>
                {entries.length === 0
                  ? 'No history yet — your downloads and transcripts will show up here'
                  : 'Nothing matches this filter'}
              </p>
            </div>
          ) : (
            bucketOrder
              .filter((b) => grouped[b]?.length)
              .map((bucket) => (
                <section key={bucket} className="mb-6 last:mb-0">
                  <h3
                    className="text-xs text-gray-400 mb-2 px-1"
                    style={{ fontFamily: 'Space Mono, monospace', letterSpacing: '1.5px' }}
                  >
                    {bucket}
                  </h3>
                  <div className="space-y-2">
                    {grouped[bucket].map((entry) => {
                      const isDownload = entry.entryType === 'download';
                      const host = getHostFromUrl(entry.sourceUrl);
                      return (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-colors"
                        >
                          {/* Type icon */}
                          <div
                            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                              isDownload ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {isDownload ? <Download className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                          </div>

                          {/* Main info */}
                          <button
                            onClick={() => handleOpen(entry)}
                            className="flex-1 min-w-0 text-left"
                            title={isDownload ? 'Open file' : 'View transcript'}
                          >
                            <div
                              className="text-sm text-gray-900 truncate"
                              style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 500 }}
                            >
                              {entry.title}
                            </div>
                            <div
                              className="text-xs text-gray-500 truncate"
                              style={{ fontFamily: 'Courier Prime, monospace' }}
                            >
                              {host} · {formatRelative(entry.timestamp)}
                              {entry.fileSizeBytes ? ` · ${formatBytes(entry.fileSizeBytes)}` : ''}
                              {!isDownload ? ' · transcript' : ''}
                            </div>
                          </button>

                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {isDownload ? (
                              <>
                                <button
                                  onClick={() => handleOpen(entry)}
                                  className="p-2 rounded-lg hover:bg-orange-100 text-gray-600 hover:text-orange-600"
                                  title="Open file"
                                >
                                  <Play className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleReveal(entry)}
                                  className="p-2 rounded-lg hover:bg-orange-100 text-gray-600 hover:text-orange-600"
                                  title="Reveal in Finder"
                                >
                                  <Folder className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setViewingTranscript(entry)}
                                className="p-2 rounded-lg hover:bg-orange-100 text-gray-600 hover:text-orange-600"
                                title="View transcript"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleCopyUrl(entry)}
                              className="p-2 rounded-lg hover:bg-orange-100 text-gray-600 hover:text-orange-600"
                              title="Copy source URL"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="p-2 rounded-lg hover:bg-red-100 text-gray-600 hover:text-red-600"
                              title="Remove from history"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
          )}
        </div>
      </div>

      {/* Transcript viewer modal */}
      {viewingTranscript && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
          onClick={() => setViewingTranscript(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3
                  className="text-xl text-gray-900 truncate"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                >
                  {viewingTranscript.title}
                </h3>
                <p
                  className="text-xs text-gray-500 mt-0.5"
                  style={{ fontFamily: 'Courier Prime, monospace' }}
                >
                  {getHostFromUrl(viewingTranscript.sourceUrl)} ·{' '}
                  {formatRelative(viewingTranscript.timestamp)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopyText(viewingTranscript.transcriptText || '')}
                  className="px-3 py-2 rounded-full text-sm text-gray-600 hover:bg-blue-200 hover:text-gray-900 transition-colors flex items-center gap-1"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
                <button
                  onClick={() => setViewingTranscript(null)}
                  className="p-2 rounded-full hover:bg-blue-200 transition-colors"
                >
                  <X className="h-6 w-6 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <pre
                className="whitespace-pre-wrap break-words text-sm text-gray-800 leading-relaxed"
                style={{ fontFamily: 'system-ui, sans-serif' }}
              >
                {viewingTranscript.transcriptText || '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

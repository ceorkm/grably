import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Download, Check, Loader2, ChevronDown } from 'lucide-react';
import { useDownloadUi } from '../stores/downloadStore';

interface DownloadProgress {
  percent: number;
  downloaded: string;
  total: string;
  speed: string;
  eta: string;
  filename?: string;
  id?: string;
}

interface DownloadStatus {
  id: string;
  filename: string;
  status: string;
  percent: number;
}

interface ActiveDownload {
  id: string;
  filename: string;
  progress?: DownloadProgress;
  status?: string;
  done?: boolean;
  lastUpdate: number;
}

// Browser-style download center: a toolbar icon (top-right, left of History)
// that opens a right-anchored popover. New downloads slide in as they start.
// Consumes the same Tauri events as before — backend is untouched.
export const DownloadCenter: React.FC = () => {
  const [downloads, setDownloads] = useState<Map<string, ActiveDownload>>(new Map());
  const isOpen = useDownloadUi((s) => s.isOpen);
  const openPanel = useDownloadUi((s) => s.open);
  const closePanel = useDownloadUi((s) => s.close);
  const setActiveCount = useDownloadUi((s) => s.setActiveCount);
  // Track which ids we've already seen so we only auto-open on a genuinely new download.
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!window.__TAURI__) return;

    const unlistenStatus = listen<DownloadStatus>('download-status', (event) => {
      const { id, filename, status } = event.payload;
      if (!seenIds.current.has(id)) {
        seenIds.current.add(id);
        openPanel(); // a download just entered — reveal the panel
      }
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(id);
        newMap.set(id, { id, filename, status, progress: existing?.progress, lastUpdate: Date.now() });
        return newMap;
      });
    });

    const unlistenProgress = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;
      const id = progress.id || progress.filename || 'Unknown';
      if (!seenIds.current.has(id)) {
        seenIds.current.add(id);
        openPanel();
      }
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(id);
        newMap.set(id, {
          id,
          filename: progress.filename || existing?.filename || 'Download',
          progress,
          status: undefined,
          lastUpdate: Date.now(),
        });
        return newMap;
      });
    });

    const unlistenComplete = listen<{ filename: string; path: string }>('download-complete', (event) => {
      // Mark as done immediately (shows the check), then clear after a beat.
      setDownloads(prev => {
        const newMap = new Map(prev);
        for (const [id, download] of newMap.entries()) {
          if (download.filename === event.payload.filename) {
            newMap.set(id, { ...download, done: true, status: undefined, lastUpdate: Date.now() });
            break;
          }
        }
        return newMap;
      });
      setTimeout(() => {
        setDownloads(prev => {
          const newMap = new Map(prev);
          for (const [id, download] of newMap.entries()) {
            if (download.filename === event.payload.filename) {
              newMap.delete(id);
              seenIds.current.delete(id);
              break;
            }
          }
          return newMap;
        });
      }, 2500);
    });

    // Sweep stale entries that finished but never got a complete event.
    const cleanupInterval = setInterval(() => {
      setDownloads(prev => {
        const newMap = new Map(prev);
        const now = Date.now();
        for (const [id, download] of newMap.entries()) {
          if (now - download.lastUpdate > 30000 && ((download.progress?.percent ?? 0) >= 100 || download.done)) {
            newMap.delete(id);
            seenIds.current.delete(id);
          }
        }
        return newMap;
      });
    }, 5000);

    return () => {
      unlistenStatus.then(fn => fn());
      unlistenProgress.then(fn => fn());
      unlistenComplete.then(fn => fn());
      clearInterval(cleanupInterval);
    };
  }, []);

  const list = Array.from(downloads.values());
  const activeCount = list.filter(d => !d.done && (d.progress?.percent ?? 0) < 100).length;

  // Publish the active count so the toolbar trigger button can show its badge.
  useEffect(() => {
    setActiveCount(activeCount);
  }, [activeCount, setActiveCount]);

  return (
    <>
      <style>{`
        @keyframes dc-slide-in {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes dc-pop {
          0% { opacity: 0; transform: translateY(-8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dc-item { animation: dc-slide-in 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
        .dc-panel { animation: dc-pop 0.2s ease-out; }
        .dc-scroll::-webkit-scrollbar { width: 6px; }
        .dc-scroll::-webkit-scrollbar-track { background: #fed7aa; border-radius: 10px; }
        .dc-scroll::-webkit-scrollbar-thumb { background: #fb923c; border-radius: 10px; }
        .dc-scroll::-webkit-scrollbar-thumb:hover { background: #ea580c; }
      `}</style>

      {/* Popover (trigger button lives in each screen's toolbar via DownloadButton) */}
      {isOpen && (
        <div className="dc-panel fixed top-20 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-orange-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-100 to-amber-100 border-b border-orange-200">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Space Mono, monospace' }}>
                  Downloads
                </span>
              </div>
              <button
                onClick={() => closePanel()}
                className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                title="Hide"
              >
                <ChevronDown className="w-4 h-4 text-orange-700" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto dc-scroll">
              {list.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'Space Mono, monospace' }}>
                    No downloads yet
                  </p>
                  <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: 'Space Mono, monospace' }}>
                    Downloads appear here as they start
                  </p>
                </div>
              ) : (
                list.map(download => {
                  const percent = download.progress?.percent ?? 0;
                  return (
                    <div key={download.id} className="dc-item px-4 py-3 border-b border-orange-100 last:border-b-0">
                      <div className="flex items-center gap-2">
                        {download.done ? (
                          <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin flex-shrink-0" />
                        )}
                        <p className="text-xs font-bold text-gray-900 truncate flex-1" style={{ fontFamily: 'Space Mono, monospace' }}>
                          {download.filename}
                        </p>
                      </div>

                      {download.done ? (
                        <p className="text-xs text-green-600 mt-1.5 pl-5" style={{ fontFamily: 'Space Mono, monospace' }}>
                          Done
                        </p>
                      ) : download.progress ? (
                        <div className="mt-2 pl-5 space-y-1">
                          <div className="w-full bg-orange-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-orange-400 to-orange-500 h-full transition-all duration-300 ease-out"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
                            <span className="font-bold">{percent.toFixed(0)}%</span>
                            <span className="truncate ml-2">
                              {download.progress.speed}{download.progress.eta ? ` · ${download.progress.eta}` : ''}
                            </span>
                          </div>
                        </div>
                      ) : download.status ? (
                        <p className="text-xs text-orange-600 mt-1.5 pl-5" style={{ fontFamily: 'Space Mono, monospace' }}>
                          {download.status}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

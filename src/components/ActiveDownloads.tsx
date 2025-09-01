import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Download } from 'lucide-react';

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
  lastUpdate: number;
}

export const ActiveDownloads: React.FC = () => {
  const [downloads, setDownloads] = useState<Map<string, ActiveDownload>>(new Map());
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: window.innerHeight - 250 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!window.__TAURI__) return;

    // Listen for download status events (real-time streaming)
    const unlistenStatus = listen<DownloadStatus>('download-status', (event) => {
      const { id, filename, status } = event.payload;
      
      setDownloads(prev => {
        const newMap = new Map(prev);
        newMap.set(id, {
          id,
          filename,
          status,
          lastUpdate: Date.now()
        });
        return newMap;
      });
    });

    // Listen for download progress events
    const unlistenProgress = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;
      const id = progress.id || progress.filename || 'Unknown';
      
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(id);
        newMap.set(id, {
          id,
          filename: progress.filename || existing?.filename || 'Download',
          progress,
          status: undefined, // Clear status when we have actual progress
          lastUpdate: Date.now()
        });
        return newMap;
      });
    });

    // Listen for download complete events to remove from list
    const unlistenComplete = listen<{filename: string, path: string}>('download-complete', (event) => {
      // Remove completed download after a short delay
      setTimeout(() => {
        setDownloads(prev => {
          const newMap = new Map(prev);
          // Find and remove by filename
          for (const [id, download] of newMap.entries()) {
            if (download.filename === event.payload.filename) {
              newMap.delete(id);
              break;
            }
          }
          return newMap;
        });
      }, 2000); // Remove after 2 seconds to let user see it completed
    });

    // Clean up old downloads that haven't updated in 30 seconds
    const cleanupInterval = setInterval(() => {
      setDownloads(prev => {
        const newMap = new Map(prev);
        const now = Date.now();
        
        for (const [id, download] of newMap.entries()) {
          if (now - download.lastUpdate > 30000 && (download.progress?.percent ?? 0) >= 100) {
            newMap.delete(id);
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

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);
  
  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    setIsDragging(true);
  };

  // Always show the widget
  return (
    <div 
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
      onMouseDown={handleDragStart}
    >
      <div className={`bg-white rounded-2xl shadow-2xl border-2 border-orange-200 overflow-hidden transition-all duration-300 ${
        isMinimized ? 'w-64' : 'w-96'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-100 to-amber-100 border-b border-orange-200">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Space Mono, monospace' }}>
              ACTIVE DOWNLOADS ({downloads.size})
            </span>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-orange-200 rounded transition-colors"
          >
            {isMinimized ? '▲' : '▼'}
          </button>
        </div>

        {/* Downloads List */}
        {!isMinimized && (
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {downloads.size === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-500" style={{ fontFamily: 'Space Mono, monospace' }}>
                  No active downloads
                </p>
                <p className="text-xs text-gray-400 mt-2" style={{ fontFamily: 'Space Mono, monospace' }}>
                  Downloads will appear here
                </p>
              </div>
            ) : (
              Array.from(downloads.values()).map(download => (
              <div key={download.id} className="p-3 border-b border-orange-100 last:border-b-0">
                <div className="mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate" style={{ fontFamily: 'Space Mono, monospace' }}>
                      {download.filename}
                    </p>
                    {download.status ? (
                      // Show status message
                      <p className="text-xs text-orange-600 mt-1 animate-pulse" style={{ fontFamily: 'Space Mono, monospace' }}>
                        {download.status}
                      </p>
                    ) : download.progress ? (
                      // Show download size
                      <p className="text-xs text-gray-600 mt-1">
                        {download.progress.downloaded} / {download.progress.total}
                      </p>
                    ) : null}
                  </div>
                </div>
                
                {/* Progress Bar or Status Indicator */}
                {download.progress ? (
                  <div className="space-y-1">
                    <div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-orange-400 to-orange-500 h-full transition-all duration-300 ease-out"
                        style={{ width: `${download.progress.percent || 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span className="font-bold">{download.progress.percent?.toFixed(1) || 0}%</span>
                      <span>{download.progress.speed} • ETA: {download.progress.eta}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
            )}
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #fed7aa;
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
    </div>
  );
};
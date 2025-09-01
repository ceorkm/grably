import { useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { check } from '@tauri-apps/plugin-updater';

export function UpdateButton() {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersion = '0.1.0';
  const [status, setStatus] = useState('');

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus('Checking...');
    
    try {
      const update = await check();
      
      if (update?.available) {
        setUpdateAvailable(true);
        setStatus(`v${update.version} available`);
        setTimeout(() => setStatus(''), 5000);
      } else {
        setStatus('Up to date');
        setTimeout(() => setStatus(''), 3000);
      }
    } catch (error) {
      console.error('Update check failed:', error);
      setStatus('Check failed');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      {status && (
        <span className="text-xs" style={{ 
          fontFamily: 'Space Mono, monospace',
          color: updateAvailable ? '#ea580c' : '#6b7280'
        }}>
          {status}
        </span>
      )}
      
      <button
        onClick={checkForUpdates}
        disabled={checking}
        className="p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 group"
        title={`Version ${currentVersion} - Click to check for updates`}
      >
        {checking ? (
          <RefreshCw className="h-4 w-4 text-gray-500 animate-spin" />
        ) : updateAvailable ? (
          <Download className="h-4 w-4 text-orange-500 animate-bounce" />
        ) : (
          <RefreshCw className="h-4 w-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
        )}
      </button>
      
      <div className="text-xs px-2 py-1 bg-gray-100 rounded" style={{ 
        fontFamily: 'Space Mono, monospace',
        color: '#6b7280'
      }}>
        v{currentVersion}
      </div>
    </div>
  );
}
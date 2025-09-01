import { useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import toast from 'react-hot-toast';

export function UpdateChecker() {
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          console.log(`Update available: ${update.version}`);
          
          // Show native dialog
          const yes = await confirm(`Update to version ${update.version} is available. Download and install now?`);
          
          if (yes) {
            toast.loading('Downloading update...', { id: 'update-download' });
            
            // Track download progress
            let downloaded = 0;
            let total = 0;
            
            try {
              console.log('Starting downloadAndInstall...');
              await update.downloadAndInstall((event: any) => {
                console.log('Update event:', JSON.stringify(event));
                
                if (event.event === 'Started') {
                  total = event.data?.contentLength || 0;
                  console.log(`Download started, total size: ${total}`);
                  toast.loading('Download started...', { id: 'update-download' });
                } else if (event.event === 'Progress') {
                  downloaded += event.data?.chunkLength || 0;
                  const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                  toast.loading(`Downloading update... ${percent}%`, { id: 'update-download' });
                  console.log(`Download progress: ${downloaded}/${total} (${percent}%)`);
                } else if (event.event === 'Finished') {
                  toast.success('Update downloaded! Installing...', { id: 'update-download' });
                  console.log('Download finished');
                } else {
                  console.log('Unknown event type:', event);
                }
              });
              
              console.log('downloadAndInstall completed, restarting...');
              toast.success('Update installed! Restarting...', { id: 'update-download' });
              await relaunch();
            } catch (downloadError: any) {
              console.error('Download/install error:', downloadError);
              console.error('Error details:', downloadError?.message || downloadError);
              toast.error(`Update failed: ${downloadError?.message || downloadError}`, { id: 'update-download', duration: 5000 });
            }
          }
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    };

    // Check on startup
    checkForUpdates();
    
    // Check every hour
    const interval = setInterval(checkForUpdates, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return null;
}
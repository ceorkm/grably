import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { Youtube, Globe2, Headphones, ArrowRight, Github, History } from 'lucide-react';
import Typewriter from 'typewriter-effect';
import { YouTubeDownloader } from './components/YouTubeDownloader';
import { UniversalDownloader } from './components/UniversalDownloader';
import { TranscriptionTool } from './components/TranscriptionTool';
import { ActiveDownloads } from './components/ActiveDownloads';
import { HistoryView } from './components/HistoryView';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const tools = [
  {
    id: 'youtube',
    title: 'YouTube',
    description: 'Grab videos & audio from YouTube',
    icon: Youtube,
    font: 'Bebas Neue, sans-serif',
  },
  {
    id: 'universal',
    title: 'Universal',
    description: 'Grab from any social platform',
    icon: Globe2,
    font: 'Bungee, cursive',
  },
  {
    id: 'transcribe',
    title: 'Transcribe',
    description: 'Convert videos to text instantly',
    icon: Headphones,
    font: 'Archivo Black, sans-serif',
  },
];

function App() {
  const [activeView, setActiveView] = useState<string>('home');
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [freePercentage, setFreePercentage] = useState(100);
  const [showHistory, setShowHistory] = useState(false);
  

  useEffect(() => {
    // Check if we're in Tauri context
    if (window.__TAURI__) {
      console.log('Tauri API is available');
      
      // Track completed downloads to prevent duplicate toasts
      const completedDownloads = new Set<string>();
      
      // Listen for tool switching events from quick access
      const unlistenToolSwitch = listen<string>('switch-tool', (event) => {
        console.log('Switching to tool:', event.payload);
        setActiveView(event.payload);
      });

      const unlistenSetUrl = listen<string>('set-url', (event) => {
        console.log('Setting URL:', event.payload);
        // You can add URL handling logic here if needed
      });
      
      // Listen for download complete events
      const unlisten = listen<{filename: string, path: string}>('download-complete', (event) => {
        const { filename, path } = event.payload;
        
        // Prevent duplicate toasts for same file
        if (completedDownloads.has(filename)) {
          return;
        }
        completedDownloads.add(filename);
        
        // Clear from set after 10 seconds to allow re-downloading
        setTimeout(() => {
          completedDownloads.delete(filename);
        }, 10000);
        
        toast(
          <div style={{ fontFamily: 'Space Mono, monospace' }}>
            <strong style={{ fontSize: '14px', color: '#ea580c' }}>DOWNLOAD COMPLETE</strong>
            <br />
            <span style={{ fontSize: '12px', color: '#1f2937' }}>{filename}</span>
            <br />
            <span style={{ fontSize: '11px', color: '#6b7280' }}>{path}</span>
          </div>,
          {
            duration: 4000,
            style: {
              background: 'linear-gradient(135deg, #fed7aa 0%, #ffedd5 100%)',
              border: '2px solid #fb923c',
              borderRadius: '12px',
              padding: '12px',
            },
          }
        );
      });
      
      // Auto-update check: 5s after launch, silently check GitHub release.
      // If a newer signed version is available, show a non-blocking toast
      // with an "Install & restart" action.
      const updateTimer = setTimeout(async () => {
        try {
          const update = await checkForUpdate();
          if (update?.available) {
            toast(
              (t) => (
                <div style={{ fontFamily: 'Space Mono, monospace', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>
                    UPDATE AVAILABLE · v{update.version}
                  </div>
                  <div style={{ fontSize: 11, color: '#374151', maxWidth: 280, lineHeight: 1.35 }}>
                    A new version of Grably is ready. Click to install — Grably will restart automatically.
                  </div>
                  <button
                    onClick={async () => {
                      toast.dismiss(t.id);
                      const installToast = toast.loading('Downloading update…', {
                        style: { fontFamily: 'Space Mono, monospace' },
                      });
                      try {
                        await update.downloadAndInstall();
                        toast.success('Update installed. Restarting…', { id: installToast });
                        await relaunch();
                      } catch (err) {
                        toast.error(`Update failed: ${err}`, { id: installToast, duration: 6000 });
                      }
                    }}
                    style={{
                      padding: '8px 14px',
                      background: 'linear-gradient(135deg, #ff6b35 0%, #ea580c 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 10,
                      fontFamily: 'Bebas Neue, sans-serif',
                      fontSize: 16,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                    }}
                  >
                    Install & Restart
                  </button>
                </div>
              ),
              {
                duration: 20000,
                style: {
                  background: 'linear-gradient(135deg, #fed7aa 0%, #ffedd5 100%)',
                  border: '2px solid #fb923c',
                  borderRadius: 14,
                  padding: 14,
                  maxWidth: 340,
                },
              }
            );
          }
        } catch (err) {
          // Network failure / no release yet / signature mismatch — keep silent.
          console.warn('[updater] check failed:', err);
        }
      }, 5000);

      return () => {
        unlisten.then(fn => fn());
        unlistenToolSwitch.then(fn => fn());
        unlistenSetUrl.then(fn => fn());
        clearTimeout(updateTimer);
      };
    } else {
      console.error('ERROR: Tauri API is required. This app cannot run in browser mode.');
    }
    
    setTimeout(() => setSubtitleVisible(true), 2000);
    
    // Animate the 100% FREE counter in a loop
    const startCounting = () => {
      let count = 1;
      setFreePercentage(1);
      const interval = setInterval(() => {
        count += 1;
        setFreePercentage(count);
        if (count >= 100) {
          clearInterval(interval);
          // Pause at 100%, then restart
          setTimeout(() => {
            startCounting(); // Restart the animation
          }, 2000); // Stay at 100% for 2 seconds
        }
      }, 10); // Fast counting to 100
    };
    
    // Initial start after 5 seconds (show 100% first)
    setTimeout(() => {
      startCounting();
    }, 5000);
  }, []);


  const renderView = () => {
    switch(activeView) {
      case 'youtube':
        return <YouTubeDownloader onBack={() => setActiveView('home')} />;
      case 'universal':
        return <UniversalDownloader onBack={() => setActiveView('home')} />;
      case 'transcribe':
        return <TranscriptionTool onBack={() => setActiveView('home')} />;
      default:
        return (
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Logo */}
            <div className="fixed top-6 left-6 z-50">
              <img 
                src="/favicon.png" 
                alt="Grably Logo" 
                className="w-20 h-20 hover:scale-110 transition-all duration-300"
              />
            </div>


            {/* Top Right Buttons */}
            <div className="fixed top-6 right-6 z-50 flex space-x-3">
              <button
                onClick={() => setShowHistory(true)}
                className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-200 group"
                title="History"
              >
                <History className="h-6 w-6 text-gray-600 group-hover:text-orange-500 transition-colors" />
              </button>
              <button
                onClick={() => open('https://github.com/ceorkm/grably')}
                className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-200 group"
                title="View on GitHub"
              >
                <Github className="h-6 w-6 text-gray-600 group-hover:text-gray-900 transition-colors" />
              </button>
            </div>

            {/* Hero Section with Typewriter */}
            <div className="text-center mb-20">
              <h1 className="text-6xl md:text-7xl mb-6" style={{fontFamily: 'Courier Prime, monospace', fontWeight: 700}}>
                <Typewriter
                  options={{
                    strings: ['Grably', 'GRABLY!'],
                    autoStart: true,
                    loop: true,
                    delay: 100,
                    deleteSpeed: 50,
                  }}
                />
              </h1>
              
              <p 
                className={`text-xl max-w-xl mx-auto transition-all duration-1000 ${
                  subtitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{
                  fontFamily: 'Space Mono, monospace',
                  color: '#6B7280',
                  letterSpacing: '-0.5px'
                }}
              >
                Grab any media locally. 
                <span className="inline-block animate-pulse mx-2" style={{color: '#FF6B35'}}>Fast</span>
                <span className="inline-block animate-bounce" style={{animationDelay: '0.1s'}}>Private</span>
                <span className="inline-block animate-pulse ml-2" style={{animationDelay: '0.2s', fontFamily: 'Rubik Mono One', color: '#FF6B35'}}>FREE</span>
              </p>
            </div>

            {/* Tools Grid with crazy fonts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
              {tools.map((tool, index) => {
                const Icon = tool.icon;
                const isHovered = hoveredCard === index;
                
                return (
                  <div
                    key={tool.id}
                    className="group block cursor-pointer"
                    onMouseEnter={() => setHoveredCard(index)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => setActiveView(tool.id)}
                  >
                    <div 
                      className={`p-8 bg-white rounded-2xl border border-gray-100 transition-all duration-300 relative ${
                        isHovered ? 'transform -rotate-1 scale-105 shadow-2xl border-orange-300' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div 
                          className={`p-3 bg-orange-50 rounded-xl transition-all duration-300 ${
                            isHovered ? 'rotate-12 scale-110' : ''
                          }`}
                        >
                          <Icon className="h-6 w-6" style={{color: '#FF6B35'}} />
                        </div>
                        <ArrowRight 
                          className={`h-5 w-5 text-gray-400 transition-all duration-300 mt-1 ${
                            isHovered ? 'text-orange-500 translate-x-2' : ''
                          }`} 
                        />
                      </div>
                      
                      <h3 
                        className="text-2xl mb-2"
                        style={{
                          color: '#1F2937',
                          letterSpacing: index === 1 ? '2px' : '0',
                          fontFamily: tool.font
                        }}
                      >
                        {tool.title}
                      </h3>
                      <p 
                        className={`transition-all duration-300 ${
                          isHovered ? 'text-gray-900' : 'text-gray-600'
                        }`}
                        style={{
                          fontFamily: index === 0 ? 'Playfair Display, serif' : 
                                     index === 1 ? 'Space Mono, monospace' : 
                                     'Courier Prime, monospace',
                          fontStyle: index === 0 ? 'italic' : 'normal'
                        }}
                      >
                        {tool.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Features with animated numbers */}
            <div className="text-center py-12 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto">
                <div className="group cursor-pointer">
                  <div 
                    className="text-3xl font-bold text-gray-900 mb-1 transition-all duration-300 group-hover:scale-125"
                    style={{fontFamily: 'Rubik Mono One, sans-serif'}}
                  >
                    {freePercentage}%
                  </div>
                  <div style={{fontFamily: 'Bebas Neue, sans-serif', fontSize: '20px', color: '#6B7280'}}>FREE</div>
                </div>
                <div className="group cursor-pointer">
                  <div 
                    className="text-3xl font-bold text-gray-900 mb-1 transition-all duration-300 group-hover:rotate-6"
                    style={{fontFamily: 'Bungee, cursive'}}
                  >
                    NO
                  </div>
                  <div style={{fontFamily: 'Archivo Black, sans-serif', color: '#6B7280'}}>Server</div>
                </div>
                <div className="group cursor-pointer">
                  <div 
                    className="text-3xl font-bold text-gray-900 mb-1 transition-all duration-300 group-hover:skew-x-12"
                    style={{fontFamily: 'Space Mono, monospace'}}
                  >
                    100%
                  </div>
                  <div style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic', color: '#6B7280'}}>Private</div>
                </div>
              </div>
            </div>

            {/* Footer text */}
            <div className="text-center mt-20">
              <button
                onClick={() => open('https://x.com/ceorkm')}
                className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{fontFamily: 'Courier Prime, monospace', fontSize: '12px', color: '#9ca3af'}}
              >
                Made with ❤️ by
                <img
                  src="https://unavatar.io/twitter/ceorkm"
                  alt="ceorkm"
                  className="w-7 h-7 rounded-full border border-gray-200 shadow-sm"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="underline">ceorkm</span>
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {renderView()}

      {/* Active Downloads Widget */}
      <ActiveDownloads />

      {/* History Modal */}
      {showHistory && (
        <HistoryView onClose={() => setShowHistory(false)} />
      )}

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: '',
          style: {
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#1f2937',
            border: '1px solid rgba(251, 146, 60, 0.2)',
            backdropFilter: 'blur(10px)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </>
  );
}

export default App;
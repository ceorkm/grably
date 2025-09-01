import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, Loader2, Globe2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// Platform Icons as SVG Components
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1 1 12.324 0 6.162 6.162 0 0 1-12.324 0zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm4.965-10.405a1.44 1.44 0 1 1 2.881.001 1.44 1.44 0 0 1-2.881-.001z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const RedditIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
  </svg>
);

const PinterestIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <path d="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.2-2.4.04-3.46l1.4-5.96s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.03 0 1.52.77 1.52 1.69 0 1.03-.65 2.56-.99 3.99-.28 1.19.6 2.16 1.77 2.16 2.13 0 3.77-2.24 3.77-5.48 0-2.87-2.06-4.87-5-4.87-3.41 0-5.41 2.56-5.41 5.21 0 1.03.4 2.14.9 2.74.1.12.11.23.08.35l-.34 1.36c-.05.22-.18.27-.41.16-1.5-.7-2.43-2.89-2.43-4.65 0-3.78 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12 12 0 0 0 12 24a12 12 0 0 0 12-12A12 12 0 0 0 12 0z"/>
  </svg>
);

const platforms = [
  { name: 'Instagram', icon: InstagramIcon, color: '#E4405F', type: 'instagram' },
  { name: 'TikTok', icon: TikTokIcon, color: '#000000', type: 'tiktok' },
  { name: 'Twitter/X', icon: TwitterIcon, color: '#000000', type: 'twitter' },
  { name: 'Facebook', icon: FacebookIcon, color: '#1877F2', type: 'facebook' },
  { name: 'Reddit', icon: RedditIcon, color: '#FF4500', type: 'reddit' },
  { name: 'Pinterest', icon: PinterestIcon, color: '#BD081C', type: 'pinterest' },
];

export const UniversalDownloader: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  // Removed progress state - using ActiveDownloads widget instead
  const [detectedPlatform, setDetectedPlatform] = useState<string>('');

  // Progress is now handled by ActiveDownloads widget

  useEffect(() => {
    // Detect platform from URL
    if (url) {
      if (url.includes('instagram.com')) setDetectedPlatform('instagram');
      else if (url.includes('tiktok.com')) setDetectedPlatform('tiktok');
      else if (url.includes('twitter.com') || url.includes('x.com')) setDetectedPlatform('twitter');
      else if (url.includes('facebook.com') || url.includes('fb.')) setDetectedPlatform('facebook');
      else if (url.includes('reddit.com')) setDetectedPlatform('reddit');
      else if (url.includes('pinterest.com')) setDetectedPlatform('pinterest');
      else setDetectedPlatform('');
    } else {
      setDetectedPlatform('');
    }
  }, [url]);

  const downloadContent = async () => {
    if (!url) return;
    
    setDownloading(true);
    
    try {
      if (!window.__TAURI__) {
        toast('Downloads require the desktop app', {
          icon: 'ℹ️',
        });
        setDownloading(false);
        return;
      }
      
      // Start download in background (fire and forget)
      invoke<string>('download_universal', { 
        url,
        siteType: detectedPlatform || undefined
      }).then(() => {
        // Download completed silently
      }).catch(error => {
        console.error('Download failed:', error);
        toast.error(`Download failed: ${error}`);
      });
      
      // Keep downloading state for 2 seconds to show button feedback
      setTimeout(() => {
        setUrl('');
        setDetectedPlatform('');
        setDownloading(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to start download:', error);
      toast.error(`Failed to start download: ${error}`);
      setDownloading(false);
    }
  };

  const getPlatformInfo = () => {
    const platform = platforms.find(p => p.type === detectedPlatform);
    return platform || null;
  };

  const platformInfo = getPlatformInfo();

  return (
    <div className="min-h-screen p-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
      >
        <ArrowLeft className="h-5 w-5 text-orange-500 group-hover:-translate-x-1 transition-transform" />
      </button>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-4 bg-orange-50 rounded-2xl mb-4">
            <Globe2 className="h-12 w-12 text-orange-500" />
          </div>
          <h1 className="text-5xl mb-4" style={{ fontFamily: 'Bungee, cursive', color: '#1F2937', letterSpacing: '2px' }}>
            Universal Downloader
          </h1>
          <p className="text-gray-600" style={{ fontFamily: 'Space Mono, monospace' }}>
            Grab content from any social platform • Works everywhere
          </p>
        </div>

        {/* Supported Platforms */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h3 className="text-sm font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif', color: '#ea580c' }}>
            SUPPORTED PLATFORMS
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              return (
                <div
                  key={platform.type}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 text-center ${
                    detectedPlatform === platform.type
                      ? 'border-orange-400 bg-orange-50 scale-110 shadow-lg'
                      : 'border-gray-200 hover:border-orange-200'
                  }`}
                >
                  <div className="flex justify-center mb-1" style={{ color: platform.color }}>
                    <Icon />
                  </div>
                  <p className="text-xs font-bold" style={{ fontFamily: 'Space Mono, monospace', color: platform.color }}>
                    {platform.name}
                  </p>
                </div>
              );
            })}
          </div>

          {/* URL Input */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif', color: '#6B7280' }}>
                PASTE URL HERE
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://instagram.com/p/..."
                  className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-orange-200 focus:border-orange-400 focus:outline-none transition-colors"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                />
                {platformInfo && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: platformInfo.color }}>
                    <platformInfo.icon />
                  </div>
                )}
              </div>
              {platformInfo && (
                <p className="text-sm mt-2" style={{ fontFamily: 'Space Mono, monospace', color: platformInfo.color }}>
                  Detected: {platformInfo.name}
                </p>
              )}
            </div>

            {/* Download Button */}
            <button
              onClick={downloadContent}
              disabled={downloading || !url}
              className="w-full py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl disabled:opacity-50 group"
              style={{
                fontFamily: 'Bungee, cursive',
                background: downloading || !url
                  ? '#e5e7eb'
                  : platformInfo
                    ? `linear-gradient(135deg, ${platformInfo.color}99 0%, ${platformInfo.color} 100%)`
                    : 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                color: downloading || !url ? '#9ca3af' : 'white',
                fontSize: '18px'
              }}
            >
              {downloading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-6 w-6 group-hover:animate-bounce" />
                  GRAB IT!
                </>
              )}
            </button>

          </div>
        </div>

        {/* Tips */}
        <div className="bg-orange-50 rounded-2xl p-6 text-center">
          <p className="text-sm" style={{ fontFamily: 'Courier Prime, monospace', color: '#ea580c' }}>
            💡 Tip: Downloads save to ~/Downloads/Grably/
          </p>
        </div>
      </div>
    </div>
  );
};
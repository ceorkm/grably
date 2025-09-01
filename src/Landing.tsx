import { useState } from 'react';
import { Download, Zap, Shield, Cpu, Play } from 'lucide-react';

export default function Landing() {
  const [downloadHovered, setDownloadHovered] = useState(false);

  const features = [
    { icon: <Zap />, title: 'LIGHTNING', subtitle: 'Fast AF', font: 'Bungee' },
    { icon: <Shield />, title: 'NOTARIZED', subtitle: 'Apple Approved', font: 'Archivo Black' },
    { icon: <Cpu />, title: 'UNIVERSAL', subtitle: 'Intel + M1/M2/M3', font: 'Rubik Mono One' },
  ];

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(135deg, #FDFCFB 0%, #FAF9F8 25%, #FFFEFE 50%, #FAFAF9 75%, #FCFBFA 100%)',
      backgroundSize: '400% 400%',
      animation: 'milkSwirl 20s ease infinite'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bungee&family=Archivo+Black&family=Rubik+Mono+One&family=Space+Mono:wght@400;700&family=Bebas+Neue&family=Courier+Prime:wght@700&display=swap');
        
        @keyframes milkSwirl {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-8xl md:text-9xl mb-6" style={{
            fontFamily: 'Bungee, cursive',
            color: '#000000'
          }}>
            GRABLY
          </h1>
          
          <p className="text-xl" style={{
            fontFamily: 'Space Mono, monospace',
            color: '#000000'
          }}>
            Grab any media from the web.{' '}
            <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3em' }}>
              SIMPLE.
            </span>{' '}
            <span style={{ fontFamily: 'Archivo Black' }}>
              FAST.
            </span>{' '}
            <span style={{ fontFamily: 'Rubik Mono One', fontSize: '1.2em' }}>
              100% FREE
            </span>
          </p>
        </div>

        {/* Video Demo Placeholder */}
        <div className="mb-16">
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="aspect-video bg-gray-50 rounded-xl flex items-center justify-center">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-md mb-4">
                  <Play className="w-10 h-10 text-black ml-1" />
                </div>
                <p style={{
                  fontFamily: 'Bungee, cursive',
                  fontSize: '1.5rem',
                  color: '#000000'
                }}>
                  DEMO VIDEO COMING SOON
                </p>
                <p style={{
                  fontFamily: 'Space Mono, monospace',
                  color: '#666666',
                  marginTop: '0.5rem'
                }}>
                  See Grably in action
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Download Section */}
        <div className="mb-16">
          <div className="bg-white rounded-2xl p-12 shadow-lg text-center">
            <img src="/icon.png" alt="Grably" className="w-32 h-32 mx-auto mb-6" />
            
            <h2 style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: '2.5rem',
              color: '#000000',
              marginBottom: '1rem'
            }}>
              DESKTOP APP FOR MACOS
            </h2>
            
            <p style={{
              fontFamily: 'Courier Prime, monospace',
              fontSize: '1.25rem',
              color: '#333333',
              marginBottom: '2rem'
            }}>
              YouTube, Twitter, Instagram, Facebook - we grab 'em all
            </p>
            
            <a
              href="Grably_0.1.0_universal_notarized.dmg"
              download
              onMouseEnter={() => setDownloadHovered(true)}
              onMouseLeave={() => setDownloadHovered(false)}
              className="inline-flex items-center gap-4 px-10 py-5 rounded-xl text-white shadow-lg"
              style={{
                background: '#000000',
                fontFamily: 'Bungee, cursive',
                fontSize: '1.25rem',
                transform: downloadHovered ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 0.2s'
              }}
            >
              <Download className="w-6 h-6" />
              DOWNLOAD FOR MAC
            </a>
            
            <div style={{
              marginTop: '1.5rem',
              fontFamily: 'Space Mono, monospace',
              color: '#9CA3AF',
              fontSize: '0.875rem'
            }}>
              <p>v0.1.0 • Universal Binary • 173 MB</p>
              <p>macOS 10.13+ • Notarized by Apple</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-8 shadow-md"
            >
              <div className="text-black mb-4">
                {feature.icon}
              </div>
              <h3 style={{
                fontFamily: `${feature.font}, cursive`,
                fontSize: '1.25rem',
                color: '#000000',
                marginBottom: '0.5rem'
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontFamily: 'Space Mono, monospace',
                color: '#666666',
                fontSize: '0.875rem'
              }}>
                {feature.subtitle}
              </p>
            </div>
          ))}
        </div>

        {/* What's Inside */}
        <div className="bg-white rounded-2xl p-10 mb-12 shadow-md">
          <h3 style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: '2rem',
            color: '#000000',
            marginBottom: '1.5rem',
            letterSpacing: '1px'
          }}>
            WHAT'S INCLUDED
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              '✓ YouTube downloader with format picker',
              '✓ Universal grabber for all social media',
              '✓ Built-in Whisper AI transcription',
              '✓ Auto-organizes in ~/Downloads/Grably/',
              '✓ No account, no cloud, no BS',
              '✓ 100% offline capable'
            ].map((item, i) => (
              <p key={i} style={{
                fontFamily: 'Space Mono, monospace',
                color: '#333333',
                fontSize: '0.95rem'
              }}>
                {item}
              </p>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center py-8">
          <p style={{
            fontFamily: 'Bungee, cursive',
            fontSize: '1rem',
            color: '#000000',
            marginBottom: '0.5rem'
          }}>
            GRABLY © 2025
          </p>
          <p style={{
            fontFamily: 'Space Mono, monospace',
            color: '#666666',
            fontSize: '0.875rem'
          }}>
            No ads • No tracking • No subscription • 100% Free
          </p>
        </footer>
      </div>
    </div>
  );
}
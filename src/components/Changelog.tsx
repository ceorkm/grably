import React from 'react';
import { X, ExternalLink, Calendar, Bug, Star, Zap } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';

interface ChangelogProps {
  onClose: () => void;
}

const releases = [
  {
    version: 'v1.0.20251001',
    date: '2025-10-01',
    title: 'Hidden Files Fix & Model Updates',
    type: 'major',
    url: 'https://github.com/ceorkm/grably/releases/tag/v1.0.20251001-final',
    changes: [
      {
        type: 'fix',
        description: 'Fixed hidden file downloads from Ok.ru and other sites'
      },
      {
        type: 'improvement',
        description: 'Updated whisper model for better transcription accuracy'
      },
      {
        type: 'improvement',
        description: 'Improved filename handling with proper sanitization'
      },
      {
        type: 'security',
        description: 'All binaries signed and notarized for macOS distribution'
      }
    ]
  },
  {
    version: 'v0.1.1',
    date: '2025-09-27',
    title: 'Initial Release',
    type: 'major',
    url: 'https://github.com/ceorkm/grably/releases/tag/v0.1.1',
    changes: [
      {
        type: 'feature',
        description: 'YouTube video and audio downloading'
      },
      {
        type: 'feature',
        description: 'Universal downloader for social platforms'
      },
      {
        type: 'feature',
        description: 'Local transcription with Whisper AI'
      },
      {
        type: 'feature',
        description: 'Drag & drop file transcription'
      }
    ]
  }
];

const getChangeIcon = (type: string) => {
  switch (type) {
    case 'fix':
      return <Bug className="h-4 w-4 text-red-500" />;
    case 'feature':
      return <Star className="h-4 w-4 text-blue-500" />;
    case 'improvement':
      return <Zap className="h-4 w-4 text-green-500" />;
    case 'security':
      return <Star className="h-4 w-4 text-purple-500" />;
    default:
      return <Star className="h-4 w-4 text-gray-500" />;
  }
};

const getVersionTypeColor = (type: string) => {
  switch (type) {
    case 'major':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'minor':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'patch':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const Changelog: React.FC<ChangelogProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily: 'Space Mono, monospace'}}>
                What's New
              </h2>
              <p className="text-gray-600 mt-1" style={{fontFamily: 'Courier Prime, monospace'}}>
                Latest updates and improvements
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-orange-200 transition-colors"
            >
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6">
          <div className="space-y-8">
            {releases.map((release, index) => (
              <div key={release.version} className="relative">
                {/* Version Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium border ${getVersionTypeColor(release.type)}`}
                      style={{fontFamily: 'Space Mono, monospace'}}
                    >
                      {release.version}
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {release.title}
                    </h3>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span style={{fontFamily: 'Courier Prime, monospace'}}>
                        {release.date}
                      </span>
                    </div>
                    <button
                      onClick={() => open(release.url)}
                      className="flex items-center space-x-1 text-orange-600 hover:text-orange-700 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>View on GitHub</span>
                    </button>
                  </div>
                </div>

                {/* Changes List */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {release.changes.map((change, changeIndex) => (
                    <div key={changeIndex} className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {getChangeIcon(change.type)}
                      </div>
                      <p className="text-gray-700 flex-1" style={{fontFamily: 'system-ui, sans-serif'}}>
                        {change.description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Divider (except for last item) */}
                {index < releases.length - 1 && (
                  <div className="mt-8 border-t border-gray-200"></div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <button
              onClick={() => open('https://github.com/ceorkm/grably/releases')}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium"
              style={{fontFamily: 'Space Mono, monospace'}}
            >
              <ExternalLink className="h-4 w-4" />
              <span>View All Releases</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
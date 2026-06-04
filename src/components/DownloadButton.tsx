import React from 'react';
import { Download } from 'lucide-react';
import { useDownloadUi } from '../stores/downloadStore';

// Toolbar trigger for the download center. Rendered inside each screen's
// existing button row so it never overlaps. `round` matches the home screen's
// pill buttons; default matches the tools' rounded-xl buttons.
export const DownloadButton: React.FC<{ round?: boolean }> = ({ round }) => {
  const toggle = useDownloadUi((s) => s.toggle);
  const activeCount = useDownloadUi((s) => s.activeCount);

  return (
    <button
      onClick={toggle}
      className={`relative p-3 bg-white transition-all duration-200 group ${
        round ? 'rounded-full shadow-md hover:shadow-lg' : 'rounded-xl shadow-lg hover:shadow-xl'
      }`}
      title="Downloads"
    >
      <Download
        className={`${round ? 'h-6 w-6' : 'h-5 w-5'} text-orange-500 group-hover:scale-110 transition-transform`}
      />
      {activeCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-black tabular-nums shadow"
          style={{ fontFamily: 'Space Mono, monospace' }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
};

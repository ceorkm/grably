import { create } from 'zustand';

// Shared UI state for the download center so the toolbar trigger button (which
// lives inside each screen's button row) and the global popover/listener stay
// in sync. The actual download data lives in DownloadCenter; only the open
// state and the active count are shared here.
interface DownloadUiState {
  isOpen: boolean;
  activeCount: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActiveCount: (n: number) => void;
}

export const useDownloadUi = create<DownloadUiState>((set) => ({
  isOpen: false,
  activeCount: 0,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveCount: (n) => set({ activeCount: n }),
}));

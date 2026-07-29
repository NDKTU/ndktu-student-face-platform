import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
}

/** Прототип держит тост 2200 мс — сохраняем. */
const TOAST_MS = 2200;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), TOAST_MS);
  },
  hide: () => {
    clearTimeout(timer);
    set({ message: null });
  },
}));

export function useToast() {
  return useToastStore((s) => s.show);
}

export function Toast() {
  const message = useToastStore((s) => s.message);
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-12 bg-ink px-4 py-2.5 text-13-5 font-semibold text-white shadow-popover"
    >
      {message}
    </div>
  );
}

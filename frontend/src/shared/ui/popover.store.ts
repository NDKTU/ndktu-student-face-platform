import { create } from 'zustand';

/**
 * Какой поповер шапки сейчас открыт. Уведомления и меню аватара
 * взаимоисключающие — как в прототипе, где открытие одного гасит другой.
 * Держать это в состоянии каждого компонента нельзя: они не знают друг о друге.
 */
type PopoverId = 'notifications' | 'avatar';

interface PopoverState {
  openId: PopoverId | null;
  toggle: (id: PopoverId) => void;
  close: () => void;
}

export const usePopoverStore = create<PopoverState>((set) => ({
  openId: null,
  toggle: (id) => set((s) => ({ openId: s.openId === id ? null : id })),
  close: () => set({ openId: null }),
}));

/** Возвращает состояние конкретного поповера и способ им управлять. */
export function usePopover(id: PopoverId) {
  const open = usePopoverStore((s) => s.openId === id);
  const toggle = usePopoverStore((s) => s.toggle);
  const close = usePopoverStore((s) => s.close);

  return { open, toggle: () => toggle(id), close };
}

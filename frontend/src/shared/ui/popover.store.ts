import { create } from 'zustand';

/**
 * Какой поповер шапки сейчас открыт.
 *
 * Поповеров в шапке сейчас один — меню аватара; колокольчик уведомлений убран
 * вместе с выдуманным фидом. Общее состояние всё равно нужно: открытие любого
 * следующего должно гасить предыдущий, а компоненты друг о друге не знают.
 */
type PopoverId = 'avatar';

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

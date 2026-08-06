import { create } from 'zustand';
import * as api from '@/shared/api/lavozimlar';
import type { Lavozim } from '@/shared/api/lavozimlar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LavozimlarState {
  lavozimlar: Lavozim[];
  status: LoadStatus;
  error: string | null;

  load: () => Promise<void>;
  add: (name: string) => Promise<void>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

/** Список короткий (десятки записей), поэтому без пагинации и фильтров. */
export const useLavozimlarStore = create<LavozimlarState>()((set, get) => ({
  lavozimlar: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ lavozimlar: await api.getLavozimlar(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  add: async (name) => {
    const created = await api.createLavozim(name);
    set({ lavozimlar: [...get().lavozimlar, created] });
  },

  rename: async (id, name) => {
    const updated = await api.updateLavozim(id, name);
    set({ lavozimlar: get().lavozimlar.map((b) => (b.id === id ? updated : b)) });
  },

  remove: async (id) => {
    await api.deleteLavozim(id);
    set({ lavozimlar: get().lavozimlar.filter((b) => b.id !== id) });
  },
}));

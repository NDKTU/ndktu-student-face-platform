import { create } from 'zustand';
import * as api from '@/shared/api/bolimlar';
import type { Bolim } from '@/shared/api/bolimlar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface BolimlarState {
  bolimlar: Bolim[];
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
export const useBolimlarStore = create<BolimlarState>()((set, get) => ({
  bolimlar: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ bolimlar: await api.getBolimlar(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  add: async (name) => {
    const created = await api.createBolim(name);
    set({ bolimlar: [...get().bolimlar, created] });
  },

  rename: async (id, name) => {
    const updated = await api.updateBolim(id, name);
    set({ bolimlar: get().bolimlar.map((b) => (b.id === id ? updated : b)) });
  },

  remove: async (id) => {
    await api.deleteBolim(id);
    set({ bolimlar: get().bolimlar.filter((b) => b.id !== id) });
  },
}));

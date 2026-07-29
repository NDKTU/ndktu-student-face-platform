import { create } from 'zustand';
import type { Subject } from '@/entities/university/model/types';
import * as api from '@/shared/api/fanlar';

/** Строка каталога фанов с устойчивым id и дополнительными полями формы. */
export interface FanRow extends Subject {
  id: number;
  kod: string;
  tavsif: string;
}

/** Черновик формы «Yangi fan». */
export interface FanDraft {
  fan: string;
  kafedra: string;
  kredit: string;
  kod: string;
  tavsif: string;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface FanlarState {
  fans: FanRow[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
  add: (draft: FanDraft) => Promise<void>;
  update: (id: number, draft: FanDraft) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Текущий запрос списка, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useFanlarStore = create<FanlarState>()((set) => ({
  fans: [],
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        set({ fans: await api.getFanlar(), status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  // Мутации: сначала сервер, затем локальная заплатка его ответом — id и
  // порядок совпадают с базой, список целиком не перекачивается.
  add: async (draft) => {
    const created = await api.createFan(draft);
    set((s) => ({ fans: [created, ...s.fans] }));
  },

  update: async (id, draft) => {
    const updated = await api.updateFan(id, draft);
    set((s) => ({ fans: s.fans.map((f) => (f.id === id ? updated : f)) }));
  },

  remove: async (id) => {
    await api.deleteFan(id);
    set((s) => ({ fans: s.fans.filter((f) => f.id !== id) }));
  },
}));

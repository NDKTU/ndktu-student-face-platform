import { create } from 'zustand';
import type { PermissionCode, PermissionMatrix } from '@/entities/access/model/permissions';
import type { Role } from '@/entities/access/model/roles';
import * as api from '@/shared/api/rollar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RollarState {
  matrix: PermissionMatrix | null;
  /** Число учёток по ролям — счётчики в списке ролей. */
  counts: Record<string, number>;
  status: LoadStatus;
  error: string | null;

  load: () => Promise<void>;
  toggle: (role: Role, code: PermissionCode, granted: boolean) => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useRollarStore = create<RollarState>()((set) => ({
  matrix: null,
  counts: {},
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        const [matrix, counts] = await Promise.all([api.getMatrix(), api.getRoleCounts()]);
        set({ matrix, counts, status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  // Сервер отвечает всей матрицей — берём её, а не переключаем локально:
  // строка super_admin заблокирована, и отказ должен быть виден сразу.
  toggle: async (role, code, granted) => {
    set({ matrix: await api.setPermission(role, code, granted) });
  },
}));

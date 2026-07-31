import { create } from 'zustand';
import * as api from '@/shared/api/rollar';
import type { PermissionInfo, RoleWithPermissions } from '@/shared/api/rollar';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RollarState {
  /** Роли с их правами — как они заведены в БД. */
  roles: RoleWithPermissions[];
  /** Полный словарь прав: бэкенд заводит их сам, обходя маршруты при старте. */
  permissions: PermissionInfo[];
  /** Число учёток по ролям — счётчики в списке. */
  counts: Record<string, number>;
  status: LoadStatus;
  error: string | null;

  load: () => Promise<void>;
  /** Выдать или отобрать одно право у роли. */
  toggle: (roleId: number, permissionId: number, granted: boolean) => Promise<void>;
  /** Возвращает id созданной роли — экран сразу её открывает. */
  addRole: (name: string) => Promise<number>;
  removeRole: (roleId: number, force?: boolean) => Promise<void>;
}

/** Текущий запрос, чтобы StrictMode не слал его дважды. */
let inFlight: Promise<void> | null = null;

export const useRollarStore = create<RollarState>()((set, get) => ({
  roles: [],
  permissions: [],
  counts: {},
  status: 'idle',
  error: null,

  load: async () => {
    if (inFlight) return inFlight;

    set({ status: 'loading', error: null });
    inFlight = (async () => {
      try {
        const [roles, permissions, counts] = await Promise.all([
          api.getRoles(),
          api.getPermissions(),
          api.getRoleCounts(),
        ]);
        set({ roles, permissions, counts, status: 'ready' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  toggle: async (roleId, permissionId, granted) => {
    const role = get().roles.find((r) => r.id === roleId);
    const permission = get().permissions.find((p) => p.id === permissionId);
    if (!role || !permission) return;

    // Эндпоинт заменяет набор прав роли целиком, а не переключает одно, —
    // поэтому новый набор считаем здесь и отправляем его весь.
    const next = granted
      ? [...role.permissions, permission]
      : role.permissions.filter((p) => p.id !== permissionId);

    const patch = (permissions: PermissionInfo[]) =>
      set((s) => ({
        roles: s.roles.map((r) => (r.id === roleId ? { ...r, permissions } : r)),
      }));

    // Ставим галочку сразу, чтобы она не «залипала» на время запроса;
    // при ошибке возвращаем прежний набор.
    patch(next);
    try {
      await api.assignPermissions(
        roleId,
        next.map((p) => p.id),
      );
    } catch (e) {
      patch(role.permissions);
      throw e;
    }
  },

  addRole: async (name) => {
    // Ответ приходит с уже выданным `user:me` — берём права оттуда, а не
    // подставляем пустой список, который разошёлся бы с сервером.
    const created = await api.createRole(name);
    set((s) => ({ roles: [...s.roles, created], counts: { ...s.counts, [created.name]: 0 } }));
    return created.id;
  },

  removeRole: async (roleId, force = false) => {
    await api.deleteRole(roleId, force);
    set((s) => ({
      roles: s.roles.filter((r) => r.id !== roleId),
      // Счётчик учёток тоже уходит: иначе удалённая роль осталась бы в
      // подписях под другими строками.
      counts: Object.fromEntries(
        Object.entries(s.counts).filter(
          ([name]) => name !== s.roles.find((r) => r.id === roleId)?.name,
        ),
      ),
    }));
  },
}));

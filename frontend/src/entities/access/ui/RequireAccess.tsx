import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/usePermissions';
import type { NavKey } from '../model/roles';

/**
 * Гард раздела. Меню и так показывает только доступное, но адрес, набранный
 * руками, открыл бы любую страницу. Сервер такие запросы отвергает сам —
 * пускать пользователя на заведомо пустой экран всё равно незачем.
 */
export function RequireAccess({ nav, children }: { nav: NavKey; children: ReactNode }) {
  const { canAccess } = usePermissions();
  return canAccess(nav) ? <>{children}</> : <Navigate to="/bosh" replace />;
}

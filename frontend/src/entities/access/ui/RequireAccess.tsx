import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../lib/usePermissions';
import type { NavKey } from '../model/roles';

/**
 * Гард раздела. Раньше роль решала только то, что показать в меню, — адрес,
 * набранный руками, открывал любую страницу. Сервер такие запросы теперь
 * отвергает, но пускать пользователя на заведомо пустой экран незачем.
 */
export function RequireAccess({ nav, children }: { nav: NavKey; children: ReactNode }) {
  const { canAccess } = usePermissions();
  return canAccess(nav) ? <>{children}</> : <Navigate to="/bosh" replace />;
}

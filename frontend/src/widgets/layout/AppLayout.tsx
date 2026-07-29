import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { useIdleTimeout } from '@/features/auth/lib/useIdleTimeout';

/** Брейкпоинт мобильной раскладки — тот же, что в прототипе. */
const MOBILE_QUERY = '(max-width: 820px)';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  useIdleTimeout();

  // На мобильном сайдбар — оверлей, кнопка в шапке открывает и закрывает его;
  // на десктопе та же кнопка сворачивает его до иконок.
  function toggleSidebar() {
    if (isMobile) setMobileOpen((open) => !open);
    else setCollapsed((value) => !value);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <AppHeader onToggleSidebar={toggleSidebar} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          collapsed={collapsed && !isMobile}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />

        {mobileOpen && (
          <div
            className="app-scrim"
            role="presentation"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <main className="app-scroll flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-28">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

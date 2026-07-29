import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/features/auth/model/session.store';
import type { NavKey } from '../model/roles';
import type { Role } from '../model/roles';
import { RequireAccess } from './RequireAccess';

function renderAt(role: Role, nav: NavKey, path: string) {
  useSessionStore.setState({ role });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <RequireAccess nav={nav}>
              <div>himoyalangan sahifa</div>
            </RequireAccess>
          }
        />
        <Route path="/bosh" element={<div>bosh sahifa</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSessionStore.setState({ role: 'super_admin' });
});

describe('RequireAccess', () => {
  it('пускает роль, у которой раздел есть в меню', () => {
    renderAt('super_admin', 'tuzilma', '/tuzilma');
    expect(screen.getByText('himoyalangan sahifa')).toBeInTheDocument();
  });

  it('студента с адреса /tuzilma уводит на главную', () => {
    // Раньше адрес, набранный руками, открывал весь справочник университета.
    renderAt('talaba', 'tuzilma', '/tuzilma');
    expect(screen.getByText('bosh sahifa')).toBeInTheDocument();
    expect(screen.queryByText('himoyalangan sahifa')).not.toBeInTheDocument();
  });

  it('преподавателя не пускает в «Rollar»', () => {
    renderAt('oqituvchi', 'rollar', '/rollar');
    expect(screen.getByText('bosh sahifa')).toBeInTheDocument();
  });

  it('«Profil» открыт всем, хотя в меню его нет', () => {
    renderAt('talaba', 'profil', '/profil');
    expect(screen.getByText('himoyalangan sahifa')).toBeInTheDocument();
  });
});

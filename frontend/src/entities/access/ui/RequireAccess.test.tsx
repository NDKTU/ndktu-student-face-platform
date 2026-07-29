import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/features/auth/model/session.store';
import type { Persona } from '@/features/auth/model/session.store';
import type { NavKey } from '../model/roles';
import { RequireAccess } from './RequireAccess';

interface Session {
  permissions?: string[];
  roleNames?: string[];
  persona?: Persona;
}

function renderAt(session: Session, nav: NavKey, path: string) {
  useSessionStore.setState({
    permissions: new Set(session.permissions ?? []),
    roleNames: session.roleNames ?? [],
    persona: session.persona ?? 'staff',
  });

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
  useSessionStore.setState({ permissions: new Set(), roleNames: [], persona: 'staff' });
});

describe('RequireAccess', () => {
  it('пускает того, у кого есть нужное право', () => {
    renderAt({ permissions: ['read:faculty'] }, 'tuzilma', '/tuzilma');
    expect(screen.getByText('himoyalangan sahifa')).toBeInTheDocument();
  });

  it('без права уводит на главную', () => {
    // Раньше адрес, набранный руками, открывал весь справочник университета.
    renderAt({ permissions: [], persona: 'student' }, 'tuzilma', '/tuzilma');
    expect(screen.getByText('bosh sahifa')).toBeInTheDocument();
    expect(screen.queryByText('himoyalangan sahifa')).not.toBeInTheDocument();
  });

  it('чужого права мало: read:question не открывает «Rollar»', () => {
    renderAt({ permissions: ['read:question'] }, 'rollar', '/rollar');
    expect(screen.getByText('bosh sahifa')).toBeInTheDocument();
  });

  it('Admin проходит куда угодно, даже с пустым набором прав', () => {
    renderAt({ roleNames: ['Admin'] }, 'rollar', '/rollar');
    expect(screen.getByText('himoyalangan sahifa')).toBeInTheDocument();
  });

  it('персона закрывает раздел даже при наличии права', () => {
    renderAt({ permissions: ['quiz_process:start_quiz'], persona: 'staff' }, 'stestlar', '/stestlar');
    expect(screen.getByText('bosh sahifa')).toBeInTheDocument();
  });

  it('«Profil» открыт всем, хотя в меню его нет', () => {
    renderAt({ persona: 'student' }, 'profil', '/profil');
    expect(screen.getByText('himoyalangan sahifa')).toBeInTheDocument();
  });
});

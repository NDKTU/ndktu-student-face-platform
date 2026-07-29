import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';
import { useSessionStore } from '@/features/auth/model/session.store';
import { ROLES, type Role } from '../model/roles';

function asRole(role: Role) {
  useSessionStore.setState({ role });
  return renderHook(() => usePermissions()).result.current;
}

describe('usePermissions', () => {
  beforeEach(() => {
    useSessionStore.setState({ role: 'super_admin' });
  });

  it('super_admin видит все одиннадцать разделов', () => {
    expect(asRole('super_admin').nav).toHaveLength(11);
  });

  it('talaba не видит административных разделов', () => {
    const { nav } = asRole('talaba');
    expect(nav).toEqual(['bosh', 'guruhim', 'fanlarim', 'stestlar', 'svazlar']);
    expect(nav).not.toContain('foydalanuvchilar');
    expect(nav).not.toContain('rollar');
  });

  it('право на запись есть у четырёх управляющих ролей', () => {
    const writers = ROLES.filter((role) => asRole(role).canWrite);
    expect(writers).toEqual(['super_admin', 'admin', 'dekan', 'kafedra_mudiri']);
  });

  it('персональные данные студента видят только super_admin и admin', () => {
    const allowed = ROLES.filter((role) => asRole(role).canViewSensitive);
    expect(allowed).toEqual(['super_admin', 'admin']);
  });

  it('canAccess закрывает чужой раздел и открывает общий', () => {
    const talaba = asRole('talaba');
    expect(talaba.canAccess('rollar')).toBe(false);
    expect(talaba.canAccess('guruhim')).toBe(true);
    // Профиль и уведомления доступны всем, хотя в меню их нет.
    expect(talaba.canAccess('profil')).toBe(true);
    expect(talaba.canAccess('bildirishnomalar')).toBe(true);
  });

  it('матрица прав: удаление в LMS только у super_admin и admin', () => {
    const canDelete = ROLES.filter((role) => asRole(role).can('lms:delete'));
    expect(canDelete).toEqual(['super_admin', 'admin']);
  });

  it('у talaba в LMS только чтение', () => {
    const talaba = asRole('talaba');
    expect(talaba.can('lms:read')).toBe(true);
    expect(talaba.can('lms:write')).toBe(false);
  });
});

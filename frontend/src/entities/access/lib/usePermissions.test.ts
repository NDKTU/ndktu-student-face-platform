import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';
import { useSessionStore } from '@/features/auth/model/session.store';
import type { Persona } from '@/features/auth/model/session.store';
import type { NavKey } from '../model/roles';

function session(permissions: string[], roleNames: string[] = [], persona: Persona = 'staff') {
  useSessionStore.setState({ permissions: new Set(permissions), roleNames, persona });
  return renderHook(() => usePermissions()).result.current;
}

const keys = (nav: readonly { key: NavKey }[]) => nav.map((item) => item.key);

describe('usePermissions', () => {
  beforeEach(() => {
    useSessionStore.setState({ permissions: new Set(), roleNames: [], persona: 'staff' });
  });

  it('без прав остаются только разделы, которые ничего не требуют', () => {
    expect(keys(session([]).nav)).toEqual(['bosh', 'sozlamalar']);
  });

  it('раздел появляется вместе с правом на чтение его сущности', () => {
    expect(keys(session(['read:subject']).nav)).toContain('fanlar');
    expect(keys(session([]).nav)).not.toContain('fanlar');
  });

  it('«Foydalanuvchilar» открывает любое из трёх прав, не все сразу', () => {
    expect(keys(session(['read:employee']).nav)).toContain('foydalanuvchilar');
    expect(keys(session(['read:student']).nav)).toContain('foydalanuvchilar');
  });

  it('Admin видит всё: сервер пропускает эту роль мимо проверок', () => {
    const admin = session([], ['Admin']);
    expect(admin.isAdmin).toBe(true);
    expect(admin.has('read:faculty')).toBe(true);
    expect(keys(admin.nav)).toContain('rollar');
  });

  it('персона важнее прав: студенческие разделы сотруднику не показываются', () => {
    // У Admin есть всё, но сдавать тесты ему негде — это экран студента.
    const admin = session([], ['Admin'], 'staff');
    expect(keys(admin.nav)).not.toContain('stestlar');
    expect(keys(admin.nav)).toContain('testlar');
  });

  it('…и наоборот: студент не получает разделов персонала', () => {
    const student = session(['quiz_process:start_quiz', 'read:quiz'], ['student'], 'student');
    expect(keys(student.nav)).toContain('stestlar');
    expect(keys(student.nav)).not.toContain('testlar');
  });

  it('canAccess закрывает раздел без права и открывает общий', () => {
    const student = session(['quiz_process:start_quiz'], ['student'], 'student');
    expect(student.canAccess('rollar')).toBe(false);
    expect(student.canAccess('stestlar')).toBe(true);
    // Профиль есть у всех, хотя в меню он и не выводится.
    expect(student.canAccess('profil')).toBe(true);
    expect(keys(student.nav)).not.toContain('profil');
  });

  it('«Reja» ждёт своё право с бэкенда и до тех пор не показывается', () => {
    expect(keys(session(['read:faculty']).nav)).not.toContain('reja');
    expect(keys(session(['read:curriculum']).nav)).toContain('reja');
  });

  it('hasAny срабатывает по любому совпадению', () => {
    const p = session(['read:quiz']);
    expect(p.hasAny('read:course', 'read:quiz')).toBe(true);
    expect(p.hasAny('read:course', 'read:role')).toBe(false);
  });
});

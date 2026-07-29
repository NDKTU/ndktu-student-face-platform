import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';
import { useSessionStore } from '@/features/auth/model/session.store';

function withPermissions(names: string[], roleNames: string[] = ['dekan']) {
  useSessionStore.setState({
    permissions: new Set(names),
    roleNames,
    persona: 'staff',
  });
  return renderHook(() => usePermissions()).result.current;
}

/**
 * Персональные данные студента и сотрудника закрыты двумя разными правами, и
 * сводить их к одному нельзя: тот, кому положено видеть анкету студента, не
 * обязан видеть паспорт и ЖШШИР сотрудника.
 *
 * Раньше это было зашито двумя списками ролей. Теперь права выдаются на экране
 * «Rollar» по отдельности — проверка здесь ровно о том, что они независимы.
 */
describe('доступ к персональным данным', () => {
  beforeEach(() => {
    useSessionStore.setState({ permissions: new Set(), roleNames: [], persona: 'staff' });
  });

  it('без прав не видно ни ту, ни другую анкету', () => {
    const p = withPermissions([]);
    expect(p.canViewStudentSensitive).toBe(false);
    expect(p.canViewEmployeeSensitive).toBe(false);
  });

  it('право на студента не открывает карточку сотрудника', () => {
    const p = withPermissions(['read:student_sensitive']);
    expect(p.canViewStudentSensitive).toBe(true);
    expect(p.canViewEmployeeSensitive).toBe(false);
  });

  it('право на сотрудника не открывает карточку студента', () => {
    const p = withPermissions(['read:employee_sensitive']);
    expect(p.canViewEmployeeSensitive).toBe(true);
    expect(p.canViewStudentSensitive).toBe(false);
  });

  it('Admin видит обе — сервер его тоже пропускает мимо проверок', () => {
    const p = withPermissions([], ['Admin']);
    expect(p.canViewStudentSensitive).toBe(true);
    expect(p.canViewEmployeeSensitive).toBe(true);
  });
});

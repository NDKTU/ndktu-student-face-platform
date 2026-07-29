import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_SENSITIVE_ROLES,
  ROLES,
  SENSITIVE_DATA_ROLES,
  type Role,
} from '../model/roles';

/**
 * В системе два разных правила доступа к персональным данным, и их
 * нельзя сводить к одному:
 *
 *   студент  — видят super_admin и admin (SENSITIVE_DATA_ROLES);
 *   сотрудник — видит только super_admin.
 *
 * Прототип задаёт именно так. Если кто-то «унифицирует» правила,
 * админ получит доступ к паспортам и ЖШШИР сотрудников.
 */
describe('доступ к персональным данным', () => {
  it('карточку студента открывают super_admin и admin', () => {
    expect(ROLES.filter((r) => SENSITIVE_DATA_ROLES.includes(r))).toEqual([
      'super_admin',
      'admin',
    ]);
  });

  it('карточку сотрудника открывает только super_admin', () => {
    expect(ROLES.filter((r) => EMPLOYEE_SENSITIVE_ROLES.includes(r))).toEqual(['super_admin']);
  });

  it('правила не совпадают — admin видит студента, но не сотрудника', () => {
    expect(SENSITIVE_DATA_ROLES).toContain('admin');
    expect(EMPLOYEE_SENSITIVE_ROLES).not.toContain('admin');
  });

  it('ни одна из остальных ролей не видит персональных данных', () => {
    const others: Role[] = ['dekan', 'kafedra_mudiri', 'oqituvchi', 'talaba'];
    others.forEach((role) => {
      expect(SENSITIVE_DATA_ROLES, role).not.toContain(role);
      expect(EMPLOYEE_SENSITIVE_ROLES, role).not.toContain(role);
    });
  });
});

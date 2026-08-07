import { describe, expect, it } from 'vitest';
import type { Employee } from '../model/types';
import { employeeRoleOptions, matchesRole } from './roles';

function emp(id: number, roleLabels: string[]): Employee {
  return { id, roleLabels } as Employee;
}

describe('employeeRoleOptions', () => {
  it('собирает все роли, а не только первую у каждого', () => {
    const rows = [emp(1, ['Teacher', 'Dekan']), emp(2, ['Teacher'])];
    expect(employeeRoleOptions(rows)).toEqual(['Dekan', 'Teacher']);
  });

  it('пропускает сотрудников без ролей', () => {
    expect(employeeRoleOptions([emp(1, [])])).toEqual([]);
  });
});

describe('matchesRole', () => {
  it('находит по второй роли, а не только по первой', () => {
    expect(matchesRole(emp(1, ['Teacher', 'Dekan']), 'Dekan')).toBe(true);
  });

  it('пустой фильтр пропускает всех', () => {
    expect(matchesRole(emp(1, []), '')).toBe(true);
  });

  it('не находит того, у кого этой роли нет', () => {
    expect(matchesRole(emp(1, ['Teacher']), 'Dekan')).toBe(false);
  });
});

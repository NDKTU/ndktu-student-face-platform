import type { Employee } from '../model/types';

/**
 * Варианты фильтра по роли. Собираются по всем ролям каждого сотрудника:
 * роль — связь many-to-many, и у декана их две. Если брать только первую,
 * вторая роль не попадёт в список и отфильтровать по ней будет нечем.
 */
export function employeeRoleOptions(employees: Employee[]): string[] {
  const all = employees.flatMap((e) => e.roleLabels);
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

/** Совпадение по вхождению, а не по первой роли. Пустой фильтр пропускает всех. */
export function matchesRole(employee: Employee, label: string): boolean {
  return !label || employee.roleLabels.includes(label);
}

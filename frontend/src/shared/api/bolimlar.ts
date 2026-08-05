import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для справочника подразделений.
 *
 * Подразделение — это бухгалтерия, отдел кадров, учебная часть: место работы
 * тех сотрудников, которые не ведут занятия. Кафедра — другая сущность, она
 * живёт в дереве структуры (`shared/api/tuzilma.ts`).
 *
 * CRUD на бэкенде был с самого начала, но экрана к нему не существовало:
 * подразделение показывалось в списке сотрудников и по нему фильтровали,
 * а завести или назначить его было нечем.
 */

interface ApiDepartment {
  id: number;
  name: string;
}

export interface Bolim {
  id: number;
  name: string;
}

export async function getBolimlar(): Promise<Bolim[]> {
  const rows = await getAll<ApiDepartment>('/department/', 'departments');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function createBolim(name: string): Promise<Bolim> {
  const created = await api.post<ApiDepartment>('/department/', { name });
  return { id: created.id, name: created.name };
}

export async function updateBolim(id: number, name: string): Promise<Bolim> {
  const updated = await api.put<ApiDepartment>(`/department/${id}`, { name });
  return { id: updated.id, name: updated.name };
}

export const deleteBolim = (id: number) => api.delete(`/department/${id}`);

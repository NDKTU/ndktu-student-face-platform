import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для справочника должностей.
 *
 * Должность — «Professor», «Dotsent», «Buxgalter». Раньше это была свободная
 * строка `position_title` на сотруднике: её вводили заново каждый раз, так что
 * «Katta o'qituvchi» и «Katta oqituvchi» оказывались разными должностями.
 *
 * На бэкенде путь `/job-title/`, а не `/position/`: слово `position` в проекте
 * занято — в семи моделях так называется порядковый номер в интерфейсе.
 */

interface ApiJobTitle {
  id: number;
  name: string;
}

export interface Lavozim {
  id: number;
  name: string;
}

export async function getLavozimlar(): Promise<Lavozim[]> {
  const rows = await getAll<ApiJobTitle>('/job-title/', 'job_titles');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function createLavozim(name: string): Promise<Lavozim> {
  const created = await api.post<ApiJobTitle>('/job-title/', { name });
  return { id: created.id, name: created.name };
}

export async function updateLavozim(id: number, name: string): Promise<Lavozim> {
  const updated = await api.put<ApiJobTitle>(`/job-title/${id}`, { name });
  return { id: updated.id, name: updated.name };
}

export const deleteLavozim = (id: number) => api.delete(`/job-title/${id}`);

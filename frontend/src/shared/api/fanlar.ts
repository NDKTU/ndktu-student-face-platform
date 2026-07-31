import type { FanRow } from '@/features/fanlar/model/fanlar.store';
import { displayName } from '@/shared/lib/displayName';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для модуля «Fanlar».
 *
 * Кафедра на бэкенде — ссылка (`kafedra_id`), а в каталоге её показывают
 * строкой. Держим и то и другое: выбирать надо по id, а выводить по названию.
 */

interface ApiSubject {
  id: number;
  name: string;
  kafedra_id: number | null;
  kafedra: { id: number; name: string } | null;
  code: string | null;
  credit: number | null;
  semester: number | null;
  description: string | null;
}

export interface FanPayload {
  fan?: string;
  kafedraId?: number | null;
  kredit?: string;
  semestr?: number;
  kod?: string;
  tavsif?: string;
}

function toFanRow(subject: ApiSubject): FanRow {
  return {
    id: subject.id,
    fan: subject.name,
    kafedra: displayName(subject.kafedra?.name ?? ''),
    kafedraId: subject.kafedra_id,
    kredit: subject.credit ?? 0,
    semestr: subject.semester ?? 1,
    // Ведущий предмет закреплён отдельной таблицей (subject_teachers) и в
    // карточке каталога не показывается — прочерк честнее выдуманного имени.
    oqituvchi: '—',
    kod: subject.code ?? '',
    tavsif: subject.description ?? '',
  };
}

function toBody(body: FanPayload) {
  return {
    name: body.fan,
    kafedra_id: body.kafedraId ?? null,
    code: body.kod || null,
    credit: body.kredit ? Number(body.kredit) : null,
    semester: body.semestr ?? null,
    description: body.tavsif || null,
  };
}

/**
 * Весь каталог сразу: на экране «Fanlar» пагинации нет, а список подставляется
 * в автодополнение учебного плана.
 */
export async function getFanlar(): Promise<FanRow[]> {
  const subjects = await getAll<ApiSubject>('/subject/', 'subjects');
  return subjects.map(toFanRow);
}

export async function createFan(body: FanPayload): Promise<FanRow> {
  return toFanRow(await api.post<ApiSubject>('/subject/', toBody(body)));
}

export async function updateFan(id: number, body: FanPayload): Promise<FanRow> {
  return toFanRow(await api.put<ApiSubject>(`/subject/${id}`, toBody(body)));
}

export const deleteFan = (id: number) => api.delete(`/subject/${id}`);

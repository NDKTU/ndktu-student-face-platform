import { getAll } from './envelope';
import { api, ApiError } from './http';

/**
 * Что закреплено лично за владельцем токена: его предметы, группы и активные
 * тесты. Домашние страницы преподавателя и студента собираются из этого.
 *
 * Эндпоинты закреплений отдают карточку сотрудника целиком, а нужны из неё
 * только вложенные списки — разворачиваем здесь.
 */

export interface AssignedSubject {
  id: number;
  name: string;
}

export interface AssignedGroup {
  id: number;
  name: string;
}

interface ApiAssignedSubjects {
  subject_teachers: { id: number; subject_id: number; subject: { id: number; name: string } }[];
}

interface ApiAssignedGroups {
  group_teachers: { group_id: number; group: { id: number; name: string } }[];
}

/**
 * У пользователя без карточки преподавателя оба эндпоинта отвечают 404
 * («Teacher not found for this user»). Это не сбой: закреплений просто нет, и
 * показывать вместо пустого списка экран ошибки было бы неверно.
 */
async function assignedOrEmpty<T>(request: Promise<T[]>): Promise<T[]> {
  try {
    return await request;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

export function getMySubjects(userId: number): Promise<AssignedSubject[]> {
  return assignedOrEmpty(
    api
      .get<ApiAssignedSubjects>(`/teacher/assigned_subjects/by-user/${userId}`)
      .then((data) =>
        (data.subject_teachers ?? []).map((st) => ({ id: st.subject.id, name: st.subject.name })),
      ),
  );
}

export function getMyGroups(userId: number): Promise<AssignedGroup[]> {
  return assignedOrEmpty(
    api
      .get<ApiAssignedGroups>(`/teacher/assigned_groups/by-user/${userId}`)
      .then((data) => (data.group_teachers ?? []).map((gt) => ({ id: gt.group.id, name: gt.group.name }))),
  );
}

export interface ActiveQuiz {
  id: number;
  title: string;
  duration: number;
  subject_id: number | null;
  group_id: number | null;
}

/**
 * Тесты со снятым флагом «черновик». Список уже урезан сервером под владельца
 * токена: преподаватель видит свои, студент — тесты своей группы.
 */
export async function getActiveQuizzes(): Promise<ActiveQuiz[]> {
  return getAll<ActiveQuiz>('/quiz/active', 'quizzes');
}

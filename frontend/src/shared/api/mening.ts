import { getAll } from './envelope';
import { api } from './http';

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

export async function getMySubjects(userId: number): Promise<AssignedSubject[]> {
  const data = await api.get<ApiAssignedSubjects>(`/teacher/assigned_subjects/by-user/${userId}`);
  return (data.subject_teachers ?? []).map((st) => ({ id: st.subject.id, name: st.subject.name }));
}

export async function getMyGroups(userId: number): Promise<AssignedGroup[]> {
  const data = await api.get<ApiAssignedGroups>(`/teacher/assigned_groups/by-user/${userId}`);
  return (data.group_teachers ?? []).map((gt) => ({ id: gt.group.id, name: gt.group.name }));
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

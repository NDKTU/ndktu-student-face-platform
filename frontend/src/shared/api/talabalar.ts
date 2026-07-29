import type {
  StudentDraft,
  StudentProfile,
  StudentRow,
  StudentSensitive,
} from '@/entities/student/model/types';
import { api } from './http';

const BASE = '/foydalanuvchilar/talabalar';

/**
 * Реестр студентов целиком: 1164 плоские строки. Поиск и фильтры остаются на
 * экране — постранично их пришлось бы возвращать вместе с новым UI, которого
 * в таблице нет. Персональных данных здесь нет.
 */
export const getStudents = () => api.get<StudentRow[]>(BASE);

export const createStudent = (draft: StudentDraft) => api.post<StudentRow>(BASE, draft);

/** Вкладка «Umumiy» карточки студента. */
export const getStudentProfile = (id: number) => api.get<StudentProfile>(`${BASE}/${id}`);

/** Персональные данные. Отдаются super_admin'у и admin'у, иначе 403. */
export const getStudentSensitive = (id: number) =>
  api.get<StudentSensitive>(`${BASE}/${id}/maxfiy`);

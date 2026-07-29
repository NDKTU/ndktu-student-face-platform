import type {
  QuizQuestion,
  QuizResult,
  TestDetailData,
  TestMeta,
  TestStatus,
} from '@/entities/test/model/types';
import { api } from './http';

/**
 * Граница до бэкенда для тестов. Балл считает сервер: `/start` отдаёт вопросы
 * без правильных ответов, `/submit` возвращает готовый результат.
 */

export interface TestCreatePayload {
  fan: string;
  guruh: string;
  savollar: number;
  davomiylik: number;
  oqituvchi: string;
  /** id предмета преподавателя (ts1..ts4) — по нему берутся вопросы из банка. */
  subjectId?: string;
}

export interface TestUpdatePayload {
  name?: string;
  guruh?: string;
  davomiylik?: number;
  holati?: TestStatus;
}

export interface QuizStartResponse {
  test: TestMeta;
  questions: QuizQuestion[];
}

export const getTests = () => api.get<TestMeta[]>('/testlar');
export const createTest = (body: TestCreatePayload) => api.post<TestMeta>('/testlar', body);
export const updateTest = (id: number, body: TestUpdatePayload) =>
  api.patch<TestMeta>(`/testlar/${id}`, body);
export const deleteTest = (id: number) => api.delete(`/testlar/${id}`);

export const getTestDetail = (id: number) => api.get<TestDetailData>(`/testlar/${id}/detail`);

export const startTest = (id: number, pin: string) =>
  api.post<QuizStartResponse>(`/testlar/${id}/start`, { pin });

export const submitTest = (id: number, answers: Record<number, number>, spent: number) =>
  api.post<QuizResult>(`/testlar/${id}/submit`, { answers, spent });

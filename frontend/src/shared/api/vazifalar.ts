import type {
  SubmissionFile,
  TaskDetail,
  TaskRow,
  TaskSubmissionRow,
} from '@/entities/task/model/types';
import { api } from './http';

/**
 * Граница до бэкенда для заданий. Список приходит без сдач (их больше тысячи);
 * сдачи — только при открытии задания.
 */

export interface SubmitPayload {
  text: string;
  links: string[];
  files: SubmissionFile[];
}

/**
 * Список уже урезан сервером под владельца токена: преподаватель получает
 * свои задания, студент — задания своей группы вместе со своей сдачей в mySub.
 */
export const getTasks = () => api.get<TaskRow[]>('/vazifalar');

export const getTask = (id: number) => api.get<TaskDetail>(`/vazifalar/${id}`);

export const gradeSubmission = (submissionId: number, ball: number, feedback: string) =>
  api.patch<TaskSubmissionRow>(`/vazifalar/submissions/${submissionId}`, { ball, feedback });

export const submitWork = (taskId: number, body: SubmitPayload) =>
  api.post<TaskSubmissionRow>(`/vazifalar/${taskId}/submit`, body);

/** Работа, ждущая проверки, вместе с контекстом задания. */
export interface PendingSubmission {
  id: number;
  taskId: number;
  fish: string;
  initials: string;
  fan: string;
  guruh: string;
  title: string;
}

/** Плоский список работ на проверке — для домашней страницы преподавателя. */
export const getPending = (limit = 20) =>
  api.get<PendingSubmission[]>(`/vazifalar/pending?limit=${limit}`);

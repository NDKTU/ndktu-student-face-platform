import type { Question, OptionLetter } from '@/entities/question/model/types';
import { api } from './http';

/**
 * Граница до бэкенда для банка вопросов. Ответы уже в форме Question.
 * Флаги correct у вариантов и has_image считает сервер, поэтому в запросе шлём
 * только текст вариантов, картинку и букву правильного ответа.
 */

export interface QuestionOptionPayload {
  letter: OptionLetter;
  text: string;
  image?: boolean;
}

export interface QuestionCreatePayload {
  subjectId: string;
  text: string;
  correct: OptionLetter;
  options: QuestionOptionPayload[];
}

export interface QuestionUpdatePayload {
  text?: string;
  correct?: OptionLetter;
  options?: QuestionOptionPayload[];
}

export const getQuestions = () => api.get<Question[]>('/savollar');
export const createQuestion = (body: QuestionCreatePayload) =>
  api.post<Question>('/savollar', body);
export const updateQuestion = (id: number, body: QuestionUpdatePayload) =>
  api.patch<Question>(`/savollar/${id}`, body);
export const deleteQuestion = (id: number) => api.delete(`/savollar/${id}`);

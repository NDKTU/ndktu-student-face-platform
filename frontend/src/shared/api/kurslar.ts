import type { AdminCourse, Course, Lesson, Topic } from '@/entities/course/model/types';
import { api } from './http';

/**
 * Граница до бэкенда для курсов. Нумерация тем/уроков и порядок считаются
 * на сервере, поэтому после мутации курс перечитывается целиком.
 */

export interface TopicPayload {
  name?: string;
  /** 1-based позиция; пусто — в конец (или «не двигать» при правке). */
  order?: string;
}

export interface LessonPayload {
  title?: string;
  videoType?: Lesson['videoType'];
  dur?: string;
  desc?: string;
  hasUy?: boolean;
  uyText?: string;
  uyDeadline?: string;
}

export const getCourses = () => api.get<AdminCourse[]>('/kurslar');
export const getCourse = (id: number) => api.get<Course>(`/kurslar/${id}`);

export const createTopic = (courseId: number, body: TopicPayload) =>
  api.post<Topic>(`/kurslar/${courseId}/topics`, body);
export const updateTopic = (topicId: number, body: TopicPayload) =>
  api.patch<Topic>(`/kurslar/topics/${topicId}`, body);
export const deleteTopic = (topicId: number) => api.delete(`/kurslar/topics/${topicId}`);

export const createLesson = (topicId: number, body: LessonPayload) =>
  api.post<Lesson>(`/kurslar/topics/${topicId}/lessons`, body);
export const updateLesson = (lessonId: number, body: LessonPayload) =>
  api.patch<Lesson>(`/kurslar/lessons/${lessonId}`, body);
export const deleteLesson = (lessonId: number) => api.delete(`/kurslar/lessons/${lessonId}`);

/** Новый порядок целиком: либо темы курса, либо уроки одной темы. */
export const reorderCourse = (
  courseId: number,
  body: { topics: number[] } | { topicId: number; lessons: number[] },
) => api.patch<Course>(`/kurslar/${courseId}/reorder`, body);

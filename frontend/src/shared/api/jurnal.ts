import { initials } from '@/shared/lib/initials';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для журнала занятий.
 *
 * Занятие (`Lesson`) — это не материал курса: у него есть группа, дата и
 * посещаемость. Содержимое курса живёт в /course-content, а здесь — кто был на
 * занятии и с какой оценкой.
 */

export type Attendance = 'present' | 'absent' | 'late';
export type LessonType = 'lecture' | 'seminar' | 'independent' | 'lab';

export interface JournalLesson {
  id: number;
  courseId: number;
  groupId: number;
  groupName: string;
  subjectName: string;
  type: LessonType | null;
  topic: string;
  date: string;
  description: string;
}

export interface JournalRow {
  userId: number;
  fish: string;
  initials: string;
  /** null — отметки ещё нет: строка пришла из состава группы. */
  attendance: Attendance | null;
  grade: number | null;
  notes: string;
}

interface ApiLesson {
  id: number;
  course_id: number;
  group_id: number;
  lesson_type: string | null;
  topic: string;
  date: string;
  description: string | null;
  group: { id: number; name: string } | null;
  subject_teacher: { subject: { id: number; name: string } | null } | null;
}

interface ApiResult {
  id: number | null;
  lesson_id: number;
  user_id: number;
  attendance: string | null;
  grade: number | null;
  notes: string | null;
  user: { id: number; username: string; full_name: string | null } | null;
}

/** «2026-09-01» → «01.09.2026». */
function toDate(iso: string): string {
  const parts = iso?.split('-');
  return parts?.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : (iso ?? '');
}

function toLesson(lesson: ApiLesson): JournalLesson {
  return {
    id: lesson.id,
    courseId: lesson.course_id,
    groupId: lesson.group_id,
    groupName: lesson.group?.name ?? '',
    subjectName: lesson.subject_teacher?.subject?.name ?? '',
    type: (lesson.lesson_type as LessonType) ?? null,
    topic: lesson.topic,
    date: toDate(lesson.date),
    description: lesson.description ?? '',
  };
}

function toRow(result: ApiResult): JournalRow {
  const fish = result.user?.full_name ?? result.user?.username ?? '';
  return {
    userId: result.user_id,
    fish,
    initials: initials(fish),
    attendance: (result.attendance as Attendance) ?? null,
    grade: result.grade,
    notes: result.notes ?? '',
  };
}

/** Занятия курса. Список уже урезан сервером под владельца токена. */
export async function getLessons(courseId: number): Promise<JournalLesson[]> {
  const lessons = await getAll<ApiLesson>('/lesson/', 'lessons', { course_id: courseId });
  return lessons.map(toLesson);
}

export interface JournalLessonPayload {
  courseId: number;
  groupId: number;
  topic: string;
  /** ISO-дата: бэкенд принимает date, а не строку в местном формате. */
  date: string;
  type?: LessonType;
  description?: string;
}

export async function createLesson(body: JournalLessonPayload): Promise<JournalLesson> {
  const created = await api.post<ApiLesson>('/lesson/', {
    course_id: body.courseId,
    group_id: body.groupId,
    topic: body.topic,
    date: body.date,
    lesson_type: body.type ?? null,
    description: body.description ?? null,
    // subject_teacher_id бэкенд выведет сам из курса, если его не передать.
  });
  return toLesson(created);
}

export const deleteLesson = (lessonId: number) => api.delete(`/lesson/${lessonId}`);

/**
 * Журнал занятия: строка на каждого студента группы, даже если отметки ещё нет.
 * Студент получает только свою строку — так решает сервер.
 */
export async function getJournal(lessonId: number): Promise<JournalRow[]> {
  const data = await api.get<{ results: ApiResult[] }>(`/lesson/${lessonId}/results`);
  return data.results.map(toRow);
}

/**
 * Сохраняет журнал целиком: эндпоинт делает upsert по паре (занятие, студент),
 * поэтому отправляются все заполненные строки, а не только изменённые.
 * Строки без отметки посещаемости пропускаем — бэкенд её требует.
 */
export async function saveJournal(lessonId: number, rows: JournalRow[]): Promise<JournalRow[]> {
  const data = await api.put<{ results: ApiResult[] }>(`/lesson/${lessonId}/results`, {
    items: rows
      .filter((row) => row.attendance !== null)
      .map((row) => ({
        user_id: row.userId,
        attendance: row.attendance,
        grade: row.grade,
        notes: row.notes || null,
      })),
  });
  return data.results.map(toRow);
}

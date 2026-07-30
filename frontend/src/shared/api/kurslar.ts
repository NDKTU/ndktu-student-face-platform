import type { AdminCourse, Course, Lesson, Resource, Topic } from '@/entities/course/model/types';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для курсов.
 *
 * Содержимое курса живёт отдельно от карточки: `/course/` отдаёт кто и что
 * ведёт, `/course-content/{id}` — разделы с материалами. Это две разные
 * сущности и на сервере: «мавзу» с видеоуроками принадлежит курсу целиком, а
 * `Lesson` там — занятие по расписанию с журналом посещаемости.
 */

interface ApiCourse {
  id: number;
  name: string;
  semester_number: number | null;
  topic_count: number;
  material_count: number;
  subject: { id: number; name: string } | null;
  teacher: { id: number; username: string; full_name: string | null } | null;
  faculty: { id: number; name: string } | null;
  kafedra: { id: number; name: string } | null;
  groups: { id: number; name: string }[];
}

interface ApiMaterial {
  id: number;
  topic_id: number;
  title: string;
  description: string | null;
  video_type: 'upload' | 'youtube' | null;
  video_url: string | null;
  poster_url: string | null;
  duration_label: string | null;
  attachments: { name: string; url: string; size: number | null }[];
  position: number;
  completed: boolean;
}

interface ApiTopic {
  id: number;
  course_id: number;
  title: string;
  position: number;
  materials: ApiMaterial[];
}

interface ApiContent {
  course_id: number;
  topics: ApiTopic[];
  total_materials: number;
  completed_materials: number;
}

/** «1024» байт → «1 KB»: размер вложения показывают, а не считают. */
function toSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toResource(a: ApiMaterial['attachments'][number]): Resource {
  return { name: a.name, url: a.url, size: toSize(a.size) };
}

function toLesson(material: ApiMaterial, index: number): Lesson {
  return {
    id: material.id,
    no: index + 1,
    title: material.title,
    videoType: material.video_type ?? 'upload',
    videoSrc: material.video_url ?? '',
    poster: material.poster_url ?? '',
    dur: material.duration_label ?? '',
    done: material.completed,
    desc: material.description ?? '',
    resurslar: material.attachments.map(toResource),
  };
}

function toTopic(topic: ApiTopic, index: number): Topic {
  return {
    id: topic.id,
    no: index + 1,
    title: topic.title,
    darslar: topic.materials.map(toLesson),
  };
}

function toAdminCourse(course: ApiCourse): AdminCourse {
  return {
    id: course.id,
    fan: course.subject?.name ?? course.name,
    guruh: course.groups.map((g) => g.name).join(', '),
    oqituvchi: course.teacher?.full_name ?? course.teacher?.username ?? '',
    fac: course.faculty?.name ?? '',
    kaf: course.kafedra?.name ?? '',
    sem: course.semester_number ?? 1,
    mavzular: course.topic_count,
    darslar: course.material_count,
  };
}

export interface TopicPayload {
  name?: string;
  /** 1-based позиция; пусто — оставить как есть. */
  order?: string;
}

export interface LessonPayload {
  title?: string;
  videoType?: Lesson['videoType'];
  videoSrc?: string;
  poster?: string;
  dur?: string;
  desc?: string;
}

/** Список курсов уже урезан сервером: не-администратор видит только свои. */
export async function getCourses(): Promise<AdminCourse[]> {
  const courses = await getAll<ApiCourse>('/course/', 'courses');
  return courses.map(toAdminCourse);
}

/** Курс вместе с содержимым: карточка и разделы — два запроса. */
export async function getCourse(id: number): Promise<Course> {
  const [course, content] = await Promise.all([
    api.get<ApiCourse>(`/course/${id}`),
    api.get<ApiContent>(`/course-content/${id}`),
  ]);

  return {
    fan: course.subject?.name ?? course.name,
    oqituvchi: course.teacher?.full_name ?? course.teacher?.username ?? '',
    semestr: course.semester_number ?? 1,
    mavzular: content.topics.map(toTopic),
    total: content.total_materials,
    doneCount: content.completed_materials,
  };
}

// --- Разделы ---------------------------------------------------------------

export const createTopic = (courseId: number, body: TopicPayload) =>
  api.post<{ id: number }>(`/course-content/${courseId}/topics`, { title: body.name });

export const updateTopic = (topicId: number, body: TopicPayload) =>
  api.put<{ id: number }>(`/course-content/topics/${topicId}`, {
    ...(body.name !== undefined && { title: body.name }),
    ...(body.order ? { position: Number(body.order) } : {}),
  });

export const deleteTopic = (topicId: number) => api.delete(`/course-content/topics/${topicId}`);

// --- Материалы -------------------------------------------------------------

function toMaterialBody(body: LessonPayload) {
  return {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.videoType !== undefined && { video_type: body.videoType }),
    ...(body.videoSrc !== undefined && { video_url: body.videoSrc }),
    ...(body.poster !== undefined && { poster_url: body.poster }),
    ...(body.dur !== undefined && { duration_label: body.dur }),
    ...(body.desc !== undefined && { description: body.desc }),
  };
}

export const createLesson = (topicId: number, body: LessonPayload) =>
  api.post<{ id: number }>(`/course-content/topics/${topicId}/materials`, {
    title: body.title,
    ...toMaterialBody(body),
  });

export const updateLesson = (lessonId: number, body: LessonPayload) =>
  api.put<{ id: number }>(`/course-content/materials/${lessonId}`, toMaterialBody(body));

export const deleteLesson = (lessonId: number) =>
  api.delete(`/course-content/materials/${lessonId}`);

// --- Порядок ---------------------------------------------------------------

/**
 * Порядок задаётся списком id целиком. Раздельные эндпоинты, потому что
 * перестановка разделов и перестановка материалов проверяются по-разному:
 * первая — что все из одного курса, вторая — что все из одного раздела.
 */
export const reorderTopics = (ids: number[]) =>
  api.put<{ message: string }>('/course-content/topics/reorder', { ids });

export const reorderMaterials = (ids: number[]) =>
  api.put<{ message: string }>('/course-content/materials/reorder', { ids });

/** Студент отмечает материал пройденным. Пишется только его собственная отметка. */
export const setLessonCompleted = (lessonId: number, completed: boolean) =>
  api.put<ApiMaterial>(
    `/course-content/materials/${lessonId}/completed?completed=${completed}`,
    {},
  );

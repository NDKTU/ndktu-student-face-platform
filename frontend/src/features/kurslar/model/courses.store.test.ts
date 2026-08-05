import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCourse, Course } from '@/entities/course/model/types';
import { useCoursesStore } from './courses.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком. Список должен
// быть полным: пропущенный экспорт станет undefined в момент вызова.
vi.mock('@/shared/api/kurslar', () => ({
  getCourses: vi.fn(),
  getCourse: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  uploadCourseFile: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  deleteTopic: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderTopics: vi.fn(),
  reorderMaterials: vi.fn(),
  setLessonCompleted: vi.fn(),
}));

vi.mock('@/shared/api/vazifalar', () => ({
  getMaterialHomework: vi.fn(),
  createHomework: vi.fn(),
  updateHomework: vi.fn(),
  deleteHomework: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/kurslar'));
const tasksApi = vi.mocked(await import('@/shared/api/vazifalar'));

const store = () => useCoursesStore.getState();

function meta(id: number): AdminCourse {
  return {
    id,
    fan: 'Oliy matematika',
    guruh: 'KI-24-01',
    guruhlar: [{ id: 11, name: 'KI-24-01' }],
    oqituvchi: 'Bozorov D.',
    fac: 'Konchilik fakulteti',
    kaf: 'Konchilik kafedrasi',
    sem: 1,
    mavzular: 1,
    darslar: 2,
    subjectId: 5,
    teacherId: 7,
    facultyId: 3,
    kafedraId: 4,
    groupIds: [11],
    semNumber: 1,
  };
}

const draft = {
  subjectId: 5,
  teacherId: 7,
  groupId: 11,
  facultyId: 3,
  kafedraId: 4,
};

/** Курс с одной темой и заданными уроками. */
function course(lessonIds: number[] = [1, 2]): Course {
  return {
    fan: 'Oliy matematika',
    oqituvchi: 'Bozorov D.',
    semestr: 1,
    total: lessonIds.length,
    doneCount: 0,
    mavzular: [
      {
        id: 1,
        no: 1,
        title: 'Mavzu 1',
        darslar: lessonIds.map((id, i) => ({
          id,
          no: i + 1,
          title: `Dars ${i + 1}`,
          videoType: 'upload' as const,
          videoSrc: '',
          poster: '',
          dur: '15 daq',
          done: false,
          desc: '',
          resurslar: [],
          uy: null,
        })),
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useCoursesStore.setState({ list: [], byId: {}, status: 'idle', error: null });
});

describe('courses store — загрузка', () => {
  it('load() кладёт список и переводит статус в ready', async () => {
    api.getCourses.mockResolvedValueOnce([meta(1), meta(2)]);

    await store().load();

    expect(store().list).toHaveLength(2);
    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getCourses.mockRejectedValueOnce(new Error('Network error'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
  });

  it('loadCourse кладёт дерево курса в byId', async () => {
    api.getCourse.mockResolvedValueOnce(course());

    await store().loadCourse(1);

    expect(store().byId[1]!.mavzular).toHaveLength(1);
  });
});

describe('courses store — мутации', () => {
  beforeEach(() => {
    useCoursesStore.setState({ list: [meta(1)], byId: { 1: course() }, status: 'ready' });
  });

  it('addTopic шлёт черновик и перечитывает курс со счётчиками', async () => {
    api.createTopic.mockResolvedValueOnce({ id: 2 });
    // Номера и порядок пересчитывает сервер — стор берёт его ответ как есть.
    api.getCourse.mockResolvedValueOnce(course([1, 2, 3]));

    await store().addTopic(1, { name: 'Yangi', order: '2' });

    expect(api.createTopic).toHaveBeenCalledWith(1, { name: 'Yangi', order: '2' });
    expect(store().list[0]!.darslar).toBe(3);
  });

  it('removeLesson удаляет по id урока и обновляет курс', async () => {
    api.deleteLesson.mockResolvedValueOnce(undefined);
    api.getCourse.mockResolvedValueOnce(course([2]));

    await store().removeLesson(1, 1, 1);

    expect(api.deleteLesson).toHaveBeenCalledWith(1);
    expect(store().byId[1]!.mavzular[0]!.darslar).toHaveLength(1);
    expect(store().list[0]!.darslar).toBe(1);
  });

  it('reorderLessons шлёт готовый порядок, а не пару from/to', async () => {
    api.reorderMaterials.mockResolvedValueOnce({ message: 'Reordered' });
    api.getCourse.mockResolvedValueOnce(course([2, 1]));

    await store().reorderLessons(1, 1, 1, 2);

    // Эндпоинт принимает список id целиком: порядок считает клиент, потому что
    // только он знает, куда именно перетащили.
    expect(api.reorderMaterials).toHaveBeenCalledWith([2, 1]);
    expect(store().byId[1]!.mavzular[0]!.darslar.map((d) => d.id)).toEqual([2, 1]);
  });

  it('перетаскивание на себя не дёргает сервер', async () => {
    await store().reorderTopics(1, 1, 1);
    expect(api.reorderTopics).not.toHaveBeenCalled();
  });

  it('сбой сервера пробрасывается наружу', async () => {
    api.createTopic.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(store().addTopic(1, { name: 'X', order: '' })).rejects.toThrow('HTTP 500');
  });

  it('addLesson возвращает id материала — к нему привязывается домашка', async () => {
    api.createLesson.mockResolvedValueOnce({ id: 42 });
    api.getCourse.mockResolvedValueOnce(course([1, 2, 42]));

    const id = await store().addLesson(1, 1, {
      title: 'Dars',
      videoType: 'youtube',
      videoSrc: 'https://youtu.be/x',
      dur: '15',
      desc: '',
      attachments: [],
      uy: null,
    });

    expect(id).toBe(42);
  });

  it('saveHomework без черновика удаляет прежнее задание', async () => {
    tasksApi.deleteHomework.mockResolvedValueOnce(undefined);

    await store().saveHomework(1, 42, null, 9);

    expect(tasksApi.deleteHomework).toHaveBeenCalledWith(9);
    expect(tasksApi.createHomework).not.toHaveBeenCalled();
  });
});

describe('courses store — карточка курса', () => {
  it('addCourse ставит новый курс в начало списка', async () => {
    useCoursesStore.setState({ list: [meta(1)], status: 'ready' });
    api.createCourse.mockResolvedValueOnce(meta(9));

    await store().addCourse('Oliy matematika · KI-24-01', draft);

    expect(store().list.map((c) => c.id)).toEqual([9, 1]);
  });

  it('editCourse с keepGroups не шлёт group_ids, чтобы не отвязать лишние группы', async () => {
    useCoursesStore.setState({ list: [meta(1)], byId: { 1: course() }, status: 'ready' });
    api.updateCourse.mockResolvedValueOnce(meta(1));

    await store().editCourse(1, 'Nomi', draft, true);

    expect(api.updateCourse.mock.calls[0]![1]).not.toHaveProperty('groupIds');
    // Дерево сбрасывается: карточка изменилась, содержимое перечитается заново.
    expect(store().byId[1]).toBeUndefined();
  });

  it('removeCourse убирает курс и из списка, и из byId', async () => {
    useCoursesStore.setState({ list: [meta(1), meta(2)], byId: { 1: course() }, status: 'ready' });
    api.deleteCourse.mockResolvedValueOnce(undefined);

    await store().removeCourse(1);

    expect(store().list.map((c) => c.id)).toEqual([2]);
    expect(store().byId[1]).toBeUndefined();
  });
});

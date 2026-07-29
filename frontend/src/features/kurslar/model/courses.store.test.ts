import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCourse, Course } from '@/entities/course/model/types';
import { useCoursesStore } from './courses.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/kurslar', () => ({
  getCourses: vi.fn(),
  getCourse: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  deleteTopic: vi.fn(),
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderCourse: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/kurslar'));

const store = () => useCoursesStore.getState();

function meta(id: number): AdminCourse {
  return {
    id,
    fan: 'Oliy matematika',
    guruh: 'KI-24-01',
    oqituvchi: 'Bozorov D.',
    fac: 'Konchilik fakulteti',
    kaf: 'Konchilik kafedrasi',
    sem: 1,
    mavzular: 1,
    darslar: 2,
  };
}

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
    api.createTopic.mockResolvedValueOnce({ id: 2, no: 2, title: 'Yangi', darslar: [] });
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
    api.reorderCourse.mockResolvedValueOnce(course([2, 1]));

    await store().reorderLessons(1, 1, 1, 2);

    expect(api.reorderCourse).toHaveBeenCalledWith(1, {
      topicId: 1,
      lessons: [2, 1],
    });
    expect(store().byId[1]!.mavzular[0]!.darslar.map((d) => d.id)).toEqual([2, 1]);
  });

  it('перетаскивание на себя не дёргает сервер', async () => {
    await store().reorderTopics(1, 1, 1);
    expect(api.reorderCourse).not.toHaveBeenCalled();
  });

  it('сбой сервера пробрасывается наружу', async () => {
    api.createTopic.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(store().addTopic(1, { name: 'X', order: '' })).rejects.toThrow('HTTP 500');
  });
});

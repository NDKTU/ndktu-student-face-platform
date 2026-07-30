import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalLesson, JournalRow } from '@/shared/api/jurnal';
import { useJurnalStore } from './jurnal.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/jurnal', () => ({
  getLessons: vi.fn(),
  createLesson: vi.fn(),
  deleteLesson: vi.fn(),
  getJournal: vi.fn(),
  saveJournal: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/jurnal'));

const store = () => useJurnalStore.getState();

function lesson(id: number): JournalLesson {
  return {
    id,
    courseId: 7,
    groupId: 8,
    groupName: 'JRN-25-01',
    subjectName: 'Oliy matematika',
    type: 'lecture',
    topic: `Dars ${id}`,
    date: '30.07.2026',
    description: '',
  };
}

/** Строка ростера: отметки ещё нет, поэтому attendance = null. */
function row(userId: number): JournalRow {
  return { userId, fish: `Talaba ${userId}`, initials: 'T', attendance: null, grade: null, notes: '' };
}

beforeEach(() => {
  vi.clearAllMocks();
  useJurnalStore.setState({
    lessons: [],
    rows: [],
    openLessonId: null,
    status: 'idle',
    error: null,
    dirty: false,
  });
});

describe('jurnal.store', () => {
  it('загружает занятия курса', async () => {
    api.getLessons.mockResolvedValue([lesson(1), lesson(2)]);

    await store().loadLessons(7);

    expect(api.getLessons).toHaveBeenCalledWith(7);
    expect(store().status).toBe('ready');
    expect(store().lessons.map((l) => l.id)).toEqual([1, 2]);
  });

  it('сбой загрузки не оставляет стор в состоянии loading', async () => {
    api.getLessons.mockRejectedValue(new Error('tarmoq xatosi'));

    await store().loadLessons(7);

    expect(store().status).toBe('error');
    expect(store().error).toBe('tarmoq xatosi');
  });

  it('открывает журнал занятия и сбрасывает прежние строки', async () => {
    useJurnalStore.setState({ rows: [row(99)], openLessonId: 1, dirty: true });
    api.getJournal.mockResolvedValue([row(20), row(21)]);

    await store().openLesson(2);

    expect(api.getJournal).toHaveBeenCalledWith(2);
    expect(store().openLessonId).toBe(2);
    expect(store().rows.map((r) => r.userId)).toEqual([20, 21]);
    expect(store().dirty).toBe(false);
  });

  it('правки копятся локально и поднимают dirty', () => {
    useJurnalStore.setState({ openLessonId: 1, rows: [row(20), row(21)] });

    store().setAttendance(20, 'present');
    store().setGrade(20, 5);
    store().setNotes(21, 'kechikdi');

    expect(store().dirty).toBe(true);
    expect(store().rows[0]).toMatchObject({ attendance: 'present', grade: 5 });
    expect(store().rows[1]).toMatchObject({ attendance: null, notes: 'kechikdi' });
    // Ни одного запроса: отмечать по одному студенту — запрос на каждый щелчок.
    expect(api.saveJournal).not.toHaveBeenCalled();
  });

  it('save отправляет весь журнал и снимает dirty', async () => {
    const marked: JournalRow = { ...row(20), attendance: 'present', grade: 5 };
    useJurnalStore.setState({ openLessonId: 3, rows: [marked], dirty: true });
    api.saveJournal.mockResolvedValue([marked]);

    await store().save();

    expect(api.saveJournal).toHaveBeenCalledWith(3, [marked]);
    expect(store().dirty).toBe(false);
  });

  it('save без открытого занятия ничего не отправляет', async () => {
    await store().save();

    expect(api.saveJournal).not.toHaveBeenCalled();
  });

  it('удаление открытого занятия закрывает журнал', async () => {
    useJurnalStore.setState({
      lessons: [lesson(1), lesson(2)],
      openLessonId: 2,
      rows: [row(20)],
      dirty: true,
    });
    api.deleteLesson.mockResolvedValue(undefined);

    await store().removeLesson(2);

    expect(store().lessons.map((l) => l.id)).toEqual([1]);
    expect(store().openLessonId).toBeNull();
    expect(store().rows).toEqual([]);
    expect(store().dirty).toBe(false);
  });

  it('удаление другого занятия открытый журнал не трогает', async () => {
    useJurnalStore.setState({
      lessons: [lesson(1), lesson(2)],
      openLessonId: 2,
      rows: [row(20)],
    });
    api.deleteLesson.mockResolvedValue(undefined);

    await store().removeLesson(1);

    expect(store().openLessonId).toBe(2);
    expect(store().rows).toHaveLength(1);
  });

  it('новое занятие встаёт в начало списка', async () => {
    useJurnalStore.setState({ lessons: [lesson(1)] });
    api.createLesson.mockResolvedValue(lesson(5));

    await store().addLesson({ courseId: 7, groupId: 8, topic: 'Dars 5', date: '2026-08-05' });

    expect(store().lessons.map((l) => l.id)).toEqual([5, 1]);
  });
});

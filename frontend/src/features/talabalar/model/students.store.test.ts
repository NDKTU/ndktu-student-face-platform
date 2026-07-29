import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentRow } from '@/entities/student/model/types';
import { useStudentsStore } from './students.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/talabalar', () => ({
  getStudents: vi.fn(),
  getStudentProfile: vi.fn(),
  getStudentSensitive: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/talabalar'));

const store = () => useStudentsStore.getState();

function row(id: number, over: Partial<StudentRow> = {}): StudentRow {
  return {
    id,
    fish: 'Ochilova Sitora Muhammadali qizi',
    login: 'ochilova.sitora322',
    gender: 'f',
    sid: '2024015322',
    guruh: 'DI-24-01',
    fakultet: 'Konchilik fakulteti',
    mutaxassislik: 'Dasturiy injiniring',
    kurs: 2,
    shakl: 'Kunduzgi',
    holati: 'Faol',
    tone: 'ok',
    initials: 'OS',
    manba: "Qo'lda",
    ...over,
  };
}


beforeEach(() => {
  vi.clearAllMocks();
  useStudentsStore.setState({ students: [], status: 'idle', error: null, selectedId: null });
});

describe('students store', () => {
  it('load() кладёт реестр — фильтры остаются на экране', async () => {
    api.getStudents.mockResolvedValueOnce([row(1), row(2)]);

    await store().load();

    expect(api.getStudents).toHaveBeenCalledWith();
    expect(store().students).toHaveLength(2);
    expect(store().status).toBe('ready');
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getStudents.mockRejectedValueOnce(new Error('HTTP 403'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('HTTP 403');
  });


});

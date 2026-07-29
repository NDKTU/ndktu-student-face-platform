import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentDraft, StudentRow } from '@/entities/student/model/types';
import { useStudentsStore } from './students.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/talabalar', () => ({
  getStudents: vi.fn(),
  createStudent: vi.fn(),
  getStudentProfile: vi.fn(),
  getStudentSensitive: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/talabalar'));

const store = () => useStudentsStore.getState();

function row(id: number, over: Partial<StudentRow> = {}): StudentRow {
  return {
    id,
    fish: 'Ochilova Sitora Muhammadali qizi',
    email: 'ochilova.sitora322@student.ndktu.uz',
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

const DRAFT: StudentDraft = {
  familiya: 'Testov',
  ism: 'Alisher',
  otasi: '',
  jinsi: 'Erkak',
  birth: '',
  sid: '2026099999',
  fakultet: 'Konchilik fakulteti',
  mutaxassislik: 'Dasturiy injiniring',
  guruh: 'DI-24-01',
  kurs: '2',
  semestr: '',
  shakl: 'Kunduzgi',
  eduType: 'Bakalavr',
  lang: "O'zbek",
  pay: 'Kontrakt',
  holati: 'Faol',
  jshshir: '',
  manzil: '',
  email: '',
  phone: '',
};

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

  it('новая запись встаёт в начало списка и приезжает с контекстом сервера', async () => {
    useStudentsStore.setState({ students: [row(1)], status: 'ready' });
    api.createStudent.mockResolvedValueOnce(
      row(99, { fish: 'Testov Alisher', mutaxassislik: 'Dasturiy injiniring' }),
    );

    await store().add(DRAFT);

    expect(store().students).toHaveLength(2);
    expect(store().students[0]!.id).toBe(99);
    // Факультет и специальность подставил сервер по группе, а не форма.
    expect(store().students[0]!.mutaxassislik).toBe('Dasturiy injiniring');
  });

  it('сбой сохранения пробрасывается наружу — экран покажет тост', async () => {
    api.createStudent.mockRejectedValueOnce(new Error('guruhi topilmadi'));

    await expect(store().add(DRAFT)).rejects.toThrow('guruhi topilmadi');
  });
});

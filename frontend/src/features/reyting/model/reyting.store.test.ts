import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '@/shared/api/envelope';
import type { FacultyRank, TeacherRank } from '@/shared/api/reyting';
import { PAGE_SIZE, useReytingStore } from './reyting.store';

vi.mock('@/shared/api/reyting', () => ({
  getTeacherRanking: vi.fn(),
  getFacultyRanking: vi.fn(),
  getKafedraRanking: vi.fn(),
  getFacultyOptions: vi.fn(),
  getKafedraOptions: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/reyting'));

const store = () => useReytingStore.getState();

function teacher(rank: number): TeacherRank {
  return {
    rank,
    teacherId: rank,
    fish: `O'qituvchi ${rank}`,
    kafedra: 'Konchilik kafedrasi',
    fakultet: 'Konchilik fakulteti',
    talabalar: 30,
    ortacha: 4.5,
    reyting: 4.42,
  };
}

const paged = <T,>(items: T[], total = items.length): Paged<T> => ({
  total,
  page: 1,
  limit: PAGE_SIZE,
  items,
});

const emptySlice = { items: [], total: 0, page: 1, status: 'idle' as const, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  useReytingStore.setState({
    tab: 'oqituvchilar',
    oqituvchilar: emptySlice,
    fakultetlar: emptySlice,
    kafedralar: emptySlice,
    filters: { facultyId: null, kafedraId: null, search: '' },
  });
});

describe('reyting.store', () => {
  it('грузит рейтинг преподавателей', async () => {
    api.getTeacherRanking.mockResolvedValue(paged([teacher(1), teacher(2)], 42));

    await store().load('oqituvchilar');

    expect(store().oqituvchilar).toMatchObject({ status: 'ready', total: 42 });
    expect(store().oqituvchilar.items).toHaveLength(2);
  });

  it('сбой одной вкладки не трогает остальные', async () => {
    api.getTeacherRanking.mockRejectedValue(new Error('500'));

    await store().load('oqituvchilar');

    expect(store().oqituvchilar).toMatchObject({ status: 'error', error: '500' });
    expect(store().fakultetlar.status).toBe('idle');
  });

  it('вкладки грузятся своими запросами', async () => {
    const faculty: FacultyRank = {
      rank: 1,
      facultyId: 1,
      fakultet: 'Konchilik fakulteti',
      kafedralar: 4,
      talabalar: 300,
      ortacha: 4.3,
      reyting: 4.28,
    };
    api.getFacultyRanking.mockResolvedValue(paged([faculty]));

    await store().load('fakultetlar');

    expect(api.getFacultyRanking).toHaveBeenCalledWith(1, PAGE_SIZE);
    expect(api.getTeacherRanking).not.toHaveBeenCalled();
    expect(store().fakultetlar.items[0]?.fakultet).toBe('Konchilik fakulteti');
  });

  it('фильтр уходит в запрос и сбрасывает страницу на первую', async () => {
    api.getTeacherRanking.mockResolvedValue(paged([teacher(1)]));
    useReytingStore.setState({ oqituvchilar: { ...emptySlice, page: 3 } });

    await store().setFilter('facultyId', 7);

    expect(api.getTeacherRanking).toHaveBeenCalledWith(
      expect.objectContaining({ facultyId: 7, page: 1 }),
    );
    expect(store().oqituvchilar.page).toBe(1);
  });

  it('смена факультета сбрасывает кафедру — она могла быть из другого', async () => {
    api.getTeacherRanking.mockResolvedValue(paged([teacher(1)]));
    useReytingStore.setState({ filters: { facultyId: 1, kafedraId: 5, search: '' } });

    await store().setFilter('facultyId', 2);

    expect(store().filters).toEqual({ facultyId: 2, kafedraId: null, search: '' });
  });

  it('пустой поиск в запрос не попадает', async () => {
    api.getTeacherRanking.mockResolvedValue(paged([teacher(1)]));

    await store().setFilter('search', '   ');

    expect(api.getTeacherRanking).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('страница листается в пределах открытой вкладки', async () => {
    api.getKafedraRanking.mockResolvedValue(paged([], 100));
    useReytingStore.setState({ tab: 'kafedralar' });

    await store().setPage(3);

    expect(api.getKafedraRanking).toHaveBeenCalledWith(3, PAGE_SIZE);
    expect(store().kafedralar.page).toBe(3);
    expect(store().oqituvchilar.page).toBe(1);
  });

  it('clearFilters очищает все три фильтра', async () => {
    api.getTeacherRanking.mockResolvedValue(paged([teacher(1)]));
    useReytingStore.setState({ filters: { facultyId: 1, kafedraId: 2, search: 'ali' } });

    await store().clearFilters();

    expect(store().filters).toEqual({ facultyId: null, kafedraId: null, search: '' });
  });
});

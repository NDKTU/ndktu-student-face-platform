import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestMeta } from '@/entities/test/model/types';
import { useTestlarStore } from './testlar.store';

vi.mock('@/shared/api/testlar', () => ({
  getTests: vi.fn(),
  createTest: vi.fn(),
  updateTest: vi.fn(),
  deleteTest: vi.fn(),
  getTestDetail: vi.fn(),
  startTest: vi.fn(),
  submitTest: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/testlar'));

const store = () => useTestlarStore.getState();

function meta(id: number, over: Partial<TestMeta> = {}): TestMeta {
  return {
    id,
    name: `Test ${id}`,
    fan: 'Fizika',
    oqituvchi: 'Jasur Bozorov',
    guruh: 'KI-24-01',
    savollar: 20,
    davomiylik: 30,
    holati: 'Faol',
    pin: '123456',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTestlarStore.setState({ tests: [], status: 'idle', error: null });
});

describe('testlar store — загрузка', () => {
  it('load() кладёт список и переводит статус в ready', async () => {
    api.getTests.mockResolvedValueOnce([meta(1), meta(2)]);

    await store().load();

    expect(store().tests).toHaveLength(2);
    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getTests.mockRejectedValueOnce(new Error('Network error'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
    expect(store().tests).toEqual([]);
  });
});

describe('testlar store — мутации', () => {
  beforeEach(() => {
    useTestlarStore.setState({ tests: [meta(1)], status: 'ready' });
  });

  it('add ставит созданный тест в начало и возвращает его (нужен PIN)', async () => {
    api.createTest.mockResolvedValueOnce(meta(2, { pin: '999888' }));

    const created = await store().add({
      name: 'Fizika — KI-24-02',
      subjectId: 3,
      groupId: 4,
      teacherId: 7,
      savollar: 10,
      davomiylik: 20,
      pin: '999888',
      isActive: true,
      proctoring: 'standard',
    });

    expect(created.pin).toBe('999888');
    expect(store().tests.map((x) => x.id)).toEqual([2, 1]);
  });

  it('update заменяет тест ответом сервера', async () => {
    api.updateTest.mockResolvedValueOnce(meta(1, { holati: 'Yopiq' }));

    await store().update(1, { holati: 'Yopiq' });

    expect(store().tests[0]!.holati).toBe('Yopiq');
  });

  it('remove убирает тест после успешного удаления', async () => {
    api.deleteTest.mockResolvedValueOnce(undefined);

    await store().remove(1);

    expect(api.deleteTest).toHaveBeenCalledWith(1);
    expect(store().tests).toEqual([]);
  });

  it('сбой сервера пробрасывается и список не меняется', async () => {
    api.createTest.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(
      store().add({
        name: 'X',
        subjectId: null,
        groupId: null,
        teacherId: null,
        savollar: 1,
        davomiylik: 1,
        pin: '111111',
        isActive: false,
        proctoring: 'standard',
      }),
    ).rejects.toThrow('HTTP 500');
    expect(store().tests).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFanlarStore, type FanRow } from './fanlar.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/fanlar', () => ({
  getFanlar: vi.fn(),
  createFan: vi.fn(),
  updateFan: vi.fn(),
  deleteFan: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/fanlar'));

const store = () => useFanlarStore.getState();

function row(id: number, fan: string): FanRow {
  return { id, fan, kafedra: 'K', kredit: 3, semestr: 1, oqituvchi: '—', kod: '', tavsif: '' };
}

beforeEach(() => {
  vi.clearAllMocks();
  useFanlarStore.setState({ fans: [], status: 'idle', error: null });
});

describe('fanlar store — загрузка', () => {
  it('load() кладёт каталог и переводит статус в ready', async () => {
    api.getFanlar.mockResolvedValueOnce([row(1, 'Fizika'), row(2, 'Kimyo')]);

    await store().load();

    expect(store().fans).toHaveLength(2);
    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getFanlar.mockRejectedValueOnce(new Error('Network error'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
    expect(store().fans).toEqual([]);
  });
});

describe('fanlar store — мутации', () => {
  beforeEach(() => {
    useFanlarStore.setState({ fans: [row(1, 'Fizika')], status: 'ready' });
  });

  it('add ставит ответ сервера в начало списка', async () => {
    api.createFan.mockResolvedValueOnce(row(2, 'Yangi fan'));

    await store().add({ fan: 'Yangi fan', kafedra: 'K', kredit: '5', kod: '', tavsif: '' });

    expect(api.createFan).toHaveBeenCalledWith({
      fan: 'Yangi fan',
      kafedra: 'K',
      kredit: '5',
      kod: '',
      tavsif: '',
    });
    expect(store().fans.map((f) => f.id)).toEqual([2, 1]);
  });

  it('update заменяет строку ответом сервера', async () => {
    api.updateFan.mockResolvedValueOnce({ ...row(1, 'Fizika'), kredit: 8 });

    await store().update(1, { fan: 'Fizika', kafedra: 'K', kredit: '8', kod: '', tavsif: '' });

    expect(store().fans[0]!.kredit).toBe(8);
  });

  it('remove убирает строку после успешного удаления', async () => {
    api.deleteFan.mockResolvedValueOnce(undefined);

    await store().remove(1);

    expect(api.deleteFan).toHaveBeenCalledWith(1);
    expect(store().fans).toEqual([]);
  });

  it('сбой сервера пробрасывается и список не меняется', async () => {
    api.createFan.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(
      store().add({ fan: 'X', kafedra: 'K', kredit: '3', kod: '', tavsif: '' }),
    ).rejects.toThrow('HTTP 500');
    expect(store().fans).toHaveLength(1);
  });
});

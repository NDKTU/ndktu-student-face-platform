import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '@/entities/employee/model/types';
import { unitOptions, useEmployeesStore } from './employees.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/xodimlar', () => ({
  getEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  getEmployeeSensitive: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/xodimlar'));

const store = () => useEmployeesStore.getState();

function row(id: number, over: Partial<Employee> = {}): Employee {
  return {
    id,
    fish: 'Sardor Aliyev',
    roleId: 'super_admin',
    role: 'Super Admin',
    unit: 'Rektorat',
    lavozim: 'Tizim administratori',
    holati: 'Faol',
    email: 'a.sardor@ndktu.uz',
    workEmail: 'a.sardor@ndktu.uz',
    login: 'a.sardor',
    initials: 'SA',
    color: '#2836C7',
    gender: 'Erkak',
    birth: '25.07.1998',
    hire: '01.09.2015',
    lastLogin: '18.07.2026 09:12',
    workPhone: '+998 90 100-10-10',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEmployeesStore.setState({ employees: [], status: 'idle', error: null, selectedId: null });
});

describe('employees store', () => {
  it('load() кладёт справочник и переводит статус в ready', async () => {
    api.getEmployees.mockResolvedValueOnce([row(1), row(2, { fish: 'Nodira Karimova' })]);

    await store().load();

    expect(store().employees).toHaveLength(2);
    expect(store().status).toBe('ready');
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getEmployees.mockRejectedValueOnce(new Error('HTTP 403'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('HTTP 403');
  });

  it('add кладёт запись с сервера — id придумывает не клиент', async () => {
    useEmployeesStore.setState({ employees: [row(1)], status: 'ready' });
    api.createEmployee.mockResolvedValueOnce(row(99, { fish: 'Yangi Xodim' }));

    await store().add({ fish: 'Yangi Xodim', login: 'y.xodim', pwd: 'parol' });

    expect(store().employees).toHaveLength(2);
    expect(store().employees[1]!.id).toBe(99);
  });

  it('update заменяет строку ответом сервера', async () => {
    useEmployeesStore.setState({ employees: [row(1)], status: 'ready' });
    api.updateEmployee.mockResolvedValueOnce(row(1, { lavozim: 'Yangi lavozim' }));

    await store().update(1, { lavozim: 'Yangi lavozim' });

    expect(api.updateEmployee).toHaveBeenCalledWith(1, { lavozim: 'Yangi lavozim' });
    expect(store().employees[0]!.lavozim).toBe('Yangi lavozim');
  });

  it('сбой сохранения пробрасывается наружу — экран покажет тост', async () => {
    api.updateEmployee.mockRejectedValueOnce(new Error('HTTP 409'));

    await expect(store().update(1, { login: 'band' })).rejects.toThrow('HTTP 409');
  });

  it('подразделения для фильтра берутся из справочника без пустых и дублей', () => {
    const units = unitOptions([
      row(1, { unit: 'Rektorat' }),
      row(2, { unit: 'Boshqaruv' }),
      row(3, { unit: 'Rektorat' }),
      row(4, { unit: '' }),
    ]);

    expect(units).toEqual(['Boshqaruv', 'Rektorat']);
  });
});

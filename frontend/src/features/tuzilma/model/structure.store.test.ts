import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Faculty } from '@/entities/university/model/types';
import { useStructureStore } from './structure.store';

// Стор ходит в сеть, поэтому граница до бэкенда подменяется целиком:
// проверяем логику стора, а не HTTP.
vi.mock('@/shared/api/tuzilma', () => ({
  getTree: vi.fn(),
  createFaculty: vi.fn(),
  updateFaculty: vi.fn(),
  deleteFaculty: vi.fn(),
  createKafedra: vi.fn(),
  updateKafedra: vi.fn(),
  deleteKafedra: vi.fn(),
  createSpeciality: vi.fn(),
  updateSpeciality: vi.fn(),
  deleteSpeciality: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createRejaRow: vi.fn(),
  updateRejaRow: vi.fn(),
  deleteRejaRow: vi.fn(),
  clearReja: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/tuzilma'));

/**
 * Дерево-заготовка для проверок стора.
 *
 * Раньше здесь работал мок-генератор университета на несколько сотен строк —
 * он остался с прототипа и заодно снабжал данными сами экраны. Экраны давно
 * читают API, а тесту нужна ровно эта форма: шесть факультетов, у каждого
 * кафедра со специальностью, две группы и план из двух семестров.
 */
function buildFixture(): Faculty[] {
  return Array.from({ length: 6 }, (_, f) => {
    const base = (f + 1) * 100;
    return {
      id: base,
      name: `Fakultet ${f + 1}`,
      dekan: `Dekan ${f + 1}`,
      dekanEmployeeId: null,
      color: { bg: '#EEF1FF', fg: '#2836C7' },
      kafedralar: [
        {
          id: base + 10,
          name: `Kafedra ${f + 1}`,
          mudir: `Mudir ${f + 1}`,
          mudirEmployeeId: null,
          oqituvchilar: 4,
          mutaxassisliklar: [
            {
              id: base + 20,
              name: `Mutaxassislik ${f + 1}`,
              kod: `6061010${f}`,
              reja_yil: null,
              curriculum_count: 3,
              curriculum_credits: 12,
              guruhlar: [
                {
                  id: base + 30,
                  name: `G-${f + 1}-01`,
                  shakl: 'Kunduzgi' as const,
                  kurs: 1,
                  sardor: '—',
                  student_count: 24,
                },
                {
                  id: base + 31,
                  name: `G-${f + 1}-02`,
                  shakl: 'Sirtqi' as const,
                  kurs: 2,
                  sardor: '—',
                  student_count: 22,
                },
              ],
              reja: [
                { id: base + 40, fan: 'Oliy matematika', semestr: 1, kredit: 5, oqituvchi: '—', teacherId: null },
                { id: base + 41, fan: 'Fizika', semestr: 2, kredit: 4, oqituvchi: '—', teacherId: null },
                { id: base + 42, fan: 'Kimyo', semestr: 2, kredit: 3, oqituvchi: '—', teacherId: null },
              ],
            },
          ],
        },
      ],
    };
  });
}

const pristine = { faculties: buildFixture() };

function freshFaculties(): Faculty[] {
  return buildFixture();
}

const store = () => useStructureStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useStructureStore.setState({
    faculties: freshFaculties(),
    status: 'ready',
    error: null,
    drill: [],
    selectedStudentId: null,
    rejaYears: {},
  });
});

describe('structure store — загрузка', () => {
  it('load() кладёт дерево и переводит статус в ready', async () => {
    useStructureStore.setState({ faculties: [], status: 'idle' });
    api.getTree.mockResolvedValueOnce(freshFaculties());

    await store().load();

    expect(store().faculties).toHaveLength(6);
    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    useStructureStore.setState({ faculties: [], status: 'idle' });
    api.getTree.mockRejectedValueOnce(new Error('Network error'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
    expect(store().faculties).toEqual([]);
  });

  it('load() восстанавливает rejaYears из reja_yil в дереве', async () => {
    useStructureStore.setState({ faculties: [], status: 'idle', rejaYears: {} });
    const tree = freshFaculties();
    const spec = tree[0]!.kafedralar[0]!.mutaxassisliklar[0]!;
    spec.reja_yil = '2026/2027';
    api.getTree.mockResolvedValueOnce(tree);

    await store().load();

    expect(store().rejaYears[spec.id]).toBe('2026/2027');
  });
});

describe('structure store — навигация', () => {
  it('drillInto углубляет путь, popTo возвращает наверх', () => {
    const faculty = store().faculties[0]!;
    store().drillInto({ id: faculty.id, name: faculty.name });
    const department = faculty.kafedralar[0]!;
    store().drillInto({ id: department.id, name: department.name });

    expect(store().drill.map((s) => s.name)).toEqual([faculty.name, department.name]);

    store().popTo(1);
    expect(store().drill).toHaveLength(1);
    expect(store().drill[0]!.name).toBe(faculty.name);
  });

  it('drillInto сбрасывает выбранного студента', () => {
    useStructureStore.setState({ selectedStudentId: 5000 });
    const faculty = store().faculties[0]!;
    store().drillInto({ id: faculty.id, name: faculty.name });

    expect(store().selectedStudentId).toBeNull();
  });
});

describe('structure store — мутации', () => {
  it('добавляет факультет ответом сервера, не трогая существующие', async () => {
    const created = {
      id: 1,
      name: 'Yangi fakultet',
      dekan: 'Test Dekan',
      dekanEmployeeId: 7,
      color: { bg: '#fff', fg: '#000' },
      kafedralar: [],
    };
    api.createFaculty.mockResolvedValueOnce(created);

    await store().addEntity(0, { name: 'Yangi fakultet', post: '7', postName: 'Test Dekan' });

    expect(api.createFaculty).toHaveBeenCalledWith({
      name: 'Yangi fakultet',
      dekanEmployeeId: 7,
      dekanName: 'Test Dekan',
    });
    expect(store().faculties).toHaveLength(7);
    expect(store().faculties.at(-1)!.id).toBe(1);
    expect(store().faculties[0]!.name).toBe(pristine.faculties[0]!.name);
  });

  it('создание кафедры уходит в факультет из drill-пути', async () => {
    const faculty = store().faculties[0]!;
    store().drillInto({ id: faculty.id, name: faculty.name });
    api.createKafedra.mockResolvedValueOnce({
      id: 900,
      name: 'K',
      mudir: '—',
      mudirEmployeeId: null,
      oqituvchilar: 0,
      mutaxassisliklar: [],
    });

    await store().addEntity(1, { name: 'K' });

    expect(api.createKafedra).toHaveBeenCalledWith(faculty.id, {
      name: 'K',
      // Поле не трогали — id не уходит вовсе, иначе сервер понял бы это как
      // «снять мудира».
      mudirEmployeeId: undefined,
      mudirName: null,
    });
    expect(store().faculties[0]!.kafedralar.at(-1)!.id).toBe(900);
  });

  it('редактирование кафедры сохраняет вложенные коллекции', async () => {
    const faculty = store().faculties[0]!;
    store().drillInto({ id: faculty.id, name: faculty.name });
    const department = faculty.kafedralar[0]!;

    // Сервер отвечает без вложенных списков — они должны остаться из состояния.
    api.updateKafedra.mockResolvedValueOnce({
      id: department.id,
      name: 'Qayta nomlangan kafedra',
      mudir: department.mudir,
      mudirEmployeeId: null,
      oqituvchilar: department.oqituvchilar,
      mutaxassisliklar: [],
    });

    await store().updateEntity(1, department.id, { name: 'Qayta nomlangan kafedra' });

    const updated = store().faculties[0]!.kafedralar[0]!;
    expect(updated.name).toBe('Qayta nomlangan kafedra');
    expect(updated.mudir).toBe(department.mudir);
    expect(updated.mutaxassisliklar).toHaveLength(department.mutaxassisliklar.length);
  });

  it('мутация иммутабельна: старый объект факультета не меняется', async () => {
    const before = store().faculties[0]!;
    api.updateFaculty.mockResolvedValueOnce({ ...before, name: 'O‘zgargan', kafedralar: [] });

    await store().updateEntity(0, before.id, { name: 'O‘zgargan' });

    expect(before.name).not.toBe('O‘zgargan');
    expect(store().faculties[0]).not.toBe(before);
  });

  it('удаление факультета, внутрь которого мы провалились, выкидывает наверх', async () => {
    const faculty = store().faculties[0]!;
    store().drillInto({ id: faculty.id, name: faculty.name });
    expect(store().drill).toHaveLength(1);
    api.deleteFaculty.mockResolvedValueOnce(undefined);

    await store().removeEntity(0, faculty.id);

    expect(store().faculties).toHaveLength(5);
    expect(store().drill).toEqual([]);
  });

  it('удаляет группу на третьем уровне вложенности', async () => {
    const faculty = store().faculties[0]!;
    const department = faculty.kafedralar[0]!;
    const speciality = department.mutaxassisliklar[0]!;
    const group = speciality.guruhlar[0]!;

    store().drillInto({ id: faculty.id, name: faculty.name });
    store().drillInto({ id: department.id, name: department.name });
    store().drillInto({ id: speciality.id, name: speciality.name });
    api.deleteGroup.mockResolvedValueOnce(undefined);

    const before = speciality.guruhlar.length;
    await store().removeEntity(3, group.id);

    const after = store().faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!.guruhlar;
    expect(after).toHaveLength(before - 1);
    expect(after.find((g) => g.id === group.id)).toBeUndefined();
  });

  it('сбой сервера пробрасывается наружу и состояние не меняется', async () => {
    const before = store().faculties.length;
    api.createFaculty.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(store().addEntity(0, { name: 'X' })).rejects.toThrow('HTTP 500');
    expect(store().faculties).toHaveLength(before);
  });
});

describe('structure store — учебный план', () => {
  function firstSpeciality() {
    return store().faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!;
  }

  it('добавляет строку плана ответом сервера', async () => {
    const speciality = firstSpeciality();
    const before = speciality.reja.length;
    api.createRejaRow.mockResolvedValueOnce({
      id: 901,
      fan: 'Fizika',
      semestr: 2,
      kredit: 4,
      oqituvchi: 'Bozorov D.',
      teacherId: 7,
    });

    await store().addRejaRow(speciality.id, {
      fan: 'Fizika',
      semestr: 2,
      kredit: 4,
      oqituvchi: 'Bozorov D.',
      teacherId: 7,
    });

    const reja = firstSpeciality().reja;
    expect(reja).toHaveLength(before + 1);
    expect(reja.at(-1)!.id).toBe(901);
  });

  it('удаление строки идёт по id, а не по индексу', async () => {
    const speciality = firstSpeciality();
    // Сид приходит без id, поэтому проставляем их как это делает сервер.
    useStructureStore.setState({
      faculties: store().faculties.map((f, fi) =>
        fi !== 0
          ? f
          : {
              ...f,
              kafedralar: f.kafedralar.map((k, ki) =>
                ki !== 0
                  ? k
                  : {
                      ...k,
                      mutaxassisliklar: k.mutaxassisliklar.map((s, si) =>
                        si !== 0
                          ? s
                          : { ...s, reja: s.reja.map((r, i) => ({ ...r, id: i + 1 })) },
                      ),
                    },
              ),
            },
      ),
    });
    api.deleteRejaRow.mockResolvedValueOnce(undefined);

    await store().removeRejaRow(speciality.id, 2);

    // Второй аргумент — индекс строки, а id у неё `index + 1`.
    expect(api.deleteRejaRow).toHaveBeenCalledWith(3);
    expect(firstSpeciality().reja).toHaveLength(speciality.reja.length - 1);
  });

  it('очистка семестра дёргает сервер и убирает только его строки', async () => {
    const speciality = firstSpeciality();
    api.clearReja.mockResolvedValueOnce(undefined);

    await store().clearRejaSemester(speciality.id, 1);

    expect(api.clearReja).toHaveBeenCalledWith(speciality.id, 1);
    expect(firstSpeciality().reja.some((r) => r.semestr === 1)).toBe(false);
    expect(firstSpeciality().reja.some((r) => r.semestr === 2)).toBe(true);
  });

  it('новый план чистит строки и сохраняет учебный год на сервере', async () => {
    const speciality = firstSpeciality();
    api.updateSpeciality.mockResolvedValueOnce({ ...speciality });
    api.clearReja.mockResolvedValueOnce(undefined);

    // Формы обучения у плана больше нет — она свойство группы.
    await store().createRejaPlan(speciality.id, '2026/2027');

    expect(api.updateSpeciality).toHaveBeenCalledWith(speciality.id, {
      reja_yil: '2026/2027',
    });
    expect(firstSpeciality().reja).toEqual([]);
    expect(firstSpeciality().reja_yil).toBe('2026/2027');
    expect(store().rejaYears[speciality.id]).toBe('2026/2027');
  });
});

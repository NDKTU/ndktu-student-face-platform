import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskDetail, TaskRow, TaskSubmissionRow } from '@/entities/task/model/types';
import { useTasksStore } from './tasks.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/vazifalar', () => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  gradeSubmission: vi.fn(),
  submitWork: vi.fn(),
  getPending: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/vazifalar'));

const store = () => useTasksStore.getState();

function sub(id: number, over: Partial<TaskSubmissionRow> = {}): TaskSubmissionRow {
  return {
    id,
    fish: 'Talaba Test',
    initials: 'TT',
    status: 'topshirilgan',
    ball: null,
    feedback: '',
    submittedAt: '15.07.2026 10:00',
    gradedAt: null,
    text: '',
    files: [],
    links: [],
    ...over,
  };
}

function row(id: number, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    fan: 'Oliy matematika',
    guruh: 'DI-24-01',
    oqituvchi: 'Jasur Bozorov',
    fac: '',
    title: 'Topshiriq',
    desc: '',
    deadline: '29.07.2026',
    students: 10,
    submitted: 1,
    graded: 0,
    mySub: null,
    ...over,
  };
}

function detail(id: number, subs: TaskSubmissionRow[]): TaskDetail {
  const { submitted: _s, graded: _g, mySub: _m, ...rest } = row(id);
  return { ...rest, subs };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTasksStore.setState({ tasks: [], byId: {}, status: 'idle', error: null });
});

describe('tasks store — загрузка', () => {
  it('load() кладёт список и переводит статус в ready', async () => {
    api.getTasks.mockResolvedValueOnce([row(1), row(2)]);

    await store().load();

    // Ни имени, ни группы: что видно этой роли, решает сервер.
    expect(api.getTasks).toHaveBeenCalledWith();
    expect(store().tasks).toHaveLength(2);
    expect(store().status).toBe('ready');
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getTasks.mockRejectedValueOnce(new Error('Network error'));

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
  });
});

describe('tasks store — проверка работ', () => {
  beforeEach(() => {
    useTasksStore.setState({
      tasks: [row(1, { submitted: 2, graded: 0 })],
      byId: { 1: detail(1, [sub(1), sub(2)]) },
      status: 'ready',
    });
  });

  it('grade обновляет сдачу и пересчитывает счётчики списка', async () => {
    api.gradeSubmission.mockResolvedValueOnce(
      sub(1, { status: 'baholangan', ball: 90, gradedAt: '18.07.2026 12:00' }),
    );

    await store().grade(1, 1, 90, 'Yaxshi');

    expect(api.gradeSubmission).toHaveBeenCalledWith(1, 90, 'Yaxshi');
    expect(store().byId[1]!.subs[0]!.ball).toBe(90);
    // Счётчик оценённых вырос без перезапроса всего списка.
    expect(store().tasks[0]!.graded).toBe(1);
    expect(store().tasks[0]!.submitted).toBe(2);
  });

  it('сбой сервера пробрасывается наружу', async () => {
    api.gradeSubmission.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(store().grade(1, 1, 90, '')).rejects.toThrow('HTTP 500');
  });
});

describe('tasks store — сдача студента', () => {
  beforeEach(() => {
    useTasksStore.setState({
      tasks: [row(1, { submitted: 0, graded: 0, mySub: null })],
      byId: {},
      status: 'ready',
    });
  });

  it('первая сдача увеличивает счётчик и попадает в mySub', async () => {
    api.submitWork.mockResolvedValueOnce(sub(99, { fish: 'Islom Abdullayev' }));

    await store().submit(1, { file: 'javob.pdf', text: 'Bajardim', link: '' });

    expect(api.submitWork).toHaveBeenCalledWith(1, {
      text: 'Bajardim',
      links: [],
      files: [{ name: 'javob.pdf', type: 'pdf' }],
    });
    expect(store().tasks[0]!.mySub?.id).toBe(99);
    expect(store().tasks[0]!.submitted).toBe(1);
  });

  it('пересдача не задваивает счётчик и снимает прежнюю оценку', async () => {
    useTasksStore.setState({
      tasks: [
        row(1, {
          submitted: 1,
          graded: 1,
          mySub: sub(99, { status: 'baholangan', ball: 70 }),
        }),
      ],
    });
    api.submitWork.mockResolvedValueOnce(sub(99, { status: 'topshirilgan', ball: null }));

    await store().submit(1, { file: '', text: 'qayta', link: '' });

    expect(store().tasks[0]!.submitted).toBe(1);
    expect(store().tasks[0]!.graded).toBe(0);
    expect(store().tasks[0]!.mySub?.ball).toBeNull();
  });
});

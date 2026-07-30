import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsyMethod, PsyQuestion, PsyResult } from '@/shared/api/psixologiya';
import { isAnswered, usePsyTestStore } from './psyTest.store';

vi.mock('@/shared/api/psixologiya', () => ({
  getMethod: vi.fn(),
  submitTest: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/psixologiya'));

const store = () => usePsyTestStore.getState();

function question(id: number, over: Partial<PsyQuestion> = {}): PsyQuestion {
  return {
    id,
    methodId: 1,
    type: 'true_false',
    content: { text: `Savol ${id}` },
    options: [],
    order: id,
    category: '',
    ...over,
  };
}

function method(questions: PsyQuestion[]): PsyMethod {
  return { id: 1, name: 'Beck', description: '', instruction: {}, questions };
}

const result: PsyResult = {
  id: 9,
  methodId: 1,
  methodName: 'Beck',
  userId: 3,
  username: 'talaba',
  answers: [],
  diagnosis: null,
  createdAt: '2026-07-30T10:00:00',
  questions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  store().reset();
});

describe('isAnswered', () => {
  it('нуль и «нет» — это ответы, а не пустота', () => {
    expect(isAnswered(0)).toBe(true);
    expect(isAnswered(false)).toBe(true);
  });

  it('null и пустой список ответом не считаются', () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered([])).toBe(false);
  });
});

describe('psyTest.store', () => {
  it('загружает методику и переходит к вопросам', async () => {
    api.getMethod.mockResolvedValue(method([question(1), question(2)]));

    await store().start(1);

    expect(store()).toMatchObject({ phase: 'running', index: 0 });
    expect(store().method?.questions).toHaveLength(2);
  });

  it('сбой загрузки показывает ошибку, а не пустой тест', async () => {
    api.getMethod.mockRejectedValue(new Error('404'));

    await store().start(1);

    expect(store()).toMatchObject({ phase: 'error', error: '404' });
  });

  it('переключение варианта копит массив, повторный клик снимает', () => {
    store().toggle(1, 3);
    store().toggle(1, 5);
    expect(store().answers[1]).toEqual([3, 5]);

    store().toggle(1, 3);
    expect(store().answers[1]).toEqual([5]);
  });

  it('шаг за пределы списка вопросов игнорируется', async () => {
    api.getMethod.mockResolvedValue(method([question(1), question(2)]));
    await store().start(1);

    store().prev();
    expect(store().index).toBe(0);

    store().go(1);
    store().next();
    expect(store().index).toBe(1);
  });

  it('отправляет только отвеченные вопросы', async () => {
    api.getMethod.mockResolvedValue(method([question(1), question(2), question(3)]));
    api.submitTest.mockResolvedValue(result);
    await store().start(1);

    store().answer(1, true);
    store().answer(3, false);
    await store().finish();

    expect(api.submitTest).toHaveBeenCalledWith(1, [
      { questionId: 1, value: true },
      { questionId: 3, value: false },
    ]);
    expect(store().phase).toBe('result');
  });

  it('сбой отправки оставляет ответы на месте — можно повторить', async () => {
    api.getMethod.mockResolvedValue(method([question(1)]));
    api.submitTest.mockRejectedValue(new Error('500'));
    await store().start(1);
    store().answer(1, true);

    await store().finish();

    expect(store()).toMatchObject({ phase: 'running', submitting: false, error: '500' });
    expect(store().answers[1]).toBe(true);
  });

  it('повторное нажатие «Yakunlash» второй раз не отправляет', async () => {
    api.getMethod.mockResolvedValue(method([question(1)]));
    api.submitTest.mockResolvedValue(result);
    await store().start(1);
    usePsyTestStore.setState({ submitting: true });

    await store().finish();

    expect(api.submitTest).not.toHaveBeenCalled();
  });
});

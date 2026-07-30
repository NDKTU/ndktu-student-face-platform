import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsyMethod, PsyQuestion } from '@/shared/api/psixologiya';
import { nextOrder, useMethodsStore } from './methods.store';

vi.mock('@/shared/api/psixologiya', () => ({
  getMethods: vi.fn(),
  createMethod: vi.fn(),
  updateMethod: vi.fn(),
  deleteMethod: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/psixologiya'));

const store = () => useMethodsStore.getState();

function question(id: number, order: number): PsyQuestion {
  return {
    id,
    methodId: 1,
    type: 'true_false',
    content: { text: `Savol ${id}` },
    options: [],
    order,
    category: '',
  };
}

function method(over: Partial<PsyMethod> = {}): PsyMethod {
  return { id: 1, name: 'Beck', description: '', instruction: {}, questions: [], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMethodsStore.setState({ methods: [], status: 'idle', error: null });
});

describe('nextOrder', () => {
  it('первый вопрос получает первый номер', () => {
    expect(nextOrder(method())).toBe(1);
    expect(nextOrder(undefined)).toBe(1);
  });

  it('берёт следующий после наибольшего, а не длину списка', () => {
    // Вопрос могли удалить: считать по количеству значило бы выдать занятый номер.
    expect(nextOrder(method({ questions: [question(1, 1), question(3, 7)] }))).toBe(8);
  });
});

describe('methods.store', () => {
  it('загружает список методик', async () => {
    api.getMethods.mockResolvedValue({ total: 1, page: 1, limit: 100, items: [method()] });

    await store().load();

    expect(store()).toMatchObject({ status: 'ready' });
    expect(store().methods).toHaveLength(1);
  });

  it('сбой загрузки не оставляет стор в loading', async () => {
    api.getMethods.mockRejectedValue(new Error('500'));

    await store().load();

    expect(store()).toMatchObject({ status: 'error', error: '500' });
  });

  it('правка названия не стирает уже загруженные вопросы', async () => {
    useMethodsStore.setState({ methods: [method({ questions: [question(1, 1)] })] });
    // PUT возвращает методику без вопросов — так отвечает бэкенд.
    api.updateMethod.mockResolvedValue(method({ name: 'Beck-II' }));

    await store().editMethod(1, { name: 'Beck-II' });

    expect(store().methods[0]?.name).toBe('Beck-II');
    expect(store().methods[0]?.questions).toHaveLength(1);
  });

  it('новый вопрос встаёт по своему номеру, а не в конец', async () => {
    useMethodsStore.setState({ methods: [method({ questions: [question(1, 1), question(2, 5)] })] });
    api.createQuestion.mockResolvedValue(question(3, 3));

    await store().addQuestion(1, {
      type: 'true_false',
      content: { text: 'x' },
      options: [],
      order: 3,
      category: '',
    });

    expect(store().methods[0]?.questions.map((q) => q.order)).toEqual([1, 3, 5]);
  });

  it('удаление вопроса не трогает другие методики', async () => {
    useMethodsStore.setState({
      methods: [
        method({ questions: [question(1, 1)] }),
        method({ id: 2, questions: [question(2, 1)] }),
      ],
    });
    api.deleteQuestion.mockResolvedValue(undefined);

    await store().removeQuestion(1, 1);

    expect(store().methods[0]?.questions).toHaveLength(0);
    expect(store().methods[1]?.questions).toHaveLength(1);
  });

  it('удалённая методика уходит из списка', async () => {
    useMethodsStore.setState({ methods: [method(), method({ id: 2 })] });
    api.deleteMethod.mockResolvedValue(undefined);

    await store().removeMethod(1);

    expect(store().methods.map((m) => m.id)).toEqual([2]);
  });
});

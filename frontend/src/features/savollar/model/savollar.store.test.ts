import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@/entities/question/model/types';
import { useSavollarStore } from './savollar.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/savollar', () => ({
  getQuestions: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/savollar'));

const store = () => useSavollarStore.getState();

function q(id: number, subjectId = 1, text = 'Savol?'): Question {
  return {
    id,
    subjectId,
    text,
    correct: 'A',
    hasImage: false,
    options: [
      { letter: 'A', text: 'a', image: false, correct: true },
      { letter: 'B', text: 'b', image: false, correct: false },
      { letter: 'C', text: 'c', image: false, correct: false },
      { letter: 'D', text: 'd', image: false, correct: false },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSavollarStore.setState({ questions: [], subjectId: null, status: 'idle', error: null });
});

describe('savollar store — загрузка', () => {
  it('load() кладёт банк и переводит статус в ready', async () => {
    api.getQuestions.mockResolvedValueOnce([q(1), q(2)]);

    await store().load(1);

    expect(store().questions).toHaveLength(2);
    expect(store().status).toBe('ready');
    expect(store().error).toBeNull();
  });

  it('ошибка сети попадает в состояние, а не роняет стор', async () => {
    api.getQuestions.mockRejectedValueOnce(new Error('Network error'));

    await store().load(1);

    expect(store().status).toBe('error');
    expect(store().error).toBe('Network error');
    expect(store().questions).toEqual([]);
  });
});

describe('savollar store — мутации', () => {
  beforeEach(() => {
    useSavollarStore.setState({ questions: [q(1)], status: 'ready' });
  });

  it('add ставит ответ сервера в конец списка', async () => {
    api.createQuestion.mockResolvedValueOnce(q(2, 1, 'Yangi'));

    await store().add({
      subjectId: 1,
      userId: 7,
      text: 'Yangi',
      correct: 'A',
      options: [
        { letter: 'A', text: 'a' },
        { letter: 'B', text: 'b' },
        { letter: 'C', text: 'c' },
        { letter: 'D', text: 'd' },
      ],
    });

    expect(store().questions.map((x) => x.id)).toEqual([1, 2]);
  });

  it('update заменяет вопрос ответом сервера', async () => {
    api.updateQuestion.mockResolvedValueOnce({ ...q(1), text: 'O‘zgargan' });

    await store().update(1, {
      subjectId: 1,
      userId: 7,
      text: 'O‘zgargan',
      correct: 'A',
      options: [],
    });

    expect(store().questions[0]!.text).toBe('O‘zgargan');
  });

  it('remove убирает вопрос после успешного удаления', async () => {
    api.deleteQuestion.mockResolvedValueOnce(undefined);

    await store().remove(1);

    expect(api.deleteQuestion).toHaveBeenCalledWith(1);
    expect(store().questions).toEqual([]);
  });

  it('сбой сервера пробрасывается и список не меняется', async () => {
    api.createQuestion.mockRejectedValueOnce(new Error('HTTP 500'));

    await expect(
      store().add({ subjectId: 1, userId: 7, text: 'X', correct: 'A', options: [] }),
    ).rejects.toThrow('HTTP 500');
    expect(store().questions).toHaveLength(1);
  });
});

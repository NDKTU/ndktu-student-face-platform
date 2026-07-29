import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizQuestion, TestMeta } from '@/entities/test/model/types';
import { useQuizStore } from './quiz.store';

// Вопросы и балл теперь приходят с сервера — граница подменяется целиком.
vi.mock('@/shared/api/testlar', () => ({
  startTest: vi.fn(),
  submitAnswer: vi.fn(),
  endTest: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/testlar'));

const TEST: TestMeta = {
  id: 1,
  name: 'Fizika — 2025/2026',
  fan: 'Fizika',
  oqituvchi: 'Jasur Bozorov',
  guruh: 'DI-24-01',
  savollar: 3,
  davomiylik: 30,
  holati: 'Faol',
  pin: '123456',
};

// Сервер отдаёт вопросы без правильных ответов.
const QUESTIONS: QuizQuestion[] = [0, 1, 2].map((i) => ({
  id: 100 + i,
  text: `Savol ${i + 1}`,
  image: false,
  options: (['A', 'B', 'C', 'D'] as const).map((letter) => ({
    letter,
    text: `Variant ${letter}`,
    image: false,
  })),
}));

const store = () => useQuizStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  store().reset();
  api.startTest.mockResolvedValue({
    resultId: 55,
    test: TEST,
    questions: QUESTIONS,
    proctoring: 'standard',
    faceWsToken: null,
    referenceImageUrl: null,
  });
  api.submitAnswer.mockResolvedValue({ question_id: 100, is_correct: true });
});

describe('quiz store — запуск', () => {
  it('start отправляет PIN и раскладывает вопросы с таймером', async () => {
    await store().start(TEST, '123456');

    expect(api.startTest).toHaveBeenCalledWith(1, '123456');
    expect(store().phase).toBe('quiz');
    expect(store().questions).toHaveLength(3);
    expect(store().remaining).toBe(30 * 60);
    expect(store().index).toBe(0);
    expect(store().answers).toEqual({});
  });

  it('неверный PIN пробрасывается наружу, тест не стартует', async () => {
    api.startTest.mockRejectedValueOnce(new Error("PIN noto'g'ri"));

    await expect(store().start(TEST, '000000')).rejects.toThrow("PIN noto'g'ri");
    expect(store().phase).toBe('idle');
  });

  it('правильные ответы клиенту не приходят', async () => {
    await store().start(TEST, '123456');
    expect(store().questions.every((q) => q.correct === undefined)).toBe(true);
  });
});

describe('quiz store — прохождение', () => {
  beforeEach(async () => {
    await store().start(TEST, '123456');
  });

  it('answer пишет ответ текущего вопроса, навигация двигает индекс', () => {
    store().answer(2);
    expect(store().answers).toEqual({ 0: 2 });
    // Ответ уходит сразу и адресуется id вопроса, а сервер сверяет текст.
    expect(api.submitAnswer).toHaveBeenCalledWith(55, 100, 'Variant C');

    store().next();
    store().answer(1);
    expect(store().answers).toEqual({ 0: 2, 1: 1 });
    expect(store().index).toBe(1);

    store().prev();
    expect(store().index).toBe(0);
    // За границы списка не выходим.
    store().prev();
    expect(store().index).toBe(0);
  });

  it('tick уменьшает остаток, а на нуле сдаёт работу автоматически', async () => {
    store().tick();
    expect(store().remaining).toBe(30 * 60 - 1);

    api.endTest.mockResolvedValueOnce({
      correct: 0,
      wrong: 3,
      total: 3,
      pct: 0,
      spent: 1800,
    });
    useQuizStore.setState({ remaining: 1 });
    store().tick();
    await vi.waitFor(() => expect(store().phase).toBe('result'));
  });

  it('finish подводит итог попытки — ответы уже на сервере', async () => {
    store().answer(3);
    useQuizStore.setState({ remaining: 30 * 60 - 120 });

    api.endTest.mockResolvedValueOnce({
      correct: 2,
      wrong: 1,
      total: 3,
      pct: 67,
      spent: 120,
    });

    await store().finish();

    // Ответы отправлены поштучно ещё во время теста; сюда уходит только
    // идентификатор попытки и потраченное время.
    expect(api.endTest).toHaveBeenCalledWith(1, 55, 120, undefined);
    expect(store().phase).toBe('result');
    expect(store().result).toMatchObject({ correct: 2, wrong: 1, pct: 67 });
  });

  it('reset возвращает стор в исходное состояние', () => {
    store().answer(1);
    store().reset();

    expect(store().phase).toBe('idle');
    expect(store().test).toBeNull();
    expect(store().questions).toEqual([]);
    expect(store().answers).toEqual({});
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizQuestion, TestMeta } from '@/entities/test/model/types';
import { useQuizStore } from './quiz.store';

// Вопросы и балл теперь приходят с сервера — граница подменяется целиком.
vi.mock('@/shared/api/testlar', () => ({
  startTest: vi.fn(),
  submitTest: vi.fn(),
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
  api.startTest.mockResolvedValue({ test: TEST, questions: QUESTIONS });
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

    api.submitTest.mockResolvedValueOnce({
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

  it('finish отправляет ответы и берёт результат с сервера', async () => {
    store().answer(3);
    useQuizStore.setState({ remaining: 30 * 60 - 120 });

    api.submitTest.mockResolvedValueOnce({
      correct: 2,
      wrong: 1,
      total: 3,
      pct: 67,
      spent: 120,
    });

    await store().finish();

    // Имя сдающего не передаётся: сервер берёт его из токена.
    expect(api.submitTest).toHaveBeenCalledWith(1, { 0: 3 }, 120);
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

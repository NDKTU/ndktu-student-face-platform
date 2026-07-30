import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJournal, saveJournal, type JournalRow } from './jurnal';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function apiRow(userId: number, extra: Record<string, unknown> = {}) {
  return {
    id: null,
    lesson_id: 4,
    user_id: userId,
    attendance: null,
    grade: null,
    notes: null,
    user: { id: userId, username: `talaba${userId}`, full_name: `Aliyev Ali ${userId}` },
    ...extra,
  };
}

const body = () => JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);

describe('getJournal', () => {
  it('строку без отметки отдаёт с attendance = null, а не «present»', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, results: [apiRow(20)] }));

    const [row] = await getJournal(4);

    expect(row).toMatchObject({ userId: 20, attendance: null, grade: null, notes: '' });
  });

  it('подписывает строку ФИО, а логином — только если ФИО нет', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        total: 2,
        results: [apiRow(20), apiRow(21, { user: { id: 21, username: 'talaba21', full_name: null } })],
      }),
    );

    const rows = await getJournal(4);

    expect(rows.map((r) => r.fish)).toEqual(['Aliyev Ali 20', 'talaba21']);
  });
});

describe('saveJournal', () => {
  const row = (userId: number, over: Partial<JournalRow> = {}): JournalRow => ({
    userId,
    fish: `Talaba ${userId}`,
    initials: 'T',
    attendance: 'present',
    grade: null,
    notes: '',
    ...over,
  });

  it('строки без отметки не отправляет — бэкенд требует attendance', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, results: [apiRow(20)] }));

    await saveJournal(4, [row(20), row(21, { attendance: null })]);

    expect(body().items).toEqual([
      { user_id: 20, attendance: 'present', grade: null, notes: null },
    ]);
  });

  it('пустой изох уходит как null, а не как пустая строка', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, results: [apiRow(20)] }));

    await saveJournal(4, [row(20, { notes: '', grade: 5 })]);

    expect(body().items[0]).toEqual({ user_id: 20, attendance: 'present', grade: 5, notes: null });
  });
});

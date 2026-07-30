import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyGroups, getMySubjects } from './mening';

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('закрепления преподавателя', () => {
  it('404 значит «ничего не закреплено», а не ошибку', async () => {
    fetchMock.mockResolvedValue(response(404, { detail: 'Teacher not found for this user' }));

    await expect(getMySubjects(1)).resolves.toEqual([]);
    await expect(getMyGroups(1)).resolves.toEqual([]);
  });

  it('остальные ошибки пробрасываются — их прятать нельзя', async () => {
    fetchMock.mockResolvedValue(response(500, { detail: 'boom' }));

    await expect(getMySubjects(1)).rejects.toThrow('boom');
  });

  it('разворачивает вложенные списки', async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, { subject_teachers: [{ id: 1, subject_id: 2, subject: { id: 2, name: 'Fizika' } }] }),
    );

    await expect(getMySubjects(1)).resolves.toEqual([{ id: 2, name: 'Fizika' }]);
  });
});

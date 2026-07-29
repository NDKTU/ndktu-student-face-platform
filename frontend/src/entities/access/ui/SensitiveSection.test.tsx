import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/shared/api/http';
import { SensitiveSection } from './SensitiveSection';

interface Block {
  jshshir: string;
}

function renderSection(load: (id: number) => Promise<Block>, allowed = true) {
  return render(
    <SensitiveSection
      id={1}
      load={load}
      allowed={allowed}
      title="MAXFIY MA'LUMOT"
      denied={{ title: 'Ruxsat yo‘q', text: 'Faqat Super Admin uchun' }}
      gridClass="grid-cols-2"
      rows={(d) => [['JSHSHIR', d.jshshir]]}
    />,
  );
}

describe('SensitiveSection', () => {
  it('показывает данные, когда сервер их отдал', async () => {
    renderSection(() => Promise.resolve({ jshshir: '31234567890123' }));

    expect(await screen.findByText('31234567890123')).toBeInTheDocument();
  });

  it('403 показывается как «нет доступа», а не как ошибка сети', async () => {
    renderSection(() => Promise.reject(new ApiError(403, 'Ruxsat yetarli emas')));

    expect(await screen.findByText('Ruxsat yo‘q')).toBeInTheDocument();
    expect(screen.queryByText('Ruxsat yetarli emas')).not.toBeInTheDocument();
  });

  it('обычная ошибка показывает сообщение сервера', async () => {
    renderSection(() => Promise.reject(new ApiError(500, 'Server xatosi')));

    expect(await screen.findByText('Server xatosi')).toBeInTheDocument();
  });

  it('роли без права запрос не уходит вовсе', async () => {
    const load = vi.fn();
    renderSection(load, false);

    await waitFor(() => expect(screen.getByText('Ruxsat yo‘q')).toBeInTheDocument());
    expect(load).not.toHaveBeenCalled();
  });
});

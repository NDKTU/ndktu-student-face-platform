import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TestMeta } from '@/entities/test/model/types';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

/** Ввод 6-значного PIN перед запуском теста. Сам код проверяет сервер. */
export function PinModal({
  test,
  onStart,
  onCancel,
}: {
  test: TestMeta;
  onStart: (pin: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('testlar');
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      toast(t('pin.invalid'));
      return;
    }

    // Модалку не закрываем до ответа: при неверном коде студент должен
    // остаться в ней и ввести другой.
    setBusy(true);
    try {
      await onStart(pin);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('pin.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('pin.title')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('pin.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t('pin.start')}
          </Button>
        </>
      }
    >
      <div className="text-13-5 font-semibold text-ink">{test.fan}</div>
      <div className="-mt-1.5 text-12 text-ink-subtle">
        {t('pin.hint', { fan: test.fan, count: test.savollar, duration: test.davomiylik })}
      </div>
      <label className="mt-1 block">
        <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">{t('pin.label')}</span>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          inputMode="numeric"
          placeholder={t('pin.placeholder')}
          autoFocus
          className="h-12 w-full rounded-12 border border-line bg-surface-raised text-center font-mono text-24 font-bold tracking-[0.35em] text-ink outline-none focus:border-brand focus:bg-surface focus:shadow-focus"
        />
      </label>
    </Modal>
  );
}

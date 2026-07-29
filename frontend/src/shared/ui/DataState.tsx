import { useTranslation } from 'react-i18next';
import { Button } from './Button';

/** Заглушки загрузки и ошибки для экранов, которые ждут данные с сервера. */
export function LoadingState() {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center justify-center gap-3 rounded-18 border border-line bg-surface px-6 py-16 text-13-5 text-ink-subtle shadow-card">
      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
      {t('loading')}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  const { t } = useTranslation('common');

  return (
    <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <h3 className="m-0 text-17 font-bold text-ink">{t('loadError')}</h3>
      {message && (
        <p className="mx-auto mt-2 max-w-[420px] text-13 break-words text-ink-subtle">{message}</p>
      )}
      <Button className="mt-5" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

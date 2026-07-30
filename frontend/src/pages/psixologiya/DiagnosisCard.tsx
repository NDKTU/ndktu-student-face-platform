import { useTranslation } from 'react-i18next';
import type { Diagnosis } from '@/shared/api/psixologiya';

/**
 * Итог методики.
 *
 * `null` — не ошибка: сервер возвращает его, когда у методики не настроены
 * `scoring` и `interpretation`. Ответы при этом сохранены, и сказать об этом
 * надо прямо, а не показывать пустую карточку.
 */
export function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis | null }) {
  const { t } = useTranslation('psixologiya');

  if (!diagnosis) {
    return (
      <div className="rounded-14 border border-warning bg-warning-soft px-4 py-3.5">
        <p className="m-0 text-13-5 font-bold text-warning">{t('result.notConfigured')}</p>
        <p className="mt-1 mb-0 text-12-5 text-warning">{t('result.notConfiguredText')}</p>
      </div>
    );
  }

  if (diagnosis.type === 'sum') {
    return (
      <div className="rounded-14 border border-brand bg-brand-soft px-5 py-4">
        <p className="m-0 text-11-5 font-bold tracking-[0.04em] text-brand uppercase">
          {t('result.title')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
          <span className="text-20 font-extrabold text-ink">{diagnosis.label}</span>
          <span className="text-12-5 text-ink-muted">
            {t('result.total')}: <b className="text-ink">{diagnosis.total}</b>
          </span>
        </div>
        {diagnosis.description && (
          <p className="mt-2 mb-0 text-13-5 leading-[1.5] text-ink-secondary">
            {diagnosis.description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-14 border border-brand bg-brand-soft px-5 py-4">
      <p className="m-0 text-11-5 font-bold tracking-[0.04em] text-brand uppercase">
        {t('result.byCategory')}
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {diagnosis.categories.map((cat) => (
          <div key={cat.name} className="rounded-11 border border-line bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-13-5 font-bold text-ink">{cat.name}</span>
              <span className="text-12 text-ink-muted">
                {t('result.score')}: <b className="text-ink">{cat.score}</b>
              </span>
            </div>
            {cat.label && <p className="mt-1 mb-0 text-13 font-semibold text-brand">{cat.label}</p>}
            {cat.description && (
              <p className="mt-1 mb-0 text-12-5 leading-[1.5] text-ink-muted">{cat.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

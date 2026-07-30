import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PAGE_SIZE, usePsyResultsStore } from '@/features/psixologiya/model/psyResults.store';
import { useMethodsStore } from '@/features/psixologiya/model/methods.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { Diagnosis } from '@/shared/api/psixologiya';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { AnswerList } from './AnswerList';
import { DiagnosisCard } from './DiagnosisCard';

export function ResultsPanel() {
  const { t } = useTranslation('psixologiya');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { has } = usePermissions();

  const results = usePsyResultsStore((s) => s.results);
  const total = usePsyResultsStore((s) => s.total);
  const page = usePsyResultsStore((s) => s.page);
  const methodId = usePsyResultsStore((s) => s.methodId);
  const status = usePsyResultsStore((s) => s.status);
  const error = usePsyResultsStore((s) => s.error);
  const openId = usePsyResultsStore((s) => s.openId);
  const open = usePsyResultsStore((s) => s.open);

  const load = usePsyResultsStore((s) => s.load);
  const setMethodId = usePsyResultsStore((s) => s.setMethodId);
  const setPage = usePsyResultsStore((s) => s.setPage);
  const openResult = usePsyResultsStore((s) => s.openResult);
  const remove = usePsyResultsStore((s) => s.remove);

  const methods = useMethodsStore((s) => s.methods);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canDelete = has('delete:psychology_results');

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  if (status === 'idle' || status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error} onRetry={() => void load()} />;

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          aria-label={t('result.filter')}
          value={methodId ?? ''}
          onChange={(e) => void setMethodId(e.target.value === '' ? null : Number(e.target.value))}
          className="h-[42px] min-w-[240px] rounded-11 border border-line bg-surface px-3.5 text-14 text-ink-secondary outline-none focus:border-brand"
        >
          <option value="">{t('result.allMethods')}</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {total === 0 ? (
        <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <h3 className="m-0 text-16 font-bold text-ink">{t('result.emptyTitle')}</h3>
          <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('result.emptyText')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {results.map((row) => {
              const isOpen = row.id === openId;
              return (
                <div key={row.id} className="rounded-14 border border-line bg-surface shadow-card">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => void openResult(isOpen ? null : row.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-11 border-none bg-transparent px-3 py-2.5 text-left hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-14 font-semibold text-ink">
                          {row.username || `#${row.userId ?? '—'}`}
                        </span>
                        <span className="block truncate text-12 text-ink-subtle">
                          {row.methodName}
                        </span>
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-13 text-ink-muted sm:block">
                        {summary(row.diagnosis, t)}
                      </span>
                      <span className="flex-none text-12 text-ink-subtle">
                        {row.createdAt.slice(0, 10)}
                      </span>
                      <span className="flex-none text-12-5 font-bold text-brand">
                        {isOpen ? t('result.collapse') : t('result.expand')}
                      </span>
                    </button>
                    {canDelete && (
                      <Button
                        variant="secondary"
                        className="h-[34px] flex-none rounded-10 px-3 text-danger"
                        onClick={() => setConfirmId(row.id)}
                      >
                        {tc('delete')}
                      </Button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
                      {!open ? (
                        <p className="m-0 text-13-5 text-ink-subtle">{t('result.loading')}</p>
                      ) : (
                        <>
                          <DiagnosisCard diagnosis={open.diagnosis} />
                          <div>
                            <h4 className="mt-0 mb-2.5 text-13 font-bold text-ink">
                              {t('result.answers')}
                            </h4>
                            <AnswerList questions={open.questions} answers={open.answers} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="text-12-5 text-ink-muted">{t('result.page', { from, to, total })}</span>
            <Button
              variant="secondary"
              className="h-[34px] rounded-10 px-3"
              disabled={page <= 1}
              onClick={() => void setPage(page - 1)}
            >
              {t('result.prev')}
            </Button>
            <Button
              variant="secondary"
              className="h-[34px] rounded-10 px-3"
              disabled={to >= total}
              onClick={() => void setPage(page + 1)}
            >
              {t('result.next')}
            </Button>
          </div>
        </>
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title={tc('delete')}
          text={t('result.confirmDelete')}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId;
            setConfirmId(null);
            void remove(id)
              .then(() => toast(tc('deleted')))
              .catch((e: unknown) =>
                toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`),
              );
          }}
        />
      )}
    </>
  );
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Одна строка про итог — в списке разворачивать карточку целиком незачем. */
function summary(diagnosis: Diagnosis | null, t: Translate): string {
  if (!diagnosis) return t('result.notConfigured');
  if (diagnosis.type === 'sum') return `${diagnosis.label} (${diagnosis.total})`;
  return diagnosis.categories
    .filter((c) => c.label)
    .map((c) => `${c.name}: ${c.label}`)
    .join(' · ');
}

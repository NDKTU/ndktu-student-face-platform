import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/entities/test/mock/tests';
import type { TestMeta } from '@/entities/test/model/types';
import { useQuizStore } from '@/features/testlar/model/quiz.store';
import { useTestlarStore } from '@/features/testlar/model/testlar.store';
import { useTestlar } from '@/features/testlar/lib/useTestlar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { PinModal } from './PinModal';
import { QuizRunner } from './QuizRunner';

export function StudentTestlarPage() {
  const { t } = useTranslation('testlar');
  const { t: tn } = useTranslation('nav');
  const { status, error, reload } = useTestlar();

  const allTests = useTestlarStore((s) => s.tests);
  const phase = useQuizStore((s) => s.phase);
  const result = useQuizStore((s) => s.result);
  const test = useQuizStore((s) => s.test);
  const start = useQuizStore((s) => s.start);
  const reset = useQuizStore((s) => s.reset);

  const [pinFor, setPinFor] = useState<TestMeta | null>(null);

  // Группу отфильтровал сервер; здесь остаётся отсеять закрытые тесты.
  const activeTests = useMemo(() => allTests.filter((x) => x.holati === 'Faol'), [allTests]);


  if (phase === 'quiz') {
    return (
      <>
        <CrumbBar crumbs={[{ label: tn('stestlar') }]} />
        <QuizRunner />
      </>
    );
  }

  if (phase === 'result' && result && test) {
    return (
      <>
        <CrumbBar crumbs={[{ label: tn('stestlar') }]} />
        <div className="mx-auto max-w-[600px] px-6 pt-10 pb-16 text-center">
          <div className="rounded-20 border border-line bg-surface p-8 shadow-card">
            <div
              className="mx-auto grid size-24 place-items-center rounded-full text-28 font-extrabold text-white"
              style={{ background: result.pct >= 60 ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {result.pct}%
            </div>
            <h1 className="mt-5 mb-1 text-23 font-extrabold tracking-[-0.02em] text-ink">
              {t('result.title')}
            </h1>
            <div className="text-14 text-ink-muted">{test.fan}</div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <ResultStat label={t('result.correct')} value={String(result.correct)} tone="success" />
              <ResultStat label={t('result.wrong')} value={String(result.wrong)} tone="danger" />
              <ResultStat label={t('result.spent')} value={formatTime(result.spent)} tone="ink" />
            </div>

            <Button className="mt-7" onClick={reset}>
              {t('result.back')}
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('stestlar') }]} />

      <div className="mx-auto w-full max-w-[1040px] px-8 pt-7 pb-12">
        <PageHeader title={t('studentTitle')} subtitle={t('studentSubtitle')} />

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {activeTests.map((item) => (
            <div key={item.id} className="rounded-16 border border-line bg-surface p-5 shadow-card">
              <div className="text-15 font-bold text-ink">{item.fan}</div>
              <div className="mt-1 text-12-5 text-ink-subtle">{item.oqituvchi}</div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-20 bg-surface-muted px-2.5 py-1 text-11-5 font-bold text-ink-muted">
                  {t('card.questions', { count: item.savollar })}
                </span>
                <span className="rounded-20 bg-surface-muted px-2.5 py-1 text-11-5 font-bold text-ink-muted">
                  {t('card.duration', { count: item.davomiylik })}
                </span>
              </div>
              <Button className="mt-4 w-full justify-center" onClick={() => setPinFor(item)}>
                {t('card.start')}
              </Button>
            </div>
          ))}
        </div>
        )}
      </div>

      {pinFor && (
        <PinModal
          test={pinFor}
          onStart={async (pin) => {
            // Ошибку не глотаем: PinModal покажет её тостом и оставит форму.
            await start(pinFor, pin);
            setPinFor(null);
          }}
          onCancel={() => setPinFor(null)}
        />
      )}
    </>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger' | 'ink';
}) {
  const color =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-12 bg-surface-raised px-2 py-3">
      <div className={`text-20 font-extrabold ${color}`}>{value}</div>
      <div className="mt-0.5 text-11-5 font-medium text-ink-subtle">{label}</div>
    </div>
  );
}

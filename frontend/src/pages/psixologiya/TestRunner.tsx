import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isAnswered, usePsyTestStore } from '@/features/psixologiya/model/psyTest.store';
import { Button } from '@/shared/ui/Button';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { AnswerList } from './AnswerList';
import { DiagnosisCard } from './DiagnosisCard';
import { QuestionRenderer } from './QuestionRenderer';

/** Прохождение методики: по одному вопросу, затем результат. */
export function TestRunner({ methodId, onExit }: { methodId: number; onExit: () => void }) {
  const { t } = useTranslation('psixologiya');

  const phase = usePsyTestStore((s) => s.phase);
  const method = usePsyTestStore((s) => s.method);
  const index = usePsyTestStore((s) => s.index);
  const answers = usePsyTestStore((s) => s.answers);
  const result = usePsyTestStore((s) => s.result);
  const error = usePsyTestStore((s) => s.error);
  const submitting = usePsyTestStore((s) => s.submitting);

  const start = usePsyTestStore((s) => s.start);
  const answer = usePsyTestStore((s) => s.answer);
  const toggle = usePsyTestStore((s) => s.toggle);
  const go = usePsyTestStore((s) => s.go);
  const next = usePsyTestStore((s) => s.next);
  const prev = usePsyTestStore((s) => s.prev);
  const finish = usePsyTestStore((s) => s.finish);
  const reset = usePsyTestStore((s) => s.reset);

  useEffect(() => {
    void start(methodId);
    return reset;
  }, [methodId, start, reset]);

  if (phase === 'loading') return <LoadingState />;
  if (phase === 'error') return <ErrorState message={error} onRetry={() => void start(methodId)} />;
  if (!method) return null;

  if (phase === 'result' && result) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        <div className="rounded-18 border border-line bg-surface px-6 py-7 text-center shadow-card">
          <h2 className="m-0 text-18 font-extrabold text-ink">{t('result.done')}</h2>
          <p className="mt-1 mb-0 text-13-5 text-ink-muted">{method.name}</p>
        </div>

        <DiagnosisCard diagnosis={result.diagnosis} />

        <div className="rounded-18 border border-line bg-surface p-5 shadow-card">
          <h3 className="mt-0 mb-3 text-14 font-bold text-ink">{t('result.answers')}</h3>
          <AnswerList questions={method.questions} answers={result.answers} />
        </div>

        <Button variant="secondary" onClick={onExit}>
          {t('result.back')}
        </Button>
      </div>
    );
  }

  const questions = method.questions;
  if (questions.length === 0) {
    return (
      <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
        <p className="m-0 text-13-5 text-ink-subtle">{t('method.noQuestions')}</p>
        <Button variant="secondary" className="mt-4" onClick={onExit}>
          {t('test.exit')}
        </Button>
      </div>
    );
  }

  const question = questions[Math.min(index, questions.length - 1)];
  if (!question) return null;

  const answeredCount = questions.filter((q) => isAnswered(answers[q.id] ?? null)).length;
  const isLast = index >= questions.length - 1;
  const unanswered = questions.length - answeredCount;

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <div className="rounded-18 border border-line bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-16 font-extrabold text-ink">{method.name}</h2>
            {method.description && (
              <p className="mt-0.5 mb-0 truncate text-12-5 text-ink-subtle">{method.description}</p>
            )}
          </div>
          <span className="flex-none text-13 font-bold text-brand">
            {t('test.progress', { current: index + 1, total: questions.length })}
          </span>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Точки-навигация: по методике ходят вперёд-назад, а не строго линейно. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              aria-label={t('result.question', { n: q.order })}
              onClick={() => go(i)}
              className={`size-6 cursor-pointer rounded-7 border-none text-10 font-bold ${
                i === index
                  ? 'bg-brand text-white'
                  : isAnswered(answers[q.id] ?? null)
                    ? 'bg-success-soft text-success'
                    : 'bg-surface-muted text-ink-subtle'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-18 border border-line bg-surface px-6 py-8 shadow-card">
        <QuestionRenderer
          question={question}
          value={answers[question.id] ?? null}
          onChange={(value) => answer(question.id, value)}
          onToggle={(value) => toggle(question.id, value)}
        />
      </div>

      {error && (
        <div className="rounded-12 border border-danger bg-danger-soft px-4 py-3 text-13-5 text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" disabled={index === 0} onClick={prev}>
          {t('test.prev')}
        </Button>

        <span className="text-12-5 text-ink-subtle">
          {unanswered > 0
            ? t('test.unanswered', { count: unanswered })
            : t('test.answered', { count: answeredCount })}
        </span>

        {isLast ? (
          <Button disabled={submitting} onClick={() => void finish()}>
            {submitting ? t('test.submitting') : t('test.finish')}
          </Button>
        ) : (
          <Button onClick={next}>{t('test.next')}</Button>
        )}
      </div>
    </div>
  );
}

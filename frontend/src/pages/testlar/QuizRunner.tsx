import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuizStore } from '@/features/testlar/model/quiz.store';
import { formatTime } from '@/entities/test/mock/tests';
import { Button } from '@/shared/ui/Button';

/** Прохождение теста с обратным отсчётом. Таймер живёт, пока фаза = quiz. */
export function QuizRunner() {
  const { t } = useTranslation('testlar');

  const test = useQuizStore((s) => s.test);
  const questions = useQuizStore((s) => s.questions);
  const index = useQuizStore((s) => s.index);
  const answers = useQuizStore((s) => s.answers);
  const remaining = useQuizStore((s) => s.remaining);
  const answer = useQuizStore((s) => s.answer);
  const goTo = useQuizStore((s) => s.goTo);
  const next = useQuizStore((s) => s.next);
  const prev = useQuizStore((s) => s.prev);
  const tick = useQuizStore((s) => s.tick);
  const finish = useQuizStore((s) => s.finish);

  // Один интервал на всё прохождение; tick сам завершит тест на нуле.
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  if (!test) return null;
  const question = questions[index]!;
  const answeredCount = Object.keys(answers).length;
  const lowTime = remaining <= 60;

  return (
    <div className="mx-auto max-w-[820px] px-6 pt-6 pb-16">
      <div className="quiz-bar mb-5 flex items-center justify-between gap-4 rounded-14 border border-line bg-surface px-5 py-3.5 shadow-card">
        <div className="min-w-0">
          <div className="truncate text-14 font-bold text-ink">{test.fan}</div>
          <div className="text-12 text-ink-subtle">
            {t('quiz.answered', { count: answeredCount, total: questions.length })}
          </div>
        </div>
        <div
          className={`flex items-center gap-2 rounded-11 px-3.5 py-2 font-mono text-16 font-bold tabular-nums ${
            lowTime ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
          }`}
        >
          <ClockIcon />
          {formatTime(remaining)}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {questions.map((_, i) => {
          const isCurrent = i === index;
          const isAnswered = answers[i] != null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={`size-8 rounded-9 border text-12 font-bold ${
                isCurrent
                  ? 'border-brand bg-brand text-white'
                  : isAnswered
                    ? 'border-success-soft bg-success-tint text-success'
                    : 'border-line bg-surface text-ink-muted'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="rounded-16 border border-line bg-surface p-6 shadow-card">
        <div className="mb-1 text-12 font-bold text-brand">
          {t('quiz.question', { current: index + 1, total: questions.length })}
        </div>
        <div className="mb-5 text-16 leading-[1.5] font-semibold text-ink">{question.text}</div>

        <div className="flex flex-col gap-2.5">
          {question.options.map((option, k) => {
            const selected = answers[index] === k;
            return (
              <button
                key={option.letter}
                type="button"
                onClick={() => answer(k)}
                className={`flex items-center gap-3 rounded-12 border px-4 py-3 text-left ${
                  selected
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-surface hover:bg-surface-raised'
                }`}
              >
                <span
                  className={`grid size-7 flex-none place-items-center rounded-8 text-12 font-bold ${
                    selected ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
                  }`}
                >
                  {option.letter}
                </span>
                <span className="text-14 font-semibold text-ink-secondary">{option.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="quiz-nav mt-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={prev} disabled={index === 0}>
          {t('quiz.prev')}
        </Button>
        {index === questions.length - 1 ? (
          <Button onClick={finish}>{t('quiz.finish')}</Button>
        ) : (
          <Button onClick={next}>{t('quiz.next')}</Button>
        )}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2" />
    </svg>
  );
}

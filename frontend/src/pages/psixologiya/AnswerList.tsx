import { useTranslation } from 'react-i18next';
import type { PsyAnswer, PsyQuestion } from '@/shared/api/psixologiya';

/**
 * Расшифровка сохранённых ответов.
 *
 * В результате лежат сырые значения (`true`, `3`, `[1,4]`) — без вопросов
 * методики они не читаются, поэтому список принимает и то, и другое.
 */
export function AnswerList({
  questions,
  answers,
}: {
  questions: PsyQuestion[];
  answers: PsyAnswer[];
}) {
  const { t } = useTranslation('psixologiya');
  const byId = new Map(questions.map((q) => [q.id, q]));

  return (
    <div className="flex flex-col gap-2">
      {answers.map((answer, index) => {
        const question = byId.get(answer.questionId);
        const images = pickImages(question, answer.value);

        return (
          <div key={answer.questionId} className="rounded-11 border border-line bg-surface px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-11 tracking-[0.04em] text-ink-subtle uppercase">
                  {t('result.question', { n: question?.order ?? index + 1 })}
                </p>
                <p className="mt-0.5 mb-0 text-13-5 text-ink">{question?.content.text || '—'}</p>
              </div>
              {images.length > 0 && (
                <div className="flex flex-none gap-1.5">
                  {images.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="size-14 rounded-9 border border-line object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-12 text-ink-subtle">{t('result.answer')}:</span>
              <span className="rounded-8 bg-brand-soft px-2 py-0.5 text-12 font-bold text-brand">
                {label(question, answer.value, t)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Картинки выбранных вариантов — только у тех типов, где вариант это картинка. */
function pickImages(question: PsyQuestion | undefined, value: unknown): string[] {
  if (!question || (question.type !== 'image_choice' && question.type !== 'multi_choice')) return [];
  const chosen = Array.isArray(value) ? value : [value];
  return question.options
    .filter((opt) => chosen.some((v) => String(v) === String(opt.value)))
    .map((opt) => opt.image_url)
    .filter((url): url is string => !!url);
}

function label(question: PsyQuestion | undefined, value: unknown, t: Translate): string {
  if (!question) return String(value ?? '—');

  switch (question.type) {
    case 'true_false':
      // Значение могло прийти и числом, и строкой: JSONB не типизирован.
      if (value === true || value === 1 || value === '1') return t('test.yes');
      if (value === false || value === 0 || value === '0') return t('test.no');
      return String(value ?? '—');

    case 'scale':
      return String(value ?? '—');

    case 'text':
    case 'image_stimulus':
      return question.options.find((o) => String(o.value) === String(value))?.text ?? String(value ?? '—');

    case 'image_choice': {
      const index = question.options.findIndex((o) => String(o.value) === String(value));
      return index >= 0 ? t('test.variant', { n: index + 1 }) : String(value ?? '—');
    }

    case 'multi_choice': {
      const chosen = Array.isArray(value) ? value : [value];
      const names = chosen.map((v) => {
        const index = question.options.findIndex((o) => String(o.value) === String(v));
        if (index < 0) return String(v);
        return question.options[index]?.description || t('test.variant', { n: index + 1 });
      });
      return names.length > 0 ? names.join(', ') : '—';
    }

    default:
      return String(value ?? '—');
  }
}

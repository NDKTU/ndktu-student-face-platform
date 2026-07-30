import { useTranslation } from 'react-i18next';
import type { PsyQuestion, QuestionOption } from '@/shared/api/psixologiya';
import type { AnswerValue } from '@/features/psixologiya/model/psyTest.store';

/**
 * Отрисовка одного вопроса методики.
 *
 * Тип вопроса задаёт и разметку `content`/`options`, и вид элемента управления —
 * шесть типов, шесть компонентов. Новый тип добавляется здесь и в
 * `QUESTION_TYPES` на бэкенде; молча свести его к «тексту» нельзя, поэтому
 * неизвестный тип показывает явное сообщение.
 */
export function QuestionRenderer({
  question,
  value,
  onChange,
  onToggle,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onToggle: (value: number) => void;
}) {
  const { t } = useTranslation('psixologiya');

  switch (question.type) {
    case 'true_false':
      return <TrueFalse question={question} value={value} onChange={onChange} />;
    case 'scale':
      return <Scale question={question} value={value} onChange={onChange} />;
    case 'text':
      return <TextOptions question={question} value={value} onChange={onChange} />;
    case 'image_stimulus':
      return <ImageStimulus question={question} value={value} onChange={onChange} />;
    case 'image_choice':
      return <ImageChoice question={question} value={value} onChange={onChange} />;
    case 'multi_choice':
      return <MultiChoice question={question} value={value} onToggle={onToggle} />;
    default:
      return <p className="text-center text-13-5 text-ink-subtle">{t('test.unknownType')}</p>;
  }
}

const PROMPT = 'text-center text-16 leading-[1.45] font-semibold text-ink';

/** Общий вид кнопки-варианта: выбранная подсвечена рамкой и фоном бренда. */
function optionClass(selected: boolean, extra = '') {
  return `cursor-pointer rounded-12 border-2 text-left transition-colors ${
    selected
      ? 'border-brand bg-brand-soft text-brand'
      : 'border-line bg-surface text-ink hover:border-brand'
  } ${extra}`;
}

function TrueFalse({
  question,
  value,
  onChange,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  const { t } = useTranslation('psixologiya');
  const choices = [
    { label: t('test.yes'), val: true },
    { label: t('test.no'), val: false },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      <p className={PROMPT}>{question.content.text}</p>
      <div className="flex gap-3">
        {choices.map(({ label, val }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(val)}
            className={optionClass(value === val, 'min-w-[120px] px-6 py-3 text-center text-14 font-bold')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Scale({
  question,
  value,
  onChange,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  const min = Number(question.content.min ?? 1);
  const max = Number(question.content.max ?? 5);
  // Испорченный диапазон не должен вешать вкладку бесконечным массивом.
  const count = Number.isFinite(min) && Number.isFinite(max) && max >= min ? max - min + 1 : 0;
  const steps = Array.from({ length: Math.min(count, 21) }, (_, i) => min + i);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className={PROMPT}>{question.content.text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={optionClass(value === n, 'size-12 text-center text-14 font-bold')}
          >
            {n}
          </button>
        ))}
      </div>
      {(question.content.min_label || question.content.max_label) && (
        <div className="flex w-full max-w-[340px] justify-between text-12 text-ink-subtle">
          <span>{question.content.min_label ?? ''}</span>
          <span>{question.content.max_label ?? ''}</span>
        </div>
      )}
    </div>
  );
}

function TextOptions({
  question,
  value,
  onChange,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className={PROMPT}>{question.content.text}</p>
      <OptionList options={question.options} value={value} onChange={onChange} />
    </div>
  );
}

function ImageStimulus({
  question,
  value,
  onChange,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      {question.content.image_url && (
        <img
          src={question.content.image_url}
          alt=""
          className="max-h-[260px] rounded-14 border border-line object-contain"
        />
      )}
      {question.content.text && <p className={PROMPT}>{question.content.text}</p>}
      <div className="w-full">
        <OptionList options={question.options} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function ImageChoice({
  question,
  value,
  onChange,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  const { t } = useTranslation('psixologiya');

  return (
    <div className="flex flex-col items-center gap-5">
      {question.content.text && <p className={PROMPT}>{question.content.text}</p>}
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
        {question.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            aria-label={t('test.variant', { n: i + 1 })}
            onClick={() => onChange(opt.value)}
            className={optionClass(value === opt.value, 'overflow-hidden p-0')}
          >
            <img src={opt.image_url} alt="" className="h-28 w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChoice({
  question,
  value,
  onToggle,
}: {
  question: PsyQuestion;
  value: AnswerValue;
  onToggle: (value: number) => void;
}) {
  const { t } = useTranslation('psixologiya');
  const selected = Array.isArray(value) ? value : [];

  return (
    <div className="flex flex-col gap-4">
      <p className={PROMPT}>{question.content.text}</p>
      {question.content.description && (
        <p className="m-0 text-center text-13 text-ink-muted">{question.content.description}</p>
      )}
      <p className="m-0 text-center text-12 text-ink-subtle">{t('test.multiHint')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {question.options.map((opt, i) => {
          const numeric = Number(opt.value);
          const isOn = selected.includes(numeric);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggle(numeric)}
              className={optionClass(isOn, 'overflow-hidden p-0')}
            >
              {opt.image_url ? (
                <img src={opt.image_url} alt="" className="h-28 w-full object-cover" />
              ) : (
                <span className="flex h-28 w-full items-center justify-center bg-surface-muted text-12 text-ink-subtle">
                  {opt.description || t('test.variant', { n: i + 1 })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionList({
  options,
  value,
  onChange,
}: {
  options: QuestionOption[];
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(opt.value)}
          className={optionClass(value === opt.value, 'px-4 py-3 text-13-5')}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}

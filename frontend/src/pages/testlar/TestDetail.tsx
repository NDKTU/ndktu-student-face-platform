import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  StudentAttempt,
  TestDetailData,
  TestMeta,
  TestStatus,
} from '@/entities/test/model/types';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const STATUS_TONE: Record<TestStatus, { bg: string; fg: string }> = {
  Faol: { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' },
  Yopiq: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
  Yopilgan: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
};

/** Аналитика теста: показатели, результаты студентов и разбор по вопросам.
 *  Данные считает бэкенд по реальным попыткам — страница их только рисует. */
export function TestDetail({ test, data }: { test: TestMeta; data: TestDetailData }) {
  const { t } = useTranslation('testlar');
  const toast = useToast();

  const [tab, setTab] = useState<'results' | 'questions'>('results');
  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);

  const tone = STATUS_TONE[test.holati];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-24 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
              {test.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="rounded-20 bg-brand-soft px-2.5 py-1 text-11-5 font-bold text-brand">
                {test.guruh}
              </span>
              <span className="text-13 text-ink-subtle">
                {test.fan} · {test.oqituvchi}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-20 px-2.5 py-1 text-11-5 font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {t(`status.${test.holati}`)}
              </span>
            </div>
          </div>

          <div className="flex flex-none items-center gap-2">
            <div className="flex items-center gap-2 rounded-11 border border-line bg-surface-raised px-3 py-2">
              <span className="text-11 font-bold text-ink-subtle">PIN</span>
              <span className="font-mono text-16 font-extrabold tracking-[0.2em] text-brand">
                {test.pin}
              </span>
              <button
                type="button"
                aria-label={t('detail.copyPin')}
                onClick={() => {
                  void navigator.clipboard?.writeText(test.pin ?? '');
                  toast(t('detail.pinCopied'));
                }}
                className="grid size-6 cursor-pointer place-items-center rounded-8 border-none bg-transparent text-ink-subtle hover:bg-surface-muted"
              >
                <CopyIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <StatCard value={`${data.stats.submitted}/${data.stats.total}`} label={t('detail.stat.submitted')} />
          <StatCard value={`${data.stats.avg}%`} label={t('detail.stat.avg')} />
          <StatCard value={data.stats.max} label={t('detail.stat.max')} />
          <StatCard value={data.stats.min} label={t('detail.stat.min')} />
          <StatCard value={data.stats.avgTime} label={t('detail.stat.avgTime')} />
        </div>

        <div className="mt-5 flex gap-6 border-t border-surface-sunken pt-1">
          <TabButton active={tab === 'results'} onClick={() => { setTab('results'); setAttempt(null); }}>
            {t('detail.tab.results')}
          </TabButton>
          <TabButton active={tab === 'questions'} onClick={() => { setTab('questions'); setAttempt(null); }}>
            {t('detail.tab.questions')}
          </TabButton>
        </div>
      </div>

      {tab === 'results' &&
        (attempt ? (
          <AttemptReview
            test={test}
            attempt={attempt}
            questions={data.questions}
            onBack={() => setAttempt(null)}
          />
        ) : (
          <ResultsTable students={data.students} onOpen={setAttempt} />
        ))}

      {tab === 'questions' && <QuestionAnalysis data={data} />}
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-14 border border-line bg-surface-raised px-4 py-3.5">
      <div className="text-20 font-extrabold tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-0.5 text-11-5 font-medium text-ink-subtle">{label}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`cursor-pointer border-none border-b-2 bg-transparent px-0 py-3 text-13-5 font-bold ${
        active ? 'border-brand text-brand' : 'border-transparent text-ink-faint hover:text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function ResultsTable({
  students,
  onOpen,
}: {
  students: StudentAttempt[];
  onOpen: (s: StudentAttempt) => void;
}) {
  const { t } = useTranslation('testlar');

  return (
    <div className="overflow-hidden rounded-18 border border-line bg-surface shadow-card">
      <table className="rtab w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-sunken">
            <Th>{t('detail.results.fish')}</Th>
            <Th className="w-24 text-center">{t('detail.results.ball')}</Th>
            <Th className="w-24 text-center">{t('detail.results.foiz')}</Th>
            <Th className="w-28">{t('detail.results.vaqt')}</Th>
            <Th className="w-32">{t('detail.results.sana')}</Th>
            <Th className="w-36">{t('detail.results.holati')}</Th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr
              key={s.id}
              onClick={s.submitted ? () => onOpen(s) : undefined}
              className={`border-b border-surface-muted last:border-b-0 ${
                s.submitted ? 'cursor-pointer hover:bg-surface-raised' : ''
              }`}
            >
              <Td label={t('detail.results.fish')}>
                <span className="flex items-center gap-2.5">
                  <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-soft text-11 font-bold text-brand">
                    {s.initials}
                  </span>
                  <span className="font-semibold text-ink">{s.fish}</span>
                </span>
              </Td>
              <Td label={t('detail.results.ball')} className="text-center font-bold text-ink">
                {s.submitted ? `${s.ball} / ${s.total}` : '—'}
              </Td>
              <Td label={t('detail.results.foiz')} className="text-center font-bold text-brand">
                {s.submitted ? `${s.pct}%` : '—'}
              </Td>
              <Td label={t('detail.results.vaqt')} className="font-mono text-13 text-ink-secondary">
                {s.time}
              </Td>
              <Td label={t('detail.results.sana')} className="text-13 text-ink-muted">
                {s.sana || '—'}
              </Td>
              <Td label={t('detail.results.holati')}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-20 px-2.5 py-1 text-11-5 font-bold"
                  style={
                    s.submitted
                      ? { background: 'var(--color-success-tint)', color: 'var(--color-success)' }
                      : { background: 'var(--color-surface-alt)', color: 'var(--color-ink-muted)' }
                  }
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {s.submitted ? t('detail.studentStatus.submitted') : t('detail.studentStatus.notSubmitted')}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttemptReview({
  test,
  attempt,
  questions,
  onBack,
}: {
  test: TestMeta;
  attempt: StudentAttempt;
  questions: TestDetailData['questions'];
  onBack: () => void;
}) {
  const { t } = useTranslation('testlar');

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" className="w-fit" onClick={onBack}>
        ‹ {t('detail.back')}
      </Button>

      <div className="flex items-center justify-between gap-4 rounded-16 border border-line bg-surface p-5 shadow-card">
        <div className="text-16 font-bold text-ink">{attempt.fish}</div>
        <div className="flex gap-6 text-right">
          <MetaCell value={`${attempt.ball} / ${attempt.total}`} label={t('detail.results.ball')} />
          <MetaCell value={`${attempt.pct}%`} label={t('detail.results.foiz')} accent />
          <MetaCell value={attempt.time} label={t('detail.results.vaqt')} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {questions.map((q, qi) => {
          const chosen = attempt.answers[qi];
          return (
            <div key={qi} className="rounded-16 border border-line bg-surface p-5 shadow-card">
              <div className="flex gap-3">
                <span className="grid size-7 flex-none place-items-center rounded-full bg-surface-muted text-12 font-bold text-ink-subtle">
                  {qi + 1}
                </span>
                <div className="text-14-5 leading-[1.5] font-semibold text-ink">
                  {test.fan} — {stripFan(q.text, test.fan)}
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 pl-10">
                {q.options.map((opt, k) => {
                  const isCorrect = k === q.correct;
                  const isChosen = k === chosen;
                  const wrongChoice = isChosen && !isCorrect;
                  return (
                    <div
                      key={opt.letter}
                      className="flex items-center gap-3 rounded-11 border px-3 py-2.5"
                      style={{
                        background: isCorrect ? '#EDF7EE' : wrongChoice ? '#FDECEC' : '#F8F9FE',
                        borderColor: isCorrect ? '#B6E2C6' : wrongChoice ? '#F3C6C6' : '#EEF0F6',
                      }}
                    >
                      <span
                        className="grid size-[26px] flex-none place-items-center rounded-8 text-12 font-bold"
                        style={{
                          background: isCorrect ? '#22A560' : wrongChoice ? 'var(--color-danger)' : 'var(--color-line)',
                          color: isCorrect || wrongChoice ? '#fff' : 'var(--color-ink-muted)',
                        }}
                      >
                        {opt.letter}
                      </span>
                      <span
                        className="flex-1 text-13-5 font-semibold"
                        style={{
                          color: isCorrect ? '#157A43' : wrongChoice ? 'var(--color-danger)' : 'var(--color-ink-secondary)',
                        }}
                      >
                        {opt.text}
                      </span>
                      {isCorrect && (
                        <span className="flex-none text-12 font-bold text-success">{t('detail.question.correct')}</span>
                      )}
                      {wrongChoice && (
                        <span className="flex-none text-12 font-bold text-danger">{t('detail.question.selected')}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionAnalysis({ data }: { data: TestDetailData }) {
  const { t } = useTranslation('testlar');

  return (
    <div className="flex flex-col gap-2.5">
      {data.perQuestion.map((q) => (
        <div key={q.no} className="rounded-14 border border-line bg-surface p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className="grid size-7 flex-none place-items-center rounded-full bg-surface-muted text-12 font-bold text-ink-subtle">
              {q.no}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-13-5 font-semibold text-ink">{q.text}</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-[9px] flex-1 overflow-hidden rounded-md bg-danger-soft">
                  <div className="h-full rounded-md bg-success transition-[width] duration-500" style={{ width: `${q.pct}%` }} />
                </div>
                <span className="w-24 flex-none text-right text-12 font-bold text-ink">
                  {t('detail.question.correctCount', { count: q.correctN })} · {q.pct}%
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetaCell({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-16 font-extrabold ${accent ? 'text-brand' : 'text-ink'}`}>{value}</div>
      <div className="text-11 text-ink-subtle">{label}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-3 text-11-5 font-bold text-ink-subtle uppercase ${className}`}>{children}</th>;
}

function Td({ children, label, className = '' }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <td data-label={label} className={`px-5 py-3 text-13-5 ${className}`}>
      {children}
    </td>
  );
}

/** «{Fan} — {текст}» уже содержит фан в начале; убираем дубль перед выводом. */
function stripFan(text: string, fan: string): string {
  const prefix = `${fan} — `;
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

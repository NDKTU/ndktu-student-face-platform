import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TEACHER_SUBJECTS } from '@/entities/question/mock/buildQuestions';
import type { OptionLetter, Question } from '@/entities/question/model/types';
import { useSavollarStore } from '@/features/savollar/model/savollar.store';
import { useSavollar } from '@/features/savollar/lib/useSavollar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { RowMenu } from '@/shared/ui/RowMenu';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { QuestionModal, EMPTY_QUESTION_DRAFT, type QuestionDraft } from './QuestionModal';

const LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];

type ModalState = {
  mode: 'add' | 'edit';
  id?: number;
  draft: QuestionDraft;
  images: Record<OptionLetter, boolean>;
};

const NO_IMAGES: Record<OptionLetter, boolean> = { A: false, B: false, C: false, D: false };

export function SavollarPage() {
  const { t } = useTranslation('savollar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { status, error, reload } = useSavollar();

  const questions = useSavollarStore((s) => s.questions);
  const add = useSavollarStore((s) => s.add);
  const update = useSavollarStore((s) => s.update);
  const remove = useSavollarStore((s) => s.remove);

  const [subjectId, setSubjectId] = useState<string>(TEACHER_SUBJECTS[0].id);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirm, setConfirm] = useState<{ id: number } | null>(null);

  const subject = TEACHER_SUBJECTS.find((s) => s.id === subjectId) ?? TEACHER_SUBJECTS[0];
  const rows = useMemo(
    () => questions.filter((q) => q.subjectId === subject.id),
    [questions, subject.id],
  );

  function openAdd() {
    setModal({ mode: 'add', draft: EMPTY_QUESTION_DRAFT, images: NO_IMAGES });
  }

  function openEdit(question: Question) {
    const options = { A: '', B: '', C: '', D: '' } as Record<OptionLetter, string>;
    const images = { ...NO_IMAGES };
    question.options.forEach((o) => {
      options[o.letter] = o.text;
      images[o.letter] = o.image;
    });
    setModal({
      mode: 'edit',
      id: question.id,
      draft: { text: question.text, correct: question.correct, options },
      images,
    });
  }

  async function handleSave(draft: QuestionDraft) {
    if (!modal) return;
    // Флаги картинок сохраняем от исходного вопроса — форма их не редактирует.
    const options = LETTERS.map((letter) => ({
      letter,
      text: draft.options[letter],
      image: modal.images[letter],
    }));
    try {
      if (modal.mode === 'add') {
        await add({ subjectId: subject.id, text: draft.text, correct: draft.correct, options });
        toast(tc('created'));
      } else if (modal.id) {
        await update(modal.id, { text: draft.text, correct: draft.correct, options });
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      await remove(confirm.id);
      toast(tc('deleted'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setConfirm(null);
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1040px] px-8 pt-7 pb-12">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-[5px] block text-11-5 font-semibold text-ink-subtle">
                  {t('fanLabel')}
                </span>
                <select
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setExpandedId(null);
                  }}
                  className="h-[42px] min-w-[250px] cursor-pointer rounded-11 border border-line bg-surface px-3 text-14 font-semibold text-ink outline-none focus:border-brand focus:shadow-focus"
                >
                  {TEACHER_SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fan}
                    </option>
                  ))}
                </select>
              </label>
              <Button className="h-[42px] rounded-11 px-4" onClick={openAdd}>
                + {t('addQuestion')}
              </Button>
            </div>
          }
        />

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : (
          <>
            <div className="mb-4 text-13 text-ink-muted">
              {t('bankCountPrefix')}{' '}
              <b className="text-ink">{t('bankCountValue', { count: rows.length })}</b>{' '}
              {t('bankCountSuffix')}
            </div>

            {rows.length === 0 ? (
              <div className="rounded-14 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
                <h3 className="m-0 text-16 font-bold text-ink">{t('emptyTitle')}</h3>
                <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">
                  {t('emptyText')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rows.map((question, index) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    index={index + 1}
                    expanded={expandedId === question.id}
                    onToggle={() =>
                      setExpandedId((id) => (id === question.id ? null : question.id))
                    }
                    onEdit={() => openEdit(question)}
                    onDelete={() => setConfirm({ id: question.id })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <QuestionModal
          mode={modal.mode}
          initial={modal.draft}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('action.delete')}
          text={t('confirmDelete')}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function QuestionRow({
  question,
  index,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  question: Question;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('savollar');

  return (
    <div className="rounded-14 border border-line bg-surface shadow-card">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="relative flex cursor-pointer items-center gap-3.5 p-[14px_16px]"
      >
        <span className="grid size-7 flex-none place-items-center rounded-8 bg-canvas text-12 font-bold text-ink-subtle">
          {index}
        </span>
        <div className="line-clamp-2 min-w-0 flex-1 text-14 leading-[1.4] font-semibold text-ink">
          {question.text}
        </div>

        <span className="inline-flex flex-none items-center gap-[5px] rounded-20 bg-success-tint px-[11px] py-[5px] text-12 font-bold text-success">
          <span className="size-1.5 rounded-full bg-success-bright" />
          {t('correct', { letter: question.correct })}
        </span>

        <RowMenu
          items={[
            { label: t('action.edit'), onClick: onEdit },
            { label: t('action.delete'), danger: true, onClick: onDelete },
          ]}
        />

        <ChevronIcon open={expanded} />
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 px-4 pt-1 pb-4">
          {question.options.map((option) => (
            <div
              key={option.letter}
              className="flex items-center gap-3 rounded-11 border px-3 py-2.5"
              style={{
                background: option.correct ? '#EDF7EE' : '#F8F9FE',
                borderColor: option.correct ? '#B6E2C6' : '#EEF0F6',
              }}
            >
              <span
                className="grid size-[26px] flex-none place-items-center rounded-8 text-12 font-bold"
                style={{
                  background: option.correct ? '#22A560' : 'var(--color-line)',
                  color: option.correct ? '#fff' : 'var(--color-ink-muted)',
                }}
              >
                {option.letter}
              </span>
              <span
                className="text-13-5 font-semibold"
                style={{ color: option.correct ? '#157A43' : 'var(--color-ink-secondary)' }}
              >
                {option.text}
              </span>
              {option.image && (
                <span className="ml-auto rounded-20 bg-surface-muted px-2 py-0.5 text-11 font-bold text-ink-subtle">
                  {t('hasImage')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none text-ink-subtle transition-transform duration-150"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

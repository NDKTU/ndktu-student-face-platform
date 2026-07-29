import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OptionLetter } from '@/entities/question/model/types';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];

export interface QuestionDraft {
  text: string;
  correct: OptionLetter;
  options: Record<OptionLetter, string>;
}

export const EMPTY_QUESTION_DRAFT: QuestionDraft = {
  text: '',
  correct: 'A',
  options: { A: '', B: '', C: '', D: '' },
};

interface QuestionModalProps {
  mode: 'add' | 'edit';
  initial: QuestionDraft;
  onSave: (draft: QuestionDraft) => void;
  onCancel: () => void;
}

/** Форма вопроса: текст, 4 варианта и выбор правильного (радио на букве). */
export function QuestionModal({ mode, initial, onSave, onCancel }: QuestionModalProps) {
  const { t } = useTranslation('savollar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const [draft, setDraft] = useState<QuestionDraft>(initial);

  function submit() {
    if (!draft.text.trim()) {
      toast(t('validation.questionRequired'));
      return;
    }
    onSave(draft);
  }

  return (
    <Modal
      title={mode === 'add' ? t('modal.add') : t('modal.edit')}
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>{tc('save')}</Button>
        </>
      }
    >
      <ModalField label={`${t('field.question')} *`}>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          placeholder={t('placeholder.question')}
          rows={2}
          className={`${modalInputClass} h-auto py-2.5`}
          autoFocus
        />
      </ModalField>

      <div className="mt-1 mb-1.5 text-12-5 font-semibold text-ink-muted">{t('field.correct')}</div>
      <div className="flex flex-col gap-2.5">
        {LETTERS.map((letter) => {
          const isCorrect = draft.correct === letter;
          return (
            <label
              key={letter}
              className={`flex cursor-pointer items-center gap-3 rounded-11 border px-3 py-2 ${
                isCorrect ? 'border-success bg-success-tint' : 'border-line bg-surface-raised'
              }`}
            >
              <input
                type="radio"
                name="correct"
                checked={isCorrect}
                onChange={() => setDraft((d) => ({ ...d, correct: letter }))}
                className="sr-only"
              />
              <span
                className="grid size-[26px] flex-none place-items-center rounded-8 text-12 font-bold"
                style={{
                  background: isCorrect ? '#22A560' : 'var(--color-line)',
                  color: isCorrect ? '#fff' : 'var(--color-ink-muted)',
                }}
              >
                {letter}
              </span>
              <input
                value={draft.options[letter]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, options: { ...d.options, [letter]: e.target.value } }))
                }
                onClick={(e) => e.stopPropagation()}
                placeholder={t('placeholder.option')}
                className="h-9 flex-1 rounded-8 border border-line bg-surface px-3 text-14 text-ink outline-none focus:border-brand"
              />
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

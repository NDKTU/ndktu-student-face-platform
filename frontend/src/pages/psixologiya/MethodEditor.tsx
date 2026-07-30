import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nextOrder, useMethodsStore } from '@/features/psixologiya/model/methods.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { PsyMethod, PsyQuestion, QuestionDraft } from '@/shared/api/psixologiya';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';
import { EMPTY_QUESTION, QuestionModal } from './QuestionModal';

type ModalState = { mode: 'add' | 'edit'; id?: number; draft: QuestionDraft };

/** Список вопросов методики с редактором. Только для тех, кто ведёт методики. */
export function MethodEditor({ method }: { method: PsyMethod }) {
  const { t } = useTranslation('psixologiya');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { has } = usePermissions();

  const addQuestion = useMethodsStore((s) => s.addQuestion);
  const editQuestion = useMethodsStore((s) => s.editQuestion);
  const removeQuestion = useMethodsStore((s) => s.removeQuestion);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canCreate = has('create:psychology');
  const canUpdate = has('update:psychology');
  const canDelete = has('delete:psychology');

  function toDraft(question: PsyQuestion): QuestionDraft {
    return {
      type: question.type,
      content: question.content,
      options: question.options,
      order: question.order,
      category: question.category,
    };
  }

  async function save(draft: QuestionDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await addQuestion(method.id, draft);
        toast(tc('created'));
      } else if (modal.id) {
        await editQuestion(method.id, modal.id, draft);
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-13-5 text-ink-subtle">
          {t('method.questions', { count: method.questions.length })}
        </p>
        {canCreate && (
          <Button
            className="h-[38px] rounded-11 px-4"
            onClick={() =>
              setModal({
                mode: 'add',
                draft: { ...EMPTY_QUESTION, order: nextOrder(method) },
              })
            }
          >
            + {t('question.add')}
          </Button>
        )}
      </div>

      {method.questions.length === 0 ? (
        <div className="rounded-14 border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
          <p className="m-0 text-13-5 text-ink-subtle">{t('question.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {method.questions.map((question) => (
            <div
              key={question.id}
              className="flex items-center gap-3 rounded-12 border border-line bg-surface px-4 py-3 shadow-card"
            >
              <span className="grid size-7 flex-none place-items-center rounded-8 bg-surface-muted text-12 font-bold text-ink-secondary">
                {question.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-13-5 font-semibold text-ink">
                  {question.content.text || '—'}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-6 bg-brand-soft px-1.5 py-0.5 text-11 font-bold text-brand">
                    {t(`type.${question.type}`)}
                  </span>
                  {question.category && (
                    <span className="text-11-5 text-ink-subtle">{question.category}</span>
                  )}
                </div>
              </div>
              {canUpdate && (
                <Button
                  variant="secondary"
                  className="h-[32px] flex-none rounded-9 px-3"
                  onClick={() => setModal({ mode: 'edit', id: question.id, draft: toDraft(question) })}
                >
                  {tc('edit')}
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="secondary"
                  className="h-[32px] flex-none rounded-9 px-3 text-danger"
                  onClick={() => setConfirmId(question.id)}
                >
                  {tc('delete')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <QuestionModal
          mode={modal.mode}
          initial={modal.draft}
          onSave={(draft) => void save(draft)}
          onCancel={() => setModal(null)}
        />
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title={tc('delete')}
          text={t('question.confirmDelete')}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId;
            setConfirmId(null);
            void removeQuestion(method.id, id)
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

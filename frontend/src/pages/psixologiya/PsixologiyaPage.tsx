import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMethodsStore } from '@/features/psixologiya/model/methods.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { MethodDraft } from '@/shared/api/psixologiya';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { MethodEditor } from './MethodEditor';
import { EMPTY_METHOD, MethodModal } from './MethodModal';
import { ResultsPanel } from './ResultsPanel';
import { TestRunner } from './TestRunner';

type Tab = 'methods' | 'results';
type ModalState = { mode: 'add' | 'edit'; id?: number; draft: MethodDraft };

/**
 * Психология: список методик, редактор вопросов и результаты.
 *
 * Один экран на всех: студент видит те же методики, но вместо редактора у него
 * кнопка «пройти». Разделять на два раздела нечего — набор методик один, и
 * различают их права, а не роль.
 */
export function PsixologiyaPage() {
  const { t } = useTranslation('psixologiya');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { has, persona } = usePermissions();

  const methods = useMethodsStore((s) => s.methods);
  const status = useMethodsStore((s) => s.status);
  const error = useMethodsStore((s) => s.error);
  const load = useMethodsStore((s) => s.load);
  const reload = useMethodsStore((s) => s.reload);
  const addMethod = useMethodsStore((s) => s.addMethod);
  const editMethod = useMethodsStore((s) => s.editMethod);
  const removeMethod = useMethodsStore((s) => s.removeMethod);

  const [tab, setTab] = useState<Tab>('methods');
  const [openId, setOpenId] = useState<number | null>(null);
  const [takingId, setTakingId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canCreate = has('create:psychology');
  const canUpdate = has('update:psychology');
  const canDelete = has('delete:psychology');
  const canSeeResults = has('read:psychology_results');
  // Редактор показываем только тому, кто вообще может что-то менять; всем
  // остальным методика — это тест, который проходят.
  const isEditor = canCreate || canUpdate || canDelete;

  useEffect(() => {
    void load();
  }, [load]);

  async function save(draft: MethodDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        const created = await addMethod(draft);
        setOpenId(created.id);
        toast(tc('created'));
      } else if (modal.id) {
        await editMethod(modal.id, draft);
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (takingId !== null) {
    return (
      <>
        <CrumbBar
          crumbs={[
            { label: t('title'), onClick: () => setTakingId(null) },
            { label: methods.find((m) => m.id === takingId)?.name ?? '' },
          ]}
        />
        <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
          <TestRunner methodId={takingId} onExit={() => setTakingId(null)} />
        </div>
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1100px] px-8 pt-7 pb-12">
        <PageHeader
          title={t('title')}
          subtitle={persona === 'student' ? t('studentSubtitle') : t('subtitle')}
          actions={
            canCreate && tab === 'methods' ? (
              <Button
                className="h-[42px] rounded-11 px-4"
                onClick={() => setModal({ mode: 'add', draft: EMPTY_METHOD })}
              >
                + {t('method.add')}
              </Button>
            ) : undefined
          }
        />

        {canSeeResults && (
          <div className="mb-5 flex gap-1 rounded-12 border border-line bg-surface p-1 shadow-card">
            {(['methods', 'results'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-[34px] cursor-pointer rounded-9 border-none px-4 text-13 font-bold ${
                  tab === key ? 'bg-brand text-white' : 'bg-transparent text-ink-secondary'
                }`}
              >
                {t(`tab.${key}`)}
              </button>
            ))}
          </div>
        )}

        {tab === 'results' && canSeeResults ? (
          <ResultsPanel />
        ) : status === 'idle' || status === 'loading' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : methods.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('method.emptyTitle')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">
              {isEditor ? t('method.emptyText') : t('method.emptyStudent')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {methods.map((method) => {
              const isOpen = method.id === openId;
              return (
                <div key={method.id} className="rounded-16 border border-line bg-surface shadow-card">
                  <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-[200px] flex-1">
                      <h3 className="m-0 text-15 font-bold text-ink">{method.name}</h3>
                      {method.description && (
                        <p className="mt-0.5 mb-0 text-12-5 text-ink-subtle">{method.description}</p>
                      )}
                      <p className="mt-1 mb-0 text-12 text-ink-muted">
                        {t('method.questions', { count: method.questions.length })}
                      </p>
                    </div>

                    <Button
                      className="h-[36px] flex-none rounded-10 px-4"
                      disabled={method.questions.length === 0}
                      onClick={() => setTakingId(method.id)}
                    >
                      {t('method.start')}
                    </Button>

                    {isEditor && (
                      <Button
                        variant="secondary"
                        className="h-[36px] flex-none rounded-10 px-3"
                        onClick={() => setOpenId(isOpen ? null : method.id)}
                      >
                        {isOpen ? t('result.collapse') : t('method.open')}
                      </Button>
                    )}
                    {canUpdate && (
                      <Button
                        variant="secondary"
                        className="h-[36px] flex-none rounded-10 px-3"
                        onClick={() =>
                          setModal({
                            mode: 'edit',
                            id: method.id,
                            draft: {
                              name: method.name,
                              description: method.description,
                              instruction: method.instruction,
                            },
                          })
                        }
                      >
                        {tc('edit')}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="secondary"
                        className="h-[36px] flex-none rounded-10 px-3 text-danger"
                        onClick={() => setConfirmId(method.id)}
                      >
                        {tc('delete')}
                      </Button>
                    )}
                  </div>

                  {isOpen && isEditor && (
                    <div className="border-t border-line px-5 py-4">
                      <MethodEditor method={method} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <MethodModal
          mode={modal.mode}
          initial={modal.draft}
          onSave={(draft) => void save(draft)}
          onCancel={() => setModal(null)}
        />
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title={t('method.delete')}
          text={t('method.confirmDelete')}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId;
            setConfirmId(null);
            if (openId === id) setOpenId(null);
            void removeMethod(id)
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

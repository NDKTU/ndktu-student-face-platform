import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTasksStore, type SubmitDraft } from '@/features/vazifalar/model/tasks.store';
import { useVazifalar } from '@/features/vazifalar/lib/useVazifalar';
import { toStudentTask } from '@/entities/task/lib/taskState';
import { taskStatusMeta } from '@/entities/task/mock/studentTasks';
import type { StudentTask, TaskStatus } from '@/entities/task/model/types';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const TABS: (TaskStatus | 'all')[] = ['all', 'topshirilmagan', 'topshirilgan', 'baholangan', 'kechikkan'];

export function StudentVazifalarPage() {
  const { t } = useTranslation('vazifalar');
  const { t: tn } = useTranslation('nav');

  const { status: loadStatus, error, reload } = useVazifalar(true);
  const allTasks = useTasksStore((s) => s.tasks);

  // Список уже урезан сервером до своей группы; своё состояние — в mySub.
  const tasks = useMemo(() => allTasks.map(toStudentTask), [allTasks]);
  const [tab, setTab] = useState<TaskStatus | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(null);

  const filtered = tab === 'all' ? tasks : tasks.filter((x) => x.status === tab);
  const task = selected ? (tasks.find((x) => x.id === selected) ?? null) : null;

  const columns: Column<StudentTask>[] = [
    { key: 'title', label: t('column.title'), render: (x) => x.title, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'fan', label: t('column.fan'), width: 220, padX: 16, render: (x) => x.fan, cellClass: 'text-13 text-ink-muted' },
    { key: 'deadline', label: t('column.deadline'), width: 120, padX: 14, render: (x) => x.deadline, cellClass: 'text-13 text-ink-secondary' },
    {
      key: 'status',
      label: t('column.status'),
      width: 140,
      padX: 14,
      render: (x) => {
        const meta = taskStatusMeta(x.status);
        return (
          <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: meta.bg, color: meta.fg }}>
            {t(`status.${x.status}`)}
          </span>
        );
      },
    },
    { key: 'ball', label: t('column.ball'), width: 80, padX: 12, align: 'center', render: (x) => (x.ball != null ? x.ball : '—'), cellClass: 'text-13 font-bold text-ink' },
  ];

  if (task) {
    return (
      <>
        <CrumbBar
          crumbs={[{ label: tn('svazlar'), onClick: () => setSelected(null) }, { label: task.title }]}
        />
        <TaskDetail task={task} />
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('svazlar') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={t('studentTitle')} subtitle={t('studentSubtitle', { count: tasks.length })} />

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-20 border px-3.5 py-1.5 text-12-5 font-bold ${
                tab === key
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink-muted hover:bg-surface-raised'
              }`}
            >
              {t(`filter.${key}`)}
            </button>
          ))}
        </div>

        {loadStatus === 'loading' || loadStatus === 'idle' ? (
          <LoadingState />
        ) : loadStatus === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : filtered.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('empty.text')}</p>
          </div>
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={filtered} rowKey={(x) => x.id} onRowClick={(x) => setSelected(x.id)} />
          </TableCard>
        )}
      </div>
    </>
  );
}

function TaskDetail({ task }: { task: StudentTask }) {
  const { t } = useTranslation('vazifalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const submit = useTasksStore((s) => s.submit);

  const [modalOpen, setModalOpen] = useState(false);
  const meta = taskStatusMeta(task.status);
  const overdue = task.status === 'kechikkan';

  async function handleSubmit(draft: SubmitDraft) {
    if (!draft.file.trim() && !draft.text.trim() && !draft.link.trim()) {
      toast(t('submitModal.empty'));
      return;
    }
    try {
      await submit(task.id, draft);
      setModalOpen(false);
      toast(t('submitModal.done'));
    } catch (e) {
      // Форму не закрываем: написанное не должно пропасть из-за сбоя сети.
      toast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto w-full mx-auto w-full max-w-[1040px] px-8 pt-7 pb-12">
      <div className="rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="mb-1 flex items-center gap-2.5">
          <span className="text-12-5 text-ink-subtle">{task.fan}</span>
          <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: meta.bg, color: meta.fg }}>
            {t(`status.${task.status}`)}
          </span>
        </div>
        <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
          {task.title}
        </h1>
        {task.desc && <p className="mt-2 text-14 leading-[1.55] text-ink-muted">{task.desc}</p>}
        <div className="mt-3 text-13 font-semibold text-ink-secondary">
          {t('detail.deadline', { date: task.deadline })}
        </div>
      </div>

      {task.status === 'baholangan' && (
        <div className="mt-4 rounded-18 border border-success-soft bg-success-tint p-6">
          <div className="flex items-center justify-between">
            <span className="text-13-5 font-bold text-success">{t('detail.grade')}</span>
            <span className="text-20 font-extrabold text-success">
              {t('detail.ballLabel', { ball: task.ball })}
            </span>
          </div>
          {task.gradedAt && (
            <div className="mt-1 text-12 text-success">{t('detail.gradedAt', { date: task.gradedAt })}</div>
          )}
          {task.feedback && <p className="mt-3 text-13-5 leading-[1.5] text-ink-secondary">{task.feedback}</p>}
        </div>
      )}

      <div className="mt-4 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="mb-3 text-14 font-bold text-ink">{t('detail.mySubmission')}</div>
        {task.sub ? (
          <div className="flex flex-col gap-2.5">
            {task.sub.files.map((file) => (
              <div key={file.name} className="flex items-center gap-3 rounded-11 border border-surface-sunken bg-surface-raised px-3.5 py-2.5">
                <span className="rounded-8 bg-danger-soft px-2 py-1 text-11 font-bold text-danger uppercase">
                  {file.type}
                </span>
                <span className="flex-1 truncate text-13-5 font-semibold text-ink">{file.name}</span>
                <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-brand hover:underline">
                  {t('detail.view')}
                </button>
              </div>
            ))}
            {task.sub.text && <p className="text-13-5 text-ink-secondary">{task.sub.text}</p>}
            {task.sub.links.map((link) => (
              <a key={link} href={link} className="truncate text-13 font-semibold text-brand" target="_blank" rel="noreferrer">
                {link}
              </a>
            ))}
            <div className="text-12 text-ink-subtle">{t('detail.submittedAt', { date: task.sub.submittedAt })}</div>
          </div>
        ) : (
          <p className="m-0 text-13-5 text-ink-subtle">{t('detail.notSubmitted')}</p>
        )}

        {overdue ? (
          <div className="mt-4 rounded-11 bg-danger-soft px-4 py-3 text-13 font-semibold text-danger">
            {t('detail.overdue')}
          </div>
        ) : (
          <Button className="mt-4" onClick={() => setModalOpen(true)}>
            {task.sub ? t('detail.resubmit') : t('detail.submit')}
          </Button>
        )}
      </div>

      {modalOpen && (
        <SubmitModal onSubmit={(d) => void handleSubmit(d)} onCancel={() => setModalOpen(false)} cancelLabel={tc('cancel')} />
      )}
    </div>
  );
}

function SubmitModal({
  onSubmit,
  onCancel,
  cancelLabel,
}: {
  onSubmit: (draft: SubmitDraft) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const { t } = useTranslation('vazifalar');
  const [draft, setDraft] = useState<SubmitDraft>({ file: '', text: '', link: '' });

  return (
    <Modal
      title={t('submitModal.title')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={() => onSubmit(draft)}>{t('submitModal.submit')}</Button>
        </>
      }
    >
      <ModalField label={t('submitModal.file')}>
        <input
          value={draft.file}
          onChange={(e) => setDraft((d) => ({ ...d, file: e.target.value }))}
          placeholder="yechim.pdf"
          className={modalInputClass}
        />
      </ModalField>
      <ModalField label={t('submitModal.text')}>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          rows={3}
          className={`${modalInputClass} h-auto py-2.5`}
        />
      </ModalField>
      <ModalField label={t('submitModal.link')}>
        <input
          value={draft.link}
          onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))}
          placeholder="https://..."
          className={modalInputClass}
        />
      </ModalField>
    </Modal>
  );
}

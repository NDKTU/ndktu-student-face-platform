import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTasksStore } from '@/features/vazifalar/model/tasks.store';
import { useVazifalar } from '@/features/vazifalar/lib/useVazifalar';
import type { TaskDetail, TaskSubmissionRow } from '@/entities/task/model/types';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const SUB_TONE: Record<TaskSubmissionRow['status'], { bg: string; fg: string }> = {
  baholangan: { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' },
  topshirilgan: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
  topshirilmagan: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
};

export function TeacherVazifalarPage() {
  const { t } = useTranslation('vazifalar');
  const { t: tn } = useTranslation('nav');

  const { status: loadStatus, error, reload } = useVazifalar();
  const tasks = useTasksStore((s) => s.tasks);
  const byId = useTasksStore((s) => s.byId);
  const loadTask = useTasksStore((s) => s.loadTask);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Фильтровать нечего: сервер отдал только задания этого преподавателя.

  useEffect(() => {
    if (selectedId) void loadTask(selectedId);
  }, [selectedId, loadTask]);

  const selected = selectedId ? (byId[selectedId] ?? null) : null;

  const columns: Column<(typeof tasks)[number]>[] = [
    { key: 'title', label: t('teacher.column.title'), render: (x) => x.title, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'fan', label: t('teacher.column.fan'), width: 220, padX: 16, render: (x) => x.fan, cellClass: 'text-13 text-ink-muted' },
    { key: 'guruh', label: t('teacher.column.guruh'), width: 110, padX: 14, render: (x) => x.guruh, cellClass: 'text-13 font-semibold text-ink-secondary' },
    { key: 'deadline', label: t('teacher.column.deadline'), width: 120, padX: 14, render: (x) => x.deadline, cellClass: 'text-13 text-ink-secondary' },
    {
      key: 'submitted',
      label: t('teacher.column.submitted'),
      width: 110,
      padX: 12,
      align: 'center',
      render: (x) => `${x.submitted}/${x.students}`,
      cellClass: 'text-13 font-bold text-ink',
    },
    {
      key: 'pending',
      label: t('teacher.column.pending'),
      width: 110,
      padX: 12,
      align: 'center',
      render: (x) => {
        const pending = x.submitted - x.graded;
        return pending > 0 ? (
          <span className="rounded-20 bg-warning-soft px-2.5 py-1 text-11-5 font-bold text-warning">{pending}</span>
        ) : (
          '—'
        );
      },
    },
  ];

  if (selectedId) {
    const row = tasks.find((x) => x.id === selectedId);
    return (
      <>
        <CrumbBar
          crumbs={[
            { label: tn('tvazlar'), onClick: () => setSelectedId(null) },
            { label: selected?.title ?? row?.title ?? '' },
          ]}
        />
        {selected ? (
          <SubmissionList task={selected} />
        ) : (
          <div className="mx-auto w-full max-w-[1040px] px-8 pt-7 pb-12">
            <LoadingState />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('tvazlar') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={t('teacher.title')} subtitle={t('teacher.subtitle')} />

        {loadStatus === 'loading' || loadStatus === 'idle' ? (
          <LoadingState />
        ) : loadStatus === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : tasks.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('teacher.empty.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('teacher.empty.text')}</p>
          </div>
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={tasks} rowKey={(x) => x.id} onRowClick={(x) => setSelectedId(x.id)} />
          </TableCard>
        )}
      </div>
    </>
  );
}

function SubmissionList({ task }: { task: TaskDetail }) {
  const { t } = useTranslation('vazifalar');
  const toast = useToast();
  const grade = useTasksStore((s) => s.grade);
  const [grading, setGrading] = useState<TaskSubmissionRow | null>(null);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">{task.title}</h1>
        <div className="mt-1.5 text-13-5 text-ink-subtle">
          {task.fan} · {task.guruh} · {task.deadline}
        </div>
      </div>

      <div className="mb-3 text-14 font-bold text-ink">{t('teacher.subsTitle')}</div>
      <div className="flex flex-col gap-2">
        {task.subs.map((sub) => {
          const tone = SUB_TONE[sub.status];
          return (
            <div key={sub.id} className="flex items-center gap-3.5 rounded-14 border border-line bg-surface px-4 py-3 shadow-card">
              <span className="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-12 font-bold text-brand">
                {sub.initials}
              </span>
              <span className="min-w-0 flex-1 truncate text-14 font-semibold text-ink">{sub.fish}</span>
              {sub.ball != null && <span className="text-14 font-extrabold text-ink">{sub.ball}</span>}
              <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
                {t(`teacher.subStatus.${sub.status}`)}
              </span>
              {sub.status !== 'topshirilmagan' && (
                <Button variant="secondary" className="h-9 px-3.5" onClick={() => setGrading(sub)}>
                  {t('teacher.grade')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {grading && (
        <GradeModal
          submission={grading}
          onSave={(ball, feedback) => {
            grade(task.id, grading.id, ball, feedback)
              .then(() => setGrading(null))
              .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
          }}
          onCancel={() => setGrading(null)}
        />
      )}
    </div>
  );
}

function GradeModal({
  submission,
  onSave,
  onCancel,
}: {
  submission: TaskSubmissionRow;
  onSave: (ball: number, feedback: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('vazifalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const [ball, setBall] = useState(submission.ball != null ? String(submission.ball) : '');
  const [feedback, setFeedback] = useState(submission.feedback);

  function submit() {
    const parsed = parseInt(ball, 10);
    if (Number.isNaN(parsed)) {
      toast(t('teacher.gradeModal.invalid'));
      return;
    }
    onSave(Math.max(0, Math.min(100, parsed)), feedback.trim());
    toast(t('teacher.gradeModal.saved'));
  }

  return (
    <Modal
      title={`${t('teacher.gradeModal.title')} · ${submission.fish}`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>{t('teacher.gradeModal.save')}</Button>
        </>
      }
    >
      <ModalField label={t('teacher.gradeModal.ball')}>
        <input value={ball} onChange={(e) => setBall(e.target.value)} inputMode="numeric" className={modalInputClass} autoFocus />
      </ModalField>
      <ModalField label={t('teacher.gradeModal.feedback')}>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} className={`${modalInputClass} h-auto py-2.5`} />
      </ModalField>
    </Modal>
  );
}

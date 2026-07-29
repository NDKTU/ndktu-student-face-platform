import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTasksStore } from '@/features/vazifalar/model/tasks.store';
import { useVazifalar } from '@/features/vazifalar/lib/useVazifalar';
import { taskState } from '@/entities/task/lib/taskState';
import type { TaskDetail, TaskRow, TaskSubmissionRow } from '@/entities/task/model/types';
import { shortFaculty } from '@/entities/course/mock/adminCourses';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { AdminSubmissionGrade } from './AdminSubmissionGrade';
import { STATE_TONE, SUB_TONE } from './adminVazifaTones';

const FILTER_CLASS =
  'h-[42px] cursor-pointer rounded-11 border border-line bg-surface px-3 text-13-5 font-semibold text-ink outline-none focus:border-brand focus:shadow-focus';

export function AdminVazifalarPage() {
  const { t } = useTranslation('vazifalar');

  const { status: loadStatus, error, reload } = useVazifalar();
  const tasks = useTasksStore((s) => s.tasks);
  const byId = useTasksStore((s) => s.byId);
  const loadTask = useTasksStore((s) => s.loadTask);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);

  // Сдачи приезжают отдельным запросом: в списке их нет.
  useEffect(() => {
    if (selectedTaskId) void loadTask(selectedTaskId);
  }, [selectedTaskId, loadTask]);

  const [fac, setFac] = useState('');
  const [oq, setOq] = useState('');
  const [guruh, setGuruh] = useState('');
  const [status, setStatus] = useState('');

  const facOptions = useMemo(() => [...new Set(tasks.map((x) => x.fac))].sort(), [tasks]);
  const oqOptions = useMemo(() => [...new Set(tasks.map((x) => x.oqituvchi))].sort(), [tasks]);
  const guruhOptions = useMemo(() => [...new Set(tasks.map((x) => x.guruh))].sort(), [tasks]);

  const rows = tasks.filter(
    (x) =>
      (!fac || x.fac === fac) &&
      (!oq || x.oqituvchi === oq) &&
      (!guruh || x.guruh === guruh) &&
      (!status || taskState(x) === status),
  );

  const selectedTask = selectedTaskId ? (byId[selectedTaskId] ?? null) : null;
  const selectedSub = selectedTask?.subs.find((s) => s.id === selectedSubId) ?? null;

  // --- Проверка одной сдачи ---
  if (selectedTask && selectedSub) {
    return (
      <>
        <CrumbBar
          crumbs={[
            { label: t('admin.title'), onClick: () => { setSelectedTaskId(null); setSelectedSubId(null); } },
            { label: selectedTask.title, onClick: () => setSelectedSubId(null) },
            { label: selectedSub.fish },
          ]}
        />
        <AdminSubmissionGrade
          task={selectedTask}
          submission={selectedSub}
          onBack={() => setSelectedSubId(null)}
          onGraded={(nextId) => setSelectedSubId(nextId)}
        />
      </>
    );
  }

  // --- Детали задания (сдачи студентов) ---
  if (selectedTaskId) {
    const row = tasks.find((x) => x.id === selectedTaskId);
    return (
      <>
        <CrumbBar
          crumbs={[
            { label: t('admin.title'), onClick: () => setSelectedTaskId(null) },
            { label: selectedTask?.title ?? row?.title ?? '' },
          ]}
        />
        {selectedTask ? (
          <TaskSubmissions task={selectedTask} onOpenSub={(id) => setSelectedSubId(id)} />
        ) : (
          <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
            <LoadingState />
          </div>
        )}
      </>
    );
  }

  // --- Список заданий ---
  const columns: Column<TaskRow>[] = [
    {
      key: 'title',
      label: t('admin.column.title'),
      render: (x) => (
        <div>
          <div className="text-14 font-semibold text-ink">{x.title}</div>
          <div className="mt-0.5 text-12 text-ink-subtle">{x.fan}</div>
        </div>
      ),
      cellClass: '',
    },
    { key: 'oqituvchi', label: t('admin.column.oqituvchi'), width: 150, padX: 12, render: (x) => x.oqituvchi, cellClass: 'text-13 text-ink-muted' },
    {
      key: 'guruh',
      label: t('admin.column.guruh'),
      width: 110,
      padX: 12,
      render: (x) => (
        <span className="rounded-20 bg-brand-soft px-2.5 py-1 text-11-5 font-bold text-brand">{x.guruh}</span>
      ),
    },
    { key: 'deadline', label: t('admin.column.deadline'), width: 120, padX: 12, render: (x) => x.deadline, cellClass: 'text-13 text-ink-secondary' },
    {
      key: 'submitted',
      label: t('admin.column.submitted'),
      width: 110,
      padX: 12,
      align: 'center',
      render: (x) => `${x.submitted}/${x.students}`,
      cellClass: 'text-13 font-bold text-ink',
    },
    {
      key: 'graded',
      label: t('admin.column.graded'),
      width: 110,
      padX: 12,
      align: 'center',
      render: (x) => x.graded,
      cellClass: 'text-13 font-bold text-success',
    },
    {
      key: 'status',
      label: t('admin.column.status'),
      width: 140,
      padX: 12,
      render: (x) => {
        const st = taskState(x);
        const tone = STATE_TONE[st];
        return (
          <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {t(`admin.state.${st}`)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <CrumbBar crumbs={[{ label: t('admin.title') }]} />
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

        <div className="mb-4 flex flex-wrap items-center gap-3.5">
          <select value={fac} onChange={(e) => setFac(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('admin.filter.fac')}</option>
            {facOptions.map((f) => <option key={f} value={f}>{shortFaculty(f)}</option>)}
          </select>
          <select value={oq} onChange={(e) => setOq(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('admin.filter.oq')}</option>
            {oqOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={guruh} onChange={(e) => setGuruh(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('admin.filter.guruh')}</option>
            {guruhOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('admin.filter.status')}</option>
            <option value="tekshirilmoqda">{t('admin.state.tekshirilmoqda')}</option>
            <option value="baholangan">{t('admin.state.baholangan')}</option>
            <option value="kechikkan">{t('admin.state.kechikkan')}</option>
          </select>
          <div className="ml-auto text-13 font-semibold text-ink-subtle">
            {t('admin.counter', { shown: rows.length, total: tasks.length })}
          </div>
        </div>

        {loadStatus === 'loading' || loadStatus === 'idle' ? (
          <LoadingState />
        ) : loadStatus === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : rows.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('admin.empty.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('admin.empty.text')}</p>
          </div>
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={rows} rowKey={(x) => x.id} onRowClick={(x) => setSelectedTaskId(x.id)} />
          </TableCard>
        )}
      </div>
    </>
  );
}

function TaskSubmissions({ task, onOpenSub }: { task: TaskDetail; onOpenSub: (id: number) => void }) {
  const { t } = useTranslation('vazifalar');

  const submitted = task.subs.filter((s) => s.status !== 'topshirilmagan');
  const graded = task.subs.filter((s) => s.status === 'baholangan');

  // Порядок: сначала на проверке, затем оценённые, затем не сдавшие.
  const rank = (s: TaskSubmissionRow) => (s.status === 'topshirilgan' ? 0 : s.status === 'baholangan' ? 1 : 2);
  const ordered = [...task.subs].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="rounded-20 bg-brand-soft px-2.5 py-1 text-11-5 font-bold text-brand">{task.guruh}</span>
          <span className="text-13 text-ink-subtle">
            {t('admin.detail.meta', { fan: task.fan, oqituvchi: task.oqituvchi, deadline: task.deadline })}
          </span>
        </div>
        <h1 className="mt-1.5 mb-0 text-24 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
          {task.title}
        </h1>

        <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <Stat value={`${submitted.length}/${task.students}`} label={t('admin.detail.stat.submitted')} />
          <Stat value={String(graded.length)} label={t('admin.detail.stat.graded')} />
          <Stat value={String(submitted.length - graded.length)} label={t('admin.detail.stat.pending')} />
        </div>
      </div>

      <div className="overflow-hidden rounded-18 border border-line bg-surface shadow-card">
        <table className="rtab w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-sunken">
              <Th>{t('admin.detail.column.fish')}</Th>
              <Th className="w-40">{t('admin.detail.column.status')}</Th>
              <Th className="w-48">{t('admin.detail.column.submittedAt')}</Th>
              <Th className="w-28 text-center">{t('admin.detail.column.ball')}</Th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((s) => {
              const tone = SUB_TONE[s.status];
              const clickable = s.status !== 'topshirilmagan';
              return (
                <tr
                  key={s.id}
                  onClick={clickable ? () => onOpenSub(s.id) : undefined}
                  className={`border-b border-surface-muted last:border-b-0 ${
                    clickable ? 'cursor-pointer hover:bg-surface-raised' : 'opacity-50'
                  }`}
                >
                  <Td label={t('admin.detail.column.fish')}>
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-soft text-11 font-bold text-brand">
                        {s.initials}
                      </span>
                      <span className="font-semibold text-ink">{s.fish}</span>
                    </span>
                  </Td>
                  <Td label={t('admin.detail.column.status')}>
                    <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
                      {t(`admin.subStatus.${s.status}`)}
                    </span>
                  </Td>
                  <Td label={t('admin.detail.column.submittedAt')} className="font-mono text-12-5 text-ink-secondary">
                    {s.submittedAt ?? '—'}
                  </Td>
                  <Td label={t('admin.detail.column.ball')} className="text-center font-bold text-brand">
                    {s.ball != null ? `${s.ball}/100` : '—'}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-14 border border-line bg-surface-raised px-4 py-3.5">
      <div className="text-20 font-extrabold tracking-[-0.02em] text-brand">{value}</div>
      <div className="mt-0.5 text-11-5 font-medium text-ink-subtle">{label}</div>
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

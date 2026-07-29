import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TestDetailData, TestMeta, TestStatus } from '@/entities/test/model/types';
import { useTestlarStore } from '@/features/testlar/model/testlar.store';
import { useTestlar } from '@/features/testlar/lib/useTestlar';
import { getTestDetail } from '@/shared/api/testlar';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { TestDetail } from './TestDetail';

const STATUS_TONE: Record<TestStatus, { bg: string; fg: string }> = {
  Faol: { bg: 'var(--color-success-tint)', fg: 'var(--color-success)' },
  Yopiq: { bg: 'var(--color-surface-alt)', fg: 'var(--color-ink-muted)' },
};

/** Testlar для super_admin/admin: список всех тестов + аналитика (read-only). */
export function AdminTestlarPage() {
  const { t } = useTranslation('testlar');
  const { t: tn } = useTranslation('nav');
  const { status, error, reload } = useTestlar();

  const tests = useTestlarStore((s) => s.tests);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TestDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selected = selectedId ? (tests.find((x) => x.id === selectedId) ?? null) : null;

  // Аналитика тянется отдельным запросом: она тяжелее списка и нужна только
  // при открытии конкретного теста.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let alive = true;
    setDetail(null);
    setDetailError(null);
    getTestDetail(selectedId)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((e: unknown) => {
        if (alive) setDetailError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      alive = false;
    };
  }, [selectedId]);

  const columns: Column<TestMeta>[] = [
    { key: 'name', label: t('admin.column.name'), render: (x) => x.fan, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'guruh', label: t('admin.column.guruh'), width: 110, padX: 14, render: (x) => x.guruh, cellClass: 'text-13 font-semibold text-ink-secondary' },
    { key: 'questions', label: t('admin.column.questions'), width: 100, padX: 12, align: 'center', render: (x) => x.savollar, cellClass: 'text-13 font-bold text-ink' },
    { key: 'duration', label: t('admin.column.duration'), width: 90, padX: 12, align: 'center', render: (x) => `${x.davomiylik}′`, cellClass: 'text-13 text-ink-muted' },
    {
      key: 'status',
      label: t('admin.column.status'),
      width: 110,
      padX: 12,
      render: (x) => {
        const tone = STATUS_TONE[x.holati];
        return (
          <span className="rounded-20 px-2.5 py-1 text-11-5 font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {t(`status.${x.holati}`)}
          </span>
        );
      },
    },
    { key: 'pin', label: t('admin.column.pin'), width: 90, padX: 14, render: (x) => x.pin ?? '—', cellClass: 'font-mono text-13 font-semibold text-brand' },
  ];

  if (selected) {
    return (
      <>
        <CrumbBar
          crumbs={[{ label: tn('testlar'), onClick: () => setSelectedId(null) }, { label: selected.fan }]}
        />
        {detail ? (
          <TestDetail test={selected} data={detail} />
        ) : (
          <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
            {detailError ? (
              <ErrorState message={detailError} onRetry={() => setSelectedId(selected.id)} />
            ) : (
              <LoadingState />
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('testlar') }]} />
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={tn('testlar')} subtitle={t('admin.subtitle')} />

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={tests} rowKey={(x) => x.id} onRowClick={(x) => setSelectedId(x.id)} />
          </TableCard>
        )}
      </div>
    </>
  );
}

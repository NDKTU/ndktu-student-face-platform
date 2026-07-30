import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoursesStore } from '@/features/kurslar/model/courses.store';
import { useKurslar } from '@/features/kurslar/lib/useKurslar';
import { shortFaculty } from '@/shared/lib/shortFaculty';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import type { AdminCourse } from '@/entities/course/model/types';
import { CourseDetail } from './CourseDetail';

const FILTER_CLASS =
  'h-[42px] cursor-pointer rounded-11 border border-line bg-surface px-3 text-13-5 font-semibold text-ink outline-none focus:border-brand focus:shadow-focus';

export function KurslarPage() {
  const { t } = useTranslation('kurslar');
  const { status, error, reload } = useKurslar();
  const list = useCoursesStore((s) => s.list);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [facFilter, setFacFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const facultyOptions = useMemo(() => [...new Set(list.map((c) => c.fac))].sort(), [list]);
  const teacherOptions = useMemo(() => [...new Set(list.map((c) => c.oqituvchi))].sort(), [list]);
  const groupOptions = useMemo(() => [...new Set(list.map((c) => c.guruh))].sort(), [list]);

  const rows = list.filter(
    (c) =>
      (!facFilter || c.fac === facFilter) &&
      (!teacherFilter || c.oqituvchi === teacherFilter) &&
      (!groupFilter || c.guruh === groupFilter),
  );

  const selected = selectedId ? (list.find((c) => c.id === selectedId) ?? null) : null;

  const columns: Column<AdminCourse>[] = [
    { key: 'fan', label: t('column.fan'), render: (c) => c.fan, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'guruh', label: t('column.guruh'), width: 110, padX: 14, render: (c) => c.guruh, cellClass: 'text-13 font-semibold text-ink-secondary' },
    { key: 'oqituvchi', label: t('column.oqituvchi'), width: 150, padX: 14, render: (c) => c.oqituvchi, cellClass: 'text-13 text-ink-muted' },
    { key: 'fac', label: t('column.fac'), width: 150, padX: 14, render: (c) => shortFaculty(c.fac), cellClass: 'text-13 text-ink-muted' },
    { key: 'sem', label: t('column.sem'), width: 70, padX: 12, align: 'center', render: (c) => c.sem, cellClass: 'text-13 font-bold text-ink' },
    { key: 'mavzu', label: t('column.mavzu'), width: 80, padX: 12, align: 'center', render: (c) => c.mavzular, cellClass: 'text-13 font-bold text-ink' },
    { key: 'dars', label: t('column.dars'), width: 80, padX: 12, align: 'center', render: (c) => c.darslar, cellClass: 'text-13 font-bold text-ink' },
  ];

  if (selected) {
    return (
      <>
        <CrumbBar
          crumbs={[
            { label: t('title'), onClick: () => setSelectedId(null) },
            { label: `${selected.fan} · ${selected.guruh}` },
          ]}
        />
        <CourseDetail meta={selected} />
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={t('title')} subtitle={t('subtitle', { count: list.length })} />

        <div className="mb-4.5 flex flex-wrap items-end gap-3.5">
          <select value={facFilter} onChange={(e) => setFacFilter(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('filter.allFaculties')}</option>
            {facultyOptions.map((f) => (
              <option key={f} value={f}>
                {shortFaculty(f)}
              </option>
            ))}
          </select>
          <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('filter.allTeachers')}</option>
            {teacherOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={FILTER_CLASS}>
            <option value="">{t('filter.allGroups')}</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {(facFilter || teacherFilter || groupFilter) && (
            <button
              type="button"
              onClick={() => {
                setFacFilter('');
                setTeacherFilter('');
                setGroupFilter('');
              }}
              className="h-[42px] cursor-pointer rounded-11 border border-line bg-surface px-3.5 text-13 font-bold text-ink-muted hover:bg-surface-raised"
            >
              {t('filter.clear')}
            </button>
          )}
        </div>

        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : rows.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('empty.text')}</p>
          </div>
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => setSelectedId(c.id)} />
          </TableCard>
        )}
      </div>
    </>
  );
}

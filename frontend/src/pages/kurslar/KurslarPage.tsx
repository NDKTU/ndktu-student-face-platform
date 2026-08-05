import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { useCourseOptions } from '@/features/kurslar/lib/useCourseOptions';
import { useKurslar } from '@/features/kurslar/lib/useKurslar';
import { useCoursesStore, type CourseDraft } from '@/features/kurslar/model/courses.store';
import { shortFaculty } from '@/shared/lib/shortFaculty';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { RowMenu } from '@/shared/ui/RowMenu';
import { PencilIcon, TrashIcon } from '@/shared/ui/icons';
import { useToast } from '@/shared/ui/Toast';
import type { AdminCourse } from '@/entities/course/model/types';
import { CourseDetail } from './CourseDetail';
import { CourseModal } from './CourseModal';

const FILTER_CLASS =
  'h-[42px] cursor-pointer rounded-11 border border-line bg-surface px-3 text-13-5 font-semibold text-ink outline-none focus:border-brand focus:shadow-focus';

/** Код группы — моноширинный чип, как коды специальностей в других разделах. */
const GROUP_CHIP =
  'rounded-8 bg-brand-soft px-[9px] py-[3px] font-mono text-12-5 font-semibold text-brand';

type ModalState = { mode: 'add' | 'edit'; id?: number; multiGroup: boolean; draft: CourseDraft };

const EMPTY_DRAFT: CourseDraft = {
  subjectId: null,
  teacherId: null,
  groupId: null,
  facultyId: null,
  kafedraId: null,
};

export function KurslarPage() {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const { status, error, reload } = useKurslar();
  const { has } = usePermissions();
  const toast = useToast();

  const list = useCoursesStore((s) => s.list);
  const addCourse = useCoursesStore((s) => s.addCourse);
  const editCourse = useCoursesStore((s) => s.editCourse);
  const removeCourse = useCoursesStore((s) => s.removeCourse);

  const canCreate = has('create:course');
  const canEdit = has('update:course');
  const canDelete = has('delete:course');

  // Справочники нужны только тем, кто может править курсы: студенту незачем
  // тянуть список сотрудников.
  useCourseOptions();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [facFilter, setFacFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);

  const facultyOptions = useMemo(() => [...new Set(list.map((c) => c.fac))].sort(), [list]);
  const teacherOptions = useMemo(() => [...new Set(list.map((c) => c.oqituvchi))].sort(), [list]);
  // По id, а не по склеенной строке: курс в двух группах иначе давал бы
  // отдельный вариант «KI-24-01, KI-24-02», который ни на что не похож.
  const groupOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const course of list) for (const g of course.guruhlar) byId.set(g.id, g.name);
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [list]);

  const rows = list.filter(
    (c) =>
      (!facFilter || c.fac === facFilter) &&
      (!teacherFilter || c.oqituvchi === teacherFilter) &&
      (!groupFilter || c.guruhlar.some((g) => g.id === Number(groupFilter))),
  );

  const selected = selectedId ? (list.find((c) => c.id === selectedId) ?? null) : null;

  function openEdit(course: AdminCourse) {
    setModal({
      mode: 'edit',
      id: course.id,
      multiGroup: course.groupIds.length > 1,
      draft: {
        subjectId: course.subjectId,
        teacherId: course.teacherId,
        groupId: course.groupIds[0] ?? null,
        facultyId: course.facultyId,
        kafedraId: course.kafedraId,
      },
    });
  }

  async function handleSave(name: string, draft: CourseDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await addCourse(name, draft);
        toast(t('toast.courseAdded'));
      } else if (modal.id) {
        await editCourse(modal.id, name, draft, modal.multiGroup);
        toast(t('toast.courseSaved'));
      }
      setModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      await removeCourse(confirm.id);
      toast(tc('deleted'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setConfirm(null);
  }

  const columns: Column<AdminCourse>[] = [
    { key: 'fan', label: t('column.fan'), render: (c) => c.fan, cellClass: 'text-14 font-semibold text-ink' },
    {
      key: 'guruh',
      label: t('column.guruh'),
      width: 130,
      padX: 14,
      render: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.guruhlar.map((g) => (
            <span key={g.id} className={GROUP_CHIP}>
              {g.name}
            </span>
          ))}
        </span>
      ),
      cellClass: '',
    },
    { key: 'oqituvchi', label: t('column.oqituvchi'), width: 150, padX: 14, render: (c) => c.oqituvchi, cellClass: 'text-13 text-ink-muted' },
    { key: 'fac', label: t('column.fac'), width: 150, padX: 14, render: (c) => shortFaculty(c.fac), cellClass: 'text-13 text-ink-muted' },
    { key: 'sem', label: t('column.sem'), width: 70, padX: 12, align: 'center', render: (c) => c.semNumber ?? t('sem.none'), cellClass: 'text-13 font-bold text-ink' },
    { key: 'mavzu', label: t('column.mavzu'), width: 80, padX: 12, align: 'center', render: (c) => c.mavzular, cellClass: 'text-13 font-bold text-ink' },
    { key: 'dars', label: t('column.dars'), width: 80, padX: 12, align: 'center', render: (c) => c.darslar, cellClass: 'text-13 font-bold text-brand' },
  ];

  if (canEdit || canDelete) {
    columns.push({
      key: 'actions',
      label: '',
      width: 56,
      padX: 8,
      align: 'center',
      render: (c) => (
        <div className="flex justify-end">
          <RowMenu
            items={[
              ...(canEdit
                ? [{ label: t('action.edit'), icon: <PencilIcon />, onClick: () => openEdit(c) }]
                : []),
              ...(canDelete
                ? [
                    {
                      label: t('action.delete'),
                      icon: <TrashIcon />,
                      danger: true,
                      onClick: () => setConfirm({ id: c.id, name: c.fan }),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ),
      cellClass: '',
    });
  }

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
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle', { count: list.length })}
          actions={
            canCreate ? (
              <Button
                className="h-[42px] rounded-11 px-4"
                onClick={() => setModal({ mode: 'add', multiGroup: false, draft: EMPTY_DRAFT })}
              >
                + {t('create')}
              </Button>
            ) : undefined
          }
        />

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
              <option key={g.id} value={g.id}>
                {g.name}
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
            <h3 className="m-0 text-16 font-bold text-ink">
              {list.length === 0 ? t('emptyAll.title') : t('empty.title')}
            </h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">
              {list.length === 0 ? t('emptyAll.text') : t('empty.text')}
            </p>
          </div>
        ) : (
          <TableCard>
            <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => setSelectedId(c.id)} />
          </TableCard>
        )}
      </div>

      {modal && (
        <CourseModal
          mode={modal.mode}
          initial={modal.draft}
          multiGroup={modal.multiGroup}
          onSave={(name, draft) => void handleSave(name, draft)}
          onCancel={() => setModal(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t('action.delete')}
          text={t('confirmCourse')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

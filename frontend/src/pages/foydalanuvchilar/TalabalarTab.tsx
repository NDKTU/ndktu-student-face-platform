import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentsStore } from '@/features/talabalar/model/students.store';
import { useTalabalar } from '@/features/talabalar/lib/useTalabalar';
import { toFacultyTree } from '@/features/talabalar/lib/facultyTree';
import { useStructureStore } from '@/features/tuzilma/model/structure.store';
import { useStructure } from '@/features/tuzilma/lib/useStructure';
import type { StudentDraft, StudentRow } from '@/entities/student/model/types';
import type { StudentStatus } from '@/entities/university/model/types';
import { statusTone } from '@/entities/university/lib/studentProfile';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';
import { StudentModal } from './StudentModal';
import { FilterBar, filterSelectClass, SearchInput } from './FilterBar';

const STATUSES: StudentStatus[] = ['Faol', "Akademik ta'til", "Ta'til"];
const SOURCES: StudentRow['manba'][] = ['HEMIS', "Qo'lda"];

export function TalabalarTab() {
  const { t } = useTranslation('talabalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const { status, error, reload } = useTalabalar();
  const students = useStudentsStore((s) => s.students);
  const add = useStudentsStore((s) => s.add);
  const select = useStudentsStore((s) => s.select);

  // Справочник групп берётся из дерева структуры — отдельного эндпоинта нет.
  useStructure();
  const faculties = useStructureStore((s) => s.faculties);
  const tree = useMemo(() => toFacultyTree(faculties), [faculties]);

  const [query, setQuery] = useState('');
  const [fakultet, setFakultet] = useState('');
  const [guruh, setGuruh] = useState('');
  const [holati, setHolati] = useState('');
  const [manba, setManba] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Список групп сужается выбранным факультетом — иначе он необозрим.
  const groupOptions = useMemo(() => {
    const source = fakultet ? tree.filter((f) => f.name === fakultet) : tree;
    return Array.from(
      new Set(source.flatMap((f) => f.specialities.flatMap((s) => s.groups))),
    ).sort((a, b) => a.localeCompare(b));
  }, [tree, fakultet]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (fakultet && s.fakultet !== fakultet) return false;
      if (guruh && s.guruh !== guruh) return false;
      if (holati && s.holati !== holati) return false;
      if (manba && s.manba !== manba) return false;
      if (!q) return true;
      return s.fish.toLowerCase().includes(q) || s.sid.toLowerCase().includes(q);
    });
  }, [students, query, fakultet, guruh, holati, manba]);

  const columns: Column<StudentRow>[] = [
    {
      key: 'fish',
      label: t('column.fish'),
      render: (s) => (
        <div className="flex items-center gap-[11px]">
          <span className="grid size-[34px] flex-none place-items-center rounded-full bg-surface-alt text-12 font-bold text-ink-muted">
            {s.initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-14 font-semibold text-ink">{s.fish}</div>
            <div className="truncate text-11-5 text-ink-subtle">{s.email}</div>
          </div>
        </div>
      ),
      cellClass: '',
    },
    {
      key: 'sid',
      label: t('column.sid'),
      width: 130,
      padX: 16,
      render: (s) => s.sid,
      cellClass: 'font-mono text-13 text-ink-secondary',
    },
    {
      key: 'guruh',
      label: t('column.guruh'),
      width: 110,
      padX: 16,
      render: (s) => s.guruh,
      cellClass: 'text-13 font-semibold text-ink-secondary',
    },
    {
      key: 'fakultet',
      label: t('column.fakultet'),
      padX: 16,
      render: (s) => s.fakultet,
      cellClass: 'text-13 text-ink-muted',
    },
    {
      key: 'kurs',
      label: t('column.kurs'),
      width: 90,
      padX: 16,
      render: (s) => t('kurs', { n: s.kurs }),
      cellClass: 'text-13 text-ink-secondary',
    },
    {
      key: 'holat',
      label: t('column.holat'),
      width: 120,
      padX: 16,
      render: (s) => {
        const tone = statusTone(s.tone);
        return (
          <span
            className="inline-block rounded-20 px-[11px] py-1 text-12 font-bold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {s.holati}
          </span>
        );
      },
      cellClass: '',
    },
    {
      key: 'manba',
      label: t('column.manba'),
      width: 100,
      padX: 16,
      render: (s) => (
        <span
          className={`inline-block rounded-20 px-[11px] py-1 text-11-5 font-bold ${
            s.manba === 'HEMIS' ? 'bg-brand-soft text-brand' : 'bg-surface-alt text-ink-muted'
          }`}
        >
          {s.manba}
        </span>
      ),
      cellClass: '',
    },
  ];

  async function handleSave(draft: StudentDraft) {
    try {
      await add(draft);
      toast(tc('created'));
      setModalOpen(false);
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (status === 'loading' || status === 'idle') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <>
      {/* На этой вкладке крупного заголовка нет — только счётчик и действия. */}
      <div className="mb-[22px] flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-14 text-ink-muted">{t('subtitle', { count: students.length })}</p>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            className="h-[46px] rounded-12 px-5"
            onClick={() => toast(t('importDone'))}
          >
            <DownloadIcon />
            {t('import')}
          </Button>
          <Button className="h-[46px] rounded-12 px-5" onClick={() => setModalOpen(true)}>
            + {t('add')}
          </Button>
        </div>
      </div>

      <FilterBar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('search')} />

        <select
          value={fakultet}
          onChange={(e) => {
            setFakultet(e.target.value);
            setGuruh('');
          }}
          className={filterSelectClass}
        >
          <option value="">{t('filter.faculty')}</option>
          {tree.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>

        <select value={guruh} onChange={(e) => setGuruh(e.target.value)} className={filterSelectClass}>
          <option value="">{t('filter.group')}</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select value={holati} onChange={(e) => setHolati(e.target.value)} className={filterSelectClass}>
          <option value="">{t('filter.status')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select value={manba} onChange={(e) => setManba(e.target.value)} className={filterSelectClass}>
          <option value="">{t('filter.source')}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterBar>

      <TableCard>
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
            <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">{t('empty.text')}</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(s) => s.id}
            onRowClick={(s) => select(s.id)}
          />
        )}
      </TableCard>

      {modalOpen && (
        <StudentModal
          tree={tree}
          onSave={(draft) => void handleSave(draft)}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  );
}

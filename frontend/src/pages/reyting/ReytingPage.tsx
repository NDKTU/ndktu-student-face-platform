import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PAGE_SIZE,
  useReytingStore,
  type RankingTab,
} from '@/features/reyting/model/reyting.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import * as api from '@/shared/api/reyting';
import type { FacultyRank, KafedraRank, RefOption, TeacherRank } from '@/shared/api/reyting';
import { downloadCsv } from '@/shared/lib/downloadCsv';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';

const TABS: RankingTab[] = ['oqituvchilar', 'fakultetlar', 'kafedralar'];

/** Первые три места отмечаются медалью, дальше — просто номер. */
const MEDALS = ['🥇', '🥈', '🥉'];

export function ReytingPage() {
  const { t } = useTranslation('reyting');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { has } = usePermissions();

  const tab = useReytingStore((s) => s.tab);
  const filters = useReytingStore((s) => s.filters);
  const oqituvchilar = useReytingStore((s) => s.oqituvchilar);
  const fakultetlar = useReytingStore((s) => s.fakultetlar);
  const kafedralar = useReytingStore((s) => s.kafedralar);

  const setTab = useReytingStore((s) => s.setTab);
  const setFilter = useReytingStore((s) => s.setFilter);
  const clearFilters = useReytingStore((s) => s.clearFilters);
  const setPage = useReytingStore((s) => s.setPage);
  const load = useReytingStore((s) => s.load);

  const slice = tab === 'oqituvchilar' ? oqituvchilar : tab === 'fakultetlar' ? fakultetlar : kafedralar;

  // Вкладку грузим при первом открытии: пока в неё не зашли, три запроса вместо
  // одного были бы напрасны.
  useEffect(() => {
    if (slice.status === 'idle') void load(tab);
  }, [tab, slice.status, load]);

  const [faculties, setFaculties] = useState<RefOption[]>([]);
  const [kafedraRefs, setKafedraRefs] = useState<RefOption[]>([]);
  const [exporting, setExporting] = useState(false);

  // Поле поиска живёт локально: фильтрует сервер, и запрос на каждую букву дал
  // бы десяток лишних обращений на одно слово.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = setTimeout(() => void setFilter('search', searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setFilter]);

  const canFilterFaculty = has('read:faculty');
  const canFilterKafedra = has('read:kafedra');

  useEffect(() => {
    // Справочники нужны только вкладке преподавателей и только тому, у кого есть
    // на них право: без него фильтры просто не показываются.
    if (tab !== 'oqituvchilar') return;
    if (canFilterFaculty && faculties.length === 0) {
      api.getFacultyOptions().then(setFaculties, () => setFaculties([]));
    }
    if (canFilterKafedra && kafedraRefs.length === 0) {
      api.getKafedraOptions().then(setKafedraRefs, () => setKafedraRefs([]));
    }
  }, [tab, canFilterFaculty, canFilterKafedra, faculties.length, kafedraRefs.length]);

  const kafedraOptions = useMemo(
    () =>
      filters.facultyId === null
        ? kafedraRefs
        : kafedraRefs.filter((k) => k.facultyId === filters.facultyId),
    [kafedraRefs, filters.facultyId],
  );

  const hasFilters = filters.facultyId !== null || filters.kafedraId !== null || !!filters.search;

  async function handleExport() {
    setExporting(true);
    try {
      const rows = await collectCsv(tab, filters, t);
      if (rows.length <= 1) {
        toast(t('exportEmpty'));
        return;
      }
      downloadCsv(`reyting-${tab}.csv`, rows);
    } catch (e) {
      toast(`${tc('loadError')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const from = slice.total === 0 ? 0 : (slice.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(slice.page * PAGE_SIZE, slice.total);

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <Button
              variant="secondary"
              className="h-[42px] rounded-11 px-4"
              disabled={exporting || slice.total === 0}
              onClick={() => void handleExport()}
            >
              {exporting ? t('exporting') : t('export')}
            </Button>
          }
        />

        <div className="mb-4 flex gap-1 rounded-12 border border-line bg-surface p-1 shadow-card">
          {TABS.map((key) => (
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

        {tab === 'oqituvchilar' && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('filter.search')}
              className="h-[42px] min-w-[240px] flex-1 rounded-11 border border-line bg-surface px-3.5 text-14 text-ink outline-none placeholder:text-ink-faint focus:border-brand"
            />
            {canFilterFaculty && (
              <select
                aria-label={t('filter.faculty')}
                value={filters.facultyId ?? ''}
                onChange={(e) =>
                  void setFilter('facultyId', e.target.value === '' ? null : Number(e.target.value))
                }
                className="h-[42px] min-w-[200px] rounded-11 border border-line bg-surface px-3.5 text-14 text-ink-secondary outline-none focus:border-brand"
              >
                <option value="">{t('filter.allFaculties')}</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {canFilterKafedra && (
              <select
                aria-label={t('filter.kafedra')}
                value={filters.kafedraId ?? ''}
                onChange={(e) =>
                  void setFilter('kafedraId', e.target.value === '' ? null : Number(e.target.value))
                }
                className="h-[42px] min-w-[200px] rounded-11 border border-line bg-surface px-3.5 text-14 text-ink-secondary outline-none focus:border-brand"
              >
                <option value="">{t('filter.allKafedras')}</option>
                {kafedraOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            )}
            {hasFilters && (
              <Button
                variant="secondary"
                className="h-[42px] rounded-11 px-4"
                onClick={() => {
                  setSearchInput('');
                  void clearFilters();
                }}
              >
                {t('filter.clear')}
              </Button>
            )}
          </div>
        )}

        {slice.status === 'idle' || slice.status === 'loading' ? (
          <LoadingState />
        ) : slice.status === 'error' ? (
          <ErrorState message={slice.error} onRetry={() => void load(tab)} />
        ) : slice.total === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
            <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('empty.text')}</p>
          </div>
        ) : (
          <>
            <TableCard>
              {tab === 'oqituvchilar' ? (
                <DataTable
                  columns={teacherColumns(t)}
                  rows={oqituvchilar.items}
                  rowKey={(r) => r.teacherId}
                />
              ) : tab === 'fakultetlar' ? (
                <DataTable
                  columns={facultyColumns(t)}
                  rows={fakultetlar.items}
                  rowKey={(r) => r.facultyId}
                />
              ) : (
                <DataTable
                  columns={kafedraColumns(t)}
                  rows={kafedralar.items}
                  rowKey={(r) => r.kafedraId}
                />
              )}
            </TableCard>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-12-5 text-ink-subtle">{t('hint')}</p>
              <div className="flex items-center gap-3">
                <span className="text-12-5 text-ink-muted">
                  {t('page', { from, to, total: slice.total })}
                </span>
                <Button
                  variant="secondary"
                  className="h-[34px] rounded-10 px-3"
                  disabled={slice.page <= 1}
                  onClick={() => void setPage(slice.page - 1)}
                >
                  {t('prev')}
                </Button>
                <Button
                  variant="secondary"
                  className="h-[34px] rounded-10 px-3"
                  disabled={to >= slice.total}
                  onClick={() => void setPage(slice.page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function RankCell({ rank }: { rank: number }) {
  const medal = MEDALS[rank - 1];
  return (
    <span className="text-14 font-bold text-ink">{medal ? `${medal} ${rank}` : `${rank}`}</span>
  );
}

/** Балл на шкале 2–5: два знака, иначе 4.7 и 4.68 выглядят одинаково. */
const score = (value: number) => value.toFixed(2);

function teacherColumns(t: Translate): Column<TeacherRank>[] {
  return [
    { key: 'rank', label: t('column.rank'), width: 80, align: 'center', render: (r) => <RankCell rank={r.rank} />, cellClass: '' },
    { key: 'fish', label: t('column.oqituvchi'), render: (r) => r.fish, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'kafedra', label: t('column.kafedra'), padX: 16, render: (r) => r.kafedra || '—', cellClass: 'text-13 text-ink-muted' },
    { key: 'fakultet', label: t('column.fakultet'), padX: 16, render: (r) => r.fakultet || '—', cellClass: 'text-13 text-ink-muted' },
    { key: 'talabalar', label: t('column.talabalar'), width: 110, align: 'center', render: (r) => r.talabalar, cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'ortacha', label: t('column.ortacha'), width: 130, align: 'center', render: (r) => score(r.ortacha), cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'reyting', label: t('column.reyting'), width: 110, align: 'center', render: (r) => score(r.reyting), cellClass: 'text-14 font-bold text-ink' },
  ];
}

function facultyColumns(t: Translate): Column<FacultyRank>[] {
  return [
    { key: 'rank', label: t('column.rank'), width: 80, align: 'center', render: (r) => <RankCell rank={r.rank} />, cellClass: '' },
    { key: 'fakultet', label: t('column.fakultet'), render: (r) => r.fakultet, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'kafedralar', label: t('column.kafedralar'), width: 130, align: 'center', render: (r) => r.kafedralar, cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'talabalar', label: t('column.talabalar'), width: 110, align: 'center', render: (r) => r.talabalar, cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'ortacha', label: t('column.ortacha'), width: 130, align: 'center', render: (r) => score(r.ortacha), cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'reyting', label: t('column.reyting'), width: 110, align: 'center', render: (r) => score(r.reyting), cellClass: 'text-14 font-bold text-ink' },
  ];
}

function kafedraColumns(t: Translate): Column<KafedraRank>[] {
  return [
    { key: 'rank', label: t('column.rank'), width: 80, align: 'center', render: (r) => <RankCell rank={r.rank} />, cellClass: '' },
    { key: 'kafedra', label: t('column.kafedra'), render: (r) => r.kafedra, cellClass: 'text-14 font-semibold text-ink' },
    { key: 'fakultet', label: t('column.fakultet'), padX: 16, render: (r) => r.fakultet, cellClass: 'text-13 text-ink-muted' },
    { key: 'oqituvchilar', label: t('column.oqituvchilar'), width: 130, align: 'center', render: (r) => r.oqituvchilar, cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'talabalar', label: t('column.talabalar'), width: 110, align: 'center', render: (r) => r.talabalar, cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'ortacha', label: t('column.ortacha'), width: 130, align: 'center', render: (r) => score(r.ortacha), cellClass: 'text-13-5 text-ink-secondary' },
    { key: 'reyting', label: t('column.reyting'), width: 110, align: 'center', render: (r) => score(r.reyting), cellClass: 'text-14 font-bold text-ink' },
  ];
}

/**
 * Выгрузка идёт отдельным запросом на весь список, а не по видимой странице:
 * выгружать двадцать строк из двухсот бессмысленно.
 */
async function collectCsv(
  tab: RankingTab,
  filters: { facultyId: number | null; kafedraId: number | null; search: string },
  t: Translate,
): Promise<string[][]> {
  const LIMIT = 1000;

  if (tab === 'fakultetlar') {
    const data = await api.getFacultyRanking(1, LIMIT);
    return [
      [t('column.rank'), t('column.fakultet'), t('column.kafedralar'), t('column.talabalar'), t('column.ortacha'), t('column.reyting')],
      ...data.items.map((r) => [String(r.rank), r.fakultet, String(r.kafedralar), String(r.talabalar), score(r.ortacha), score(r.reyting)]),
    ];
  }

  if (tab === 'kafedralar') {
    const data = await api.getKafedraRanking(1, LIMIT);
    return [
      [t('column.rank'), t('column.kafedra'), t('column.fakultet'), t('column.oqituvchilar'), t('column.talabalar'), t('column.ortacha'), t('column.reyting')],
      ...data.items.map((r) => [String(r.rank), r.kafedra, r.fakultet, String(r.oqituvchilar), String(r.talabalar), score(r.ortacha), score(r.reyting)]),
    ];
  }

  const data = await api.getTeacherRanking({
    facultyId: filters.facultyId ?? undefined,
    kafedraId: filters.kafedraId ?? undefined,
    search: filters.search.trim() || undefined,
    page: 1,
    limit: LIMIT,
  });
  return [
    [t('column.rank'), t('column.oqituvchi'), t('column.kafedra'), t('column.fakultet'), t('column.talabalar'), t('column.ortacha'), t('column.reyting')],
    ...data.items.map((r) => [String(r.rank), r.fish, r.kafedra, r.fakultet, String(r.talabalar), score(r.ortacha), score(r.reyting)]),
  ];
}

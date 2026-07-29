import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStructureStore } from '@/features/tuzilma/model/structure.store';
import { useStructure } from '@/features/tuzilma/lib/useStructure';
import { useFanlarStore } from '@/features/fanlar/model/fanlar.store';
import { useFanlar } from '@/features/fanlar/lib/useFanlar';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { FACULTY_COLORS } from '@/entities/university/lib/facultyColors';
import type { EduForm, RejaRow } from '@/entities/university/model/types';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { EntityCard } from '../tuzilma/EntityCard';
import { PlanModal, type PlanDraft } from './PlanModal';
import { RejaFanModal, type RejaFanDraft, type TeacherOption } from './RejaFanModal';

/** План всегда охватывает 1–8 семестр — так его создаёт модалка. */
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Порядок обхода общей палитры для бейджей карточек — как в эталоне. */
const BADGE_ORDER = [0, 1, 3, 4, 2, 5];

function badgeColor(i: number) {
  return FACULTY_COLORS[BADGE_ORDER[i % BADGE_ORDER.length]!]!;
}

/**
 * Инициалы для бейджа: по первой букве первых двух слов.
 * Отличается от namePrefix — там односложное имя даёт три буквы («MET»),
 * а в эталоне у «Metallurgiya» бейдж «M».
 */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!)
    .join('')
    .toUpperCase();
}

/** Тон чипа формы обучения. */
const FORM_CHIP: Record<EduForm, { bg: string; fg: string }> = {
  Kunduzgi: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' },
  Sirtqi: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
};

/** Специальность с планом — карточка верхнего уровня. */
interface PlanOption {
  id: number;
  name: string;
  label: string;
  kod: string;
  kafedra: string;
  shakl: EduForm;
  teachers: TeacherOption[];
  /** Строки плана. Пусты, пока специальность не открыли. */
  reja: RejaRow[];
  /** Счётчики из дерева — они известны и до загрузки строк. */
  fanCount: number;
  creditCount: number;
}

/** Строка плана вместе с её позицией в reja специальности — по ней идут правки. */
interface RejaEntry {
  row: RejaRow;
  index: number;
}

type FanModalState = { mode: 'add' | 'edit'; index?: number; draft: RejaFanDraft };
type ConfirmState =
  | { kind: 'plan'; name: string }
  | { kind: 'semester'; semestr: number }
  | { kind: 'row'; index: number; name: string };

export function RejaPage() {
  const { t } = useTranslation('reja');
  const { t: tc } = useTranslation('common');
  const { has } = usePermissions();
  const canWrite = has('create:curriculum');
  const toast = useToast();
  const { status, error, reload } = useStructure();

  const faculties = useStructureStore((s) => s.faculties);
  const rejaYears = useStructureStore((s) => s.rejaYears);
  const createRejaPlan = useStructureStore((s) => s.createRejaPlan);
  const addRejaRow = useStructureStore((s) => s.addRejaRow);
  const updateRejaRow = useStructureStore((s) => s.updateRejaRow);
  const removeRejaRow = useStructureStore((s) => s.removeRejaRow);
  const clearRejaPlan = useStructureStore((s) => s.clearRejaPlan);
  const clearRejaSemester = useStructureStore((s) => s.clearRejaSemester);

  // Кафедру фана берём из каталога фанлар — там же, где фаны заводят.
  // Он тоже с сервера, поэтому подгружаем (иначе подсказки к «Fan» пусты,
  // пока не открыли страницу «Fanlar»).
  useFanlar();
  const fans = useFanlarStore((s) => s.fans);
  const fanKafedra = useMemo(() => {
    const map = new Map<string, string>();
    fans.forEach((f) => map.set(f.fan, f.kafedra));
    return map;
  }, [fans]);
  const suggestions = useMemo(
    () => Array.from(new Set(fans.map((f) => f.fan))).sort((a, b) => a.localeCompare(b)),
    [fans],
  );

  const plans = useMemo<PlanOption[]>(
    () =>
      faculties.flatMap((faculty) =>
        faculty.kafedralar.flatMap((department) =>
          department.mutaxassisliklar.map((speciality) => ({
            id: speciality.id,
            name: speciality.name,
            // «Название — Факультет», без слова «fakulteti»: так в прототипе.
            label: `${speciality.name} — ${faculty.name.replace(' fakulteti', '')}`,
            kod: speciality.kod,
            kafedra: department.name,
            shakl: speciality.shakl,
            teachers: department.teachers.map((p) => ({ short: p.short, display: p.display })),
            reja: speciality.reja,
            // Из дерева: строки плана в списке не загружены, а карточка
            // показывает «сколько фанов и кредитов» ещё до его открытия.
            fanCount: speciality.curriculum_count,
            creditCount: speciality.curriculum_credits,
          })),
        ),
      ),
    [faculties],
  );

  const [specId, setSpecId] = useState<number | null>(null);
  const [semestr, setSemestr] = useState<number | null>(null);
  const [planModal, setPlanModal] = useState<PlanDraft | null>(null);
  const [fanModal, setFanModal] = useState<FanModalState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Строки плана дерево не несёт — забираем их при выборе специальности.
  const loadReja = useStructureStore((s) => s.loadReja);
  useEffect(() => {
    if (specId !== null) void loadReja(specId);
  }, [specId, loadReja]);

  const plan = plans.find((p) => p.id === specId) ?? null;
  const entries: RejaEntry[] = useMemo(
    () => (plan?.reja ?? []).map((row, index) => ({ row, index })),
    [plan],
  );
  const semesterEntries = semestr ? entries.filter((e) => e.row.semestr === semestr) : [];

  function openAddFan(sem: number) {
    setFanModal({
      mode: 'add',
      draft: {
        fan: '',
        semestr: String(sem),
        kredit: '3',
        oqituvchi: plan?.teachers[0]?.short ?? '—',
      },
    });
  }

  function openEditFan(entry: RejaEntry) {
    setFanModal({
      mode: 'edit',
      index: entry.index,
      draft: {
        fan: entry.row.fan,
        semestr: String(entry.row.semestr),
        kredit: String(entry.row.kredit),
        oqituvchi: entry.row.oqituvchi,
      },
    });
  }

  function reportError(e: unknown) {
    toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
  }

  async function handleSaveFan(draft: RejaFanDraft) {
    if (!plan || !fanModal) return;
    const row: RejaRow = {
      fan: draft.fan.trim(),
      semestr: Number(draft.semestr) || 1,
      kredit: Number(draft.kredit) || 0,
      oqituvchi: draft.oqituvchi || '—',
    };

    try {
      if (fanModal.mode === 'add') {
        await addRejaRow(plan.id, row);
        toast(tc('created'));
      } else if (fanModal.index !== undefined) {
        await updateRejaRow(plan.id, fanModal.index, row);
        toast(tc('saved'));
      }
      setFanModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      reportError(e);
    }
  }

  async function handleCreatePlan(draft: PlanDraft) {
    try {
      await createRejaPlan(draft.specialityId, draft.year.trim(), draft.shakl);
      setSpecId(draft.specialityId);
      setSemestr(null);
      toast(t('toast.planCreated'));
      setPlanModal(null);
    } catch (e) {
      reportError(e);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    try {
      if (confirm.kind === 'plan' && specId) await clearRejaPlan(specId);
      if (confirm.kind === 'semester' && plan) await clearRejaSemester(plan.id, confirm.semestr);
      if (confirm.kind === 'row' && plan) await removeRejaRow(plan.id, confirm.index);
      toast(tc('deleted'));
    } catch (e) {
      reportError(e);
    }
    setConfirm(null);
  }

  const crumbs = [
    {
      label: t('title'),
      onClick: plan ? () => { setSpecId(null); setSemestr(null); } : undefined,
    },
    ...(plan
      ? [{ label: plan.name, onClick: semestr ? () => setSemestr(null) : undefined }]
      : []),
    ...(plan && semestr ? [{ label: t('semester', { n: semestr }) }] : []),
  ];

  return (
    <>
      <CrumbBar crumbs={crumbs} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        {status === 'loading' || status === 'idle' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : !plan ? (
          <PlansLevel
            plans={plans}
            canWrite={canWrite}
            onOpen={(id) => { setSpecId(id); setSemestr(null); }}
            onNewPlan={() =>
              setPlanModal({
                specialityId: plans[0]?.id ?? 0,
                year: t('placeholder.year'),
                shakl: plans[0]?.shakl ?? 'Kunduzgi',
              })
            }
            onEditPlan={(p) =>
              setPlanModal({
                specialityId: p.id,
                year: rejaYears[p.id] || t('placeholder.year'),
                shakl: p.shakl,
              })
            }
            onClearPlan={(p) => { setSpecId(p.id); setConfirm({ kind: 'plan', name: p.name }); }}
          />
        ) : !semestr ? (
          <SemestersLevel
            plan={plan}
            entries={entries}
            canWrite={canWrite}
            onOpen={setSemestr}
            onAddFan={openAddFan}
            onClearSemester={(n) => setConfirm({ kind: 'semester', semestr: n })}
          />
        ) : (
          <SubjectsLevel
            semestr={semestr}
            entries={semesterEntries}
            kafedraOf={(fan) => fanKafedra.get(fan) ?? ''}
            canWrite={canWrite}
            onAddFan={() => openAddFan(semestr)}
            onEdit={openEditFan}
            onDelete={(entry) =>
              setConfirm({ kind: 'row', index: entry.index, name: entry.row.fan })
            }
          />
        )}
      </div>

      {planModal && (
        <PlanModal
          initial={planModal}
          specialities={plans.map((p) => ({ id: p.id, label: p.label }))}
          onCreate={handleCreatePlan}
          onCancel={() => setPlanModal(null)}
        />
      )}

      {fanModal && (
        <RejaFanModal
          mode={fanModal.mode}
          initial={fanModal.draft}
          suggestions={suggestions}
          teachers={plan?.teachers ?? []}
          onSave={handleSaveFan}
          onCancel={() => setFanModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'row' ? t('action.delete') : t('action.clear')}
          text={
            confirm.kind === 'plan'
              ? t('confirmClearPlan', { name: confirm.name })
              : confirm.kind === 'semester'
                ? t('confirmClearSemester', { n: confirm.semestr })
                : t('confirmDelete', { name: confirm.name })
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

/* ── Уровень 1: планы по мутахассисликам ─────────────────────────────── */

interface PlansLevelProps {
  plans: PlanOption[];
  canWrite: boolean;
  onOpen: (id: number) => void;
  onNewPlan: () => void;
  onEditPlan: (plan: PlanOption) => void;
  onClearPlan: (plan: PlanOption) => void;
}

function PlansLevel({ plans, canWrite, onOpen, onNewPlan, onEditPlan, onClearPlan }: PlansLevelProps) {
  const { t } = useTranslation('reja');

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          canWrite ? (
            <Button className="h-[46px] rounded-12 px-5" onClick={onNewPlan}>
              + {t('newPlan')}
            </Button>
          ) : undefined
        }
      />

      <CardGrid
        isEmpty={plans.length === 0}
        emptyTitle={t('empty.plans.title')}
        emptyText={t('empty.plans.text')}
      >
        {plans.map((plan, i) => {
          const color = badgeColor(i);
          const credits = plan.creditCount;
          return (
            <EntityCard
              key={plan.id}
              title={plan.name}
              subtitleNode={
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-6 bg-surface-alt px-1.5 py-0.5 font-mono text-12 font-medium text-ink-code">
                    {plan.kod}
                  </span>
                  <span className="text-12 text-ink-subtle">{plan.kafedra}</span>
                </div>
              }
              badgeText={initials(plan.name)}
              badgeBg={color.bg}
              badgeFg={color.fg}
              chips={[{ text: plan.shakl, ...FORM_CHIP[plan.shakl] }]}
              stats={[
                { value: SEMESTERS.length, label: t('stat.semestr') },
                { value: plan.fanCount, label: t('stat.fan') },
                { value: credits, label: t('stat.kredit') },
              ]}
              canWrite={canWrite}
              onOpen={() => onOpen(plan.id)}
              onEdit={() => onEditPlan(plan)}
              menuItems={[
                { label: t('action.edit'), onClick: () => onEditPlan(plan) },
                { label: t('action.clear'), danger: true, onClick: () => onClearPlan(plan) },
              ]}
            />
          );
        })}
      </CardGrid>
    </>
  );
}

/* ── Уровень 2: семестры плана ───────────────────────────────────────── */

interface SemestersLevelProps {
  plan: PlanOption;
  entries: RejaEntry[];
  canWrite: boolean;
  onOpen: (semestr: number) => void;
  onAddFan: (semestr: number) => void;
  onClearSemester: (semestr: number) => void;
}

function SemestersLevel({
  plan,
  entries,
  canWrite,
  onOpen,
  onAddFan,
  onClearSemester,
}: SemestersLevelProps) {
  const { t } = useTranslation('reja');
  // Внутри плана строки уже загружены — считаем по ним, счётчик из дерева
  // после правок успел бы устареть.
  const totalCredits = plan.reja.reduce((acc, r) => acc + r.kredit, 0);

  return (
    <>
      <PageHeader
        title={plan.name}
        subtitle={t('planMeta', {
          sem: SEMESTERS.length,
          fan: plan.reja.length,
          kredit: totalCredits,
        })}
        actions={
          canWrite ? (
            <Button className="h-[46px] rounded-12 px-5" onClick={() => onAddFan(1)}>
              + {t('addFan')}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-[18px] flex flex-wrap gap-3.5">
        <SummaryCard label={t('speciality')} value={plan.name} />
        <SummaryCard label={t('totalCredits')} value={String(totalCredits)} accent />
      </div>

      <CardGrid isEmpty={false} emptyTitle="" emptyText="">
        {SEMESTERS.map((n, i) => {
          const rows = entries.filter((e) => e.row.semestr === n);
          const color = badgeColor(i);
          return (
            <EntityCard
              key={n}
              title={t('semester', { n })}
              badgeText={String(n)}
              badgeBg={color.bg}
              badgeFg={color.fg}
              stats={[
                { value: rows.length, label: t('stat.fan') },
                { value: rows.reduce((acc, e) => acc + e.row.kredit, 0), label: t('stat.kredit') },
              ]}
              canWrite={canWrite}
              onOpen={() => onOpen(n)}
              menuItems={[
                { label: t('action.addFan'), onClick: () => onAddFan(n) },
                { label: t('action.clear'), danger: true, onClick: () => onClearSemester(n) },
              ]}
            />
          );
        })}
      </CardGrid>
    </>
  );
}

/* ── Уровень 3: фаны семестра ────────────────────────────────────────── */

interface SubjectsLevelProps {
  semestr: number;
  entries: RejaEntry[];
  kafedraOf: (fan: string) => string;
  canWrite: boolean;
  onAddFan: () => void;
  onEdit: (entry: RejaEntry) => void;
  onDelete: (entry: RejaEntry) => void;
}

function SubjectsLevel({
  semestr,
  entries,
  kafedraOf,
  canWrite,
  onAddFan,
  onEdit,
  onDelete,
}: SubjectsLevelProps) {
  const { t } = useTranslation('reja');
  const credits = entries.reduce((acc, e) => acc + e.row.kredit, 0);

  return (
    <>
      <PageHeader
        title={t('semester', { n: semestr })}
        subtitle={t('semesterMeta', { fan: entries.length, kredit: credits })}
        actions={
          canWrite ? (
            <Button className="h-[46px] rounded-12 px-5" onClick={onAddFan}>
              + {t('addFan')}
            </Button>
          ) : undefined
        }
      />

      <CardGrid
        isEmpty={entries.length === 0}
        emptyTitle={t('empty.semester.title')}
        emptyText={t('empty.semester.text')}
      >
        {entries.map((entry, i) => {
          const color = badgeColor(i);
          const kafedra = kafedraOf(entry.row.fan);
          return (
            <EntityCard
              key={`${entry.index}-${entry.row.fan}`}
              title={entry.row.fan}
              subtitleNode={
                kafedra ? <div className="mt-1 text-12 text-ink-subtle">{kafedra}</div> : undefined
              }
              badgeText={initials(entry.row.fan)}
              badgeBg={color.bg}
              badgeFg={color.fg}
              lead={{
                label: t('field.oqituvchi'),
                name: entry.row.oqituvchi,
                initials: initials(entry.row.oqituvchi),
              }}
              stats={[{ value: entry.row.kredit, label: t('stat.kredit') }]}
              canWrite={canWrite}
              onEdit={() => onEdit(entry)}
              onDelete={() => onDelete(entry)}
            />
          );
        })}
      </CardGrid>
    </>
  );
}

/* ── Общие части ─────────────────────────────────────────────────────── */

function CardGrid({
  isEmpty,
  emptyTitle,
  emptyText,
  children,
}: {
  isEmpty: boolean;
  emptyTitle: string;
  emptyText: string;
  children: ReactNode;
}) {
  if (isEmpty) {
    return (
      <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        <h3 className="m-0 text-17 font-bold text-ink">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-14 border border-line bg-surface px-5 py-3.5">
      <div className="text-11-5 font-semibold text-ink-subtle">{label}</div>
      <div className={`mt-0.5 text-15 font-bold ${accent ? 'text-brand' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

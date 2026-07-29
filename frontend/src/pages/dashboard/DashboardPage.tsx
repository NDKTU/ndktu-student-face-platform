import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStructureStore } from '@/features/tuzilma/model/structure.store';
import { useStructure } from '@/features/tuzilma/lib/useStructure';
import { countFacultyStudents } from '@/entities/university/lib/counters';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { STAT_ICONS } from './statIcons';

/** Тон плитки показателя. */
type StatTone = 'brand' | 'info' | 'violet' | 'success' | 'warning';

const TONE_CLASS: Record<StatTone, string> = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
};

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { t: tn } = useTranslation('nav');
  const faculties = useStructureStore((s) => s.faculties);
  const { status, error, reload } = useStructure();

  const totals = useMemo(() => {
    let departments = 0;
    let specialities = 0;
    let students = 0;
    let teachers = 0;

    faculties.forEach((f) => {
      departments += f.kafedralar.length;
      f.kafedralar.forEach((k) => {
        teachers += k.oqituvchilar;
        specialities += k.mutaxassisliklar.length;
        k.mutaxassisliklar.forEach((s) =>
          s.guruhlar.forEach((g) => {
            students += g.student_count;
          }),
        );
      });
    });

    return { faculties: faculties.length, departments, specialities, students, teachers };
  }, [faculties]);

  // Столбцы нормируются по максимуму, а не по сумме — так видно разброс.
  const distribution = useMemo(() => {
    const rows = faculties.map((f) => ({
      name: f.name.replace(' fakulteti', ''),
      value: countFacultyStudents(f),
      color: f.color.fg,
    }));
    const max = Math.max(...rows.map((r) => r.value), 1);
    return rows.map((r) => ({ ...r, pct: `${Math.round((r.value / max) * 100)}%` }));
  }, [faculties]);


  return (
    <>
      <CrumbBar crumbs={[{ label: tn('bosh') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-25 font-extrabold tracking-[-0.025em] text-ink">{t('title')}</h1>
            <p className="mt-1.5 mb-0 text-14 text-ink-muted">{t('subtitle')}</p>
          </div>
          <span className="rounded-10 border border-line bg-surface px-[13px] py-2 text-12-5 font-semibold text-ink-muted">
            {t('year')}
          </span>
        </div>

        {status === 'error' && (
          <div className="mb-[22px]">
            <ErrorState message={error} onRetry={() => void reload()} />
          </div>
        )}

        {status === 'idle' || status === 'loading' ? (
          <LoadingState />
        ) : (
          <>
        <div className="mb-[22px] grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <StatCard icon="fakultet" tone="brand" value={totals.faculties} label={t('stat.fakultet')} />
          <StatCard icon="kafedra" tone="info" value={totals.departments} label={t('stat.kafedra')} />
          <StatCard icon="mutaxassislik" tone="violet" value={totals.specialities} label={t('stat.mutaxassislik')} />
          {/* Бейдж «+3.2%» здесь был фиксированной строкой из прототипа:
              динамику бэкенд не считает, сравнивать не с чем. */}
          <StatCard icon="talaba" tone="success" value={totals.students} label={t('stat.talaba')} />
          <StatCard icon="oqituvchi" tone="warning" value={totals.teachers} label={t('stat.oqituvchi')} />
        </div>

        <div className="grid items-start gap-[18px] lg:[grid-template-columns:1.4fr_1fr]">
          <Panel title={t('facultyChart')} titleGap={18}>
            <div className="flex flex-col gap-[15px]">
              {distribution.map((row) => (
                <div key={row.name}>
                  <div className="mb-1.5 flex justify-between text-13">
                    <span className="font-semibold text-ink-secondary">{row.name}</span>
                    <span className="font-bold text-ink">{row.value}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-md bg-surface-muted">
                    <div
                      className="h-full rounded-md transition-[width] duration-500"
                      style={{ width: row.pct, background: row.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

        </div>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({
  icon,
  tone,
  value,
  label,
  badge,
}: {
  icon: keyof typeof STAT_ICONS;
  tone: StatTone;
  value: number;
  label: string;
  badge?: string;
}) {
  return (
    <div className="rounded-16 border border-line bg-surface px-5 py-[18px] shadow-card">
      <div className="flex items-start justify-between">
        <span className={`grid size-10 place-items-center rounded-11 ${TONE_CLASS[tone]}`}>
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            {STAT_ICONS[icon]}
          </svg>
        </span>
        {badge && (
          <span className="rounded-20 bg-success-soft px-2 py-[3px] text-11-5 font-bold text-success">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3 text-30 font-extrabold tracking-[-0.02em] text-ink">{value}</div>
      <div className="text-13 font-semibold text-ink-muted">{label}</div>
    </div>
  );
}

/**
 * Отступ под заголовком у двух панелей разный: 18px у диаграммы и 16px
 * у ленты активности. Это не оплошность прототипа, а его фактическая вёрстка,
 * и режим «пиксель в пиксель» обязывает её сохранить.
 */
function Panel({
  title,
  titleGap = 16,
  children,
}: {
  title: string;
  titleGap?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-16 border border-line bg-surface p-[22px] shadow-card">
      <h3 className="mt-0 text-16 font-bold text-ink" style={{ marginBottom: titleGap }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

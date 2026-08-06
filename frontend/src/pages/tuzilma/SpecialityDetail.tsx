import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { EduForm, Faculty, Kafedra, Speciality } from '@/entities/university/model/types';

/** Sirtqi выделен: заочное прекращено, такие группы остались от прошлых лет. */
const FORM_CHIP: Record<EduForm, { bg: string; fg: string }> = {
  Kunduzgi: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' },
  Kechki: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' },
  Masofaviy: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand)' },
  Sirtqi: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
};
import { countSpecialityStudents } from '@/entities/university/lib/counters';
import { namePrefix } from '@/shared/lib/namePrefix';
import { EntityCard } from './EntityCard';
import { useStructureStore } from '@/features/tuzilma/model/structure.store';

interface SpecialityDetailProps {
  speciality: Speciality;
  department: Kafedra;
  faculty: Faculty;
  canWrite: boolean;
  onOpenGroup: (id: number, name: string) => void;
  onAddGroup: () => void;
  onEditGroup: (
    id: number,
    name: string,
    kurs: number,
    shakl: EduForm | null,
    sardorStudentId?: number,
    sardorName?: string,
  ) => void;
  onDeleteGroup: (id: number, name: string) => void;
  activeTab: 'groups' | 'curriculum';
  onTabChange: (tab: 'groups' | 'curriculum') => void;
}

export function SpecialityDetail({
  speciality,
  department,
  faculty,
  canWrite,
  onOpenGroup,
  onEditGroup,
  onDeleteGroup,
  activeTab,
  onTabChange,
}: SpecialityDetailProps) {
  const { t } = useTranslation('tuzilma');
  const loadReja = useStructureStore((s) => s.loadReja);

  useEffect(() => {
    if (activeTab === 'curriculum') {
      void loadReja(speciality.id);
    }
  }, [activeTab, speciality.id, loadReja]);

  const totalStudents = countSpecialityStudents(speciality);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      {/* Шапка специальности со статистикой и табами */}
      <div className="mb-6 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div
              className="grid size-[58px] flex-none place-items-center rounded-15 text-18 font-extrabold"
              style={{ background: faculty.color.bg, color: faculty.color.fg }}
              aria-hidden="true"
            >
              {namePrefix(speciality.name)}
            </div>

            <div>
              <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
                {speciality.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-6 bg-surface-alt px-2 py-0.5 font-mono text-12 font-semibold text-ink-code">
                  {speciality.kod}
                </span>
                <span className="text-13-5 text-ink-subtle">{department.name}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-[26px]">
            <Stat value={speciality.guruhlar.length} label={t('stat.guruh')} />
            <Stat value={totalStudents} label={t('stat.talaba')} />
            <Stat value={speciality.curriculum_count} label={t('stat.fan')} />
          </div>
        </div>

        {/* Табы */}
        <div className="mt-6 flex border-b border-line">
          <button
            type="button"
            onClick={() => onTabChange('groups')}
            className={`mr-6 pb-3 text-14 font-bold transition-colors border-b-2 ${
              activeTab === 'groups'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-subtle hover:text-ink'
            }`}
          >
            {t('level.group.plural')}
          </button>
          <button
            type="button"
            onClick={() => onTabChange('curriculum')}
            className={`pb-3 text-14 font-bold transition-colors border-b-2 ${
              activeTab === 'curriculum'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-subtle hover:text-ink'
            }`}
          >
            O'quv reja / Fanlar
          </button>
        </div>
      </div>

      {/* Контент таба */}
      {activeTab === 'groups' ? (
        speciality.guruhlar.length === 0 ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
            <h3 className="m-0 text-17 font-bold text-ink">{t('level.group.emptyTitle')}</h3>
            <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">
              {t('level.group.empty')}
            </p>
          </div>
        ) : (
          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
            {speciality.guruhlar.map((g) => (
              <EntityCard
                key={g.id}
                title={g.name}
                badgeText={namePrefix(g.name)}
                badgeBg={faculty.color.bg}
                badgeFg={faculty.color.fg}
                chips={[
                  {
                    text: `${g.kurs}-kurs`,
                    bg: 'var(--color-success-soft)',
                    fg: 'var(--color-success)',
                  },
                  // Форма обучения — свойство группы, и на карточке
                  // специальности её уже нет: показываем здесь.
                  ...(g.shakl ? [{ text: g.shakl, ...FORM_CHIP[g.shakl] }] : []),
                ]}
                lead={
                  g.sardor
                    ? { label: t('group.leader'), name: g.sardor, initials: namePrefix(g.sardor) }
                    : undefined
                }
                stats={[{ value: g.student_count, label: t('stat.talaba') }]}
                canWrite={canWrite}
                onOpen={() => onOpenGroup(g.id, g.name)}
                onEdit={() => openEditGroupHandler(g)}
                onDelete={() => onDeleteGroup(g.id, g.name)}
              />
            ))}
          </div>
        )
      ) : (
        <CurriculumTab reja={speciality.reja} />
      )}
    </div>
  );

  function openEditGroupHandler(g: Speciality['guruhlar'][number]) {
    onEditGroup(g.id, g.name, g.kurs, g.shakl, g.sardorStudentId ?? undefined, g.sardor);
  }
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <div className="text-21 font-extrabold tracking-[-0.01em] text-ink">{value}</div>
      <div className="text-11-5 font-medium text-ink-subtle">{label}</div>
    </div>
  );
}

function CurriculumTab({ reja }: { reja: Speciality['reja'] }) {
  if (!reja || reja.length === 0) {
    return (
      <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        <h3 className="m-0 text-17 font-bold text-ink">O'quv reja hali shakllantirilmagan</h3>
        <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">
          Ushbu mutaxassislik uchun fanlar va o'quv reja kiritilmagan.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-18 border border-line bg-surface shadow-card">
      <table className="rtab w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-sunken">
            <th className="px-5 py-3 text-11-5 font-bold uppercase text-ink-subtle w-14">№</th>
            <th className="px-5 py-3 text-11-5 font-bold uppercase text-ink-subtle">Fan nomi</th>
            <th className="px-5 py-3 text-11-5 font-bold uppercase text-ink-subtle">Semestr</th>
            <th className="px-5 py-3 text-11-5 font-bold uppercase text-ink-subtle">Kredit</th>
            <th className="px-5 py-3 text-11-5 font-bold uppercase text-ink-subtle">O'qituvchi</th>
          </tr>
        </thead>
        <tbody>
          {reja.map((row, index) => (
            <tr
              key={`${index}-${row.fan}`}
              className="border-b border-surface-muted last:border-b-0 hover:bg-surface-raised"
            >
              <td className="px-5 py-3.5 text-13-5 text-ink-subtle">{index + 1}</td>
              <td className="px-5 py-3.5 text-13-5 font-semibold text-ink">{row.fan}</td>
              <td className="px-5 py-3.5 text-13-5 font-mono text-ink-code">{row.semestr}-semestr</td>
              <td className="px-5 py-3.5 text-13-5 font-semibold text-brand">{row.kredit}</td>
              <td className="px-5 py-3.5 text-13-5 text-ink-muted">{row.oqituvchi || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

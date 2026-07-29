import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { SensitiveSection } from '@/entities/access/ui/SensitiveSection';
import { statusTone } from '@/entities/university/lib/studentProfile';
import type { StudentRow } from '@/entities/student/model/types';
import { getStudentProfile, getStudentSensitive } from '@/shared/api/talabalar';
import { useAsyncData } from '@/shared/lib/useAsyncData';

type Tab = 'umumiy' | 'maxfiy';

/** Карточка студента: шапка с боковой панелью и две вкладки. */
export function StudentDetail({ student }: { student: StudentRow }) {
  const { t } = useTranslation('talabalar');
  const { t: tc } = useTranslation('common');
  const { canViewStudentSensitive: canViewSensitive } = usePermissions();
  const [tab, setTab] = useState<Tab>('umumiy');

  // Анкета приезжает с сервера: раньше она считалась здесь же из хэша sid.
  const profile = useAsyncData(student.id, getStudentProfile);
  const tone = statusTone(student.tone);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      {/* --- Шапка --- */}
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-[260px] flex-1 items-start gap-[18px]">
            <div
              className="grid size-[84px] flex-none place-items-center rounded-18 bg-brand text-24 font-extrabold text-white"
              aria-hidden="true"
            >
              {student.initials}
            </div>

            <div className="min-w-0">
              <h1 className="m-0 text-25 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
                {student.fish}
              </h1>
              <div className="mt-1.5 font-mono text-13 text-ink-code">
                {t('detail.idLabel', { sid: student.sid })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-20 px-2.5 py-1 text-12 font-bold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
                  {student.holati}
                </span>
                <span className="rounded-20 bg-brand-soft px-2.5 py-1 text-12 font-bold text-brand">
                  {t('kurs', { n: student.kurs })}
                </span>
                {student.shakl && (
                  <span className="rounded-20 bg-surface-muted px-2.5 py-1 text-12 font-bold text-ink-muted">
                    {student.shakl}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* --- Боковая панель: где учится и откуда запись --- */}
          <div className="w-full max-w-[240px] flex-none rounded-14 bg-surface-raised p-5">
            <PanelRow label={t('detail.guruh')}>
              <span className="text-14 font-bold text-brand">{student.guruh}</span>
            </PanelRow>
            <PanelRow label={t('detail.mutaxassislik')}>{student.mutaxassislik}</PanelRow>
            <PanelRow label={t('detail.fakultet')}>{student.fakultet}</PanelRow>

            <div className="mt-4 border-t border-line pt-4">
              <div className="text-11-5 font-semibold text-ink-subtle">{t('detail.manba')}</div>
              <span
                className={`mt-1.5 inline-block rounded-20 px-[11px] py-1 text-12 font-bold ${
                  student.manba === 'HEMIS'
                    ? 'bg-brand-soft text-brand'
                    : 'bg-surface-alt text-ink-muted'
                }`}
              >
                {student.manba}
              </span>
              <div className="mt-1.5 text-11-5 text-ink-faint">
                {t(`detail.manbaNote.${student.manba}`)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Вкладки --- */}
      <div className="mb-5 flex gap-6 border-b border-line">
        <TabButton active={tab === 'umumiy'} onClick={() => setTab('umumiy')}>
          {t('detail.tab.umumiy')}
        </TabButton>
        <TabButton active={tab === 'maxfiy'} onClick={() => setTab('maxfiy')}>
          <LockIcon />
          {t('detail.tab.maxfiy')}
        </TabButton>
      </div>

      <div className="rounded-18 border border-line bg-surface p-6 shadow-card">
        {tab === 'umumiy' ? (
          profile.status !== 'ready' || !profile.data ? (
            <p className="py-10 text-center text-13-5 text-ink-subtle">
              {profile.status === 'error' ? profile.error : tc('loading')}
            </p>
          ) : (
            <FieldGrid
              rows={[
                [t('detail.field.birth'), profile.data.birth],
                [t('detail.field.email'), profile.data.login],
                [t('detail.field.lang'), profile.data.lang],
                [t('detail.field.eduType'), profile.data.eduType],
                [t('detail.field.semestr'), profile.data.semestr],
                [t('detail.field.kurs'), profile.data.kursLevel],
                [t('detail.field.pay'), profile.data.pay],
              ]}
            />
          )
        ) : (
          <SensitiveSection
            id={student.id}
            load={getStudentSensitive}
            title={t('section.maxfiy')}
            denied={{ title: t('detail.denied.title'), text: t('detail.denied.text') }}
            allowed={canViewSensitive}
            gridClass="grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"
            rows={(d) => [
              [t('detail.field.jshshir'), d.jshshir],
              [t('detail.field.soc'), d.soc],
              [t('detail.field.pov'), d.pov],
              [t('detail.field.country'), d.passport],
              [t('detail.field.vil'), d.vil],
              [t('detail.field.tum'), d.tum],
              [t('detail.field.address'), d.address],
            ]}
          />
        )}
      </div>
    </div>
  );
}

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="text-11-5 font-semibold text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-14 font-semibold text-ink">{children}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-x-0 border-t-0 border-b-2 bg-transparent px-1 pb-2.5 text-14 font-bold ${
        active ? 'border-b-brand text-brand' : 'border-b-transparent text-ink-faint hover:text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-11-5 font-semibold text-ink-subtle">{label}</dt>
          <dd className="m-0 mt-1 text-14 font-semibold break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}


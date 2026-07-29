import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { SensitiveSection } from '@/entities/access/ui/SensitiveSection';
import { statusTone } from '@/entities/university/lib/studentProfile';
import type { Faculty, Group, Speciality, Student } from '@/entities/university/model/types';
import { getStudentProfile, getStudentSensitive } from '@/shared/api/talabalar';
import { useAsyncData } from '@/shared/lib/useAsyncData';

interface StudentDetailProps {
  student: Student;
  group: Group;
  speciality: Speciality;
  faculty: Faculty;
}

export function StudentDetail({ student, group, speciality, faculty }: StudentDetailProps) {
  const { t } = useTranslation('tuzilma');
  const { t: tc } = useTranslation('common');
  const { canViewStudentSensitive: canViewSensitive } = usePermissions();
  const [tab, setTab] = useState<'general' | 'sensitive'>('general');

  // Тот же источник, что и в реестре «Foydalanuvchilar»: анкета живёт в БД.
  const profile = useAsyncData(student.id, getStudentProfile);
  const tone = statusTone(student.tone);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-[18px]">
          <div
            className="grid size-[58px] flex-none place-items-center rounded-15 text-18 font-extrabold text-white"
            style={{ background: faculty.color.fg }}
            aria-hidden="true"
          >
            {student.initials}
          </div>

          <div className="min-w-[220px] flex-1">
            <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
              {student.fish}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-12-5 text-ink-code">
                {t('student.idLabel', { sid: student.sid })}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-20 px-2.5 py-1 text-11 font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
                {student.holati}
              </span>
              <span className="rounded-20 bg-surface-muted px-2.5 py-1 text-11 font-bold text-ink-muted">
                {`${group.kurs}-kurs`}
              </span>
              <span className="rounded-20 bg-surface-muted px-2.5 py-1 text-11 font-bold text-ink-muted">
                {speciality.shakl}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-18 border border-line bg-surface shadow-card">
        <div className="flex gap-6 border-b border-surface-sunken px-6">
          <TabButton active={tab === 'general'} onClick={() => setTab('general')}>
            {t('student.tab.general')}
          </TabButton>
          <TabButton active={tab === 'sensitive'} onClick={() => setTab('sensitive')}>
            {t('student.tab.sensitive')}
          </TabButton>
        </div>

        <div className="p-6">
          {tab === 'general' ? (
            profile.status !== 'ready' || !profile.data ? (
              <p className="py-10 text-center text-13-5 text-ink-subtle">
                {profile.status === 'error' ? profile.error : tc('loading')}
              </p>
            ) : (
              <FieldGrid
                rows={[
                  [t('student.field.birth'), profile.data.birth],
                  [t('student.field.email'), profile.data.email],
                  [t('student.field.lang'), profile.data.lang],
                  [t('student.field.eduType'), profile.data.eduType],
                  [t('student.field.semestr'), profile.data.semestr],
                  [t('student.field.kurs'), profile.data.kursLevel],
                  [t('student.field.pay'), profile.data.pay],
                  [t('group.leader'), group.sardor],
                ]}
              />
            )
          ) : (
            <SensitiveSection
              id={student.id}
              load={getStudentSensitive}
              title={t('student.tab.sensitive')}
              denied={{ title: t('student.denied.title'), text: t('student.denied.text') }}
              allowed={canViewSensitive}
              gridClass="grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"
              rows={(d) => [
                [t('student.field.jshshir'), d.jshshir],
                [t('student.field.soc'), d.soc],
                [t('student.field.pov'), d.pov],
                [t('student.field.country'), d.country],
                [t('student.field.vil'), d.vil],
                [t('student.field.tum'), d.tum],
                [t('student.field.address'), d.address],
              ]}
            />
          )}
        </div>
      </div>
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`cursor-pointer border-none border-b-2 bg-transparent px-0 py-3.5 text-13-5 font-bold ${
        active ? 'border-brand text-brand' : 'border-transparent text-ink-faint hover:text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-11-5 font-semibold text-ink-subtle">{label}</dt>
          <dd className="m-0 mt-1 text-13-5 font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

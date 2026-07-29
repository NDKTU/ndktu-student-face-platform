import { useTranslation } from 'react-i18next';
import { statusTone } from '@/entities/university/lib/studentProfile';
import type { Faculty, Group, Speciality } from '@/entities/university/model/types';

interface GroupDetailProps {
  group: Group;
  speciality: Speciality;
  faculty: Faculty;
  onOpenStudent: (id: number) => void;
}

export function GroupDetail({ group, speciality, faculty, onOpenStudent }: GroupDetailProps) {
  const { t } = useTranslation('tuzilma');

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-[18px]">
          <div
            className="grid size-[58px] flex-none place-items-center rounded-15 text-18 font-extrabold"
            style={{ background: faculty.color.bg, color: faculty.color.fg }}
            aria-hidden="true"
          >
            {group.name.split('-')[0]}
          </div>

          <div className="min-w-[220px] flex-1">
            <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
              {group.name}
            </h1>
            <div className="mt-1.5 text-13-5 text-ink-subtle">
              {t('group.subtitle', { spec: speciality.name, kurs: group.kurs })}
            </div>
          </div>

          <div className="flex gap-[22px]">
            <Stat value={group.student_count} label={t('stat.talaba')} />
            <Stat value={group.kurs} label={t('stat.kurs')} />
            <Stat value={speciality.curriculum_count} label={t('stat.fan')} />
          </div>
        </div>

        <div className="mt-5 border-t border-surface-muted pt-4 text-13 text-ink-muted">
          {t('group.leader')}: <span className="font-semibold text-ink">{group.sardor}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-18 border border-line bg-surface shadow-card">
        <table className="rtab w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-sunken">
              <Th className="w-14">{t('student.columnNo')}</Th>
              <Th>{t('student.columnFish')}</Th>
              <Th>{t('student.columnSid')}</Th>
              <Th>{t('student.columnStatus')}</Th>
            </tr>
          </thead>
          <tbody>
            {(group.students ?? []).map((student, index) => {
              const tone = statusTone(student.tone);
              return (
                <tr
                  key={student.id}
                  onClick={() => onOpenStudent(student.id)}
                  className="cursor-pointer border-b border-surface-muted last:border-b-0 hover:bg-surface-raised"
                >
                  <Td label={t('student.columnNo')} className="text-ink-subtle">
                    {index + 1}
                  </Td>
                  <Td label={t('student.columnFish')}>
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-7 flex-none place-items-center rounded-full bg-brand-soft text-11 font-bold text-brand">
                        {student.initials}
                      </span>
                      <span className="font-semibold text-ink">{student.fish}</span>
                    </span>
                  </Td>
                  <Td label={t('student.columnSid')}>
                    <span className="font-mono text-12-5 text-ink-code">{student.sid}</span>
                  </Td>
                  <Td label={t('student.columnStatus')}>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-20 px-2.5 py-1 text-11 font-bold"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
                      {student.holati}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-18 font-extrabold tracking-[-0.01em] text-ink">{value}</div>
      <div className="text-11 font-medium text-ink-subtle">{label}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 text-11-5 font-bold text-ink-subtle uppercase ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  label,
  className = '',
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  // data-label читается мобильным CSS: на узком экране таблица превращается
  // в карточки, и подпись колонки подставляется через td::before.
  return (
    <td data-label={label} className={`px-5 py-3 text-13-5 ${className}`}>
      {children}
    </td>
  );
}

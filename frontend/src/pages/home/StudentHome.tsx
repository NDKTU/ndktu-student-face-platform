import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildUniversity } from '@/entities/university/mock/build';
import { buildCourse } from '@/entities/course/mock/buildCourse';
import type { RejaRow } from '@/entities/university/model/types';
import { CrumbBar } from '@/widgets/layout/CrumbBar';

/** Группа студента, под которым выполняется вход (в прототипе переименована). */
const STUDENT_GROUP_NAME = 'DI-24-01';

/** Показатели студента — фиксированные значения прототипа. */
const STATS = [
  { key: 'gpa', value: '4.3' },
  { key: 'attendance', value: '96%' },
  { key: 'credits', value: '48/240' },
] as const;

export function StudentHome() {
  const { t } = useTranslation('home');
  const { t: tn } = useTranslation('nav');
  const navigate = useNavigate();

  const { group, department, subjects } = useMemo(() => {
    const { faculties } = buildUniversity();
    const department = faculties[2]!.kafedralar[0]!;
    const spec = department.mutaxassisliklar[0]!;
    const group = spec.guruhlar[0]!;
    const currentSemester = 4;
    const inSem = spec.reja.filter((r) => r.semestr === currentSemester);
    const subjects = inSem.length >= 4 ? inSem : spec.reja.slice(0, 6);
    return { group, department, subjects };
  }, []);

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('bosh') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="rounded-20 bg-[linear-gradient(135deg,#2836C7_0%,#4655D8_100%)] px-7 py-6 text-white">
          <div className="text-20 font-extrabold tracking-[-0.02em]">
            {t('student.welcome', { name: 'Islom' })}
          </div>
          <div className="mt-1 text-13 font-semibold opacity-85">
            {t('student.group', { spec: 'Dasturiy injiniring', name: 'DI-24-01', kurs: 2 })}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {STATS.map((stat) => (
              <div key={stat.key} className="rounded-14 bg-white/15 px-4 py-3">
                <div className="text-20 font-extrabold">{stat.value}</div>
                <div className="text-11-5 font-medium opacity-85">{t(`student.stat.${stat.key}`)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid items-start gap-[18px] lg:[grid-template-columns:1fr_1.6fr]">
          <div className="rounded-16 border border-line bg-surface p-6 shadow-card">
            <h3 className="mt-0 mb-4 text-16 font-bold text-ink">{t('student.myGroup')}</h3>
            <div className="text-20 font-extrabold text-ink">{STUDENT_GROUP_NAME}</div>
            <dl className="mt-4 flex flex-col gap-3">
              {[
                [t('student.groupField.kaf'), department.name],
                [t('student.groupField.sardor'), group.sardor],
                [
                  t('student.groupField.students'),
                  t('student.groupField.studentsValue', { count: group.students.length }),
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-12-5 font-semibold text-ink-subtle">{label}</dt>
                  <dd className="m-0 text-right text-13-5 font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-16 border border-line bg-surface p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-16 font-bold text-ink">{t('student.subjects')}</h3>
              <button
                type="button"
                onClick={() => navigate('/fanlarim')}
                className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-brand hover:underline"
              >
                {t('student.all')}
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {subjects.map((row) => (
                <SubjectProgress key={row.fan} row={row} label={t('student.progress')} credit={t('student.credit', { count: row.kredit })} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SubjectProgress({ row, label, credit }: { row: RejaRow; label: string; credit: string }) {
  const course = buildCourse(row.fan, row.oqituvchi, row.semestr);
  const pct = Math.round((course.doneCount / course.total) * 100);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-13-5 font-semibold text-ink">{row.fan}</span>
        <span className="text-12 font-medium text-ink-subtle">{credit}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-[9px] flex-1 overflow-hidden rounded-md bg-surface-muted">
          <div className="h-full rounded-md bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-right text-12 font-bold text-brand">{pct}%</span>
      </div>
      <div className="mt-1 text-11 text-ink-subtle">{label}</div>
    </div>
  );
}

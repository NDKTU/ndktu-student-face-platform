import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPending, type PendingSubmission } from '@/shared/api/vazifalar';
import { TEACHER_TESTS } from '@/entities/test/mock/tests';
import { CrumbBar } from '@/widgets/layout/CrumbBar';

/** Предметы и группы преподавателя. */
const SUBJECTS = [
  { fan: 'Kon jinslari mexanikasi', groups: ['KI-24-01', 'KI-24-02', 'KI-23-01'] },
  { fan: 'Portlatish ishlari texnologiyasi', groups: ['KI-23-01', 'KI-23-02'] },
  { fan: 'Kon aerologiyasi va ventilyatsiya', groups: ['KI-24-01', 'KI-24-02'] },
  { fan: 'Oliy matematika', groups: ['KI-24-01', 'MT-24-01', 'GD-24-01'] },
];

export function TeacherHome() {
  const { t } = useTranslation('home');
  const { t: tn } = useTranslation('nav');
  const navigate = useNavigate();

  // Плоский список работ на проверке приходит отдельным запросом: в списке
  // заданий сдач нет, а тянуть детали каждого — это два десятка запросов.
  const [ungraded, setUngraded] = useState<PendingSubmission[]>([]);
  useEffect(() => {
    let alive = true;
    getPending(6)
      .then((items) => alive && setUngraded(items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const groupCount = useMemo(() => new Set(SUBJECTS.flatMap((s) => s.groups)).size, []);

  const activeTests = TEACHER_TESTS.filter((x) => x.holati === 'Faol').length;

  const stats = [
    { key: 'subjects', value: SUBJECTS.length, alert: false },
    { key: 'groups', value: groupCount, alert: false },
    { key: 'tests', value: activeTests, alert: false },
    { key: 'ungraded', value: ungraded.length, alert: ungraded.length > 0 },
  ] as const;

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('bosh') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="rounded-20 bg-[linear-gradient(135deg,#157A43_0%,#1F9A57_100%)] px-7 py-6 text-white">
          <div className="text-20 font-extrabold tracking-[-0.02em]">
            {t('teacher.welcome', { name: 'Jasur' })}
          </div>
          <div className="mt-1 text-13 font-semibold opacity-85">{t('teacher.kaf', { kaf: 'Konchilik ishi kafedrasi' })}</div>
        </div>

        <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {stats.map((stat) => (
            <button
              key={stat.key}
              type="button"
              onClick={() => stat.key === 'ungraded' && stat.value > 0 && navigate('/tvazlar')}
              className={`rounded-16 border p-5 text-left shadow-card ${
                stat.alert
                  ? 'cursor-pointer border-warning-soft bg-warning-soft'
                  : 'cursor-default border-line bg-surface'
              }`}
            >
              <div className={`text-30 font-extrabold tracking-[-0.02em] ${stat.alert ? 'text-warning' : 'text-ink'}`}>
                {stat.value}
              </div>
              <div className={`text-13 font-semibold ${stat.alert ? 'text-warning' : 'text-ink-muted'}`}>
                {t(`teacher.stat.${stat.key}`)}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-16 border border-line bg-surface p-6 shadow-card">
          <h3 className="mt-0 mb-4 text-16 font-bold text-ink">{t('teacher.ungradedTitle')}</h3>
          {ungraded.length === 0 ? (
            <p className="m-0 text-13-5 text-ink-subtle">{t('teacher.ungradedEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ungraded.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => navigate('/tvazlar')}
                  className="flex cursor-pointer items-center gap-3.5 rounded-14 border border-line bg-surface px-4 py-3 text-left hover:bg-surface-raised"
                >
                  <span className="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-12 font-bold text-brand">
                    {sub.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-14 font-semibold text-ink">{sub.fish}</span>
                    <span className="block truncate text-12 text-ink-subtle">
                      {sub.fan} · {sub.guruh} · {sub.title}
                    </span>
                  </span>
                  <span className="flex-none text-12-5 font-bold text-brand">{t('teacher.goGrade')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPending, type PendingSubmission } from '@/shared/api/vazifalar';
import { getActiveQuizzes, getMyGroups, getMySubjects } from '@/shared/api/mening';
import { useCurrentUser } from '@/features/auth/lib/useCurrentUser';
import { useSessionStore } from '@/features/auth/model/session.store';
import { CrumbBar } from '@/widgets/layout/CrumbBar';

export function TeacherHome() {
  const { t } = useTranslation('home');
  const { t: tn } = useTranslation('nav');
  const navigate = useNavigate();

  const me = useCurrentUser();
  const user = useSessionStore((s) => s.user);
  const userId = user?.id ?? null;
  // Первое имя из ФИО: приветствие обращается по имени, а не по фамилии.
  const firstName = user?.employee?.first_name ?? me.displayName.split(' ')[0] ?? '';
  const kafedra = user?.employee?.teacher?.kafedra?.name ?? '';

  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [activeTests, setActiveTests] = useState(0);

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

  // Закрепления и активные тесты — три независимых запроса. Ошибку каждого
  // гасим по отдельности: пустая плитка лучше пустой страницы.
  useEffect(() => {
    if (userId === null) return;
    let alive = true;

    void getMySubjects(userId)
      .then((items) => alive && setSubjects(items))
      .catch(() => undefined);
    void getMyGroups(userId)
      .then((items) => alive && setGroups(items))
      .catch(() => undefined);
    void getActiveQuizzes()
      .then((items) => alive && setActiveTests(items.length))
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [userId]);

  const stats = [
    { key: 'subjects', value: subjects.length, alert: false },
    { key: 'groups', value: groups.length, alert: false },
    { key: 'tests', value: activeTests, alert: false },
    { key: 'ungraded', value: ungraded.length, alert: ungraded.length > 0 },
  ] as const;

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('bosh') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="rounded-20 bg-[linear-gradient(135deg,#157A43_0%,#1F9A57_100%)] px-7 py-6 text-white">
          <div className="text-20 font-extrabold tracking-[-0.02em]">
            {t('teacher.welcome', { name: firstName })}
          </div>
          <div className="mt-1 text-13 font-semibold opacity-85">{t('teacher.kaf', { kaf: kafedra })}</div>
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

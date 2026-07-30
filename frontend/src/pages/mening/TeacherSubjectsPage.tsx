import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyGroups, getMySubjects, type AssignedGroup, type AssignedSubject } from '@/shared/api/mening';
import { useSessionStore } from '@/features/auth/model/session.store';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';

/**
 * Что закреплено за преподавателем: предметы и группы.
 *
 * Закрепления заводит администратор в разделе пользователей — здесь только
 * просмотр. Ссылки ведут туда, где с ними работают: предмет — в банк вопросов,
 * группа — в журнал через список курсов.
 */
export function TeacherSubjectsPage() {
  const { t } = useTranslation('mening');
  const navigate = useNavigate();
  const userId = useSessionStore((s) => s.user?.id ?? null);

  const [subjects, setSubjects] = useState<AssignedSubject[] | null>(null);
  const [groups, setGroups] = useState<AssignedGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId === null) return;
    setError(null);
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    getMySubjects(userId).then(setSubjects, fail);
    getMyGroups(userId).then(setGroups, fail);
  }, [userId]);

  return (
    <>
      <CrumbBar crumbs={[{ label: t('subjects.title') }]} />

      <div className="mx-auto w-full max-w-[1100px] px-8 pt-7 pb-12">
        <PageHeader title={t('subjects.title')} subtitle={t('subjects.subtitle')} />

        {error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : !subjects || !groups ? (
          <LoadingState />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <Panel
              title={t('subjects.subjects', { count: subjects.length })}
              empty={t('subjects.noSubjects')}
              items={subjects.map((s) => ({
                id: s.id,
                name: s.name,
                onClick: () => navigate('/savollar'),
              }))}
            />
            <Panel
              title={t('subjects.groups', { count: groups.length })}
              empty={t('subjects.noGroups')}
              items={groups.map((g) => ({
                id: g.id,
                name: g.name,
                onClick: () => navigate('/kurslar'),
              }))}
            />
          </div>
        )}
      </div>
    </>
  );
}

function Panel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: number; name: string; onClick: () => void }[];
}) {
  return (
    <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
      <h3 className="mt-0 mb-3 text-14 font-bold text-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="m-0 text-13-5 text-ink-subtle">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="cursor-pointer rounded-10 border border-line bg-surface px-3.5 py-2.5 text-left text-13-5 font-semibold text-ink hover:border-brand hover:bg-brand-soft"
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

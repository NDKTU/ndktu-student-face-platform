import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGroupStudents } from '@/shared/api/tuzilma';
import type { Student } from '@/entities/university/model/types';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { useSessionStore } from '@/features/auth/model/session.store';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';

/**
 * Группа студента: её состав и его собственная учебная карточка.
 *
 * Всё берётся из `/user/me` и состава группы — никаких оценок и посещаемости
 * здесь нет: успеваемость студент видит в своих курсах и тестах.
 */
export function MyGroupPage() {
  const { t } = useTranslation('mening');
  const student = useSessionStore((s) => s.user?.student ?? null);
  const groupId = student?.group?.id ?? null;
  const { has } = usePermissions();

  // Состав группы отдаёт `/group/{id}/students`, а он требует `read:student` —
  // права на весь справочник студентов. У самого студента его нет, и обходить
  // это с клиента нельзя: список одногруппников ему покажет только тот, кому
  // такое право выдали (куратор, деканат).
  const canSeeClassmates = has('read:student');

  const [classmates, setClassmates] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupId === null || !canSeeClassmates) return;
    setError(null);
    getGroupStudents(groupId).then(setClassmates, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [groupId, canSeeClassmates]);

  const facts = student
    ? ([
        ['group', student.group?.name],
        ['faculty', student.faculty],
        ['specialty', student.specialty],
        ['level', student.level],
        ['semester', student.semester],
        ['educationForm', student.education_form],
        ['educationType', student.education_type],
        ['paymentForm', student.payment_form],
      ] as const)
    : [];

  return (
    <>
      <CrumbBar crumbs={[{ label: t('group.title') }]} />

      <div className="mx-auto w-full max-w-[1100px] px-8 pt-7 pb-12">
        <PageHeader title={t('group.title')} subtitle={student?.full_name ?? ''} />

        {!student ? (
          <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <p className="m-0 text-13-5 text-ink-subtle">{t('group.notStudent')}</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
              <h3 className="mt-0 mb-3 text-14 font-bold text-ink">{t('group.card')}</h3>
              <dl className="m-0 flex flex-col gap-2.5">
                {facts.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-11-5 text-ink-subtle">{t(`group.field.${key}`)}</dt>
                    <dd className="m-0 text-13-5 font-semibold text-ink">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-16 border border-line bg-surface p-5 shadow-card">
              <h3 className="mt-0 mb-3 text-14 font-bold text-ink">
                {t('group.classmates', { count: classmates?.length ?? 0 })}
              </h3>

              {groupId === null ? (
                <p className="m-0 text-13-5 text-ink-subtle">{t('group.noGroup')}</p>
              ) : !canSeeClassmates ? (
                <p className="m-0 text-13-5 text-ink-subtle">{t('group.classmatesDenied')}</p>
              ) : error ? (
                <ErrorState message={error} onRetry={() => window.location.reload()} />
              ) : !classmates ? (
                <LoadingState />
              ) : classmates.length === 0 ? (
                <p className="m-0 text-13-5 text-ink-subtle">{t('group.empty')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {classmates.map((mate) => (
                    <div
                      key={mate.id}
                      className="flex items-center gap-3 rounded-10 border border-line px-3.5 py-2.5"
                    >
                      <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-soft text-11-5 font-bold text-brand">
                        {mate.initials}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-13-5 font-semibold text-ink">
                        {mate.fish}
                      </span>
                      <span className="flex-none font-mono text-12 text-ink-subtle">{mate.sid}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

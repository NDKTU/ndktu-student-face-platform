import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RejaRow } from '@/entities/university/model/types';
import { useSessionStore } from '@/features/auth/model/session.store';
import { getReja, getGroupStudents } from '@/shared/api/tuzilma';
import { api } from '@/shared/api/http';
import { CrumbBar } from '@/widgets/layout/CrumbBar';

interface ApiGroup {
  id: number;
  name: string;
  kurs: number | null;
  speciality_id: number | null;
}

export function StudentHome() {
  const { t } = useTranslation('home');
  const { t: tn } = useTranslation('nav');
  const navigate = useNavigate();

  const user = useSessionStore((s) => s.user);
  const student = user?.student ?? null;
  const groupId = student?.group?.id ?? null;

  const [group, setGroup] = useState<ApiGroup | null>(null);
  const [groupSize, setGroupSize] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<RejaRow[]>([]);

  useEffect(() => {
    if (groupId === null) return;
    let alive = true;

    void (async () => {
      try {
        const info = await api.get<ApiGroup>(`/group/${groupId}`);
        if (!alive) return;
        setGroup(info);

        // Состав группы и учебный план — независимые запросы; ошибку каждого
        // гасим отдельно, чтобы одна не уносила всю страницу.
        void getGroupStudents(groupId)
          .then((list) => alive && setGroupSize(list.length))
          .catch(() => undefined);

        if (info.speciality_id !== null) {
          const plan = await getReja(info.speciality_id);
          if (!alive) return;
          // Семестр берём из анкеты студента; если её нет — показываем план
          // целиком, это честнее пустого списка.
          const semester = Number.parseInt(student?.semester ?? '', 10);
          const current = Number.isNaN(semester)
            ? plan
            : plan.filter((row) => row.semestr === semester);
          setSubjects(current.length > 0 ? current : plan);
        }
      } catch {
        // Страница остаётся с тем, что успело загрузиться.
      }
    })();

    return () => {
      alive = false;
    };
  }, [groupId, student?.semester]);

  const firstName = student?.first_name ?? '';
  const kurs = Number.parseInt(student?.level ?? '', 10);

  return (
    <>
      <CrumbBar crumbs={[{ label: tn('bosh') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="rounded-20 bg-[linear-gradient(135deg,#2836C7_0%,#4655D8_100%)] px-7 py-6 text-white">
          <div className="text-20 font-extrabold tracking-[-0.02em]">
            {t('student.welcome', { name: firstName })}
          </div>
          <div className="mt-1 text-13 font-semibold opacity-85">
            {t('student.group', {
              spec: student?.specialty ?? '',
              name: student?.group?.name ?? '',
              kurs: Number.isNaN(kurs) ? '' : kurs,
            })}
          </div>

          {/* Плитки посещаемости и кредитов убраны: считать их не из чего —
              журнал посещаемости и зачёт кредитов на бэкенде пока не сводятся.
              GPA приходит из анкеты HEMIS, поэтому он остался. */}
          {student?.avg_gpa !== null && student?.avg_gpa !== undefined && (
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-14 bg-white/15 px-4 py-3">
                <div className="text-20 font-extrabold">{student.avg_gpa}</div>
                <div className="text-11-5 font-medium opacity-85">{t('student.stat.gpa')}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid items-start gap-[18px] lg:[grid-template-columns:1fr_1.6fr]">
          <div className="rounded-16 border border-line bg-surface p-6 shadow-card">
            <h3 className="mt-0 mb-4 text-16 font-bold text-ink">{t('student.myGroup')}</h3>
            <div className="text-20 font-extrabold text-ink">{student?.group?.name ?? '—'}</div>
            <dl className="mt-4 flex flex-col gap-3">
              {[
                [t('student.groupField.faculty'), student?.faculty ?? '—'],
                [t('student.groupField.kurs'), group?.kurs ? `${group.kurs}` : '—'],
                [
                  t('student.groupField.students'),
                  groupSize === null
                    ? '—'
                    : t('student.groupField.studentsValue', { count: groupSize }),
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
                onClick={() => navigate('/kurslar')}
                className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-brand hover:underline"
              >
                {t('student.all')}
              </button>
            </div>

            {subjects.length === 0 ? (
              <p className="m-0 text-13-5 text-ink-subtle">{t('student.subjectsEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Полосы «освоено на N%» здесь были, но считать их пока не из
                    чего: прогресса по курсу бэкенд не хранит. Показываем то,
                    что в плане действительно есть. */}
                {subjects.map((row) => (
                  <div
                    key={`${row.fan}-${row.semestr}`}
                    className="flex items-baseline justify-between gap-3 border-b border-surface-muted pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-13-5 font-semibold text-ink">{row.fan}</span>
                    <span className="flex-none text-12 font-medium text-ink-subtle">
                      {t('student.credit', { count: row.kredit })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

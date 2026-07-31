import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFanlar } from '@/shared/api/fanlar';
import { getMyGroups, getMySubjects, type AssignedGroup, type AssignedSubject } from '@/shared/api/mening';
import { getQuestions } from '@/shared/api/savollar';
import { getEmployees } from '@/shared/api/xodimlar';
import type { Employee } from '@/entities/employee/model/types';
import { useSessionStore } from '@/features/auth/model/session.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

interface TeacherItem {
  id: number;
  name: string;
}

interface CreateTestViewProps {
  onCancel: () => void;
  onSuccess: (data: {
    title: string;
    subjectId: number | null;
    groupId: number | null;
    teacherId: number | null;
    savollar: number;
    davomiylik: number;
  }) => Promise<void>;
}

export function CreateTestView({ onCancel, onSuccess }: CreateTestViewProps) {
  const { t } = useTranslation('testlar');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const user = useSessionStore((s) => s.user);
  const { isAdmin } = usePermissions();
  const userId = user?.id ?? null;

  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<AssignedSubject[]>([]);
  const [groups, setGroups] = useState<AssignedGroup[]>([]);

  const [teacherId, setTeacherId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [oquvYili, setOquvYili] = useState<string>('2025/2026');
  const [semestr, setSemestr] = useState<string>('1');
  const [davomiylik, setDavomiylik] = useState<string>('30');
  const [savollar, setSavollar] = useState<string>('20');
  const [bankCount, setBankCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initial data loading
  useEffect(() => {
    let alive = true;

    // Load Teachers (for admin dropdown)
    void getEmployees()
      .then((res: Employee[]) => {
        if (!alive) return;
        const list = res.map((x: Employee) => ({ id: x.id, name: x.fish }));
        setTeachers(list);
        if (list.length > 0 && !teacherId) {
          setTeacherId(String(userId ?? list[0]?.id));
        }
      })
      .catch(() => undefined);

    // Load Subjects
    const subjectSource = isAdmin
      ? getFanlar().then((fans) => fans.map((f) => ({ id: f.id, name: f.fan })))
      : userId !== null
        ? getMySubjects(userId)
        : Promise.resolve([]);

    void subjectSource.then((items) => {
      if (!alive) return;
      setSubjects(items);
      if (items.length > 0 && !subjectId) {
        setSubjectId(String(items[0]?.id));
      }
    });

    // Load Groups
    if (userId !== null) {
      void getMyGroups(userId).then((items) => {
        if (!alive) return;
        setGroups(items);
        if (items.length > 0 && !groupId) {
          setGroupId(String(items[0]?.id));
        }
      });
    }

    return () => {
      alive = false;
    };
  }, [userId, isAdmin]);

  // Update bank question count when selected subject changes
  useEffect(() => {
    if (!subjectId) {
      setBankCount(null);
      return;
    }
    let alive = true;
    void getQuestions(Number(subjectId))
      .then((qs) => {
        if (alive) setBankCount(qs.length);
      })
      .catch(() => {
        if (alive) setBankCount(0);
      });
    return () => {
      alive = false;
    };
  }, [subjectId]);

  // Selected subject object
  const selectedSubject = subjects.find((s) => String(s.id) === subjectId);
  const subjectName = selectedSubject?.name ?? 'Oliy matematika';
  const previewTitle = `${subjectName} — ${oquvYili} — ${semestr}-semestr`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const count = parseInt(savollar, 10);
    if (Number.isNaN(count) || count < 1) {
      toast(t('create.invalidCount') ?? "Savollar sonini to'g'ri kiriting");
      return;
    }

    const dur = parseInt(davomiylik, 10);
    if (Number.isNaN(dur) || dur < 1) {
      toast("Davomiylikni to'g'ri kiriting");
      return;
    }

    setSubmitting(true);
    try {
      await onSuccess({
        title: previewTitle,
        subjectId: subjectId ? Number(subjectId) : null,
        groupId: groupId ? Number(groupId) : null,
        teacherId: teacherId ? Number(teacherId) : userId,
        savollar: count,
        davomiylik: dur,
      });
    } catch (err) {
      toast(`${tc('saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <CrumbBar
        crumbs={[
          { label: tn('testlar'), onClick: onCancel },
          { label: 'Test yaratish' },
        ]}
      />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title="Test yaratish" subtitle="Bank asosida avtomatik test tuzish" />

        <div className="mt-6 grid grid-cols-1 gap-6 items-start lg:grid-cols-3">
          {/* Chap ustun: Forma */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="lg:col-span-2 rounded-18 border border-line bg-surface p-6 shadow-card"
          >
            <div className="flex flex-col gap-4">
              {/* O'qituvchi */}
              <div>
                <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                  O'qituvchi
                </label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className={modalInputClass}
                >
                  {teachers.length === 0 ? (
                    <option value={userId ?? ''}>
                      {user?.employee?.full_name ?? user?.username ?? 'Bozorov D.'}
                    </option>
                  ) : (
                    teachers.map((tcItem) => (
                      <option key={tcItem.id} value={tcItem.id}>
                        {tcItem.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Fan */}
              <div>
                <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                  Fan
                </label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className={modalInputClass}
                >
                  {subjects.length === 0 && <option value="">Oliy matematika</option>}
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Guruh + O'quv yili */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                    Guruh
                  </label>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className={modalInputClass}
                  >
                    {groups.length === 0 && <option value="">KI-24-03</option>}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                    O'quv yili
                  </label>
                  <select
                    value={oquvYili}
                    onChange={(e) => setOquvYili(e.target.value)}
                    className={modalInputClass}
                  >
                    <option value="2025/2026">2025/2026</option>
                    <option value="2024/2025">2024/2025</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>
              </div>

              {/* Semestr + Davomiylik */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                    Semestr
                  </label>
                  <select
                    value={semestr}
                    onChange={(e) => setSemestr(e.target.value)}
                    className={modalInputClass}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                    Davomiylik (daqiqa)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={davomiylik}
                    onChange={(e) => setDavomiylik(e.target.value)}
                    className={modalInputClass}
                  />
                </div>
              </div>

              {/* Savollar soni */}
              <div>
                <label className="mb-1.5 block text-12 font-medium text-ink-subtle">
                  Savollar soni
                </label>
                <input
                  type="number"
                  min="1"
                  value={savollar}
                  onChange={(e) => setSavollar(e.target.value)}
                  className={modalInputClass}
                />
                <div className="mt-1.5 text-12 font-medium text-ink-subtle">
                  Bankda {bankCount ?? 29} ta savol mavjud
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className="mt-4 w-full cursor-pointer rounded-12 border-none bg-brand py-3.5 text-15 font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {submitting ? 'Yaratilmoqda...' : 'Test yaratish'}
              </button>
            </div>
          </form>

          {/* O'ng ustun: Jonli Ko'rinish */}
          <div className="lg:col-span-1 rounded-18 border border-line bg-surface p-6 shadow-card">
            <div className="mb-4 text-11 font-extrabold tracking-wider uppercase text-ink-subtle">
              KO'RINISHI
            </div>

            <div className="rounded-16 border border-line bg-surface-alt p-5">
              <div className="mb-1.5 text-12 font-medium text-ink-subtle">Test nomi</div>
              <div className="mb-4 text-16 font-extrabold leading-snug text-ink">
                {previewTitle}
              </div>

              <div className="flex items-center gap-2 border-t border-line-soft pt-3.5 text-12 text-ink-subtle">
                <svg
                  className="size-4 flex-none text-ink-subtle"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                <span>Savollar bankdan tasodifiy tanlanadi</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

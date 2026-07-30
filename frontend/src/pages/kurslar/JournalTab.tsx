import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useJurnalStore } from '@/features/jurnal/model/jurnal.store';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { AdminCourse } from '@/entities/course/model/types';
import type { Attendance, JournalLessonPayload, LessonType } from '@/shared/api/jurnal';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Modal, ModalField, modalInputClass } from '@/shared/ui/Modal';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';

const ATTENDANCE: Attendance[] = ['present', 'late', 'absent'];
const LESSON_TYPES: LessonType[] = ['lecture', 'seminar', 'lab', 'independent'];

/** Оценка за занятие — та же шкала 0..5, что принимает бэкенд. */
const GRADES = [0, 1, 2, 3, 4, 5];

const ATTENDANCE_TONE: Record<Attendance, string> = {
  present: 'bg-success-soft text-success',
  late: 'bg-warning-soft text-warning',
  absent: 'bg-danger-soft text-danger',
};

/**
 * Журнал занятий курса: посещаемость и оценка по каждому занятию.
 *
 * Отдельная вкладка, а не часть содержимого курса: видеоматериалы одинаковы для
 * всех его групп, а журнал ведётся по конкретной группе и дате.
 */
export function JournalTab({ meta }: { meta: AdminCourse }) {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { has } = usePermissions();

  // Студент видит журнал только на чтение: расписание ведёт преподаватель.
  const canAdd = has('create:lesson');
  const canDelete = has('delete:lesson');
  const canMark = has('update:lesson_result');

  const lessons = useJurnalStore((s) => s.lessons);
  const rows = useJurnalStore((s) => s.rows);
  const openLessonId = useJurnalStore((s) => s.openLessonId);
  const status = useJurnalStore((s) => s.status);
  const error = useJurnalStore((s) => s.error);
  const dirty = useJurnalStore((s) => s.dirty);

  const loadLessons = useJurnalStore((s) => s.loadLessons);
  const openLesson = useJurnalStore((s) => s.openLesson);
  const closeLesson = useJurnalStore((s) => s.closeLesson);
  const setAttendance = useJurnalStore((s) => s.setAttendance);
  const setGrade = useJurnalStore((s) => s.setGrade);
  const setNotes = useJurnalStore((s) => s.setNotes);
  const save = useJurnalStore((s) => s.save);
  const addLesson = useJurnalStore((s) => s.addLesson);
  const removeLesson = useJurnalStore((s) => s.removeLesson);

  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLessons(meta.id);
    // Уходя со вкладки, закрываем журнал: иначе на другом курсе он открылся бы
    // с чужими строками.
    return closeLesson;
  }, [meta.id, loadLessons, closeLesson]);

  async function handleSave() {
    setBusy(true);
    try {
      await save();
      toast(t('journal.saved'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'idle' || status === 'loading') return <LoadingState />;
  if (status === 'error') {
    return <ErrorState message={error} onRetry={() => void loadLessons(meta.id)} />;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-13-5 text-ink-subtle">{t('journal.count', { count: lessons.length })}</p>
        {canAdd && (
          <Button className="h-[38px] rounded-11 px-4" onClick={() => setCreating(true)}>
            + {t('journal.addLesson')}
          </Button>
        )}
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <h3 className="m-0 text-16 font-bold text-ink">{t('journal.emptyTitle')}</h3>
          <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('journal.emptyText')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lessons.map((lesson) => {
            const isOpen = lesson.id === openLessonId;
            return (
              <div key={lesson.id} className="rounded-14 border border-line bg-surface shadow-card">
                <div className="flex items-center gap-2 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => (isOpen ? closeLesson() : void openLesson(lesson.id))}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-11 border-none bg-transparent px-3 py-2.5 text-left hover:bg-surface-muted"
                  >
                    <span className="min-w-[84px] flex-none text-13 font-bold text-ink-secondary">
                      {lesson.date}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-14 font-semibold text-ink">
                        {lesson.topic}
                      </span>
                      <span className="block truncate text-12 text-ink-subtle">
                        {[lesson.groupName, lesson.type ? t(`journal.type.${lesson.type}`) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="flex-none text-12-5 font-bold text-brand">
                      {isOpen ? t('journal.hide') : t('journal.open')}
                    </span>
                  </button>
                  {canDelete && (
                    <Button
                      variant="secondary"
                      className="h-[34px] flex-none rounded-10 px-3 text-danger"
                      onClick={() => setConfirmId(lesson.id)}
                    >
                      {tc('delete')}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-line px-5 py-4">
                    {lesson.description && (
                      <p className="mt-0 mb-3 text-12-5 text-ink-subtle">{lesson.description}</p>
                    )}

                    {rows.length === 0 ? (
                      <p className="m-0 text-13-5 text-ink-subtle">{t('journal.noStudents')}</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-left">
                            <thead>
                              <tr className="border-b border-line">
                                <Th>{t('journal.column.student')}</Th>
                                <Th className="w-[230px]">{t('journal.column.attendance')}</Th>
                                <Th className="w-[86px]">{t('journal.column.grade')}</Th>
                                <Th>{t('journal.column.notes')}</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={row.userId} className="border-b border-line last:border-b-0">
                                  <td className="py-2.5 pr-3 text-13-5 font-semibold text-ink">
                                    {row.fish}
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <div className="flex gap-1.5">
                                      {ATTENDANCE.map((value) => (
                                        <button
                                          key={value}
                                          type="button"
                                          disabled={!canMark}
                                          onClick={() => setAttendance(row.userId, value)}
                                          className={`rounded-8 border-none px-2.5 py-1 text-11-5 font-bold ${
                                            canMark ? 'cursor-pointer' : 'cursor-default'
                                          } ${
                                            row.attendance === value
                                              ? ATTENDANCE_TONE[value]
                                              : 'bg-surface-muted text-ink-subtle'
                                          }`}
                                        >
                                          {t(`journal.attendance.${value}`)}
                                        </button>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-3">
                                    <select
                                      aria-label={t('journal.column.grade')}
                                      disabled={!canMark}
                                      value={row.grade ?? ''}
                                      onChange={(e) =>
                                        setGrade(
                                          row.userId,
                                          e.target.value === '' ? null : Number(e.target.value),
                                        )
                                      }
                                      className="h-[34px] w-full cursor-pointer rounded-9 border border-line bg-surface px-2 text-13 text-ink outline-none focus:border-brand"
                                    >
                                      <option value="">—</option>
                                      {GRADES.map((grade) => (
                                        <option key={grade} value={grade}>
                                          {grade}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2.5">
                                    <input
                                      aria-label={t('journal.column.notes')}
                                      readOnly={!canMark}
                                      value={row.notes}
                                      onChange={(e) => setNotes(row.userId, e.target.value)}
                                      className="h-[34px] w-full rounded-9 border border-line bg-surface px-2.5 text-13 text-ink outline-none focus:border-brand"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Кнопка активна только при несохранённых правках: иначе
                            непонятно, ушло уже на сервер или нет. */}
                        {canMark && (
                          <div className="mt-4 flex items-center justify-end gap-3">
                            <span className="text-12 text-ink-subtle">
                              {dirty ? t('journal.unsaved') : t('journal.allSaved')}
                            </span>
                            <Button disabled={!dirty || busy} onClick={() => void handleSave()}>
                              {busy ? t('journal.saving') : tc('save')}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <NewLessonModal
          groups={meta.guruhlar}
          onCancel={() => setCreating(false)}
          onCreate={async (payload) => {
            try {
              await addLesson({ ...payload, courseId: meta.id });
              setCreating(false);
              toast(t('journal.lessonAdded'));
            } catch (e) {
              toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
        />
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title={t('journal.deleteLesson')}
          text={t('journal.confirmLesson')}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const id = confirmId;
            setConfirmId(null);
            void removeLesson(id)
              .then(() => toast(t('toast.deleted')))
              .catch((e: unknown) =>
                toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`),
              );
          }}
        />
      )}
    </>
  );
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`pb-2 text-11-5 font-bold tracking-[0.03em] text-ink-subtle uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function NewLessonModal({
  groups,
  onCreate,
  onCancel,
}: {
  groups: { id: number; name: string }[];
  onCreate: (payload: Omit<JournalLessonPayload, 'courseId'>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('kurslar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  // Группу выбираем из групп самого курса: занятие принадлежит группе, а курс
  // может читаться сразу нескольким.
  const [groupId, setGroupId] = useState(String(groups[0]?.id ?? ''));
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<LessonType>('lecture');

  function submit() {
    if (!groupId) {
      toast(t('journal.groupRequired'));
      return;
    }
    if (!topic.trim()) {
      toast(t('journal.topicRequired'));
      return;
    }
    if (!date) {
      toast(t('journal.dateRequired'));
      return;
    }
    onCreate({ groupId: Number(groupId), topic: topic.trim(), date, type });
  }

  return (
    <Modal
      title={t('journal.newLesson')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit}>{tc('save')}</Button>
        </>
      }
    >
      <ModalField label={t('journal.group')}>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className={modalInputClass}
        >
          {groups.length === 0 && <option value="">{t('journal.noGroups')}</option>}
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </ModalField>

      <ModalField label={t('journal.topic')}>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} className={modalInputClass} />
      </ModalField>

      <div className="grid grid-cols-2 gap-3.5">
        <ModalField label={t('journal.date')}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={modalInputClass}
          />
        </ModalField>
        <ModalField label={t('journal.lessonType')}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LessonType)}
            className={modalInputClass}
          >
            {LESSON_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`journal.type.${value}`)}
              </option>
            ))}
          </select>
        </ModalField>
      </div>
    </Modal>
  );
}

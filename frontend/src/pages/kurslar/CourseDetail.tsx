import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoursesStore, type LessonDraft, type TopicDraft } from '@/features/kurslar/model/courses.store';
import type { AdminCourse, Lesson, Topic } from '@/entities/course/model/types';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { shortFaculty } from '@/shared/lib/shortFaculty';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { RowMenu } from '@/shared/ui/RowMenu';
import { useToast } from '@/shared/ui/Toast';
import { TopicModal, LessonModal } from './CourseModals';
import { JournalTab } from './JournalTab';

type TopicModalState = { mode: 'add' | 'edit'; id?: number; draft: TopicDraft };
type LessonModalState = { mode: 'add' | 'edit'; topicId: number; id?: number; draft: LessonDraft };
type ConfirmState =
  | { kind: 'topic'; id: number }
  | { kind: 'lesson'; topicId: number; id: number };

const EMPTY_LESSON: LessonDraft = {
  title: '',
  videoType: 'youtube',
  videoSrc: '',
  dur: '',
  desc: '',
};

export function CourseDetail({ meta }: { meta: AdminCourse }) {
  const { t } = useTranslation('kurslar');
  const toast = useToast();
  const { has } = usePermissions();

  // Журнал занятий — отдельная вкладка, и она есть только у того, кто вообще
  // видит занятия: студенту без `read:lesson` показывать пустую таблицу незачем.
  const canSeeJournal = has('read:lesson');
  const [tab, setTab] = useState<'content' | 'journal'>('content');

  const course = useCoursesStore((s) => s.byId[meta.id]);
  const loadCourse = useCoursesStore((s) => s.loadCourse);
  const addTopic = useCoursesStore((s) => s.addTopic);
  const editTopic = useCoursesStore((s) => s.editTopic);
  const removeTopic = useCoursesStore((s) => s.removeTopic);
  const addLesson = useCoursesStore((s) => s.addLesson);
  const editLesson = useCoursesStore((s) => s.editLesson);
  const removeLesson = useCoursesStore((s) => s.removeLesson);
  const reorderTopics = useCoursesStore((s) => s.reorderTopics);
  const reorderLessons = useCoursesStore((s) => s.reorderLessons);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [topicModal, setTopicModal] = useState<TopicModalState | null>(null);
  const [lessonModal, setLessonModal] = useState<LessonModalState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [dragTopic, setDragTopic] = useState<number | null>(null);
  const [dragLesson, setDragLesson] = useState<{ topicId: number; id: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    loadCourse(meta.id).catch((e: unknown) =>
      setLoadError(e instanceof Error ? e.message : String(e)),
    );
  }, [meta.id, loadCourse]);

  // Первая тема раскрыта по умолчанию — как только курс приехал.
  const firstTopicId = course?.mavzular[0]?.id;
  useEffect(() => {
    if (firstTopicId) setOpen((o) => (firstTopicId in o ? o : { ...o, [firstTopicId]: true }));
  }, [firstTopicId]);

  function reportError(e: unknown) {
    toast(`${e instanceof Error ? e.message : String(e)}`);
  }

  async function saveTopic(draft: TopicDraft) {
    if (!topicModal) return;
    try {
      if (topicModal.mode === 'add') {
        await addTopic(meta.id, draft);
        toast(t('toast.mavzuAdded'));
      } else if (topicModal.id) {
        await editTopic(meta.id, topicModal.id, draft);
        toast(t('toast.mavzuSaved'));
      }
      setTopicModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      reportError(e);
    }
  }

  async function saveLesson(draft: LessonDraft) {
    if (!lessonModal) return;
    try {
      if (lessonModal.mode === 'add') {
        await addLesson(meta.id, lessonModal.topicId, draft);
        toast(t('toast.darsAdded'));
      } else if (lessonModal.id) {
        await editLesson(meta.id, lessonModal.topicId, lessonModal.id, draft);
        toast(t('toast.darsSaved'));
      }
      setLessonModal(null);
    } catch (e) {
      reportError(e);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      if (confirm.kind === 'topic') await removeTopic(meta.id, confirm.id);
      else await removeLesson(meta.id, confirm.topicId, confirm.id);
      toast(t('toast.deleted'));
    } catch (e) {
      reportError(e);
    }
    setConfirm(null);
  }

  if (!course) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        {loadError ? (
          <ErrorState message={loadError} onRetry={() => void loadCourse(meta.id)} />
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
      <div className="mb-5 flex flex-wrap items-start gap-4 rounded-18 border border-line bg-surface p-6 shadow-card">
        <span className="grid size-[52px] flex-none place-items-center rounded-14 bg-brand-soft text-brand">
          <BookIcon />
        </span>
        <div className="min-w-[220px] flex-1">
          <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
            {meta.guruh} · {meta.fan}
          </h1>
          <div className="mt-1.5 text-13-5 text-ink-subtle">
            {t('detail.metaLine', {
              oqituvchi: meta.oqituvchi,
              fac: shortFaculty(meta.fac),
              sem: meta.sem,
              lessons: course.total,
            })}
          </div>
        </div>
        {tab === 'content' && (
          <Button
            className="h-[38px] rounded-11 px-4"
            onClick={() =>
              setTopicModal({
                mode: 'add',
                draft: { name: '', order: String(course.mavzular.length + 1) },
              })
            }
          >
            + {t('detail.addMavzu')}
          </Button>
        )}
      </div>

      {canSeeJournal && (
        <div className="mb-5 flex gap-1 rounded-12 border border-line bg-surface p-1 shadow-card">
          {(['content', 'journal'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-[34px] cursor-pointer rounded-9 border-none px-4 text-13 font-bold ${
                tab === key ? 'bg-brand text-white' : 'bg-transparent text-ink-secondary'
              }`}
            >
              {t(`tab.${key}`)}
            </button>
          ))}
        </div>
      )}

      {tab === 'journal' && canSeeJournal ? (
        <JournalTab meta={meta} />
      ) : course.mavzular.length === 0 ? (
        <div className="rounded-18 border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <div className="mx-auto mb-3.5 grid size-[54px] place-items-center rounded-15 bg-brand-soft text-brand">
            <BookIcon />
          </div>
          <h3 className="m-0 text-16 font-bold text-ink">{t('detail.emptyMavzuTitle')}</h3>
          <p className="mx-auto mt-2 text-13-5 text-ink-subtle">{t('detail.emptyMavzuText')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {course.mavzular.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              open={!!open[topic.id]}
              onToggleOpen={() => setOpen((o) => ({ ...o, [topic.id]: !o[topic.id] }))}
              onEdit={() =>
                setTopicModal({
                  mode: 'edit',
                  id: topic.id,
                  draft: { name: topic.title, order: String(topic.no) },
                })
              }
              onDelete={() => setConfirm({ kind: 'topic', id: topic.id })}
              onAddLesson={() =>
                setLessonModal({ mode: 'add', topicId: topic.id, draft: EMPTY_LESSON })
              }
              onEditLesson={(lesson) =>
                setLessonModal({
                  mode: 'edit',
                  topicId: topic.id,
                  id: lesson.id,
                  draft: {
                    title: lesson.title,
                    videoType: lesson.videoType,
                    videoSrc: lesson.videoSrc,
                    dur: lesson.dur.replace(' daq', ''),
                    desc: lesson.desc,
                  },
                })
              }
              onDeleteLesson={(lessonId) =>
                setConfirm({ kind: 'lesson', topicId: topic.id, id: lessonId })
              }
              draggingTopic={dragTopic}
              onTopicDragStart={() => setDragTopic(topic.id)}
              onTopicDrop={() => {
                if (dragTopic) reorderTopics(meta.id, dragTopic, topic.id).catch(reportError);
                setDragTopic(null);
              }}
              dragLesson={dragLesson}
              onLessonDragStart={(id) => setDragLesson({ topicId: topic.id, id })}
              onLessonDrop={(id) => {
                if (dragLesson?.topicId === topic.id)
                  reorderLessons(meta.id, topic.id, dragLesson.id, id).catch(reportError);
                setDragLesson(null);
              }}
            />
          ))}
        </div>
      )}

      {topicModal && (
        <TopicModal
          mode={topicModal.mode}
          initial={topicModal.draft}
          onSave={(d) => void saveTopic(d)}
          onCancel={() => setTopicModal(null)}
        />
      )}
      {lessonModal && (
        <LessonModal
          mode={lessonModal.mode}
          initial={lessonModal.draft}
          onSave={(d) => void saveLesson(d)}
          onCancel={() => setLessonModal(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t('toast.deleted')}
          text={confirm.kind === 'topic' ? t('confirmMavzu') : t('confirmDars')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

interface TopicCardProps {
  topic: Topic;
  open: boolean;
  onToggleOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddLesson: () => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: number) => void;
  draggingTopic: number | null;
  onTopicDragStart: () => void;
  onTopicDrop: () => void;
  dragLesson: { topicId: number; id: number } | null;
  onLessonDragStart: (id: number) => void;
  onLessonDrop: (id: number) => void;
}

function TopicCard({
  topic,
  open,
  onToggleOpen,
  onEdit,
  onDelete,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onTopicDragStart,
  onTopicDrop,
  onLessonDragStart,
  onLessonDrop,
}: TopicCardProps) {
  const { t } = useTranslation('kurslar');

  return (
    <div
      draggable
      onDragStart={onTopicDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onTopicDrop}
      className="overflow-hidden rounded-14 border border-line bg-surface shadow-card"
      style={{ background: open ? '#FBFBFE' : '#fff' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid size-[34px] flex-none cursor-grab place-items-center rounded-10 bg-brand-soft text-13 font-extrabold text-brand">
          {topic.no}
        </span>
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
        >
          <span className="text-14-5 font-bold text-ink">{topic.title}</span>
          <span className="text-12 font-medium text-ink-subtle">
            {t('detail.lessons', { count: topic.darslar.length })}
          </span>
        </button>
        <RowMenu
          items={[
            { label: t('darsModal.edit'), onClick: onEdit },
            { label: t('toast.deleted'), danger: true, onClick: onDelete },
          ]}
        />
      </div>

      {open && (
        <div className="border-t border-surface-sunken px-4 py-3">
          {topic.darslar.length === 0 ? (
            <div className="py-4 text-center text-13 text-ink-subtle">{t('detail.emptyDars')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {topic.darslar.map((lesson) => (
                <div
                  key={lesson.id}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    onLessonDragStart(lesson.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    onLessonDrop(lesson.id);
                  }}
                  className="flex items-center gap-3 rounded-11 border border-surface-sunken bg-surface px-3 py-2.5"
                >
                  <span className="grid size-7 flex-none cursor-grab place-items-center rounded-8 bg-canvas text-12 font-bold text-ink-subtle">
                    {lesson.no}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-13-5 font-semibold text-ink">
                    {lesson.title}
                  </span>
                  <span
                    className="flex-none rounded-20 px-2.5 py-1 text-11 font-bold"
                    style={{
                      background: lesson.videoType === 'youtube' ? '#FDECEC' : '#EDEFFC',
                      color: lesson.videoType === 'youtube' ? '#C4363B' : '#2836C7',
                    }}
                  >
                    {t(`video.${lesson.videoType}`)}
                  </span>
                  <span className="flex-none text-12 text-ink-subtle">{lesson.dur}</span>
                  <RowMenu
                    items={[
                      { label: t('darsModal.edit'), onClick: () => onEditLesson(lesson) },
                      { label: t('toast.deleted'), danger: true, onClick: () => onDeleteLesson(lesson.id) },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onAddLesson}
            className="mt-3 flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-13 font-bold text-brand hover:underline"
          >
            + {t('detail.addDars')}
          </button>
        </div>
      )}
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5V18a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-2.9 0H5a1 1 0 0 1-1-1z" />
      <path d="M12 6v13" />
    </svg>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import {
  useStructureStore,
  type EntityDraft,
} from '@/features/tuzilma/model/structure.store';
import { useStructure } from '@/features/tuzilma/lib/useStructure';
import {
  countFacultySpecialities,
  countFacultyStudents,
  countSpecialityStudents,
} from '@/entities/university/mock/build';
import { namePrefix } from '@/entities/university/mock/rng';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Button } from '@/shared/ui/Button';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';
import { EntityCard, type EntityCardProps } from './EntityCard';
import { EntityGrid } from './EntityGrid';
import { EntityModal } from './EntityModal';
import { GroupDetail } from './GroupDetail';
import { StudentDetail } from './StudentDetail';

const LEVEL_KEYS = ['faculty', 'department', 'speciality', 'group'] as const;

/** Цвета чипа формы обучения — берутся из токенов, а не задаются заново. */
const FORM_CHIP = {
  Kunduzgi: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
  Sirtqi: { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' },
} as const;

type ModalState = { mode: 'add' | 'edit'; level: number; id?: number; draft: EntityDraft };

export function TuzilmaPage() {
  const { t } = useTranslation('tuzilma');
  const { t: tc } = useTranslation('common');
  // Структуру правит тот, кому разрешено заводить факультеты: остальные
  // ветки дерева требуют тех же прав, отдельной проверки на каждую не нужно.
  const { has } = usePermissions();
  const canWrite = has('create:faculty');
  const toast = useToast();
  const { status, error, reload } = useStructure();

  const faculties = useStructureStore((s) => s.faculties);
  const drill = useStructureStore((s) => s.drill);
  const selectedStudentId = useStructureStore((s) => s.selectedStudentId);
  const drillInto = useStructureStore((s) => s.drillInto);
  const popTo = useStructureStore((s) => s.popTo);
  const selectStudent = useStructureStore((s) => s.selectStudent);
  const addEntity = useStructureStore((s) => s.addEntity);
  const updateEntity = useStructureStore((s) => s.updateEntity);
  const removeEntity = useStructureStore((s) => s.removeEntity);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirm, setConfirm] = useState<{ level: number; id: number; name: string } | null>(null);

  // Текущая позиция в дереве восстанавливается из пути drill каждый рендер:
  // хранить сами объекты в состоянии нельзя — после мутации они устареют.
  const faculty = faculties.find((f) => f.id === drill[0]?.id) ?? null;
  const department = faculty?.kafedralar.find((k) => k.id === drill[1]?.id) ?? null;
  const speciality = department?.mutaxassisliklar.find((s) => s.id === drill[2]?.id) ?? null;
  const group = speciality?.guruhlar.find((g) => g.id === drill[3]?.id) ?? null;
  const student = group?.students?.find((s) => s.id === selectedStudentId) ?? null;

  const level = drill.length;

  // Состав группы дерево не несёт — забираем его, как только в группу зашли.
  const loadGroupStudents = useStructureStore((s) => s.loadGroupStudents);
  const groupId = group?.id ?? null;
  useEffect(() => {
    if (groupId !== null) void loadGroupStudents(groupId);
  }, [groupId, loadGroupStudents]);

  const crumbs = useMemo(() => {
    const items = [{ label: t('title'), onClick: level > 0 ? () => popTo(0) : undefined }];
    drill.forEach((step, i) => {
      items.push({ label: step.name, onClick: () => popTo(i + 1) });
    });
    if (student) items.push({ label: student.fish, onClick: undefined });
    return items;
  }, [drill, level, popTo, student, t]);

  async function handleSave(draft: EntityDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await addEntity(modal.level, draft);
        toast(tc('created'));
      } else if (modal.id) {
        await updateEntity(modal.level, modal.id, draft);
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      // Форму не закрываем: введённое не должно пропасть из-за сбоя сети.
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      await removeEntity(confirm.level, confirm.id);
      toast(tc('deleted'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
    setConfirm(null);
  }

  // Сетка сущностей — это любой уровень, кроме детали группы/студента.
  // Кнопка «Qo'shish» живёт в crumb-баре (как в эталоне), а не в шапке страницы.
  const onGrid = !(group && speciality && faculty);

  return (
    <>
      <CrumbBar
        crumbs={crumbs}
        actions={
          onGrid && canWrite ? (
            <Button onClick={() => setModal({ mode: 'add', level, draft: {} })}>
              + {tc('add')}
            </Button>
          ) : undefined
        }
      />

      {status === 'loading' || status === 'idle' ? (
        <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
          <LoadingState />
        </div>
      ) : status === 'error' ? (
        <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
          <ErrorState message={error} onRetry={() => void reload()} />
        </div>
      ) : student && group && speciality && faculty ? (
        <StudentDetail
          student={student}
          group={group}
          speciality={speciality}
          faculty={faculty}
        />
      ) : group && speciality && faculty ? (
        <GroupDetail
          group={group}
          speciality={speciality}
          faculty={faculty}
          onOpenStudent={selectStudent}
        />
      ) : (
        <GridLevel
          level={level}
          canWrite={canWrite}
          cards={buildCards()}
          onAdd={() => setModal({ mode: 'add', level, draft: {} })}
        />
      )}

      {modal && (
        <EntityModal
          level={modal.level}
          mode={modal.mode}
          initial={modal.draft}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('confirmDelete.title')}
          text={t('confirmDelete.text', { name: confirm.name })}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );

  /** Карточки текущего уровня. Форма карточки у каждого уровня своя. */
  function buildCards(): EntityCardProps[] {
    const openEdit = (lvl: number, id: number, draft: EntityDraft) =>
      setModal({ mode: 'edit', level: lvl, id, draft });
    const openDelete = (lvl: number, id: number, name: string) =>
      setConfirm({ level: lvl, id, name });

    if (level === 0) {
      return faculties.map((f) => ({
        title: f.name,
        badgeText: namePrefix(f.name),
        badgeBg: f.color.bg,
        badgeFg: f.color.fg,
        lead: { label: t('field.dekan'), name: f.dekan, initials: namePrefix(f.dekan) },
        stats: [
          { value: f.kafedralar.length, label: t('stat.kafedra') },
          { value: countFacultySpecialities(f), label: t('stat.mutaxassislik') },
          { value: countFacultyStudents(f), label: t('stat.talaba') },
        ],
        canWrite,
        onOpen: () => drillInto({ id: f.id, name: f.name }),
        onEdit: () => openEdit(0, f.id, { name: f.name, dekan: f.dekan }),
        onDelete: () => openDelete(0, f.id, f.name),
      }));
    }

    if (level === 1 && faculty) {
      return faculty.kafedralar.map((k) => ({
        title: k.name,
        badgeText: namePrefix(k.name),
        badgeBg: faculty.color.bg,
        badgeFg: faculty.color.fg,
        lead: { label: t('field.mudir'), name: k.mudir, initials: namePrefix(k.mudir) },
        stats: [
          { value: k.mutaxassisliklar.length, label: t('stat.mutaxassislik') },
          { value: k.oqituvchilar, label: t('stat.oqituvchi') },
          {
            value: k.mutaxassisliklar.reduce((a, s) => a + countSpecialityStudents(s), 0),
            label: t('stat.talaba'),
          },
        ],
        canWrite,
        onOpen: () => drillInto({ id: k.id, name: k.name }),
        onEdit: () => openEdit(1, k.id, { name: k.name, mudir: k.mudir }),
        onDelete: () => openDelete(1, k.id, k.name),
      }));
    }

    if (level === 2 && department && faculty) {
      return department.mutaxassisliklar.map((s) => ({
        title: s.name,
        subtitle: s.kod,
        badgeText: namePrefix(s.name),
        badgeBg: faculty.color.bg,
        badgeFg: faculty.color.fg,
        chips: [{ text: s.shakl, ...FORM_CHIP[s.shakl] }],
        stats: [
          { value: s.guruhlar.length, label: t('stat.guruh') },
          { value: countSpecialityStudents(s), label: t('stat.talaba') },
          { value: s.curriculum_count, label: t('stat.fan') },
        ],
        canWrite,
        onOpen: () => drillInto({ id: s.id, name: s.name }),
        onEdit: () => openEdit(2, s.id, { name: s.name, kod: s.kod, shakl: s.shakl }),
        onDelete: () => openDelete(2, s.id, s.name),
      }));
    }

    if (level === 3 && speciality && faculty) {
      return speciality.guruhlar.map((g) => ({
        title: g.name,
        subtitle: `${g.kurs}-kurs`,
        badgeText: g.name.split('-')[0] ?? '',
        badgeBg: faculty.color.bg,
        badgeFg: faculty.color.fg,
        lead: { label: t('group.leader'), name: g.sardor, initials: namePrefix(g.sardor) },
        stats: [{ value: g.student_count, label: t('stat.talaba') }],
        canWrite,
        onOpen: () => drillInto({ id: g.id, name: g.name }),
        onEdit: () =>
          openEdit(3, g.id, { name: g.name, kurs: String(g.kurs), sardor: g.sardor }),
        onDelete: () => openDelete(3, g.id, g.name),
      }));
    }

    return [];
  }
}

interface GridLevelProps {
  level: number;
  canWrite: boolean;
  cards: EntityCardProps[];
  onAdd: () => void;
}

function GridLevel({ level, canWrite, cards, onAdd }: GridLevelProps) {
  const { t } = useTranslation('tuzilma');
  const levelKey = LEVEL_KEYS[level] ?? 'group';

  return (
    <EntityGrid
      title={t(`level.${levelKey}.plural`)}
      subtitle={t('count', { count: cards.length, noun: t(`level.${levelKey}.noun`) })}
      isEmpty={cards.length === 0}
      emptyTitle={t(`level.${levelKey}.emptyTitle`)}
      emptyText={t(`level.${levelKey}.empty`)}
      canWrite={canWrite}
      onAdd={onAdd}
    >
      {cards.map((card) => (
        <EntityCard key={card.title + card.badgeText} {...card} />
      ))}
    </EntityGrid>
  );
}

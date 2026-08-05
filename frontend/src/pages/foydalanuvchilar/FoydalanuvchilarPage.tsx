import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useEmployeesStore,
} from '@/features/xodimlar/model/employees.store';
import { useStudentsStore } from '@/features/talabalar/model/students.store';
import type { Employee, EmployeeDraft } from '@/entities/employee/model/types';
import { getEmployeeSensitive } from '@/shared/api/xodimlar';
import { useRollar } from '@/features/rollar/lib/useRollar';
import { useBolimlar } from '@/features/bolimlar/lib/useBolimlar';
import { useRollarStore } from '@/features/rollar/model/rollar.store';
import { roleLabel } from '@/entities/access/model/roles';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { useToast } from '@/shared/ui/Toast';
import { EmployeeDetail } from '../xodimlar/EmployeeDetail';
import { EmployeeModal } from '../xodimlar/EmployeeModal';
import { StudentDetail } from './StudentDetail';
import { XodimlarTab } from './XodimlarTab';
import { TalabalarTab } from './TalabalarTab';
import { BolimlarTab } from './BolimlarTab';

const TABS = ['xodimlar', 'talabalar', 'bolimlar'] as const;
type Tab = (typeof TABS)[number];

/** Реестр пользователей: две вкладки — сотрудники и студенты. */
export function FoydalanuvchilarPage() {
  const { t } = useTranslation('talabalar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const employees = useEmployeesStore((s) => s.employees);
  const selectedId = useEmployeesStore((s) => s.selectedId);
  const select = useEmployeesStore((s) => s.select);
  const update = useEmployeesStore((s) => s.update);

  const students = useStudentsStore((s) => s.students);
  const selectedStudentId = useStudentsStore((s) => s.selectedId);
  const selectStudent = useStudentsStore((s) => s.select);

  const [tab, setTab] = useState<Tab>('xodimlar');
  const [editing, setEditing] = useState<{ id: number; draft: EmployeeDraft } | null>(null);

  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;

  /**
   * Персональные данные в форму подставляются отдельным запросом: в списке их
   * нет. Если роли их не отдают (403), форма просто открывается без них — и
   * сохранение их не затрёт, потому что пустые поля не пишутся.
   */
  async function startEditing(employee: Employee) {
    let sensitive: Partial<EmployeeDraft> = {};
    try {
      sensitive = await getEmployeeSensitive(employee.id);
    } catch {
      // 403 — ожидаемый случай для admin: секция в форме ему и так скрыта.
    }
    setEditing({ id: employee.id, draft: { ...toDraft(employee), ...sensitive } });
  }

  async function save(id: number, draft: EmployeeDraft) {
    try {
      await update(id, draft);
      toast(tc('saved'));
      setEditing(null);
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Роли для формы — из справочника БД: новую роль должно быть можно назначить
  // ещё до того, как её кто-то носит.
  useRollar();
  const { bolimlar } = useBolimlar();
  const roles = useRollarStore((s) => s.roles);
  const assignableRoles = useMemo(
    () => roles.map((r) => ({ name: r.name, label: roleLabel(r.name) })),
    [roles],
  );

  // Карточки открываются на всю страницу. Список при этом только прячется, а не
  // размонтируется, иначе возврат из карточки сбрасывал бы поиск и фильтры.
  const crumbs = selectedStudent
    ? [
        { label: t('pageTitle'), onClick: () => selectStudent(null) },
        { label: selectedStudent.fish },
      ]
    : selected
      ? [{ label: t('pageTitle'), onClick: () => select(null) }, { label: selected.fish }]
      : [{ label: t('pageTitle') }];

  return (
    <>
      <CrumbBar crumbs={crumbs} />

      {selectedStudent && <StudentDetail student={selectedStudent} />}

      {!selectedStudent && selected && (
        <EmployeeDetail employee={selected} onEdit={() => void startEditing(selected)} />
      )}

      {editing && (
        <EmployeeModal
          mode="edit"
          initial={editing.draft}
          bolimlar={bolimlar}
          roles={assignableRoles}
          onSave={(draft) => void save(editing.id, draft)}
          onCancel={() => setEditing(null)}
        />
      )}

      <div
        className={`mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12 ${
          selected || selectedStudent ? 'hidden' : ''
        }`}
      >
        <h1 className="m-0 text-28 font-extrabold tracking-[-0.025em] text-ink">{t('pageTitle')}</h1>

        <div className="mt-5 mb-6 flex gap-6 border-b border-line">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-1 pb-2.5 text-15 font-bold ${
                tab === key
                  ? 'border-b-brand text-brand'
                  : 'border-b-transparent text-ink-subtle hover:text-ink-secondary'
              }`}
            >
              {t(`tab.${key}`)}
            </button>
          ))}
        </div>

        {tab === 'xodimlar' && <XodimlarTab />}
        {tab === 'talabalar' && <TalabalarTab />}
        {tab === 'bolimlar' && <BolimlarTab />}
      </div>
    </>
  );
}

function toDraft(e: Employee): EmployeeDraft {
  return {
    fish: e.fish,
    gender: e.gender,
    birth: e.birth,
    lavozim: e.lavozim,
    departmentId: e.departmentId,
    workPhone: e.workPhone,
    workEmail: e.workEmail,
    hire: e.hire,
    login: e.login,
    roleNames: e.roleNames,
    holati: e.holati,
  };
}

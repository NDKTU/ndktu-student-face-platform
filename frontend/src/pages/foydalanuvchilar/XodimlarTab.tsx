import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unitOptions, useEmployeesStore } from '@/features/xodimlar/model/employees.store';
import { useRollar } from '@/features/rollar/lib/useRollar';
import { useRollarStore } from '@/features/rollar/model/rollar.store';
import { roleLabel } from '@/entities/access/model/roles';
import { employeeRoleOptions, matchesRole } from '@/entities/employee/lib/roles';
import { useXodimlar } from '@/features/xodimlar/lib/useXodimlar';
import type { Employee, EmployeeDraft } from '@/entities/employee/model/types';
import { PageHeader } from '@/shared/ui/PageHeader';
import { DataTable, TableCard, type Column } from '@/shared/ui/DataTable';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';
import { EmployeeModal } from '../xodimlar/EmployeeModal';
import { useBolimlar } from '@/features/bolimlar/lib/useBolimlar';
import { useLavozimlar } from '@/features/lavozimlar/lib/useLavozimlar';
import { FilterBar, filterSelectClass, SearchInput } from './FilterBar';


export function XodimlarTab() {
  const { t } = useTranslation('xodimlar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const { status, error, reload } = useXodimlar();
  const employees = useEmployeesStore((s) => s.employees);
  const select = useEmployeesStore((s) => s.select);
  const add = useEmployeesStore((s) => s.add);
  const update = useEmployeesStore((s) => s.update);

  // Подразделения — из того, что уже есть в справочнике; роли — константа.
  const units = useMemo(() => unitOptions(employees), [employees]);
  // Справочник подразделений — для формы; фильтр по-прежнему по названию,
  // потому что фильтрует уже загруженный список.
  const { bolimlar } = useBolimlar();
  const { lavozimlar } = useLavozimlar();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [unit, setUnit] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; id?: number; draft: EmployeeDraft } | null>(
    null,
  );

  const roleOptions = useMemo(() => employeeRoleOptions(employees), [employees]);

  // Роли для формы — из справочника БД, а не из уже заведённых сотрудников:
  // иначе новую роль нельзя было бы назначить, пока её никто не носит.
  useRollar();
  const roles = useRollarStore((s) => s.roles);
  const assignableRoles = useMemo(
    () => roles.map((r) => ({ name: r.name, label: roleLabel(r.name) })),
    [roles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (!matchesRole(e, role)) return false;
      if (unit && e.unit !== unit) return false;
      if (!q) return true;
      return e.fish.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
    });
  }, [employees, query, role, unit]);

  const columns: Column<Employee>[] = [
    {
      key: 'fish',
      label: t('column.fish'),
      render: (e) => (
        <div className="flex items-center gap-[11px]">
          <span
            className="grid size-[34px] flex-none place-items-center rounded-full text-12 font-bold text-white"
            style={{ background: e.color }}
          >
            {e.initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-14 font-semibold text-ink">{e.fish}</div>
            <div className="truncate text-11-5 text-ink-subtle">{e.email}</div>
          </div>
        </div>
      ),
      cellClass: '',
    },
    {
      key: 'lavozim',
      label: t('column.lavozim'),
      width: 190,
      padX: 16,
      render: (e) => e.lavozim,
      cellClass: 'text-13 text-ink-secondary',
    },
    {
      key: 'unit',
      label: t('column.unit'),
      padX: 16,
      render: (e) => e.unit,
      cellClass: 'text-13 text-ink-muted',
    },
    {
      key: 'role',
      label: t('column.role'),
      width: 180,
      padX: 16,
      // Бейдж на каждую роль: у декана их две, и вторая — не декорация, от неё
      // зависит, что человек может делать в системе.
      render: (e) => (
        <div className="flex flex-wrap gap-1">
          {e.roleLabels.map((label) => (
            <span
              key={label}
              className="rounded-6 bg-surface-sunken px-2 py-0.5 text-11-5 font-semibold text-ink-secondary"
            >
              {label}
            </span>
          ))}
        </div>
      ),
      cellClass: '',
    },
  ];

  async function handleSave(draft: EmployeeDraft) {
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await add(draft);
        toast(tc('created'));
      } else if (modal.id) {
        await update(modal.id, draft);
        toast(tc('saved'));
      }
      setModal(null);
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (status === 'loading' || status === 'idle') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { count: employees.length })}
        actions={
          <Button
            className="h-[46px] rounded-12 px-5"
            onClick={() => setModal({ mode: 'add', draft: { roleNames: [] } })}
          >
            + {t('add')}
          </Button>
        }
      />

      <FilterBar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('search')} />

        <select value={role} onChange={(e) => setRole(e.target.value)} className={filterSelectClass}>
          <option value="">{t('filter.role')}</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={filterSelectClass}>
          <option value="">{t('filter.unit')}</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </FilterBar>

      <TableCard>
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="m-0 text-16 font-bold text-ink">{t('empty.title')}</h3>
            <p className="mx-auto mt-2 max-w-[340px] text-13-5 text-ink-subtle">{t('empty.text')}</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(e) => e.id}
            onRowClick={(e) => select(e.id)}
          />
        )}
      </TableCard>

      {modal && (
        <EmployeeModal
          mode={modal.mode}
          initial={modal.draft}
          bolimlar={bolimlar}
          lavozimlar={lavozimlar}
          roles={assignableRoles}
          onSave={(draft) => void handleSave(draft)}
          onCancel={() => setModal(null)}
        />
      )}
    </>
  );
}

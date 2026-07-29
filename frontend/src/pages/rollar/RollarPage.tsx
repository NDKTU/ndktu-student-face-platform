import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ROLES, ROLE_COLORS, type Role } from '@/entities/access/model/roles';
import { MODULE_DEFS, type PermissionCode } from '@/entities/access/model/permissions';
import { useRollar } from '@/features/rollar/lib/useRollar';
import { useRollarStore } from '@/features/rollar/model/rollar.store';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ErrorState, LoadingState } from '@/shared/ui/DataState';
import { useToast } from '@/shared/ui/Toast';

/** Права super_admin менять нельзя — иначе можно запереть себя снаружи системы. */
const LOCKED_ROLE: Role = 'super_admin';

export function RollarPage() {
  const { t } = useTranslation('rollar');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  // Матрица живёт в БД и проверяется эндпоинтами: снятая галочка действительно
  // закрывает доступ, поэтому изменение сразу уходит на сервер, без «Saqlash».
  const { status, error, reload } = useRollar();
  const matrix = useRollarStore((s) => s.matrix);
  const toggle = useRollarStore((s) => s.toggle);

  const [selected, setSelected] = useState<Role>('super_admin');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const counts = useRollarStore((s) => s.counts);
  const locked = selected === LOCKED_ROLE;

  async function togglePermission(code: PermissionCode) {
    if (locked || !matrix) return;
    try {
      await toggle(selected, code, !matrix[selected]?.[code]);
      toast(t('saved'));
    } catch (e) {
      toast(`${tc('saveError')}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (status === 'loading' || status === 'idle' || !matrix) {
    return (
      <>
        <CrumbBar crumbs={[{ label: t('title') }]} />
        <LoadingState />
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <CrumbBar crumbs={[{ label: t('title') }]} />
        <ErrorState message={error} onRetry={() => void reload()} />
      </>
    );
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <div className="grid items-start gap-5 lg:[grid-template-columns:280px_minmax(0,1fr)]">
          <div className="rounded-16 border border-line bg-surface p-3.5 shadow-card">
            <div className="flex items-center justify-between px-1.5 pt-1 pb-3">
              <span className="text-13 font-bold text-ink-muted">{t('listTitle')}</span>
            </div>

            <div className="flex flex-col gap-[3px]">
              {ROLES.map((role) => {
                const active = role === selected;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelected(role)}
                    className={`flex items-center gap-[11px] rounded-11 border-none p-[11px] text-left ${
                      active
                        ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]'
                        : 'bg-transparent hover:bg-surface-raised'
                    } cursor-pointer`}
                  >
                    <span
                      className="grid size-[34px] flex-none place-items-center rounded-9 text-12 font-extrabold text-white"
                      style={{ background: ROLE_COLORS[role] }}
                    >
                      {t(`role.${role}.name`).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-[7px]">
                        <span className="truncate text-13-5 font-bold text-ink">
                          {t(`role.${role}.name`)}
                        </span>
                        <span className="flex-none rounded-12 bg-surface-alt px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.03em] text-ink-muted">
                          {t('systemBadge')}
                        </span>
                      </span>
                      <span className="mt-px block text-11-5 text-ink-subtle">
                        {t('userCount', { count: counts[role] ?? 0 })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-16 border border-line bg-surface shadow-card">
            <div className="flex flex-wrap items-start gap-[15px] border-b border-surface-sunken px-6 py-[22px]">
              <span
                className="grid size-[46px] flex-none place-items-center rounded-12 text-14 font-extrabold text-white"
                style={{ background: ROLE_COLORS[selected] }}
              >
                {t(`role.${selected}.name`).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-[240px] flex-[1_1_240px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.02em] text-ink">
                    {t(`role.${selected}.name`)}
                  </h2>
                  <span className="inline-flex items-center gap-[5px] rounded-20 bg-[#FBF3E2] px-[9px] py-[3px] text-11 font-bold text-warning">
                    {t('systemRole')}
                  </span>
                </div>
                <p className="mt-[5px] mb-0 max-w-[560px] text-13 leading-[1.45] text-ink-muted">
                  {t(`role.${selected}.desc`)}
                </p>
              </div>
            </div>

            {MODULE_DEFS.map((module) => {
              const isOpen = !collapsed[module.key];
              const granted = module.perms.filter((p) => matrix[selected]?.[p]).length;
              const allGranted = granted === module.perms.length;

              return (
                <div key={module.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [module.key]: !prev[module.key] }))
                    }
                    className="flex w-full cursor-pointer items-center gap-3.5 border-none border-t border-surface-sunken bg-transparent px-6 py-4 text-left hover:bg-surface-raised"
                  >
                    <ChevronIcon open={isOpen} />
                    <span className="flex-1">
                      <span className="block text-14 font-extrabold tracking-[-0.01em] text-ink">
                        {t(`module.${module.key}.label`)}
                      </span>
                      <span className="mt-px block text-11-5 font-medium text-ink-subtle">
                        {t(`module.${module.key}.sub`)}
                      </span>
                    </span>
                    <span
                      className={`rounded-20 px-2.5 py-1 text-12 font-bold ${
                        allGranted ? 'bg-success-tint text-success' : 'bg-canvas text-ink-muted'
                      }`}
                    >
                      {granted}/{module.perms.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pt-1 pb-2">
                      {module.perms.map((code) => {
                        const on = !!matrix[selected]?.[code];
                        return (
                          <div
                            key={code}
                            className="flex items-center gap-3.5 border-t border-canvas px-2 py-3"
                          >
                            <code className="min-w-[96px] flex-none rounded-[7px] bg-brand-soft px-[9px] py-[3px] font-mono text-12-5 font-semibold text-brand">
                              {code}
                            </code>
                            <span className="min-w-0 flex-1 truncate text-13-5 font-semibold text-ink-secondary">
                              {t(`perm.${code}`)}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={t(`perm.${code}`)}
                              disabled={locked}
                              onClick={() => void togglePermission(code)}
                              className={`relative h-[23px] w-10 flex-none rounded-20 border-none transition-colors duration-150 ${
                                locked ? 'cursor-default' : 'cursor-pointer'
                              }`}
                              style={{
                                background: on
                                  ? locked
                                    ? '#9AA0D8'
                                    : 'var(--color-brand)'
                                  : 'var(--color-line-strong)',
                              }}
                            >
                              <span
                                className="absolute top-[2.5px] left-[2.5px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-150"
                                style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="border-t border-surface-sunken px-6 py-4 text-right text-12-5 text-ink-subtle">
              {t('autoSaveHint')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none text-ink-faint transition-transform duration-150"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

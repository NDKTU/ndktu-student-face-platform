import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ROLES, PERSONAS, ROLE_COLORS, type Role } from '@/entities/access/model/roles';
import { useSessionStore } from '@/features/auth/model/session.store';
import { initials } from '@/entities/university/mock/rng';

/**
 * Демо-механика прототипа: быстрый переход между ролями. Теперь это не смена
 * поля в сторе, а настоящий перевход — сервер выдаёт токен демо-персоны, и
 * данные приезжают уже отфильтрованными под неё.
 *
 * В проде выключается и здесь, и на бэкенде (settings.allow_dev_login).
 */
const ENABLED = import.meta.env.VITE_PERSONA_SWITCHER !== 'false';

export function PersonaSwitcher() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const role = useSessionStore((s) => s.role);
  const signInAs = useSessionStore((s) => s.signInAs);

  if (!ENABLED) return null;

  async function choose(next: Role) {
    setOpen(false);
    await signInAs(next);
    // Сторы держат данные предыдущей персоны — перезагружаем страницу целиком,
    // это дешевле и надёжнее, чем сбрасывать каждый стор по отдельности.
    window.location.reload();
  }

  return (
    <div className="role-pill fixed right-[22px] bottom-[22px] z-[70]">
      {open && (
        <div className="mb-2 w-[248px] overflow-hidden rounded-14 border border-line bg-surface shadow-popover">
          {ROLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void choose(item)}
              className={`flex w-full cursor-pointer items-center gap-2.5 border-none px-3 py-2.5 text-left ${
                item === role ? 'bg-brand-soft' : 'bg-surface hover:bg-surface-raised'
              }`}
            >
              <span
                className="grid size-7 flex-none place-items-center rounded-9 text-11 font-bold text-white"
                style={{ background: ROLE_COLORS[item] }}
              >
                {initials(PERSONAS[item].user)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-13 font-bold text-ink">
                  {PERSONAS[item].user}
                </span>
                <span className="block truncate text-11-5 text-ink-subtle">
                  {PERSONAS[item].title}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2.5 rounded-20 border border-line bg-surface py-2 pr-4 pl-3.5 shadow-popover"
      >
        <span className="grid size-6 place-items-center rounded-full text-ink-subtle">
          <PeopleIcon />
        </span>
        <span className="text-13 font-bold text-ink">
          {t('personaRole', { title: PERSONAS[role].title })}
        </span>
      </button>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
      <path d="M16 3.2a3 3 0 0 1 0 5.8" />
      <path d="M18.5 20c0-2.4-.8-4.1-2.1-5.1" />
    </svg>
  );
}

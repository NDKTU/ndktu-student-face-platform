import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import { PERSONAS } from '@/entities/access/model/roles';
import { PROFILES } from '@/entities/access/model/profile';
import { useSessionStore } from '@/features/auth/model/session.store';
import { initials } from '@/entities/university/mock/rng';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { Button } from '@/shared/ui/Button';
import { modalInputClass } from '@/shared/ui/Modal';
import { useToast } from '@/shared/ui/Toast';

const MIN_PASSWORD_LENGTH = 6;

export function ProfilPage() {
  const { t } = useTranslation('profil');
  const { t: tc } = useTranslation('common');
  const { role, roleColor } = usePermissions();
  const toast = useToast();

  const persona = PERSONAS[role];
  const profile = PROFILES[role];
  // Имя настоящего владельца токена; остальная анкета пока демонстрационная.
  const userName = useSessionStore((s) => s.user?.displayName) ?? persona.user;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ email: profile.email, phone: profile.phone });
  const [contact, setContact] = useState({ email: profile.email, phone: profile.phone });
  const [password, setPassword] = useState({ old: '', next: '', repeat: '' });

  // Смена персоны меняет и профиль — незакоммиченное редактирование сбрасываем.
  const [shownRole, setShownRole] = useState(role);
  if (shownRole !== role) {
    setShownRole(role);
    setEditing(false);
    setContact({ email: profile.email, phone: profile.phone });
    setDraft({ email: profile.email, phone: profile.phone });
  }

  function saveContact() {
    setContact(draft);
    setEditing(false);
    toast(t('saved'));
  }

  function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!password.old || !password.next || !password.repeat) {
      toast(t('password.empty'));
      return;
    }
    if (password.next !== password.repeat) {
      toast(t('password.mismatch'));
      return;
    }
    if (password.next.length < MIN_PASSWORD_LENGTH) {
      toast(t('password.tooShort'));
      return;
    }
    setPassword({ old: '', next: '', repeat: '' });
    toast(t('password.changed'));
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[1440px] px-8 pt-7 pb-12">
        <div className="mb-5 rounded-18 border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-start gap-[18px]">
            <div
              className="grid size-[58px] flex-none place-items-center rounded-15 text-18 font-extrabold text-white"
              style={{ background: roleColor }}
              aria-hidden="true"
            >
              {initials(userName)}
            </div>
            <div className="min-w-[220px] flex-1">
              <h1 className="m-0 text-23 leading-[1.15] font-extrabold tracking-[-0.02em] text-ink">
                {userName}
              </h1>
              <div className="mt-1.5 text-13-5 text-ink-subtle">
                {persona.title} · {profile.org}
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-[18px] lg:grid-cols-2">
          <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-16 font-bold text-ink">{t('contact')}</h2>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(contact);
                    setEditing(true);
                  }}
                  className="cursor-pointer border-none bg-transparent p-0 text-12-5 font-bold text-brand hover:underline"
                >
                  {t('edit')}
                </button>
              )}
            </div>

            {editing ? (
              <div className="flex flex-col gap-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                    {t('email')}
                  </span>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className={modalInputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                    {t('phone')}
                  </span>
                  <input
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    className={modalInputClass}
                  />
                </label>
                <div className="flex justify-end gap-2.5">
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    {tc('cancel')}
                  </Button>
                  <Button onClick={saveContact}>{tc('save')}</Button>
                </div>
              </div>
            ) : (
              <Rows rows={[[t('email'), contact.email], [t('phone'), contact.phone]]} />
            )}
          </section>

          <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
            <h2 className="mt-0 mb-4 text-16 font-bold text-ink">{t('details')}</h2>
            <Rows rows={profile.rows} />
          </section>

          <section className="rounded-18 border border-line bg-surface p-6 shadow-card">
            <h2 className="mt-0 mb-4 text-16 font-bold text-ink">{t('password.title')}</h2>
            <form onSubmit={changePassword} className="flex flex-col gap-3.5">
              {(
                [
                  ['old', t('password.old')],
                  ['next', t('password.new')],
                  ['repeat', t('password.repeat')],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                    {label}
                  </span>
                  <input
                    type="password"
                    autoComplete={field === 'old' ? 'current-password' : 'new-password'}
                    value={password[field]}
                    onChange={(e) => setPassword((p) => ({ ...p, [field]: e.target.value }))}
                    className={modalInputClass}
                  />
                </label>
              ))}
              <div className="flex justify-end">
                <Button type="submit">{t('password.submit')}</Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="m-0 flex flex-col gap-3.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-12-5 font-semibold text-ink-subtle">{label}</dt>
          <dd className="m-0 text-right text-13-5 font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

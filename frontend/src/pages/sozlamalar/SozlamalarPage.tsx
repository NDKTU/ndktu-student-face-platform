import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/lib/useCurrentUser';
import { useSessionStore } from '@/features/auth/model/session.store';
import { changeCredentials } from '@/shared/api/auth';
import { CrumbBar } from '@/widgets/layout/CrumbBar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/ui/Toast';

const FIELD_CLASS =
  'h-[42px] w-full rounded-11 border border-line bg-surface-raised px-3.5 text-14 text-ink outline-none focus:border-brand focus:bg-surface focus:shadow-focus';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Настройки учётной записи.
 *
 * Здесь были поля названия университета, двухфакторной аутентификации и
 * еженедельной сводки. Ни за одним из них ничего не стояло: значения жили в
 * useState и исчезали при переходе на другой экран. Осталось то, что бэкенд
 * действительно умеет, — смена логина и пароля через PUT /user/me/credentials.
 */
export function SozlamalarPage() {
  const { t } = useTranslation('sozlamalar');
  const { t: tc } = useTranslation('common');
  const me = useCurrentUser();
  const signOut = useSessionStore((s) => s.signOut);
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!currentPassword) {
      toast(t('account.currentRequired'));
      return;
    }

    const nextUsername = username.trim();
    if (!nextUsername && !password) {
      toast(t('account.nothingToChange'));
      return;
    }

    if (password) {
      if (password !== repeat) {
        toast(t('account.mismatch'));
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        toast(t('account.tooShort'));
        return;
      }
    }

    setBusy(true);
    try {
      await changeCredentials({
        current_password: currentPassword,
        ...(nextUsername ? { username: nextUsername } : {}),
        ...(password ? { password } : {}),
      });
      toast(t('account.changed'));
      // Бэкенд удаляет jti из Redis при смене пароля — сессия уже недействительна,
      // и следующий запрос вернул бы 401. Выходим сами, пока можем объяснить.
      signOut();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('account.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CrumbBar crumbs={[{ label: t('title') }]} />

      <div className="mx-auto w-full max-w-[760px] px-8 pt-7 pb-12">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <section className="rounded-16 border border-line bg-surface p-6 shadow-card">
          <h3 className="mt-0 mb-[18px] text-15 font-bold text-ink">{t('account.title')}</h3>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                {t('account.current')}
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                {t('account.username')}
              </span>
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={me.username}
                className={FIELD_CLASS}
              />
            </label>

            <div className="flex gap-4">
              <label className="flex-1">
                <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                  {t('account.new')}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex-1">
                <span className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                  {t('account.repeat')}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>

            <p className="m-0 text-12 text-ink-subtle">{t('account.reloginHint')}</p>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? t('account.submitting') : tc('save')}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

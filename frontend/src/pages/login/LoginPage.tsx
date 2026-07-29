import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import emblem from '@/assets/ndktu-emblem.png';
import { useSessionStore } from '@/features/auth/model/session.store';
import { useToast } from '@/shared/ui/Toast';

/** Общий класс поля ввода — форма логина использует его дважды. */
const inputClass =
  'h-[46px] w-full rounded-12 border border-line bg-surface-raised px-3.5 text-14 text-ink outline-none ' +
  'focus:border-brand focus:bg-surface focus:shadow-focus';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const signIn = useSessionStore((s) => s.signIn);
  const logoutReason = useSessionStore((s) => s.logoutReason);
  const clearLogoutReason = useSessionStore((s) => s.clearLogoutReason);
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  // Почему выкинуло — сказать нужно один раз. Иначе сообщение осталось бы
  // висеть и после следующего неудачного входа, объясняя не то.
  useEffect(() => {
    if (!logoutReason) return;
    toast(logoutReason === 'idle' ? t('reason.idle') : t('reason.session'));
    clearLogoutReason();
  }, [logoutReason, clearLogoutReason, toast, t]);

  async function handleStaff(event: FormEvent) {
    event.preventDefault();
    if (!login.trim() || !password.trim()) {
      toast(t('staff.required'));
      return;
    }

    setBusy(true);
    try {
      await signIn(login.trim(), password);
      toast(t('staff.welcome'));
    } catch (error) {
      // Сервер отвечает одинаково на неизвестный логин и неверный пароль.
      toast(error instanceof Error ? error.message : t('staff.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[115] flex flex-col items-center justify-center overflow-y-auto bg-login p-6">
      <div className="w-full max-w-[428px]">
        <div className="rounded-22 border border-line bg-surface px-[34px] pt-[38px] pb-[34px] shadow-login-card">
          <div className="mb-7 text-center">
            <img src={emblem} alt="NDKTU" className="mx-auto mb-3.5 block size-[68px] object-contain" />
            <div className="text-23 font-extrabold tracking-[-0.02em] text-ink">
              {t('brand')} <span className="text-brand">{t('brandSuffix')}</span>
            </div>
            <div className="mt-[5px] text-13 text-ink-subtle">{t('tagline')}</div>
          </div>

          {/* Кнопка «Войти через HEMIS» здесь была, но настоящей интеграции за
              ней не стояло — она входила демо-студентом. Студенческий вход
              вернётся вместе с реальным `POST /hemis/login`. */}
          <div className="mb-3.5 text-12 font-bold tracking-[0.05em] text-ink-subtle uppercase">
            {t('staff.title')}
          </div>

          <form onSubmit={(e) => void handleStaff(e)} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="login" className="mb-1.5 block text-12-5 font-semibold text-ink-muted">
                {t('staff.login')}
              </label>
              <input
                id="login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder={t('staff.loginPlaceholder')}
                autoComplete="username"
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-12-5 font-semibold text-ink-muted">
                  {t('staff.password')}
                </label>
                <button
                  type="button"
                  onClick={() => toast(t('staff.forgotHint'))}
                  className="cursor-pointer border-none bg-transparent p-0 text-12 font-bold text-brand hover:underline"
                >
                  {t('staff.forgot')}
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('staff.passwordPlaceholder')}
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full cursor-pointer rounded-12 border border-brand bg-surface text-14-5 font-bold text-brand hover:bg-brand-soft disabled:opacity-60"
            >
              {busy ? t('staff.submitting') : t('staff.submit')}
            </button>
          </form>
        </div>

        <div className="mt-[22px] text-center text-12 leading-[1.6] text-ink-subtle">
          {t('footer.university')}
          <br />
          {t('footer.copyright')}
        </div>
      </div>
    </div>
  );
}


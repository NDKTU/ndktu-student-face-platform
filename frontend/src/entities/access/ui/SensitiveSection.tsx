import { useTranslation } from 'react-i18next';
import { useAsyncData } from '@/shared/lib/useAsyncData';

interface SensitiveSectionProps<T> {
  /** Идентификатор владельца данных; смена перезапрашивает блок. */
  id: number;
  load: (id: number) => Promise<T>;
  rows: (data: T) => [string, string][];
  /** Заголовок «запертой» рамки. */
  title: string;
  denied: { title: string; text: string };
  /**
   * Может ли роль вообще увидеть блок. Не проверка доступа — её делает
   * сервер, — а способ не слать заведомо запрещённый запрос.
   */
  allowed: boolean;
  /** Раскладка полей отличается между карточкой студента и сотрудника. */
  gridClass: string;
}

/**
 * Блок персональных данных: ЖШШИР, паспорт, адрес.
 *
 * Данные приезжают отдельным запросом и только по факту открытия вкладки —
 * раньше они считались в браузере, то есть ограничение по роли ничего не
 * закрывало. Решение принимает сервер: 403 здесь просто отрисовывается.
 */
export function SensitiveSection<T>({
  id,
  load,
  rows,
  title,
  denied,
  allowed,
  gridClass,
}: SensitiveSectionProps<T>) {
  const { t } = useTranslation('common');
  const { status, data, error } = useAsyncData(allowed ? id : null, load);

  if (!allowed) {
    return <Denied title={denied.title} text={denied.text} />;
  }

  if (status === 'loading') {
    return <p className="py-10 text-center text-13-5 text-ink-subtle">{t('loading')}</p>;
  }

  if (status === 'denied') {
    return <Denied title={denied.title} text={denied.text} />;
  }

  if (status === 'error' || !data) {
    return <p className="py-10 text-center text-13-5 text-danger">{error}</p>;
  }

  return (
    <div className="rounded-14 border border-line bg-surface-raised p-5">
      <div className="mb-4 flex items-center gap-2 text-12 font-bold tracking-[0.04em] text-ink-muted uppercase">
        <LockIcon />
        {title}
      </div>
      <dl className={`m-0 grid ${gridClass}`}>
        {rows(data).map(([label, value]) => (
          <div key={label}>
            <dt className="text-11-5 font-semibold text-ink-subtle">{label}</dt>
            <dd className="m-0 mt-1 text-14 font-semibold break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Denied({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-16 bg-canvas text-line-bold">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h3 className="m-0 text-15-5 font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-[380px] text-13-5 text-ink-subtle">{text}</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

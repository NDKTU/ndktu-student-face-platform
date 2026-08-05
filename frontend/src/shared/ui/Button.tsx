import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border-none hover:bg-brand-hover',
  secondary: 'bg-surface text-ink-secondary border border-line hover:bg-brand-soft',
  danger: 'bg-danger text-white border-none hover:brightness-95',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      // Отключённая кнопка должна отличаться на вид: во время загрузки видео
      // «Saqlash» неактивна минуты, и без этого она выглядит просто сломанной.
      className={`inline-flex h-10 cursor-pointer items-center gap-[7px] rounded-10 px-[18px] text-13-5 font-bold disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

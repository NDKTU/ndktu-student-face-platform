/** Переключатель в оформлении прототипа: 44×25, круглый ползунок. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-[25px] w-11 flex-none cursor-pointer rounded-20 border-none transition-colors duration-150"
      style={{ background: checked ? 'var(--color-brand)' : 'var(--color-line-strong)' }}
    >
      <span
        className="absolute top-[2.5px] left-[2.5px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-150"
        style={{ transform: checked ? 'translateX(19px)' : 'translateX(0)' }}
      />
    </button>
  );
}

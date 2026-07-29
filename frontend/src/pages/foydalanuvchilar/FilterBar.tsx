import type { ReactNode } from 'react';

/** Селекты в панели фильтров — один стиль на обеих вкладках. */
export const filterSelectClass =
  'h-[46px] min-w-[150px] flex-none cursor-pointer rounded-12 border border-line bg-surface px-3.5 ' +
  'text-14 text-ink-secondary outline-none focus:border-brand';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[240px] flex-1">
      <SearchIcon />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[46px] w-full rounded-12 border border-line bg-surface pr-3.5 pl-[38px] text-14 text-ink outline-none placeholder:text-ink-faint focus:border-brand"
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

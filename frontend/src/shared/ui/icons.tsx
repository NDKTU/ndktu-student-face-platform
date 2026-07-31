/**
 * Иконки действий для меню строк и карточек.
 *
 * Нарисованы вручную, как и остальные иконки интерфейса (`widgets/layout/navIcons`):
 * ради двух пиктограмм тянуть пакет иконок незачем.
 */

const BASE = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function PencilIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...BASE} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7v12a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

import { createElement } from 'react';
import type { NavKey } from '@/entities/access/model/roles';
import { NAV_ICONS } from './navIcons';

/** Ключи атрибутов SVG в React пишутся camelCase — конвертируем на лету. */
function toReactAttrs(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    out[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return out;
}

export function NavIcon({ navKey, size = 20 }: { navKey: NavKey; size?: number }) {
  const shapes = NAV_ICONS[navKey];
  if (!shapes) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes.map((shape, i) => createElement(shape.tag, { key: i, ...toReactAttrs(shape.attrs) }))}
    </svg>
  );
}

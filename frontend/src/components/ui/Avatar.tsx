import { useMemo } from 'react';
import { cn } from '@/utils/utils';

// Deterministic avatar palette drawn from the NDKTU mockup's accent colors.
const AVATAR_COLORS = [
    '#2836C7', // indigo
    '#2457D6', // blue
    '#0E7C86', // teal
    '#6D28D9', // violet
    '#157A43', // green
    '#B45309', // amber
    '#C4363B', // rose
    '#0F766E', // emerald
];

const colorFor = (seed: string): string => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export const initialsOf = (name?: string | null): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface AvatarProps {
    name?: string | null;
    /** Optional explicit initials override. */
    initials?: string;
    src?: string | null;
    /** Pixel diameter/side. Default 32. */
    size?: number;
    shape?: 'circle' | 'rounded';
    className?: string;
    /** Explicit background color; otherwise derived deterministically from name. */
    color?: string;
}

const Avatar = ({
    name,
    initials,
    src,
    size = 32,
    shape = 'circle',
    className,
    color,
}: AvatarProps) => {
    const bg = useMemo(() => color ?? colorFor(name ?? initials ?? 'U'), [color, name, initials]);
    const label = initials ?? initialsOf(name);
    const radius = shape === 'circle' ? '9999px' : 'calc(var(--radius) * 0.6)';

    return (
        <span
            className={cn('inline-grid shrink-0 place-items-center overflow-hidden font-bold text-white', className)}
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                background: src ? undefined : bg,
                fontSize: Math.max(10, Math.round(size * 0.4)),
            }}
        >
            {src ? (
                <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
            ) : (
                label
            )}
        </span>
    );
};

export default Avatar;

import { cn } from '@/lib/utils';
import type { LoadGroup } from '@/utils/teacherLoad';

interface Props {
    /** O'qituvchi yuklamasidagi guruhlar. */
    groups: LoadGroup[];
    /** Tanlanganlar: id → nom. Yuklamada yo'qlari ham shu yerda (qo'lda qo'shilgan). */
    selected: Map<number, string>;
    onToggle: (id: number, name: string) => void;
}

/**
 * O'qituvchining guruhlari — EPOS yuklamasidan. Har guruh ostida u yerda
 * o'tadigan fanlar: oqimdagi guruhlarni va kerakli guruhni bir qarashda topish uchun.
 * Qo'lda qo'shilgan (yuklamada yo'q) tanlangan guruhlar ham ro'yxat boshida
 * ko'rinadi — ularni shu yerdan olib tashlash mumkin.
 */
export function TeacherLoadGroups({ groups, selected, onToggle }: Props) {
    const known = new Set(groups.map((group) => group.id));
    const extra = [...selected.entries()].filter(([id]) => !known.has(id));
    const rows: { id: number; name: string; hint: string; extra: boolean }[] = [
        ...extra.map(([id, name]) => ({ id, name, hint: "Yuklamada yo'q — qo'lda qo'shilgan", extra: true })),
        ...groups.map((group) => ({ id: group.id, name: group.name, hint: group.subjects.join(', '), extra: false })),
    ];

    return (
        <ul className="max-h-[40dvh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((row) => (
                <li key={row.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
                        <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-primary"
                            checked={selected.has(row.id)}
                            onChange={() => onToggle(row.id, row.name)}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{row.name}</span>
                            <span className={cn('block truncate text-xs', row.extra ? 'text-amber-600' : 'text-muted-foreground')}>
                                {row.hint}
                            </span>
                        </span>
                    </label>
                </li>
            ))}
        </ul>
    );
}

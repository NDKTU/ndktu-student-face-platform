import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UsersRound } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { generalTestService, type GroupOption, type GroupOptionFilter } from '@/services/generalTestService';
import { cn } from '@/lib/utils';
import { selectClassName } from './labels';

const COURSES = [1, 2, 3, 4, 5, 6];

/** Guruhlar qayerdan olinadi. Elementar test va Zoom seansi — har biri o'z
 *  ruxsati ostidagi endpoint orqali (bir-birining ruxsatini talab qilmasin). */
export interface GroupSource {
    key: string;
    groupOptions: (filter: GroupOptionFilter) => Promise<GroupOption[]>;
    filterOptions: () => Promise<{ faculties: { id: number; name: string }[] }>;
}

const GENERAL_TEST_SOURCE: GroupSource = {
    key: 'general-test',
    groupOptions: generalTestService.groupOptions,
    filterOptions: generalTestService.filterOptions,
};

interface Props {
    /** Tanlanganlar: id → nom (nom test nomini oldindan ko'rsatish uchun kerak). */
    selected: Map<number, string>;
    onToggle: (group: GroupOption) => void;
    /** Allaqachon biriktirilganlar — belgilangan va o'chirilgan holda. */
    assignedIds?: number[];
    className?: string;
    source?: GroupSource;
}

/** Guruhlarni nomi, fakulteti va kursi bo'yicha qidirib belgilash ro'yxati. */
export function GroupChecklist({ selected, onToggle, assignedIds = [], className, source = GENERAL_TEST_SOURCE }: Props) {
    const [search, setSearch] = useState('');
    const [facultyId, setFacultyId] = useState('');
    const [course, setCourse] = useState('');
    const debounced = useDebouncedValue(search);

    const { data: options } = useQuery({
        queryKey: [source.key, 'filter-options'],
        queryFn: source.filterOptions,
        staleTime: 5 * 60 * 1000,
    });
    const filter: GroupOptionFilter = {
        search: debounced || undefined,
        faculty_id: facultyId ? Number(facultyId) : undefined,
        course: course ? Number(course) : undefined,
        limit: 100,
    };
    const { data: groups, isLoading, isError, refetch } = useQuery({
        queryKey: [source.key, 'group-options', filter],
        queryFn: () => source.groupOptions(filter),
        placeholderData: (prev) => prev,
    });
    const assigned = new Set(assignedIds);

    return (
        <div className={cn('space-y-3', className)}>
            <div className="grid gap-2 sm:grid-cols-2">
                <Input
                    placeholder="Guruh nomi..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    leftAddon={<Search className="h-4 w-4" />}
                    className="sm:col-span-2"
                />
                <select aria-label="Fakultet" className={selectClassName} value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                    <option value="">Barcha fakultetlar</option>
                    {options?.faculties.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.name}
                        </option>
                    ))}
                </select>
                <select aria-label="Kurs" className={selectClassName} value={course} onChange={(e) => setCourse(e.target.value)}>
                    <option value="">Barcha kurslar</option>
                    {COURSES.map((c) => (
                        <option key={c} value={c}>
                            {c}-kurs
                        </option>
                    ))}
                </select>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-11 w-full rounded-lg" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !groups?.length ? (
                <EmptyState icon={<UsersRound className="h-6 w-6" />} title="Guruh topilmadi" description="Filtrni o'zgartirib ko'ring." />
            ) : (
                <ul className="max-h-[40dvh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {groups.map((g) => {
                        const isAssigned = assigned.has(g.id);
                        return (
                            <li key={g.id}>
                                <label
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5',
                                        isAssigned ? 'opacity-60' : 'cursor-pointer hover:bg-accent/40',
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 shrink-0"
                                        checked={isAssigned || selected.has(g.id)}
                                        disabled={isAssigned}
                                        onChange={() => onToggle(g)}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-foreground">{g.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {[g.faculty_name, g.course ? `${g.course}-kurs` : null].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{g.student_count} talaba</span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useTeacherStudents } from '@/hooks/useTeachers';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

/**
 * O'qituvchining talabalari — universitetning barcha talabalari emas, faqat
 * unga biriktirilgan guruhlardagilar. Guruhlar ro'yxati javobning o'zidan
 * olinadi (sahifadagi talabalardan yig'ilmaydi), aks holda filtr birinchi
 * sahifada uchragan guruhlar bilan cheklanib qolardi.
 */
export const TeacherStudentsPanel = ({ teacherId }: { teacherId: number }) => {
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState<string>('all');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data, isLoading, isError, refetch } = useTeacherStudents(teacherId, {
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        group_id: groupFilter === 'all' ? undefined : Number(groupFilter),
    });

    const groups = data?.groups ?? [];
    const students = data?.students ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const groupOptions = useMemo(
        () => [
            { value: 'all', label: `Barcha guruhlar (${groups.length})` },
            ...groups.map((g) => ({ value: String(g.id), label: `${g.name} — ${g.student_count} ta` })),
        ],
        [groups]
    );

    if (isError) {
        return <ErrorState onRetry={() => refetch()} />;
    }

    if (isLoading && !data) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="rounded-2xl border border-border bg-card p-8">
                <TableEmpty
                    colSpan={1}
                    title="Guruh biriktirilmagan"
                    description="Bu o'qituvchiga guruh ham, guruhli kurs ham biriktirilmagan, shuning uchun talabalar ro'yxati bo'sh."
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-[280px]">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="F.I.SH yoki talaba ID bo'yicha..."
                        leftAddon={<Search className="h-4 w-4" />}
                    />
                </div>
                <div className="w-full sm:w-[260px]">
                    <Combobox
                        options={groupOptions}
                        value={groupFilter}
                        onChange={(val) => {
                            setGroupFilter(val);
                            setPage(1);
                        }}
                        placeholder="Guruh bo'yicha"
                    />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <Users className="h-3.5 w-3.5" />
                    {total} ta talaba
                </span>
            </div>

            {students.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={1}
                        title="Talaba topilmadi"
                        description="Tanlangan filtrlarga mos talaba yo'q."
                    />
                </div>
            ) : (
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead className="font-bold text-xs">Talaba F.I.SH</TableHead>
                            <TableHead className="font-bold text-xs">Guruh</TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Talaba ID</TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell">Kurs / semestr</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5 hidden lg:table-cell">GPA</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students.map((student, index) => (
                            <TableRow key={student.id} className="border-b border-border/50">
                                <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                                    {(page - 1) * PAGE_SIZE + index + 1}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={cn(
                                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                tileFor(student.id)
                                            )}
                                        >
                                            {initialsOf(student.full_name)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-foreground leading-snug">{student.full_name}</p>
                                            <p className="text-xs text-muted-foreground">{student.specialty || '—'}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="badge badge-primary text-xs">{student.group_name || '—'}</span>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {student.student_id_number}
                                    </span>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                    <span className="text-xs text-muted-foreground">
                                        {student.level || '—'} / {student.semester || '—'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right pr-5 hidden lg:table-cell">
                                    <span className="font-mono text-xs font-semibold">
                                        {student.avg_gpa != null ? student.avg_gpa.toFixed(1) : '—'}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                isLoading={isLoading}
            />
        </div>
    );
};

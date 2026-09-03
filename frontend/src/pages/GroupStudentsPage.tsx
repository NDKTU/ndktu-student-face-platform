import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { useGroup, useGroupStudents } from '@/hooks/useGroups';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

/**
 * Bitta guruhning talabalari. `read:student` talab qilinmaydi — backend
 * o'qituvchiga faqat o'ziga biriktirilgan guruhni ochadi. To'liq talabalar
 * ro'yxati (`/students`) huquqi borlar uchun o'z joyida qoladi.
 */
const GroupStudentsPage = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const navigate = useNavigate();
    const id = Number(groupId);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: group } = useGroup(id);
    const { data, isLoading, isError, refetch } = useGroupStudents(id, debouncedSearch || undefined);

    const students = data?.students ?? [];
    const total = data?.total ?? 0;

    return (
        <div className="space-y-5">
            <OrganizationBreadcrumbs
                items={[
                    { label: 'Guruhlar', onClick: () => navigate('/groups') },
                    { label: group?.name || `Guruh #${id}` },
                ]}
                title={group?.name || `Guruh #${id}`}
                description="Guruhga biriktirilgan talabalar ro'yxati"
            />

            <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/groups')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Orqaga
                </Button>
                <div className="w-full sm:w-[300px]">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="F.I.SH yoki talaba ID bo'yicha..."
                        leftAddon={<Search className="h-4 w-4" />}
                    />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <Users className="h-3.5 w-3.5" />
                    {total} ta talaba
                </span>
            </div>

            {isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isLoading && !data ? (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                </div>
            ) : students.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={1}
                        title="Talaba topilmadi"
                        description={
                            debouncedSearch
                                ? "Qidiruvga mos talaba yo'q."
                                : "Bu guruhda hozircha talaba yo'q."
                        }
                    />
                </div>
            ) : (
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead className="font-bold text-xs">Talaba F.I.SH</TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Talaba ID</TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell">Kurs / semestr</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5 hidden lg:table-cell">GPA</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students.map((student, index) => (
                            <TableRow key={student.id} className="border-b border-border/50">
                                <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                                    {index + 1}
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
                                            <p className="font-semibold text-foreground leading-snug">
                                                {student.full_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{student.specialty || '—'}</p>
                                        </div>
                                    </div>
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
        </div>
    );
};

export default GroupStudentsPage;

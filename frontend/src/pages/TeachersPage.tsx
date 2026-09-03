import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    Plus,
    Pencil,
    Trash2,
    BookOpen,
    UsersRound,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    ArrowRight,
    GraduationCap,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTeachers, useDeleteTeacher } from '@/hooks/useTeachers';
import { useKafedras } from '@/hooks/useReferenceData';
import type { Teacher } from '@/services/teacherService';
import { TeacherDetail } from '@/components/teachers/TeacherDetail';
import { TeacherModal } from '@/components/teachers/TeacherModal';
import { TeacherGroupModal } from '@/components/teachers/TeacherGroupModal';
import { TeacherSubjectModal } from '@/components/teachers/TeacherSubjectModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Combobox } from '@/components/ui/Combobox';
import { ExternalSourceBadge, InactiveBadge } from '@/components/common/ExternalSourceBadge';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

const COURSE_FILTER_OPTIONS = [
    { value: 'all', label: 'Barchasi' },
    { value: 'with', label: 'Kursi borlar' },
    { value: 'without', label: 'Kursi yo\'qlar' },
];

type SortField = 'name' | 'kafedra' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const TeachersPage = () => {
    const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,
    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.
    const [displayMode] = useState<'table' | 'grid'>('table');

    const [currentPage, setCurrentPage] = useState(1);
    const [selectedKafedraFilter, setSelectedKafedraFilter] = useState<string>('all');
    const [coursesFilter, setCoursesFilter] = useState<'all' | 'with' | 'without'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
    const [teacherToAssign, setTeacherToAssign] = useState<Teacher | null>(null);

    const pageSize = 15;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const kafedraIdNum = selectedKafedraFilter === 'all' ? undefined : Number(selectedKafedraFilter);
    // `undefined` — filtrsiz. Filtr SQL darajasida ishlaydi, shuning uchun
    // sahifalash hisoblagichi ham to'g'ri qoladi.
    const hasCourses = coursesFilter === 'all' ? undefined : coursesFilter === 'with';

    const {
        data: teachersData,
        isLoading: isTeachersLoading,
        isError: isTeachersError,
        refetch,
    } = useTeachers(currentPage, pageSize, debouncedSearch, true, kafedraIdNum, hasCourses);

    const { data: kafedrasData } = useKafedras(1, 200);
    const deleteTeacherMutation = useDeleteTeacher();

    const rawTeachers = teachersData?.teachers || [];
    const totalPages = teachersData ? Math.ceil(teachersData.total / pageSize) : 1;
    const totalCount = teachersData?.total ?? rawTeachers.length;
    const kafedras = kafedrasData?.kafedras || [];

    const kafedraOptions = useMemo(() => {
        const list = kafedras.map((k) => ({ value: String(k.id), label: k.name }));
        return [{ value: 'all', label: 'Barcha kafedralar' }, ...list];
    }, [kafedras]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortedTeachers = useMemo(() => {
        return [...rawTeachers].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = (a.full_name || a.user?.username || '').toLowerCase();
                valB = (b.full_name || b.user?.username || '').toLowerCase();
            } else if (sortField === 'kafedra') {
                valA = (a.kafedra?.name || '').toLowerCase();
                valB = (b.kafedra?.name || '').toLowerCase();
            } else if (sortField === 'created_at') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rawTeachers, sortField, sortOrder]);

    const handleViewTeacher = (teacher: Teacher) => {
        setSelectedTeacher(teacher);
        setViewMode('detail');
    };

    const handleBackToList = () => {
        setSelectedTeacher(null);
        setViewMode('list');
    };

    const handleEditClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedTeacher(teacher);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToDelete(teacher);
        setCascadeWarnings([]);
        setIsDeleteModalOpen(true);
    };

    const handleAssignGroupsClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToAssign(teacher);
        setIsGroupModalOpen(true);
    };

    const handleAssignSubjectsClick = (teacher: Teacher, e: React.MouseEvent) => {
        e.stopPropagation();
        setTeacherToAssign(teacher);
        setIsSubjectModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!teacherToDelete) return;
        deleteTeacherMutation.mutate(
            { id: teacherToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("O'qituvchi o'chirildi");
                    setIsDeleteModalOpen(false);
                    setTeacherToDelete(null);
                    setCascadeWarnings([]);
                    refetch();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("O'chirishda xatolik yuz berdi");
                        setIsDeleteModalOpen(false);
                        setTeacherToDelete(null);
                        setCascadeWarnings([]);
                    }
                },
            }
        );
    };

    const handleSuccess = () => {
        toast.success("O'qituvchi saqlandi");
        setIsModalOpen(false);
        setSelectedTeacher(null);
        refetch();
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground" />;
        }
        return sortOrder === 'asc' ? (
            <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary" />
        ) : (
            <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
        );
    };

    const renderActions = (teacher: Teacher) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs font-semibold gap-1 text-primary hover:bg-primary/10"
                title="Guruhlarni biriktirish"
                onClick={(e) => handleAssignGroupsClick(teacher, e)}
            >
                <UsersRound className="h-3.5 w-3.5" />
                <span>Guruhlar</span>
            </Button>
            <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs font-semibold gap-1 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                title="Fanlarni biriktirish"
                onClick={(e) => handleAssignSubjectsClick(teacher, e)}
            >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Fanlar</span>
            </Button>
            <PermissionGate permission="update:teacher">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Tahrirlash"
                    onClick={(e) => handleEditClick(teacher, e)}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:teacher">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    title="O'chirish"
                    onClick={(e) => handleDeleteClick(teacher, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                title="Batafsil"
                onClick={() => handleViewTeacher(teacher)}
            >
                <ArrowRight className="h-4 w-4" />
            </Button>
        </div>
    );

    if (viewMode === 'detail' && selectedTeacher) {
        return <TeacherDetail teacher={selectedTeacher} onBack={handleBackToList} />;
    }

    return (
        <div className="space-y-5">
            {/* Top Sub-Navigation Tabs */}

            {/* Breadcrumbs Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Foydalanuvchilar', onClick: () => {} }, { label: "O'qituvchilar" }]}
                title="Professor-O'qituvchilar"
                description="Universitet o'qituvchilar tarkibi, kafedralar, biriktirilgan fan va guruhlar"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="O'qituvchi F.I.SH bo'yicha qidirish..."
                totalCount={totalCount}
                totalLabel="O'qituvchilar"
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-[200px] sm:w-[260px]">
                            <Combobox
                                options={kafedraOptions}
                                value={selectedKafedraFilter}
                                onChange={(val) => {
                                    setSelectedKafedraFilter(val);
                                    setCurrentPage(1);
                                }}
                                placeholder="Kafedra bo'yicha saralash"
                            />
                        </div>
                        <div className="w-[180px] sm:w-[210px]">
                            <Combobox
                                options={COURSE_FILTER_OPTIONS}
                                value={coursesFilter}
                                onChange={(val) => {
                                    setCoursesFilter(val as 'all' | 'with' | 'without');
                                    setCurrentPage(1);
                                }}
                                placeholder="Kurslar bo'yicha"
                            />
                        </div>
                    </div>
                }
                actions={
                    <PermissionGate permission="create:teacher">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedTeacher(null);
                                setIsModalOpen(true);
                            }}
                            className="h-9 gap-1.5 font-semibold shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Qo'shish</span>
                        </Button>
                    </PermissionGate>
                }
            />

            {/* Content */}
            {isTeachersError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isTeachersLoading ? (
                displayMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <CatalogGrid>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
                        ))}
                    </CatalogGrid>
                )
            ) : sortedTeachers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={7}
                        title="O'qituvchilar topilmadi"
                        description={
                            searchTerm || selectedKafedraFilter !== 'all' || coursesFilter !== 'all'
                                ? "Tanlangan filtrlarga mos o'qituvchi topilmadi."
                                : "Hozircha o'qituvchi qo'shilmagan."
                        }
                    />
                </div>
            ) : displayMode === 'table' ? (
                /* High-Density Optimized Table View */
                <Table className="min-w-full border-separate border-spacing-0">
                    <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="border-b border-border/80">
                            <TableHead className="w-[50px] text-center font-bold font-mono text-xs">#</TableHead>
                            <TableHead
                                onClick={() => handleSort('name')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>O'qituvchi F.I.SH</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('kafedra')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Kafedra</span>
                                    {renderSortIcon('kafedra')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs">Kurslar</TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Foydalanuvchi</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden lg:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Yaratilgan sana</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">Holati</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedTeachers.map((teacher, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const displayName = teacher.full_name || teacher.user?.username || "Noma'lum";

                            return (
                                <TableRow
                                    key={teacher.id}
                                    onClick={() => handleViewTeacher(teacher)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* O'qituvchi F.I.SH */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(teacher.id)
                                                )}
                                            >
                                                {initialsOf(displayName)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {displayName}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                    <ExternalSourceBadge row={teacher} />
                                                    <InactiveBadge row={teacher} />
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Kafedra */}
                                    <TableCell>
                                        {teacher.kafedra ? (
                                            <span className="badge badge-primary text-xs capitalize">
                                                {teacher.kafedra.name}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Biriktirilmagan</span>
                                        )}
                                    </TableCell>

                                    {/* Kurslar */}
                                    <TableCell>
                                        {teacher.course_count ? (
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                                                    <GraduationCap className="h-3 w-3" />
                                                    {teacher.course_count}
                                                </span>
                                                <span
                                                    className="hidden xl:inline max-w-[220px] truncate text-xs text-muted-foreground"
                                                    title={(teacher.courses ?? []).map((c) => c.name).join(', ')}
                                                >
                                                    {(teacher.courses ?? []).slice(0, 2).map((c) => c.name).join(', ')}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Kurs yo'q</span>
                                        )}
                                    </TableCell>

                                    {/* Foydalanuvchi */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {teacher.user?.username || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Yaratilgan sana */}
                                    <TableCell className="hidden lg:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {teacher.created_at ? new Date(teacher.created_at).toLocaleDateString() : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="h-3 w-3" />
                                            <span>Faol</span>
                                        </span>
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(teacher)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedTeachers.map((teacher) => {
                        const displayName = teacher.full_name || teacher.user?.username || "Noma'lum";
                        return (
                            <CatalogCard
                                key={teacher.id}
                                id={teacher.id}
                                title={displayName}
                                subtitle={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {teacher.kafedra ? (
                                            <span className="badge badge-primary text-xs">{teacher.kafedra.name}</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Kafedra yo'q</span>
                                        )}
                                        <ExternalSourceBadge row={teacher} />
                                        <InactiveBadge row={teacher} />
                                    </span>
                                }
                                metrics={[
                                    { label: 'Login', value: teacher.user?.username || '—' },
                                    { label: 'Sana', value: teacher.created_at ? new Date(teacher.created_at).toLocaleDateString() : '—' },
                                ]}
                                actions={renderActions(teacher)}
                                onClick={() => handleViewTeacher(teacher)}
                            />
                        );
                    })}
                </CatalogGrid>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isTeachersLoading}
                />
            )}

            {/* Modals */}
            <TeacherModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                teacher={selectedTeacher}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setTeacherToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="O'qituvchini o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu o'qituvchini o'chirish quyidagi ma'lumotlarni ham o'chiradi:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">
                                Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!
                            </p>
                        </div>
                    ) : (
                        `Siz haqiqatan ham "${teacherToDelete?.full_name}" o'qituvchisini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />

            <TeacherGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                teacher={teacherToAssign}
            />

            <TeacherSubjectModal
                isOpen={isSubjectModalOpen}
                onClose={() => setIsSubjectModalOpen(false)}
                teacher={teacherToAssign}
            />
        </div>
    );
};

export default TeachersPage;

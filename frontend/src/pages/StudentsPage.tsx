import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { type Student } from '@/services/studentService';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
    Pencil,
    Trash2,
    Download,
    FolderEdit,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    ArrowRight,
    ScanFace,
    Award,
} from 'lucide-react';
import { Combobox } from '@/components/ui/Combobox';
import { useStudents, useDeleteStudent } from '@/hooks/useStudents';
import { useUserResults } from '@/hooks/useResults';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/context/AuthContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HemisImportModal } from '@/components/HemisImportModal';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';
import type { Result } from '@/services/resultService';

type SortField = 'name' | 'user_id' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const StudentsPage = () => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentToChangeGroup, setStudentToChangeGroup] = useState<Student | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [displayMode, setDisplayMode] = useState<'table' | 'grid'>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const pageSize = 15;
    const deleteMutation = useDeleteStudent();

    const parsedGroup = selectedGroup !== 'all' && selectedGroup ? parseInt(selectedGroup, 10) : undefined;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { hasPermission } = useAuth();
    const canReadGroup = hasPermission('read:group');

    const {
        data: studentsData,
        isLoading: isStudentsLoading,
        isError: isStudentsError,
        refetch,
    } = useStudents(currentPage, pageSize, debouncedSearch, undefined, parsedGroup);

    const { data: groupsData } = useGroups(1, 200, '', undefined, undefined, canReadGroup);

    const rawStudents = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;
    const totalCount = studentsData?.total ?? rawStudents.length;

    const groupOptions = useMemo(() => {
        const list = (groupsData?.groups || []).map((g) => ({ value: String(g.id), label: g.name }));
        return [{ value: 'all', label: 'Barcha guruhlar' }, ...list];
    }, [groupsData]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortedStudents = useMemo(() => {
        return [...rawStudents].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            if (sortField === 'name') {
                valA = (a.full_name || '').toLowerCase();
                valB = (b.full_name || '').toLowerCase();
            } else if (sortField === 'user_id') {
                valA = a.user_id;
                valB = b.user_id;
            } else if (sortField === 'created_at') {
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rawStudents, sortField, sortOrder]);

    const handleViewStudent = (student: Student) => {
        setSelectedStudent(student);
        setViewMode('detail');
    };

    const handleBackToList = () => {
        setSelectedStudent(null);
        setViewMode('list');
    };

    const handleDelete = () => {
        if (!studentToDelete) return;
        deleteMutation.mutate(
            { id: studentToDelete.id, force: cascadeWarnings.length > 0 },
            {
                onSuccess: () => {
                    toast.success("Talaba o'chirildi");
                    setStudentToDelete(null);
                    setCascadeWarnings([]);
                    refetch();
                },
                onError: (error: any) => {
                    if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                        setCascadeWarnings(error.response.data.detail.warnings || []);
                    } else {
                        toast.error("Talabani o'chirishda xatolik yuz berdi");
                        setStudentToDelete(null);
                        setCascadeWarnings([]);
                    }
                },
            }
        );
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

    const renderActions = (student: Student) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Guruhni o'zgartirish"
                onClick={(e) => {
                    e.stopPropagation();
                    setStudentToChangeGroup(student);
                }}
            >
                <FolderEdit className="h-4 w-4" />
            </Button>
            <PermissionGate permission="update:student">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Tahrirlash"
                    onClick={(e) => {
                        e.stopPropagation();
                        toast.info("Tahrirlash funksiyasi tez orada qo'shiladi");
                    }}
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <PermissionGate permission="delete:student">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                    title="O'chirish"
                    onClick={(e) => {
                        e.stopPropagation();
                        setStudentToDelete(student);
                        setCascadeWarnings([]);
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                title="Batafsil / Natijalar"
                onClick={() => handleViewStudent(student)}
            >
                <ArrowRight className="h-4 w-4" />
            </Button>
        </div>
    );

    if (viewMode === 'detail' && selectedStudent) {
        return <StudentDetail student={selectedStudent} onBack={handleBackToList} />;
    }

    return (
        <div className="space-y-5">
            {/* Top Sub-Navigation Tabs */}

            {/* Breadcrumb Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Foydalanuvchilar', onClick: () => {} }, { label: 'Talabalar' }]}
                title="Talabalar"
                description="Barcha fakultet va guruh talabalari, HEMIS integratsiyasi va test natijalari"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Talaba F.I.SH yoki ID bo'yicha qidirish..."
                viewMode={displayMode}
                onViewModeChange={setDisplayMode}
                totalCount={totalCount}
                totalLabel="Talabalar"
                extraFilters={
                    <PermissionGate permission="read:group">
                        <div className="w-[200px] sm:w-[260px]">
                            <Combobox
                                options={groupOptions}
                                value={selectedGroup}
                                onChange={(val) => {
                                    setSelectedGroup(val);
                                    setCurrentPage(1);
                                }}
                                placeholder="Guruh bo'yicha saralash"
                            />
                        </div>
                    </PermissionGate>
                }
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsImportModalOpen(true)}
                        className="h-9 gap-1.5 font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        <span>Hemisdan Import</span>
                    </Button>
                }
            />

            {/* Content */}
            {isStudentsError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isStudentsLoading ? (
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
            ) : sortedStudents.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title="Talabalar topilmadi"
                        description={
                            searchTerm || selectedGroup !== 'all'
                                ? "Tanlangan mezonlarga mos talaba topilmadi."
                                : "Hozircha talaba qo'shilmagan."
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
                                    <span>Talaba F.I.SH</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('user_id')}
                                className="group cursor-pointer select-none text-center font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center justify-center">
                                    <span>User ID</span>
                                    {renderSortIcon('user_id')}
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-xs hidden md:table-cell">Telefon</TableHead>
                            <TableHead className="font-bold text-xs hidden lg:table-cell max-w-[200px]">Manzil</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden xl:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>Qo'shilgan sana</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">Amallar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedStudents.map((student, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const displayName = student.full_name || `Talaba #${student.id}`;

                            return (
                                <TableRow
                                    key={student.id}
                                    onClick={() => handleViewStudent(student)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Talaba F.I.SH */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(student.id)
                                                )}
                                            >
                                                {initialsOf(displayName)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {displayName}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                    {student.student_id_number && (
                                                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/80">
                                                            {student.student_id_number}
                                                        </span>
                                                    )}
                                                    {student.student_status && (
                                                        <span className="badge badge-primary text-[10px]">
                                                            {student.student_status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* User ID */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground border border-border/80">
                                            #{student.user_id}
                                        </span>
                                    </TableCell>

                                    {/* Telefon */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {student.phone || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Manzil */}
                                    <TableCell className="hidden lg:table-cell max-w-[200px] truncate">
                                        <span className="text-xs text-muted-foreground" title={student.address || ''}>
                                            {student.address || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Qo'shilgan sana */}
                                    <TableCell className="hidden xl:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {student.created_at ? new Date(student.created_at).toLocaleDateString() : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(student)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {sortedStudents.map((student) => {
                        const displayName = student.full_name || `Talaba #${student.id}`;
                        return (
                            <CatalogCard
                                key={student.id}
                                id={student.id}
                                title={displayName}
                                subtitle={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <span>User ID: #{student.user_id}</span>
                                        {student.phone && <span>· {student.phone}</span>}
                                        {student.student_status && (
                                            <span className="badge badge-primary text-[10px]">{student.student_status}</span>
                                        )}
                                    </span>
                                }
                                metrics={[
                                    { label: 'Talaba ID', value: student.student_id_number || '—' },
                                    { label: 'Sana', value: student.created_at ? new Date(student.created_at).toLocaleDateString() : '—' },
                                ]}
                                actions={renderActions(student)}
                                onClick={() => handleViewStudent(student)}
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
                    isLoading={isStudentsLoading}
                />
            )}

            {/* Modals */}
            <ConfirmDialog
                isOpen={!!studentToDelete}
                onClose={() => {
                    setStudentToDelete(null);
                    setCascadeWarnings([]);
                }}
                onConfirm={handleDelete}
                title="Talabani o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu talabani o'chirish quyidagi ma'lumotlarni ham o'chiradi:
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
                        `Siz haqiqatan ham "${studentToDelete?.full_name}" talabasini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
                variant="danger"
            />

            <HemisImportModal
                isOpen={isImportModalOpen}
                onClose={() => {
                    setIsImportModalOpen(false);
                    refetch();
                }}
            />

            <ChangeGroupModal
                isOpen={!!studentToChangeGroup}
                onClose={() => {
                    setStudentToChangeGroup(null);
                    refetch();
                }}
                student={studentToChangeGroup}
            />
        </div>
    );
};

const StudentDetail = ({ student, onBack }: { student: Student; onBack: () => void }) => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;
    const {
        data: resultsData,
        isLoading: isResultsLoading,
        isError: isResultsError,
        refetch,
    } = useUserResults(student.user_id, currentPage, pageSize);

    const results: Result[] = resultsData?.results || [];
    const totalPages = resultsData ? Math.ceil(resultsData.total / pageSize) : 1;

    const renderResultScore = (result: Result) => (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                    {result.grade.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ 5</span>
                </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{result.correct_answers}</span>
                </div>
                <div className="flex items-center gap-1 text-destructive font-semibold">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{result.wrong_answers}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header & Back Button */}
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5 font-semibold">
                    <ArrowLeft className="h-4 w-4" />
                    <span>Orqaga</span>
                </Button>
                <div>
                    <h1 className="page-title">{student.full_name || `Talaba #${student.id}`}</h1>
                    <p className="text-xs text-muted-foreground">User ID: #{student.user_id}</p>
                </div>
            </div>

            {/* Information Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ScanFace className="h-4 w-4 text-primary" />
                            <span>Shaxsiy ma'lumotlar</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">F.I.SH:</span>
                            <span className="font-semibold text-foreground">{student.full_name || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">User ID:</span>
                            <span className="font-mono font-semibold text-foreground">#{student.user_id}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Telefon:</span>
                            <span className="font-mono text-foreground">{student.phone || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Manzil:</span>
                            <span className="text-foreground text-right">{student.address || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="font-medium text-muted-foreground">Talaba raqami:</span>
                            <span className="font-mono text-foreground">{student.student_id_number || '—'}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Award className="h-4 w-4 text-purple-500" />
                            <span>Akademik ma'lumotlar</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Fakultet:</span>
                            <span className="font-semibold text-foreground">{student.faculty || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Mutaxassislik:</span>
                            <span className="text-foreground">{student.specialty || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Bosqich:</span>
                            <span className="badge badge-primary">{student.level ? `${student.level}-kurs` : '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Semestr:</span>
                            <span className="font-semibold text-foreground">{student.semester || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="font-medium text-muted-foreground">O'rtacha ball (GPA):</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {student.avg_gpa ?? '—'}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Test Results */}
            <Card>
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-base">Test Natijalari</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    {isResultsError ? (
                        <ErrorState onRetry={() => refetch()} />
                    ) : isResultsLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : results.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            Ushbu talaba uchun test natijalari mavjud emas.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Table className="min-w-full border-separate border-spacing-0">
                                <TableHeader className="bg-muted/40">
                                    <TableRow className="border-b border-border/80">
                                        <TableHead className="font-bold text-xs">Test Nomi</TableHead>
                                        <TableHead className="font-bold text-xs">Fan</TableHead>
                                        <TableHead className="font-bold text-xs hidden md:table-cell">Sana</TableHead>
                                        <TableHead className="font-bold text-xs">Natija</TableHead>
                                        <TableHead className="text-right font-bold text-xs pr-4">Batafsil</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((result) => (
                                        <TableRow
                                            key={result.id}
                                            className="hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50 cursor-pointer"
                                            onClick={() =>
                                                navigate(
                                                    `/results/answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`
                                                )
                                            }
                                        >
                                            <TableCell className="font-medium text-foreground">
                                                <span>{result.quiz?.title || '-'}</span>
                                                {result.quiz?.attempt === 2 && (
                                                    <span className="ml-2 badge badge-primary text-[10px]">
                                                        Qayta ishlash
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground capitalize">
                                                {result.subject?.name || '-'}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                                                {new Date(result.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>{renderResultScore(result)}</TableCell>
                                            <TableCell className="text-right pr-4">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-xs text-primary hover:bg-primary/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(
                                                            `/results/answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`
                                                        );
                                                    }}
                                                >
                                                    Javoblar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {totalPages > 1 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                    isLoading={isResultsLoading}
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default StudentsPage;

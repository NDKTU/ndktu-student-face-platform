// import { /* toast */ } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { type Student } from '@/services/studentService';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
    // Pencil,
    // Trash2,
    // FolderEdit,
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
import { useStudents, useStudent, /* useDeleteStudent */ } from '@/hooks/useStudents';
import { useUserResults } from '@/hooks/useResults';
import { useGroups } from '@/hooks/useGroups';
import { useCatalogView } from '@/hooks/useCatalogView';
import { useAuth } from '@/context/AuthContext';
// import { /* ConfirmDialog */ } from '@/components/ui/ConfirmDialog';
// import { /* ChangeGroupModal */ } from '@/components/ChangeGroupModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import type { Result } from '@/services/resultService';
import { formatDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { formatGpa } from '@/utils/gpa';

type SortField = 'name' | 'user_id' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const StudentsPage = () => {
    const { t } = useTranslation();
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [studentToChangeGroup, setStudentToChangeGroup] = useState<Student | null>(null);
    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,
    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.
    // Telefonda (md dan past) jadval oʻrniga kartochkalar: hooknig oʻzi
    // ekran kengligiga qarab tanlaydi (hooks/useCatalogView.ts).
    const displayMode = useCatalogView();

    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Guruhlar ro'yxatidan «Talabalarni ko'rish» shu yerga `?group_id=N` bilan
    // olib keladi. Parametrni o'qimasak, admin butun universitet ro'yxatini
    // ko'rardi va o'zi qaytadan guruh tanlashi kerak bo'lardi.
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedGroup, setSelectedGroup] = useState<string>(
        () => searchParams.get('group_id') || 'all',
    );
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const pageSize = 15;
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const deleteMutation = useDeleteStudent();

    const activeFilterCount = (selectedGroup !== 'all' ? 1 : 0) + (searchTerm ? 1 : 0);

    const handleClearFilters = () => {
        setSelectedGroup('all');
        setSearchTerm('');
        setCurrentPage(1);
        // `group_id` URL'da ham qoladi — tozalanmasa, sahifa yangilanganda
        // filtr qaytib kelardi.
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('group_id');
                return next;
            },
            { replace: true },
        );
    };

    const parsedGroup = selectedGroup !== 'all' && selectedGroup ? parseInt(selectedGroup, 10) : undefined;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Sahifa ochiq turganda URL o'zgarishi mumkin: guruhlar ro'yxatidan boshqa
    // guruh bosilsa, React marshrutni almashtiradi-yu, komponentni qaytadan
    // yaratmaydi — boshlang'ich holat esa faqat bir marta hisoblanadi.
    useEffect(() => {
        const fromUrl = searchParams.get('group_id') || 'all';
        setSelectedGroup((prev) => (prev === fromUrl ? prev : fromUrl));
    }, [searchParams]);

    const { hasPermission } = useAuth();
    const canReadGroup = hasPermission('read:group');

    const {
        data: studentsData,
        isLoading: isStudentsLoading,
        isError: isStudentsError,
        refetch,
    } = useStudents(currentPage, pageSize, debouncedSearch, undefined, parsedGroup, true, {
        // Saralash serverda: sahifaning 15 qatorini tartiblash butun
        // ro'yxatni tartibsiz qoldirardi.
        sort_by: sortField,
        order: sortOrder,
    });

    // Universitetda 850 dan ortiq guruh bor: 200 talik ro'yxatda ko'pchiligi
    // yo'q edi, va `?group_id=N` bilan kelgan guruhning nomi tanlagichda
    // ko'rinmasdi — filtr ishlar, lekin admin qaysi guruh ekanini bilmasdi.
    const { data: groupsData } = useGroups(1, 1000, '', undefined, undefined, canReadGroup);

    const students = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;
    const totalCount = studentsData?.total ?? students.length;

    // URL'dagi `?student=<id>` — batafsil ko'rinish manbai.
    const detailId = Number(searchParams.get('student')) || 0;
    const { data: detailStudent } = useStudent(detailId);

    // Guruh nomi API javobida yo'q (faqat `group_id`), shuning uchun u
    // allaqachon yuklangan guruhlar ro'yxatidan olinadi.
    const groupNameById = useMemo(
        () => new Map((groupsData?.groups || []).map((g) => [g.id, g.name])),
        [groupsData],
    );

    const groupOptions = useMemo(() => {
        const list = (groupsData?.groups || []).map((g) => ({ value: String(g.id), label: g.name }));
        return [{ value: 'all', label: t('Barcha guruhlar') }, ...list];
    }, [groupsData, t]);

    const handleSort = (field: SortField) => {
        // Tartib o'zgargach birinchi sahifaga qaytamiz: aks holda
        // yangi tartibning o'rtasidan boshlab ko'rinardi.
        setCurrentPage(1);
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // Batafsil ko'rinish URL'da: ilgari u faqat mahalliy holatda edi, shuning
    // uchun brauzerning «Orqaga» tugmasi kartochkani umuman ko'rmay, undan
    // oldingi manzilga sakrardi. Endi ochilish `?student=<id>` ni qo'shadi —
    // «Orqaga» ro'yxatga qaytaradi, havolani ulashsa ham o'sha talaba ochiladi.
    const handleViewStudent = (student: Student) => {
        setSelectedStudent(student);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('student', String(student.id));
            return next;
        });
    };

    const handleBackToList = () => {
        setSelectedStudent(null);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('student');
            return next;
        });
    };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleDelete = () => {
//         if (!studentToDelete) return;
//         deleteMutation.mutate(
//             { id: studentToDelete.id, force: cascadeWarnings.length > 0 },
//             {
//                 onSuccess: () => {
//                     toast.success(t("Talaba o'chirildi"));
//                     setStudentToDelete(null);
//                     setCascadeWarnings([]);
//                     refetch();
//                 },
//                 onError: (error: any) => {
//                     if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
//                         setCascadeWarnings(error.response.data.detail.warnings || []);
//                     } else {
//                         toast.error(t("Talabani o'chirishda xatolik yuz berdi"));
//                         setStudentToDelete(null);
//                         setCascadeWarnings([]);
//                     }
//                 },
//             }
//         );
//     };

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
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
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
                    title={t("Tahrirlash")}
                    onClick={(e) => {
                        e.stopPropagation();
                        toast.info(t("Tahrirlash funksiyasi tez orada qo'shiladi"));
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
                    title={t("O'chirish")}
                    onClick={(e) => {
                        e.stopPropagation();
                        setStudentToDelete(student);
                        setCascadeWarnings([]);
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
            */}
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

    if (detailId) {
        // To'g'ridan-to'g'ri havola bilan kelinganda ro'yxatda bunday talaba
        // bo'lmasligi mumkin, shuning uchun id bo'yicha alohida so'rov bor.
        const student = selectedStudent?.id === detailId ? selectedStudent : detailStudent;
        if (student) {
            return (
                <StudentDetail
                    student={student}
                    groupName={groupNameById.get(student.group_id)}
                    onBack={handleBackToList}
                />
            );
        }
        return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
    }

    return (
        <div className="space-y-5">
            {/* Top Sub-Navigation Tabs */}

            {/* Breadcrumb Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Foydalanuvchilar', onClick: () => {} }, { label: t('Talabalar') }]}
                title={t("Talabalar")}
                description={t("Barcha fakultet va guruh talabalari, HEMIS integratsiyasi va test natijalari")}
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={t("Talaba F.I.SH yoki ID bo'yicha qidirish...")}
                totalCount={totalCount}
                totalLabel={t("Talabalar")}
                activeFilterCount={activeFilterCount}
                onClearFilters={handleClearFilters}
                extraFilters={
                    <PermissionGate permission="read:group">
                        <div className="w-full sm:w-[260px]">
                            <Combobox
                                options={groupOptions}
                                value={selectedGroup}
                                onChange={(val) => {
                                    setSelectedGroup(val);
                                    setCurrentPage(1);
                                    // URL bilan bir xilda ushlaymiz: sahifani
                                    // yangilaganda ham, havolani ulashganda ham
                                    // o'sha guruh ochiladi.
                                    setSearchParams(
                                        (prev) => {
                                            const next = new URLSearchParams(prev);
                                            if (val && val !== 'all') next.set('group_id', val);
                                            else next.delete('group_id');
                                            return next;
                                        },
                                        { replace: true },
                                    );
                                }}
                                placeholder={t("Guruh bo'yicha saralash")}
                            />
                        </div>
                    </PermissionGate>
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
            ) : students.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title={t("Talabalar topilmadi")}
                        description={
                            searchTerm || selectedGroup !== 'all'
                                ? t("Tanlangan mezonlarga mos talaba topilmadi.")
                                : t("Hozircha talaba qo'shilmagan.")
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
                                    <span>{t('Talaba F.I.SH')}</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            {/* «User ID» va «Telefon» ustunlari 2026-09-11 da yashirildi (faqat frontend; maʼlumot javobda joyida qoladi).
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
                            */}
                            <TableHead className="font-bold text-xs hidden lg:table-cell max-w-[200px]">Manzil</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden xl:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>{t("Qo'shilgan sana")}</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">{t('Amallar')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students.map((student, index) => {
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
                                            <PersonAvatar
                                                id={student.id}
                                                name={displayName}
                                                src={student.image_path}
                                                className="h-9 w-9"
                                            />
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

                                    {/* User ID va Telefon — ustunlar 2026-09-11 da yashirildi
                                        (faqat frontend; maʼlumot javobda joyida qoladi).
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground border border-border/80">
                                            #{student.user_id}
                                        </span>
                                    </TableCell>

                                    Telefon:
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {student.phone || '—'}
                                        </span>
                                    </TableCell>
                                    */}

                                    {/* Manzil */}
                                    <TableCell className="hidden lg:table-cell max-w-[200px] truncate">
                                        <span className="text-xs text-muted-foreground" title={student.address || ''}>
                                            {student.address || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Qo'shilgan sana */}
                                    <TableCell className="hidden xl:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {formatDate(student.created_at)}
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
                    {students.map((student) => {
                        const displayName = student.full_name || `Talaba #${student.id}`;
                        return (
                            <CatalogCard
                                key={student.id}
                                id={student.id}
                                title={displayName}
                                subtitle={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {/* User ID va telefon yashirilgan (2026-09-11) — jadvalda ham shunday.
                                        <span>User ID: #{student.user_id}</span>
                                        {student.phone && <span>· {student.phone}</span>}
                                        */}
                                        {student.student_status && (
                                            <span className="badge badge-primary text-[10px]">{student.student_status}</span>
                                        )}
                                    </span>
                                }
                                metrics={[
                                    { label: t('Talaba ID'), value: student.student_id_number || '—' },
                                    { label: t('Sana'), value: formatDate(student.created_at) },
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
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <ConfirmDialog
                isOpen={!!studentToDelete}
                onClose={() => {
                    setStudentToDelete(null);
                    setCascadeWarnings([]);
                }}
                onConfirm={handleDelete}
                title={t("Talabani o'chirish")}
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
                confirmText={cascadeWarnings.length > 0 ? t("Ha, majburiy o'chirish") : t("O'chirish")}
                cancelText={t("Bekor qilish")}
                variant="danger"
            />
            */}

            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <ChangeGroupModal
                isOpen={!!studentToChangeGroup}
                onClose={() => {
                    setStudentToChangeGroup(null);
                    refetch();
                }}
                student={studentToChangeGroup}
            />
            */}
        </div>
    );
};

const StudentDetail = ({
    student,
    groupName,
    onBack,
}: { student: Student; groupName?: string; onBack: () => void }) => {
    const { t } = useTranslation();
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
                {/* Surat HEMIS'dan keladi va yuz tekshiruvida etalon sifatida
                    ishlatiladi — uni ko'rsatmaslik xodimga «bu kimning surati
                    bilan solishtirilyapti?» degan savolga javob bermasdi. */}
                <PersonAvatar
                    id={student.id}
                    name={student.full_name || `Talaba #${student.id}`}
                    src={student.image_path}
                    className="h-14 w-14 text-base"
                />
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
                            <span className="font-medium text-muted-foreground">Guruh:</span>
                            <span className="font-semibold text-foreground">{groupName || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Bosqich:</span>
                            {/* `level` bekenddan allaqachon «3-kurs» ko'rinishida
                                keladi — qo'shimcha `-kurs` «3-kurs-kurs» berardi. */}
                            <span className="badge badge-primary">{student.level || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                            <span className="font-medium text-muted-foreground">Semestr:</span>
                            <span className="font-semibold text-foreground">{student.semester || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="font-medium text-muted-foreground">O'rtacha ball (GPA):</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {formatGpa(student.avg_gpa)}
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
                                        <TableHead className="font-bold text-xs hidden md:table-cell">{t('Sana')}</TableHead>
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
                                                {formatDate(result.created_at)}
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

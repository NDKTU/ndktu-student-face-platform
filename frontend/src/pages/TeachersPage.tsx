// import { /* toast */ } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    // Plus,
    // Pencil,
    // Trash2,
    // BookOpen,
    // UsersRound,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    ArrowRight,
    // GraduationCap, — «Kurslar» ustuni bilan birga yashirildi (2026-09-11)
} from 'lucide-react';
// import { /* ConfirmDialog */ } from '@/components/ui/ConfirmDialog';
import { useTeachers, useTeacher, /* useDeleteTeacher */ } from '@/hooks/useTeachers';
import { useKafedras } from '@/hooks/useReferenceData';
import { useCatalogView } from '@/hooks/useCatalogView';
import type { Teacher } from '@/services/teacherService';
import { TeacherDetail } from '@/components/teachers/TeacherDetail';
// import { /* TeacherModal */ } from '@/components/teachers/TeacherModal';
// import { /* TeacherGroupModal */ } from '@/components/teachers/TeacherGroupModal';
// import { /* TeacherSubjectModal */ } from '@/components/teachers/TeacherSubjectModal';
// import { /* PermissionGate */ } from '@/components/auth/PermissionGate';
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
import { formatDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSearchParams } from 'react-router-dom';
import { useUrlState, useUrlNumberState } from '@/hooks/useUrlState';

// Fabrika, konstanta emas: `t` modul darajasida mavjud emas, va til
// almashtirilganda ro'yxat qayta qurilishi kerak.
const courseFilterOptions = (t: TFunction) => [
    { value: 'all', label: t('Barchasi') },
    { value: 'with', label: t('Kursi borlar') },
    { value: 'without', label: t("Kursi yo'qlar") },
];

type SortField = 'name' | 'kafedra' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const TeachersPage = () => {
    const { t } = useTranslation();
    const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const detailId = Number(searchParams.get('teacher')) || 0;
    const { data: detailTeacher } = useTeacher(detailId);
    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,
    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.
    // Telefonda (md dan past) jadval oʻrniga kartochkalar: hooknig oʻzi
    // ekran kengligiga qarab tanlaydi (hooks/useCatalogView.ts).
    const displayMode = useCatalogView();

    // Filtrlar, saralash va sahifa URL'da — yangilash va «Orqaga» ularni
    // saqlaydi, kesimni havola qilib yuborsa bo'ladi.
    const [currentPage, setCurrentPage] = useUrlNumberState('page', 1);
    const [selectedKafedraFilter, setSelectedKafedraFilter] = useUrlState<string>('kafedra', 'all');
    const [coursesFilter, setCoursesFilter] = useUrlState<'all' | 'with' | 'without'>('courses', 'all');
    const [searchTerm, setSearchTerm] = useUrlState<string>('q', '');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortField, setSortField] = useUrlState<SortField>('sort', 'name');
    const [sortOrder, setSortOrder] = useUrlState<SortOrder>('order', 'asc');

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [isModalOpen, setIsModalOpen] = useState(false);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    // Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
//     const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    // Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
//     const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
    // Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
//     const [teacherToAssign, setTeacherToAssign] = useState<Teacher | null>(null);

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
    } = useTeachers(currentPage, pageSize, debouncedSearch, true, kafedraIdNum, hasCourses, {
        sort_by: sortField,
        order: sortOrder,
    });

    const { data: kafedrasData } = useKafedras(1, 200);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const deleteTeacherMutation = useDeleteTeacher();

    const teachers = teachersData?.teachers || [];
    const totalPages = teachersData ? Math.ceil(teachersData.total / pageSize) : 1;
    const totalCount = teachersData?.total ?? teachers.length;
    const kafedras = kafedrasData?.kafedras || [];

    const kafedraOptions = useMemo(() => {
        const list = kafedras.map((k) => ({ value: String(k.id), label: k.name }));
        return [{ value: 'all', label: t('Barcha kafedralar') }, ...list];
    }, [kafedras, t]);

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

    // Batafsil ko'rinish URL'da (`?teacher=<id>`), mahalliy holatda emas:
    // aks holda brauzerning «Orqaga» tugmasi kartochkani o'tkazib yuborardi
    // va havolani ulashib bo'lmasdi.
    const handleViewTeacher = (teacher: Teacher) => {
        setSelectedTeacher(teacher);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('teacher', String(teacher.id));
            return next;
        });
    };

    const handleBackToList = () => {
        setSelectedTeacher(null);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('teacher');
            return next;
        });
    };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleEditClick = (teacher: Teacher, e: React.MouseEvent) => {
//         e.stopPropagation();
//         setSelectedTeacher(teacher);
//         setIsModalOpen(true);
//     };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleDeleteClick = (teacher: Teacher, e: React.MouseEvent) => {
//         e.stopPropagation();
//         setTeacherToDelete(teacher);
//         setCascadeWarnings([]);
//         setIsDeleteModalOpen(true);
//     };

    // Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
//     const handleAssignGroupsClick = (teacher: Teacher, e: React.MouseEvent) => {
//         e.stopPropagation();
//         setTeacherToAssign(teacher);
//         setIsGroupModalOpen(true);
//     };

    // Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
//     const handleAssignSubjectsClick = (teacher: Teacher, e: React.MouseEvent) => {
//         e.stopPropagation();
//         setTeacherToAssign(teacher);
//         setIsSubjectModalOpen(true);
//     };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleConfirmDelete = async () => {
//         if (!teacherToDelete) return;
//         deleteTeacherMutation.mutate(
//             { id: teacherToDelete.id, force: cascadeWarnings.length > 0 },
//             {
//                 onSuccess: () => {
//                     toast.success(t("O'qituvchi o'chirildi"));
//                     setIsDeleteModalOpen(false);
//                     setTeacherToDelete(null);
//                     setCascadeWarnings([]);
//                     refetch();
//                 },
//                 onError: (error: any) => {
//                     if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
//                         setCascadeWarnings(error.response.data.detail.warnings || []);
//                     } else {
//                         toast.error(t("O'chirishda xatolik yuz berdi"));
//                         setIsDeleteModalOpen(false);
//                         setTeacherToDelete(null);
//                         setCascadeWarnings([]);
//                     }
//                 },
//             }
//         );
//     };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleSuccess = () => {
//         toast.success(t("O'qituvchi saqlandi"));
//         setIsModalOpen(false);
//         setSelectedTeacher(null);
//         refetch();
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

    const renderActions = (teacher: Teacher) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
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
            */}
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <PermissionGate permission="update:teacher">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                    title={t("Tahrirlash")}
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
                    title={t("O'chirish")}
                    onClick={(e) => handleDeleteClick(teacher, e)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
            */}
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

    if (detailId) {
        // Havola bilan to'g'ridan-to'g'ri kelinganda ro'yxatda bunday
        // o'qituvchi bo'lmasligi mumkin — id bo'yicha alohida so'rov.
        const teacher = selectedTeacher?.id === detailId ? selectedTeacher : detailTeacher;
        if (teacher) {
            return <TeacherDetail teacher={teacher} onBack={handleBackToList} />;
        }
        return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
    }

    return (
        <div className="space-y-5">
            {/* Top Sub-Navigation Tabs */}

            {/* Breadcrumbs Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Foydalanuvchilar', onClick: () => {} }, { label: "O'qituvchilar" }]}
                title={t("Professor-O'qituvchilar")}
                description={t("Universitet o'qituvchilar tarkibi, kafedralar, biriktirilgan fan va guruhlar")}
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={t("O'qituvchi F.I.SH bo'yicha qidirish...")}
                totalCount={totalCount}
                totalLabel="O'qituvchilar"
                activeFilterCount={
                    (selectedKafedraFilter !== 'all' ? 1 : 0) +
                    (coursesFilter !== 'all' ? 1 : 0) +
                    (searchTerm ? 1 : 0)
                }
                onClearFilters={() => {
                    setSelectedKafedraFilter('all');
                    setCoursesFilter('all');
                    setSearchTerm('');
                    setCurrentPage(1);
                }}
                extraFilters={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-full sm:w-[260px]">
                            <Combobox
                                options={kafedraOptions}
                                value={selectedKafedraFilter}
                                onChange={(val) => {
                                    setSelectedKafedraFilter(val);
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Kafedra bo'yicha saralash")}
                            />
                        </div>
                        <div className="w-full sm:w-[210px]">
                            <Combobox
                                options={courseFilterOptions(t)}
                                value={coursesFilter}
                                onChange={(val) => {
                                    setCoursesFilter(val as 'all' | 'with' | 'without');
                                    setCurrentPage(1);
                                }}
                                placeholder={t("Kurslar bo'yicha")}
                            />
                        </div>
                    </div>
                }
                /* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
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
                            <span>{t("Qo'shish")}</span>
                        </Button>
                    </PermissionGate>
                }
                */
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
            ) : teachers.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title={t("O'qituvchilar topilmadi")}
                        description={
                            searchTerm || selectedKafedraFilter !== 'all' || coursesFilter !== 'all'
                                ? t("Tanlangan filtrlarga mos o'qituvchi topilmadi.")
                                : t("Hozircha o'qituvchi qo'shilmagan.")
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
                                    <span>{t("O'qituvchi F.I.SH")}</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead
                                onClick={() => handleSort('kafedra')}
                                className="group cursor-pointer select-none font-bold text-xs hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>{t('Kafedra')}</span>
                                    {renderSortIcon('kafedra')}
                                </div>
                            </TableHead>
                            {/* «Kurslar» ustuni 2026-09-11 da yashirildi (faqat frontend; maʼlumot javobda joyida qoladi).
                            <TableHead className="font-bold text-xs">Kurslar</TableHead>
                            */}
                            <TableHead className="font-bold text-xs hidden md:table-cell">Foydalanuvchi</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden lg:table-cell hover:text-foreground"
                            >
                                <div className="flex items-center">
                                    <span>{t('Yaratilgan sana')}</span>
                                    {renderSortIcon('created_at')}
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold text-xs">{t('Holati')}</TableHead>
                            <TableHead className="text-right font-bold text-xs pr-5">{t('Amallar')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {teachers.map((teacher, index) => {
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

                                    {/* Kurslar — ustun 2026-09-11 da yashirildi
                                        (faqat frontend; maʼlumot javobda joyida qoladi).
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
                                            <span className="text-xs text-muted-foreground italic">{t("Kurs yo'q")}</span>
                                        )}
                                    </TableCell>
                                    */}

                                    {/* Foydalanuvchi */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {teacher.user?.username || '—'}
                                        </span>
                                    </TableCell>

                                    {/* Yaratilgan sana */}
                                    <TableCell className="hidden lg:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {formatDate(teacher.created_at)}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="h-3 w-3" />
                                            <span>{t('Faol')}</span>
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
                    {teachers.map((teacher) => {
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
                                            <span className="text-xs text-muted-foreground">{t("Kafedra yo'q")}</span>
                                        )}
                                        <ExternalSourceBadge row={teacher} />
                                        <InactiveBadge row={teacher} />
                                    </span>
                                }
                                metrics={[
                                    { label: 'Login', value: teacher.user?.username || '—' },
                                    { label: t('Sana'), value: formatDate(teacher.created_at) },
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
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <TeacherModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                teacher={selectedTeacher}
                onSuccess={handleSuccess}
            />
            */}

            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setTeacherToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title={t("O'qituvchini o'chirish")}
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
                confirmText={cascadeWarnings.length > 0 ? t("Ha, majburiy o'chirish") : t("O'chirish")}
                cancelText={t("Bekor qilish")}
            />
            */}

            {/* Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
            <TeacherGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                teacher={teacherToAssign}
            />
            */}

            {/* Guruh/fan biriktirish 2026-09-11 da frontenddan olib tashlandi (backend endpointlari joyida qoldi).
            <TeacherSubjectModal
                isOpen={isSubjectModalOpen}
                onClose={() => setIsSubjectModalOpen(false)}
                teacher={teacherToAssign}
            />
            */}
        </div>
    );
};

export default TeachersPage;

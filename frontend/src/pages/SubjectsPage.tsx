// import { /* toast */ } from 'sonner';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import type { Subject } from '@/services/subjectService';
import { Button } from '@/components/ui/Button';
// import { /* ConfirmDialog */ } from '@/components/ui/ConfirmDialog';
import {
    // Plus,
    // Pencil,
    // Trash2,
    ArrowRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { ExternalSourceBadge, InactiveBadge, /* isExternal */ } from '@/components/common/ExternalSourceBadge';
// import { /* Modal */ } from '@/components/ui/Modal';
// import { /* Input */ } from '@/components/ui/Input';
// import { /* useForm */ } from 'react-hook-form';
// import { /* z */ } from 'zod';
// import { /* zodResolver */ } from '@hookform/resolvers/zod';
// import { /* PermissionGate */ } from '@/components/auth/PermissionGate';
import { OrganizationBreadcrumbs } from '@/components/faculty/OrganizationBreadcrumbs';
// Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
// import { HiddenBadge, ShowHiddenSwitch, VisibilityButton } from '@/components/common/VisibilityControls';
import { OrganizationToolbar } from '@/components/faculty/OrganizationToolbar';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useSubjects, /* useCreateSubject, */ /* useUpdateSubject, */ /* useDeleteSubject */ } from '@/hooks/useSubjects';
import { useCatalogView } from '@/hooks/useCatalogView';
import { initialsOf, tileFor } from '@/lib/avatarTiles';
import { cn } from '@/lib/utils';

// EPOS maʼlumoti: fan yaratish/tahrirlash oynasi kommentga olindi (2026-09-11),
// shu bilan uning formasi sxemasi ham kerak emas.
// const subjectSchema = z.object({
//     name: z.string().min(1, 'Fan nomi kiritilishi shart'),
// });
//
// type SubjectFormValues = z.infer<typeof subjectSchema>;
type SortField = 'id' | 'name' | 'created_at';
type SortOrder = 'asc' | 'desc';

export const SubjectsPage = () => {
    const navigate = useNavigate();
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [isModalOpen, setIsModalOpen] = useState(false);
    // Yashirilganlarni koʻrsatish — faqat adminda maʼnoga ega.
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
//     const [showHidden, setShowHidden] = useState(false);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Ko'rinish almashtirgichi asboblar panelidan olib tashlangan,
    // shuning uchun o'zgartiruvchi yo'q — qiymat boshlang'ich holatda qoladi.
    // Telefonda (md dan past) jadval oʻrniga kartochkalar: hooknig oʻzi
    // ekran kengligiga qarab tanlaydi (hooks/useCatalogView.ts).
    const viewMode = useCatalogView();

    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const pageSize = 15;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const {
        data: subjectsData,
        isLoading: isSubjectsLoading,
        isError: isSubjectsError,
        refetch,
    } = useSubjects(currentPage, pageSize, debouncedSearch, undefined, true, {
        sort_by: sortField,
        order: sortOrder,
    });

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const deleteSubjectMutation = useDeleteSubject();

    const subjects = subjectsData?.subjects || [];
    const totalPages = subjectsData ? Math.ceil(subjectsData.total / pageSize) : 1;
    const totalCount = subjectsData?.total ?? subjects.length;

    const handleSort = (field: SortField) => {
        // Tartib o'zgargach birinchi sahifaga qaytamiz.
        setCurrentPage(1);
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleDeleteClick = (subject: Subject) => {
//         setSubjectToDelete(subject);
//         setCascadeWarnings([]);
//         setIsDeleteModalOpen(true);
//     };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleConfirmDelete = async () => {
//         if (!subjectToDelete) return;
//
//         deleteSubjectMutation.mutate(
//             { id: subjectToDelete.id, force: cascadeWarnings.length > 0 },
//             {
//                 onSuccess: () => {
//                     toast.success("Fan o'chirildi");
//                     setIsDeleteModalOpen(false);
//                     setSubjectToDelete(null);
//                     setCascadeWarnings([]);
//                     refetch();
//                 },
//                 onError: (error: any) => {
//                     if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
//                         setCascadeWarnings(error.response.data.detail.warnings || []);
//                     } else {
//                         toast.error("O'chirishda xatolik yuz berdi");
//                         setIsDeleteModalOpen(false);
//                         setSubjectToDelete(null);
//                         setCascadeWarnings([]);
//                     }
//                 },
//             }
//         );
//     };

    // EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
//     const handleSuccess = (_savedSubject?: Subject) => {
//         setIsModalOpen(false);
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

    const renderActions = (subject: Subject) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            {!isExternal(subject) && (
                <>
                    <PermissionGate permission="update:subject">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Tahrirlash"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSubject(subject);
                                setIsModalOpen(true);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:subject">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="O'chirish"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(subject);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </>
            )}
            */}
            {/* Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
            <VisibilityButton
                entity="subject"
                row={subject}
                label={subject.name}
                className="h-8 w-8 p-0"
            />
            */}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 gap-1"
                title="Savollarni ko'rish"
                onClick={() => navigate(`/questions?subject_id=${subject.id}`)}
            >
                <span>Savollar</span>
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Unified Breadcrumbs Header */}
            <OrganizationBreadcrumbs
                items={[{ label: 'Fanlar', onClick: () => {} }]}
                title="O'quv Fanlari"
                description="Universitet o'quv fanlari katalogi, test savollari va darslar"
            />

            {/* Controls Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Fan nomi bo'yicha qidirish..."
                totalCount={totalCount}
                totalLabel="Fanlar"
                /* Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
                extraFilters={<ShowHiddenSwitch value={showHidden} onChange={setShowHidden} />}
                */
                /* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
                actions={
                    <PermissionGate permission="create:subject">
                        <Button
                            size="sm"
                            onClick={() => {
                                setSelectedSubject(null);
                                setIsModalOpen(true);
                            }}
                            className="h-9 gap-1.5 font-semibold shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Qo'shish</span>
                        </Button>
                    </PermissionGate>
                }
                */
            />

            {/* Content */}
            {isSubjectsError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : isSubjectsLoading ? (
                viewMode === 'table' ? (
                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <CatalogGrid>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                        ))}
                    </CatalogGrid>
                )
            ) : subjects.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8">
                    <TableEmpty
                        colSpan={6}
                        title="Fanlar topilmadi"
                        description={
                            searchTerm
                                ? "Qidiruv mezonlariga mos fan topilmadi."
                                : "Hozircha tizimda fan qo'shilmagan."
                        }
                    />
                </div>
            ) : viewMode === 'table' ? (
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
                                    <span>Fan Nomi</span>
                                    {renderSortIcon('name')}
                                </div>
                            </TableHead>
                            <TableHead className="w-[120px] text-center font-bold text-xs">Kodi</TableHead>
                            <TableHead
                                onClick={() => handleSort('created_at')}
                                className="group cursor-pointer select-none font-bold text-xs hidden md:table-cell hover:text-foreground"
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
                        {subjects.map((subject, index) => {
                            const rowNumber = (currentPage - 1) * pageSize + index + 1;
                            const isActive = subject.is_active !== false;

                            return (
                                <TableRow
                                    key={subject.id}
                                    onClick={() => navigate(`/questions?subject_id=${subject.id}`)}
                                    className="group cursor-pointer transition-colors duration-150 hover:bg-primary/[0.04] dark:hover:bg-primary/10 border-b border-border/50"
                                >
                                    {/* # Row Index */}
                                    <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground w-[50px]">
                                        {rowNumber}
                                    </TableCell>

                                    {/* Fan Nomi */}
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-xs',
                                                    tileFor(subject.id)
                                                )}
                                            >
                                                {initialsOf(subject.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                                                    {subject.name}
                                                </p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                    <ExternalSourceBadge row={subject} />
                                                    <InactiveBadge row={subject} />
                                                    {/* Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
                                                    <HiddenBadge row={subject} />
                                                    */}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* Kodi */}
                                    <TableCell className="text-center w-[120px]">
                                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground border border-border/80">
                                            {subject.external_source ? `ID: ${subject.id}` : `FAN-${subject.id}`}
                                        </span>
                                    </TableCell>

                                    {/* Yaratilgan sana */}
                                    <TableCell className="hidden md:table-cell">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {subject.created_at ? new Date(subject.created_at).toLocaleDateString() : '—'}
                                        </span>
                                    </TableCell>

                                    {/* Holati */}
                                    <TableCell className="text-center">
                                        {isActive ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>Faol</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                                                <XCircle className="h-3 w-3" />
                                                <span>Nofaol</span>
                                            </span>
                                        )}
                                    </TableCell>

                                    {/* Amallar */}
                                    <TableCell className="text-right pr-4">
                                        {renderActions(subject)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                /* Grid / Card View */
                <CatalogGrid>
                    {subjects.map((subject) => (
                        <CatalogCard
                            key={subject.id}
                            id={subject.id}
                            title={subject.name}
                            subtitle={
                                <span className="flex flex-wrap items-center gap-1.5">
                                    <ExternalSourceBadge row={subject} />
                                    <InactiveBadge row={subject} />
                                    {/* Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
                                    <HiddenBadge row={subject} />
                                    */}
                                </span>
                            }
                            metrics={[
                                { label: 'Fan ID', value: `#${subject.id}` },
                                { label: 'Sana', value: subject.created_at ? new Date(subject.created_at).toLocaleDateString() : '—' },
                            ]}
                            actions={renderActions(subject)}
                            onClick={() => navigate(`/questions?subject_id=${subject.id}`)}
                        />
                    ))}
                </CatalogGrid>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isSubjectsLoading}
                />
            )}

            {/* Modal */}
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <SubjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                subject={selectedSubject}
                onSuccess={handleSuccess}
            />
            */}

            {/* Confirm Dialog */}
            {/* EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setCascadeWarnings([]);
                    setSubjectToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Fanni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-destructive font-medium">
                                Diqqat! Ushbu fanni o'chirish quyidagi ma'lumotlarni ham o'chiradi:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-destructive/80">
                                {cascadeWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">
                                Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!
                            </p>
                        </div>
                    ) : (
                        `Siz haqiqatan ham "${subjectToDelete?.name}" fanini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                    )
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
            */}
        </div>
    );
};

// EPOS/HEMIS maʼlumoti: 2026-09-11 da kommentga olindi (yaratish/tahrirlash/oʻchirish).
// const SubjectModal = ({
//     isOpen,
//     onClose,
//     subject,
//     onSuccess,
// }: {
//     isOpen: boolean;
//     onClose: () => void;
//     subject: Subject | null;
//     onSuccess: (subject?: Subject) => void;
// }) => {
//     const {
//         register,
//         handleSubmit,
//         reset,
//         formState: { errors },
//     } = useForm<SubjectFormValues>({
//         resolver: zodResolver(subjectSchema),
//         defaultValues: {
//             name: '',
//         },
//     });
//
//     const createMutation = useCreateSubject();
//     const updateMutation = useUpdateSubject();
//     const isSubmitting = createMutation.isPending || updateMutation.isPending;
//
//     useEffect(() => {
//         if (subject) {
//             reset({ name: subject.name });
//         } else {
//             reset({ name: '' });
//         }
//     }, [subject, reset]);
//
//     const onSubmit = (data: SubjectFormValues) => {
//         if (subject) {
//             updateMutation.mutate(
//                 { id: subject.id, data },
//                 {
//                     onSuccess: (updatedSubject) => {
//                         toast.success('Fan yangilandi');
//                         onSuccess(updatedSubject);
//                     },
//                     onError: () => {
//                         toast.error('Fanni yangilashda xatolik yuz berdi');
//                     },
//                 }
//             );
//         } else {
//             createMutation.mutate(data, {
//                 onSuccess: (newSubject) => {
//                     toast.success('Fan yaratildi');
//                     onSuccess(newSubject);
//                 },
//                 onError: () => {
//                     toast.error('Fan yaratishda xatolik yuz berdi');
//                 },
//             });
//         }
//     };
//
//     return (
//         <Modal
//             isOpen={isOpen}
//             onClose={onClose}
//             title={subject ? 'Fanni tahrirlash' : 'Yangi fan yaratish'}
//         >
//             <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
//                 <Input
//                     label="Fan nomi"
//                     {...register('name')}
//                     error={errors.name?.message}
//                     placeholder="masalan: Oliy matematika"
//                 />
//
//                 <div className="flex justify-end gap-2 pt-4 border-t border-border">
//                     <Button type="button" variant="outline" onClick={onClose}>
//                         Bekor qilish
//                     </Button>
//                     <Button type="submit" isLoading={isSubmitting}>
//                         {subject ? 'Yangilash' : 'Yaratish'}
//                     </Button>
//                 </div>
//             </form>
//         </Modal>
//     );
// };

export default SubjectsPage;

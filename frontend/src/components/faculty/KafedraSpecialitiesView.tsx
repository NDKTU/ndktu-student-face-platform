import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import { specialityService, type Speciality, type SpecialityStats } from '@/services/specialityService';
import { useDeleteSpeciality } from '@/hooks/useReferenceData';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';
import { CatalogCard, CatalogGrid } from '@/components/catalog/CatalogCard';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { SpecialityModal } from '@/components/speciality/SpecialityModal';
import { ExternalSourceBadge, InactiveBadge, isExternal } from '@/components/common/ExternalSourceBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

interface Props {
    faculty: Faculty;
    kafedra: Kafedra;
    onBack: () => void;
    onOpenSpeciality: (speciality: Speciality) => void;
}

export const KafedraSpecialitiesView = ({ faculty, kafedra, onBack, onOpenSpeciality }: Props) => {
    const [specialities, setSpecialities] = useState<Speciality[]>([]);
    const [stats, setStats] = useState<Map<number, SpecialityStats>>(new Map());
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selected, setSelected] = useState<Speciality | null>(null);
    const [toDelete, setToDelete] = useState<Speciality | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

    const deleteSpeciality = useDeleteSpeciality();

    const load = async () => {
        setIsLoading(true);
        setIsError(false);
        try {
            const [list, counters] = await Promise.all([
                specialityService.getSpecialities(1, 1000, undefined, kafedra.id),
                specialityService.getSpecialityStats(kafedra.id),
            ]);
            setSpecialities(list.specialities);
            setStats(new Map(counters.map((item) => [item.speciality_id, item])));
        } catch {
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void load(); }, [kafedra.id]);

    const filtered = useMemo(() => {
        const value = search.trim().toLocaleLowerCase('uz');
        return value ? specialities.filter((item) => item.name.toLocaleLowerCase('uz').includes(value)) : specialities;
    }, [search, specialities]);

    const closeDeleteDialog = () => {
        setToDelete(null);
        setCascadeWarnings([]);
    };

    const handleConfirmDelete = () => {
        if (!toDelete) return;
        deleteSpeciality.mutate({ id: toDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                toast.success("Mutaxassislik o'chirildi");
                closeDeleteDialog();
                void load();
            },
            onError: (error: any) => {
                // 409 с requires_confirmation — не ошибка, а запрос подтверждения:
                // у мутахассислика есть группы, они останутся без привязки.
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    const detail = error.response?.data?.detail;
                    toast.error(typeof detail === 'string' ? detail : "O'chirishda xatolik yuz berdi");
                    closeDeleteDialog();
                }
            },
        });
    };

    // Записи-зеркала EduPlan не редактируются: бэкенд отклонит правку,
    // а следующая синхронизация вернула бы прежние значения.
    const renderActions = (speciality: Speciality) => {
        if (isExternal(speciality)) return null;
        return (
            <div className="flex justify-end gap-1">
                <PermissionGate permission="update:speciality">
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(speciality); setIsModalOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                </PermissionGate>
                <PermissionGate permission="delete:speciality">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => { setToDelete(speciality); setCascadeWarnings([]); }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </PermissionGate>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <HierarchyHeader
                title={kafedra.name}
                description={`${faculty.name} · Mutaxassisliklar`}
                onBack={onBack}
                actions={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Qidirish..." className="w-[220px] pl-8" />
                        </div>
                        <PermissionGate permission="create:speciality">
                            <Button onClick={() => { setSelected(null); setIsModalOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" />
                                Qo'shish
                            </Button>
                        </PermissionGate>
                    </>
                }
            />

            {isError ? (
                <ErrorState onRetry={load} />
            ) : isLoading ? (
                <CatalogGrid>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</CatalogGrid>
            ) : filtered.length === 0 ? (
                <EmptyState title="Mutaxassisliklar topilmadi" description="Ushbu kafedrada mutaxassislik mavjud emas." />
            ) : (
                <CatalogGrid>
                    {filtered.map((speciality) => {
                        const item = stats.get(speciality.id);
                        const subtitleParts = [
                            speciality.education_type,
                            speciality.external_id ? `Kod: ${speciality.external_id}` : null,
                        ].filter(Boolean);
                        return (
                            <CatalogCard
                                key={speciality.id}
                                id={speciality.id}
                                title={speciality.name}
                                subtitle={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Mutaxassislik'}
                                        <ExternalSourceBadge row={speciality} />
                                        <InactiveBadge row={speciality} />
                                    </span>
                                }
                                onClick={() => onOpenSpeciality(speciality)}
                                actions={renderActions(speciality)}
                                metrics={[
                                    { label: 'Guruh', value: item?.group_count ?? '—' },
                                    { label: 'Talaba', value: item?.student_count ?? '—', accent: true },
                                ]}
                            />
                        );
                    })}
                </CatalogGrid>
            )}

            {isModalOpen && (
                <SpecialityModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    speciality={selected}
                    kafedras={[kafedra]}
                    defaultKafedraId={kafedra.id}
                    onSuccess={() => { setIsModalOpen(false); void load(); }}
                />
            )}

            <ConfirmDialog
                isOpen={Boolean(toDelete)}
                onClose={closeDeleteDialog}
                onConfirm={handleConfirmDelete}
                title="Mutaxassislikni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="mt-2 space-y-2 text-left">
                            <p className="font-medium text-destructive">Diqqat! Ushbu mutaxassislikni o'chirish quyidagilarga ta'sir qiladi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                            </ul>
                            <p className="mt-2 font-semibold text-destructive">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${toDelete?.name}" mutaxassisligini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

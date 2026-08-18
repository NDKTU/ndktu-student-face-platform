import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Brain, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useCreateMethod, useDeleteMethod, useMethods, useUpdateMethod } from '@/hooks/usePsychology';
import { MethodBuilderModal } from '@/components/psychology/MethodBuilderModal';
import { MethodList } from '@/components/psychology/MethodList';
import { QuestionsPanel } from '@/components/psychology/QuestionsPanel';
import type { MethodResponse } from '@/services/psychologyService';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function PsychologyPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const { data, isLoading, isError, refetch } = useMethods(page, 20);
    const createMethod = useCreateMethod();
    const updateMethod = useUpdateMethod();
    const deleteMethod = useDeleteMethod();

    const [methodModal, setMethodModal] = useState<{ open: boolean; editing: MethodResponse | null }>({ open: false, editing: null });
    const [activeMethod, setActiveMethod] = useState<MethodResponse | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const handleCreate = (payload: Parameters<typeof createMethod.mutate>[0]) => {
        createMethod.mutate(payload, {
            onSuccess: () => {
                setMethodModal({ open: false, editing: null });
                toast.success('Metod yaratildi');
            },
            onError: () => toast.error('Metodni yaratishda xatolik yuz berdi'),
        });
    };
    const handleUpdate = (payload: { name: string; description: string; instruction: Record<string, unknown> }) => {
        if (!methodModal.editing) return;
        updateMethod.mutate({ id: methodModal.editing.id, data: payload }, {
            onSuccess: () => {
                setMethodModal({ open: false, editing: null });
                toast.success('Metod saqlandi');
            },
            onError: () => toast.error('Metodni saqlashda xatolik yuz berdi'),
        });
    };
    const handleDeleteClick = (id: number) => {
        if (deletingId === id) {
            deleteMethod.mutate(id, {
                onSuccess: () => {
                    setDeletingId(null);
                    toast.success("Metod o'chirildi");
                },
                onError: () => toast.error("Metodni o'chirishda xatolik yuz berdi"),
            });
        } else {
            setDeletingId(id);
        }
    };

    // Sync activeMethod with fresh data
    const freshActive = activeMethod
        ? data?.methods.find(m => m.id === activeMethod.id) ?? activeMethod
        : null;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Psixologik metodlar"
                description="Test metodlarini boshqarish"
                actions={
                    <PermissionGate permission="create:psychology">
                        <Button onClick={() => setMethodModal({ open: true, editing: null })}>
                            <Plus className="mr-2 h-4 w-4" /> Yangi metod
                        </Button>
                    </PermissionGate>
                }
            />

            <Card>
                <CardHeader className="pb-0">
                    <p className="text-sm text-muted-foreground">
                        Jami: <span className="font-medium text-foreground">{data?.total ?? 0}</span> ta metod
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="mt-4 flex flex-col gap-2">
                            {Array.from({ length: 5 }, (_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : isError ? (
                        <ErrorState onRetry={() => refetch()} />
                    ) : !data?.methods.length ? (
                        <EmptyState
                            icon={<Brain className="h-6 w-6" />}
                            title="Metodlar mavjud emas"
                            description="Hozircha birorta ham metod qo'shilmagan."
                            action={
                                <PermissionGate permission="create:psychology">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setMethodModal({ open: true, editing: null })}
                                    >
                                        Birinchi metodni yarating
                                    </Button>
                                </PermissionGate>
                            }
                        />
                    ) : (
                        <>
                            <MethodList
                                methods={data.methods}
                                deletingId={deletingId}
                                isDeletePending={deleteMethod.isPending}
                                onPlayTest={(id) => navigate(`/psychology/test/${id}`)}
                                onOpenQuestions={setActiveMethod}
                                onEdit={(method) => setMethodModal({ open: true, editing: method })}
                                onDeleteClick={handleDeleteClick}
                            />

                            {data.total > 20 && (
                                <div className="mt-4">
                                    <Pagination
                                        currentPage={page}
                                        totalPages={Math.ceil(data.total / 20)}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {methodModal.open && (
                <MethodBuilderModal
                    open={methodModal.open}
                    editing={methodModal.editing}
                    onClose={() => setMethodModal({ open: false, editing: null })}
                    onCreate={handleCreate}
                    onUpdate={handleUpdate}
                    isPending={createMethod.isPending || updateMethod.isPending}
                />
            )}

            {freshActive && (
                <QuestionsPanel
                    method={freshActive}
                    onClose={() => setActiveMethod(null)}
                />
            )}
        </div>
    );
}

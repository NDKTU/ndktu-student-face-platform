import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { useCreateMethod, useDeleteMethod, useMethods, useUpdateMethod } from '@/hooks/usePsychology';
import { MethodBuilderModal } from '@/components/psychology/MethodBuilderModal';
import { MethodList } from '@/components/psychology/MethodList';
import { QuestionsPanel } from '@/components/psychology/QuestionsPanel';
import type { MethodResponse } from '@/services/psychologyService';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function PsychologyPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const { data, isLoading, isError } = useMethods(page, 20);
    const createMethod = useCreateMethod();
    const updateMethod = useUpdateMethod();
    const deleteMethod = useDeleteMethod();

    const [methodModal, setMethodModal] = useState<{ open: boolean; editing: MethodResponse | null }>({ open: false, editing: null });
    const [activeMethod, setActiveMethod] = useState<MethodResponse | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const handleCreate = (payload: Parameters<typeof createMethod.mutate>[0]) => {
        createMethod.mutate(payload, { onSuccess: () => setMethodModal({ open: false, editing: null }) });
    };
    const handleUpdate = (payload: { name: string; description: string; instruction: Record<string, unknown> }) => {
        if (!methodModal.editing) return;
        updateMethod.mutate({ id: methodModal.editing.id, data: payload }, {
            onSuccess: () => setMethodModal({ open: false, editing: null }),
        });
    };
    const handleDeleteClick = (id: number) => {
        if (deletingId === id) {
            deleteMethod.mutate(id, { onSuccess: () => setDeletingId(null) });
        } else {
            setDeletingId(id);
        }
    };

    // Sync activeMethod with fresh data
    const freshActive = activeMethod
        ? data?.methods.find(m => m.id === activeMethod.id) ?? activeMethod
        : null;

    return (
        <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                        <Brain className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">Psixologik metodlar</h1>
                        <p className="text-xs text-muted-foreground">Test metodlarini boshqarish</p>
                    </div>
                </div>
                <PermissionGate permission="create:psychology">
                    <Button onClick={() => setMethodModal({ open: true, editing: null })}>
                        <Plus className="mr-2 h-4 w-4" /> Yangi metod
                    </Button>
                </PermissionGate>
            </div>

            <Card>
                <CardHeader className="pb-0">
                    <p className="text-sm text-muted-foreground">
                        Jami: <span className="font-medium text-foreground">{data?.total ?? 0}</span> ta metod
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : isError ? (
                        <p className="py-8 text-center text-sm text-destructive">Xatolik yuz berdi</p>
                    ) : !data?.methods.length ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                            <Brain className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Metodlar mavjud emas</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setMethodModal({ open: true, editing: null })}
                            >
                                Birinchi metodni yarating
                            </Button>
                        </div>
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

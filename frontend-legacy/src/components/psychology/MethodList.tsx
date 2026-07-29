import { Brain, ChevronRight, Edit2, ListOrdered, Loader2, Play, Trash2 } from 'lucide-react';
import type { MethodResponse } from '@/services/psychologyService';

interface MethodListProps {
    methods: MethodResponse[];
    deletingId: number | null;
    isDeletePending: boolean;
    onPlayTest: (id: number) => void;
    onOpenQuestions: (method: MethodResponse) => void;
    onEdit: (method: MethodResponse) => void;
    /** Two-step delete: first click arms, second confirms. Parent toggles deletingId. */
    onDeleteClick: (id: number) => void;
}

export function MethodList({
    methods,
    deletingId,
    isDeletePending,
    onPlayTest,
    onOpenQuestions,
    onEdit,
    onDeleteClick,
}: MethodListProps) {
    return (
        <div className="mt-4 flex flex-col gap-2">
            {methods.map(method => (
                <div
                    key={method.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
                >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Brain className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{method.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{method.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <ListOrdered className="h-3.5 w-3.5" />
                        <span>{method.questions.length} savol</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            onClick={() => onPlayTest(method.id)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                            title="Testni boshlash"
                        >
                            <Play className="h-3.5 w-3.5" /> Test
                        </button>
                        <button
                            onClick={() => onOpenQuestions(method)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                            Savollar <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => onEdit(method)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => onDeleteClick(method.id)}
                            className={`rounded-lg p-1.5 transition-colors ${
                                deletingId === method.id
                                    ? 'bg-destructive text-white'
                                    : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                            }`}
                            title={deletingId === method.id ? 'Tasdiqlash uchun yana bosing' : "O'chirish"}
                        >
                            {isDeletePending && deletingId === method.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

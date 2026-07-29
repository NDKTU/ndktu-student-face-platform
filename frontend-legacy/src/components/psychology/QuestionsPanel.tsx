import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Download, ListOrdered, Loader2, Plus, Upload, X } from 'lucide-react';
import { useCreateQuestion, useDeleteQuestion, useUpdateQuestion } from '@/hooks/usePsychology';
import type { MethodResponse, QuestionResponse, QuestionType } from '@/services/psychologyService';
import { ExcelImportModal } from './ExcelImportModal';
import { buildExportWorkbook, sanitizeFilename } from './excelIO';
import { QuestionForm } from './QuestionForm';
import { QuestionRow } from './QuestionRow';
import {
    buildQuestionPayload,
    emptyQuestionForm,
    getMethodCategories,
    questionToForm,
    type QuestionFormState,
} from './questionFormHelpers';

interface QuestionsPanelProps {
    method: MethodResponse;
    onClose: () => void;
}

export function QuestionsPanel({ method, onClose }: QuestionsPanelProps) {
    const createQ = useCreateQuestion();
    const updateQ = useUpdateQuestion();
    const deleteQ = useDeleteQuestion();

    const [qModal, setQModal] = useState<{ open: boolean; editing: QuestionResponse | null }>({ open: false, editing: null });
    const [qForm, setQForm] = useState<QuestionFormState>(emptyQuestionForm());
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [importTarget, setImportTarget] = useState<{ category: string | null } | null>(null);
    // Sticky type — remembered across "Savol qo'shish" clicks so the user only
    // picks the question type once per batch.
    const [lastQuestionType, setLastQuestionType] = useState<QuestionType>('text');

    const openCreate = (category: string = '') => {
        setQForm({ ...emptyQuestionForm(), question_type: lastQuestionType, category });
        setQModal({ open: true, editing: null });
    };
    const openEdit = (q: QuestionResponse) => {
        setQForm(questionToForm(q));
        setQModal({ open: true, editing: q });
    };

    const methodCategories = getMethodCategories(method);
    const grouped = methodCategories.length >= 2;

    const sections: { key: string; label: string; items: QuestionResponse[] }[] = grouped
        ? [
            ...methodCategories.map(cat => ({
                key: cat,
                label: cat,
                items: method.questions.filter(q => (q.category ?? '').trim() === cat),
            })),
            {
                key: '__none__',
                label: 'Kategoriyasiz',
                items: method.questions.filter(q => !(q.category ?? '').trim()),
            },
        ].filter(sec => sec.key !== '__none__' || sec.items.length > 0)
        : [];

    const handleSaveQuestion = () => {
        const { content, options, order, category } = buildQuestionPayload(qForm);
        if (qModal.editing) {
            updateQ.mutate({ id: qModal.editing.id, data: { question_type: qForm.question_type, content, options, order, category } }, {
                onSuccess: () => setQModal({ open: false, editing: null }),
            });
        } else {
            createQ.mutate({ method_id: method.id, question_type: qForm.question_type, content, options, order, category }, {
                onSuccess: () => {
                    setLastQuestionType(qForm.question_type);
                    setQModal({ open: false, editing: null });
                },
            });
        }
    };

    const handleDelete = (id: number) => {
        deleteQ.mutate(id, { onSuccess: () => setDeleteId(null) });
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <h2 className="font-semibold text-foreground">{method.name}</h2>
                        <p className="text-xs text-muted-foreground">{method.questions.length} ta savol</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                const wb = buildExportWorkbook(method);
                                XLSX.writeFile(wb, `${sanitizeFilename(method.name)}.xlsx`);
                            }}
                            disabled={method.questions.length === 0}
                            title="Excel yuklab olish"
                        >
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Yuklab olish
                        </Button>
                        {!grouped && (
                            <>
                                <Button size="sm" variant="outline" onClick={() => setImportTarget({ category: null })}>
                                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Excel
                                </Button>
                                <Button size="sm" onClick={() => openCreate()}>
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Savol qo'shish
                                </Button>
                            </>
                        )}
                        <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {method.questions.length === 0 && !grouped ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                            <ListOrdered className="h-8 w-8 opacity-30" />
                            <p className="text-sm">Savollar mavjud emas</p>
                            <Button type="button" variant="outline" size="sm" onClick={() => openCreate()}>Birinchi savolni qo'shing</Button>
                        </div>
                    ) : grouped ? (
                        <div className="flex flex-col gap-5">
                            {sections.map(section => {
                                const isUncat = section.key === '__none__';
                                return (
                                    <div key={section.key} className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                                                <span className="text-xs text-muted-foreground">{section.items.length} ta</span>
                                            </div>
                                            {!isUncat && (
                                                <div className="flex items-center gap-1.5">
                                                    <Button size="sm" variant="outline" onClick={() => setImportTarget({ category: section.key })} title="Excel orqali import">
                                                        <Upload className="mr-1.5 h-3.5 w-3.5" /> Excel
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => openCreate(section.key)}>
                                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Savol qo'shish
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {section.items.length === 0 ? (
                                            <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
                                                Bu kategoriyada savollar yo'q
                                            </p>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                {section.items.map((q, idx) => (
                                                    <QuestionRow
                                                        key={q.id}
                                                        question={q}
                                                        index={idx}
                                                        showCategoryBadge={false}
                                                        onEdit={() => openEdit(q)}
                                                        onDelete={() => deleteId === q.id ? handleDelete(q.id) : setDeleteId(q.id)}
                                                        deleteArmed={deleteId === q.id}
                                                        deletePending={deleteQ.isPending && deleteId === q.id}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {method.questions.map((q, idx) => (
                                <QuestionRow
                                    key={q.id}
                                    question={q}
                                    index={idx}
                                    showCategoryBadge={true}
                                    onEdit={() => openEdit(q)}
                                    onDelete={() => deleteId === q.id ? handleDelete(q.id) : setDeleteId(q.id)}
                                    deleteArmed={deleteId === q.id}
                                    deletePending={deleteQ.isPending && deleteId === q.id}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={qModal.open}
                onClose={() => setQModal({ open: false, editing: null })}
                title={qModal.editing ? 'Savolni tahrirlash' : 'Yangi savol'}
            >
                <div className="flex flex-col gap-4">
                    <QuestionForm form={qForm} onChange={setQForm} methodCategories={methodCategories} />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setQModal({ open: false, editing: null })}>Bekor</Button>
                        <Button onClick={handleSaveQuestion} disabled={createQ.isPending || updateQ.isPending}>
                            {(createQ.isPending || updateQ.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {qModal.editing ? 'Saqlash' : "Qo'shish"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <ExcelImportModal
                open={importTarget !== null}
                onClose={() => setImportTarget(null)}
                methodId={method.id}
                category={importTarget?.category ?? null}
                nextOrder={
                    method.questions.length === 0
                        ? 1
                        : Math.max(...method.questions.map(q => q.order)) + 1
                }
            />
        </>
    );
}

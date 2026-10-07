import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import JoditEditor from 'jodit-react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { isBlankHtml } from '@/utils/html';
import { insertEditorImage, useQuestionEditorConfigs } from '@/components/questions/questionEditor';
import { useGeneralTestSubject, useSaveSubjectQuestion, useSubjectQuestions } from '@/hooks/useGeneralTests';
import type { OptionLetter } from '@/services/generalTestService';
import { apiErrorMessage } from '@/utils/apiError';

const LETTERS: OptionLetter[] = ['a', 'b', 'c', 'd'];
const EMPTY_OPTIONS: Record<OptionLetter, string> = { a: '', b: '', c: '', d: '' };

/**
 * Elementar test fani uchun savol — kurs savoli formasi bilan bir xil:
 * muharrir, rasm yuklash, kutubxonadan rasm va to'rtta variant kartochkasi.
 *
 * Ilgari bu yerda oddiy matn maydonli oyna edi: rasm yoki formula qo'shib
 * bo'lmasdi, o'qituvchi esa kursdagi formaga o'rganib qolgan.
 *
 * Alohida sahifa, oyna emas: Jodit'ning rasm va jadval oynalari modal
 * ichida fokus uchun u bilan talashadi.
 */
export default function GeneralTestQuestionFormPage() {
    const navigate = useNavigate();
    const params = useParams();
    const subjectId = Number(params.subjectId);
    const questionId = params.questionId ? Number(params.questionId) : null;
    const isEditMode = questionId !== null;
    const backTo = `/elementar-tests/subjects/${subjectId}`;

    const { data: subject } = useGeneralTestSubject(subjectId);
    // Roʻyxat faqat tahrirlashda kerak: yangi savol uchun
    // `read:general_test_question` boʻlmasa ham forma ochilsin.
    const questionsQuery = useSubjectQuestions(subjectId, isEditMode);
    const editing = isEditMode ? questionsQuery.data?.find((q) => q.id === questionId) : undefined;
    const save = useSaveSubjectQuestion(subjectId);

    const { questionEditorConfig, optionEditorConfig } = useQuestionEditorConfigs('/general-test/question/upload_image');

    const [text, setText] = useState('');
    const [options, setOptions] = useState<Record<OptionLetter, string>>(EMPTY_OPTIONS);
    const [correct, setCorrect] = useState<OptionLetter>('a');
    const [error, setError] = useState<string | null>(null);
    // Jodit qiymatni faqat birinchi chizishda oladi — formani tozalash yoki
    // tahrirlanayotgan savol kelganda muharrirlarni qaytadan yaratamiz.
    const [formKey, setFormKey] = useState(0);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeEditorRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRefs = useRef<Record<string, any>>({});

    useEffect(() => {
        if (!editing) return;
        setText(editing.text);
        setOptions({ a: editing.option_a, b: editing.option_b, c: editing.option_c, d: editing.option_d });
        setCorrect(editing.correct_option);
        setFormKey((key) => key + 1);
    }, [editing]);

    /**
     * Muharrirning joriy qiymati. Holat faqat `onBlur` da yangilanadi —
     * kutubxonadan rasm qo'yilgach muharrir fokus olmagan bo'lsa, rasm
     * holatga tushmay qolardi.
     */
    const currentValue = (key: string, fallback: string): string => {
        const value = editorRefs.current[key]?.value;
        return typeof value === 'string' ? value : fallback;
    };

    const submit = (keepOpen: boolean) => {
        const values = {
            text: currentValue('text', text).trim(),
            option_a: currentValue('a', options.a).trim(),
            option_b: currentValue('b', options.b).trim(),
            option_c: currentValue('c', options.c).trim(),
            option_d: currentValue('d', options.d).trim(),
        };
        if (isBlankHtml(values.text)) return setError('Savol matnini kiriting');
        if ([values.option_a, values.option_b, values.option_c, values.option_d].some(isBlankHtml)) {
            return setError("To'rttala variantni ham to'ldiring");
        }
        setError(null);
        save.mutate(
            { id: editing?.id, data: { ...values, correct_option: correct } },
            {
                onSuccess: () => {
                    toast.success(isEditMode ? 'Savol yangilandi' : "Savol qo'shildi");
                    if (keepOpen) {
                        setText('');
                        setOptions(EMPTY_OPTIONS);
                        setCorrect('a');
                        setFormKey((key) => key + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        navigate(backTo);
                    }
                },
                onError: (e) => setError(apiErrorMessage(e, 'Savolni saqlashda xatolik')),
            },
        );
    };

    const openLibrary = (editorKey: string) => {
        activeEditorRef.current = editorRefs.current[editorKey];
        setIsPickerOpen(true);
    };

    if (!Number.isFinite(subjectId)) return <ErrorState />;
    if (isEditMode && questionsQuery.isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-96 w-full rounded-xl" />
            </div>
        );
    }
    if (isEditMode && !editing) {
        return <ErrorState onRetry={() => questionsQuery.refetch()} />;
    }

    const libraryButton = (editorKey: string, compact = false) => (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openLibrary(editorKey)}
            className={compact
                ? 'h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground'
                : 'h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground'}
            title="Ilgari yuklangan rasmni kutubxonadan tanlash"
        >
            <FolderOpen className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {compact ? 'Kutubxona' : 'Kutubxonadan rasm'}
        </Button>
    );

    return (
        <div className="mx-auto w-full space-y-6 pb-10">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="page-title">{isEditMode ? 'Savolni tahrirlash' : 'Yangi savol'}</h1>
                    <p className="page-description mt-0.5">
                        {subject ? `«${subject.name}» fanining savollar banki` : 'Elementar test fani'}
                    </p>
                </div>
            </div>

            <Card className="border-border/80 shadow-sm">
                <CardContent className="space-y-6 pt-6">
                    <div key={`text-${formKey}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-foreground">Savol matni</label>
                            {libraryButton('text')}
                        </div>
                        <div className="overflow-hidden rounded-lg border border-border/80 shadow-sm">
                            <JoditEditor
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                ref={(ref: any) => { editorRefs.current.text = ref; }}
                                value={text}
                                config={questionEditorConfig}
                                onBlur={(value: string) => setText(value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-foreground">Javob variantlari</label>
                            <span className="text-xs font-medium text-muted-foreground">
                                To'g'ri javobni tanlash uchun variant kartasi ustiga bosing
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {LETTERS.map((letter) => {
                                const isCorrect = correct === letter;
                                return (
                                    <div
                                        key={`${letter}-${formKey}`}
                                        onClick={() => setCorrect(letter)}
                                        className={`group relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                                            isCorrect
                                                ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20 dark:bg-emerald-500/[0.06]'
                                                : 'border-border/80 bg-card hover:border-primary/40 hover:bg-muted/20'
                                        }`}
                                    >
                                        <div className="mb-2.5 flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <span
                                                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shadow-sm transition-colors ${
                                                        isCorrect
                                                            ? 'bg-emerald-600 text-white'
                                                            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                                                    }`}
                                                >
                                                    {letter.toUpperCase()}
                                                </span>
                                                <span className={`text-xs font-semibold ${isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                                    {isCorrect ? "✓ To'g'ri javob" : "To'g'ri javob deb tanlash"}
                                                </span>
                                            </div>
                                            <div onClick={(e) => e.stopPropagation()}>
                                                {libraryButton(letter, true)}
                                            </div>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-md">
                                            <JoditEditor
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                ref={(ref: any) => { editorRefs.current[letter] = ref; }}
                                                value={options[letter]}
                                                config={optionEditorConfig}
                                                onBlur={(value: string) =>
                                                    setOptions((prev) => ({ ...prev, [letter]: value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error && (
                        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/80 pt-5">
                        <Button type="button" variant="outline" onClick={() => navigate(backTo)}>
                            Bekor qilish
                        </Button>
                        {!isEditMode && (
                            <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => submit(true)}>
                                Saqlash va yangisini qo'shish
                            </Button>
                        )}
                        <Button type="button" isLoading={save.isPending} onClick={() => submit(false)}>
                            {isEditMode ? 'Savolni yangilash' : 'Savol yaratish'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <FilePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                multiple={false}
                kind="image"
                title="Kutubxonadan rasm tanlash"
                onSelect={(files) => insertEditorImage(activeEditorRef.current, files[0]?.url ?? '')}
            />
        </div>
    );
}

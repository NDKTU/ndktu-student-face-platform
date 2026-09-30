import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { logger } from '@/utils/logger';
import type { QuestionCreateRequest } from '@/services/questionService';
import { API_BASE_URL } from '@/config/env';
import { getToken } from '@/services/tokenStorage';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { FilePickerModal } from '@/components/file/FilePickerModal';
import { Card, CardContent } from '@/components/ui/Card';
import { ArrowLeft, FolderOpen, Loader2 } from 'lucide-react';
import JoditEditor from 'jodit-react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuestion, useCreateQuestion, useUpdateQuestion } from '@/hooks/useQuestions';
import { useSubjects } from '@/hooks/useSubjects';
import { useLesson } from '@/hooks/useLessons';
import { Combobox } from '@/components/ui/Combobox';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FILTER_PAGE_SIZE, withSelected, type FilterOption } from '@/utils/filterOptions';
import { subjectOption } from '@/utils/subject';

// Variantlar faqat klassik savolda majburiy: boshqa turlarda ular umuman
// boshqa shaklda (`payload`) saqlanadi.
const questionSchema = z.object({
    subject_id: z.string().min(1, 'Fan tanlanishi shart'),
    question_type: z.enum(['QUIZ', 'TRUE_FALSE', 'MULTI_SELECT', 'TYPE_ANSWER', 'PUZZLE']),
    text: z.string().min(1, 'Savol matni kiritilishi shart'),
    option_a: z.string(),
    option_b: z.string(),
    option_c: z.string(),
    option_d: z.string(),
    correct_option: z.enum(['a', 'b', 'c', 'd']),
}).superRefine((values, ctx) => {
    if (values.question_type !== 'QUIZ') return;
    for (const [field, label] of [['option_a', 'A'], ['option_b', 'B'], ['option_c', 'C'], ['option_d', 'D']] as const) {
        if (!values[field]?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${label} varianti kiritilishi shart` });
        }
    }
});

type QuestionFormValues = z.infer<typeof questionSchema>;

const QuestionFormPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    // Dars sahifasidan kelinganda fan oldindan tanlangan bo'ladi va saqlagach
    // o'sha darsga qaytiladi — o'qituvchi savolni test uchun shu yerda qo'shadi.
    const [searchParams] = useSearchParams();
    // Yangi turlar uchun holat: to'g'ri/noto'g'ri javobi va variantlar ro'yxati.
    const [trueFalseAnswer, setTrueFalseAnswer] = useState(true);
    const [multiOptions, setMultiOptions] = useState<{ text: string; correct: boolean }[]>([
        { text: '', correct: true },
        { text: '', correct: false },
    ]);
    // Matnli javob: bir nechta to'g'ri yozilish bo'lishi mumkin.
    const [textAnswers, setTextAnswers] = useState<string[]>(['']);
    // Tartib savoli: ro'yxat aynan to'g'ri tartibda kiritiladi.
    const [puzzleItems, setPuzzleItems] = useState<string[]>(['', '']);
    const presetSubjectId = searchParams.get('subject_id') ?? '';
    const lessonIdParam = searchParams.get('lesson_id');
    const returnTo = searchParams.get('return_to');
    const { user } = useAuth();
    const isEditMode = !!id;
    const questionId = id ? parseInt(id, 10) : 0;

    // Fanlar 2978 ta — hammasini yuklab brauzerda qidirib bo'lmaydi. Qidiruv
    // serverda (`useSubjects` uni `name=` ga o'giradi), sahifa hajmi kichik.
    const [subjectQuery, setSubjectQuery] = useState('');
    const debouncedSubjectQuery = useDebouncedValue(subjectQuery);
    const { data: subjectsData } = useSubjects(1, FILTER_PAGE_SIZE, debouncedSubjectQuery);
    // Tanlangan fan qidiruv natijasida bo'lmasligi mumkin — u holda Combobox
    // nom o'rniga placeholder ko'rsatardi va saqlashda maydon bo'sh deb
    // hisoblanardi. Shuning uchun tanlov alohida eslab qolinadi.
    const [selectedSubjectOption, setSelectedSubjectOption] = useState<FilterOption | null>(null);
    // Dars sahifasidan kelinganda fan darsdan olinadi va tanlash so'ralmaydi:
    // dars allaqachon o'qituvchi-fan juftligiga bog'langan.
    const { data: lessonData } = useLesson(lessonIdParam ? Number.parseInt(lessonIdParam, 10) : undefined);
    const lessonSubjectId = lessonData?.teacher_subject?.subject_id;
    const { data: question, isLoading: isQuestionLoading } = useQuestion(questionId);

    const createMutation = useCreateQuestion();
    const updateMutation = useUpdateQuestion();

    const subjects = subjectsData?.subjects || [];
    const subjectOptions = useMemo(
        () =>
            withSelected(
                subjects.map(subjectOption),
                selectedSubjectOption,
            ),
        [subjects, selectedSubjectOption],
    );
    const isSubmitting = createMutation.isPending || updateMutation.isPending;
    const isLoading = isEditMode && isQuestionLoading;

    // Refs to track which editor is "active" for media library image insertion
    const activeEditorRef = useRef<any>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const {
        register,
        handleSubmit,
        control,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<QuestionFormValues>({
        resolver: zodResolver(questionSchema),
        defaultValues: {
            question_type: 'QUIZ',
            subject_id: presetSubjectId,
            text: '',
            option_a: '',
            option_b: '',
            option_c: '',
            option_d: '',
            correct_option: 'a',
        }
    });

    // Tur bo'yicha forma o'zgaradi: klassik savolda to'rt variant,
    // boshqalarida — o'z tahrirlagichi.
    const questionType = watch('question_type');

    useEffect(() => {
        if (lessonSubjectId && !isEditMode) {
            setValue('subject_id', lessonSubjectId.toString());
        }
    }, [lessonSubjectId, isEditMode, setValue]);

    useEffect(() => {
        if (question) {
            // Fan savolning o'zidan olinadi (`subject_name` javobda bor), fanlar
            // ro'yxatidan emas. Ilgari forma ro'yxatga bog'liq edi va ro'yxatdan
            // kirilganda (client-side navigatsiya) ro'yxat kelguncha
            // initsializatsiya bo'lib ulgurardi — fan bo'sh qolardi. Endi
            // poyga yo'q: savol keldi — fan ham bor.
            setSelectedSubjectOption({
                value: question.subject_id.toString(),
                label: question.subject_name || `#${question.subject_id}`,
            });
            // `question_type` SHART: `reset(values)` formani berilgan obyektga
            // tenglashtiradi, `defaultValues` bilan birlashtirmaydi. Tushib
            // qolsa maydon `undefined` bo'lardi va ikki oqibat chiqardi:
            //   1) `watch('question_type')` bo'sh — tur bo'yicha chiqadigan
            //      beshta blokning hammasi (A/B/C/D ham) yashirinardi;
            //   2) `<select>` brauzerda birinchi variantni ko'rsatgani uchun
            //      saqlashda doim `QUIZ` ketardi — `TRUE_FALSE` savolni ochib
            //      shunchaki saqlash uni `QUIZ` ga aylantirib, `payload` ni
            //      (to'g'ri javobni) o'chirib yuborardi.
            reset({
                subject_id: question.subject_id.toString(),
                question_type: question.question_type,
                text: question.text,
                option_a: question.option_a,
                option_b: question.option_b,
                option_c: question.option_c,
                option_d: question.option_d,
                correct_option: (question.correct_option as 'a' | 'b' | 'c' | 'd') || 'a',
            });

            // Tur-maxsus javoblar formada emas, mahalliy holatda saqlanadi va
            // ular ham urug'lantirilishi kerak: aks holda bloklar bo'sh
            // ko'rinar, saqlashda esa asl javoblar o'rniga standart qiymatlar
            // yozilardi.
            // `payload` serverda `Record<string, unknown>` — bu yerda turini
            // tekshirib olamiz, bir xil yozilgan eski yozuvlar ham bo'lishi
            // mumkin.
            const payload = question.payload ?? {};
            const strings = (value: unknown): string[] =>
                Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
            const numbers = (value: unknown): number[] =>
                Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

            if (question.question_type === 'TRUE_FALSE') {
                setTrueFalseAnswer(typeof payload.correct === 'boolean' ? payload.correct : true);
            } else if (question.question_type === 'MULTI_SELECT') {
                const options = strings(payload.options);
                const correct = numbers(payload.correct);
                setMultiOptions(
                    options.length
                        ? options.map((text, index) => ({ text, correct: correct.includes(index) }))
                        : [{ text: '', correct: true }, { text: '', correct: false }],
                );
            } else if (question.question_type === 'TYPE_ANSWER') {
                const answers = strings(payload.answers);
                setTextAnswers(answers.length ? answers : ['']);
            } else if (question.question_type === 'PUZZLE') {
                const items = strings(payload.items);
                setPuzzleItems(items.length ? items : ['', '']);
            }
        }
    }, [question, reset]);


    const uploaderConfig = useMemo(() => ({
        url: `${API_BASE_URL}/question/upload_image`,
        format: 'json',
        headers: {
            Authorization: `Bearer ${getToken() || ''}`,
        },
        filesVariableName: () => 'file',
        isSuccess: (resp: any) => Boolean(resp && !resp.error && resp.url),
        process: (resp: any) => ({
            files: resp?.url ? [resp.url] : [],
            path: '',
            baseurl: '',
            error: resp?.error,
            msg: resp?.message || resp?.detail,
        }),
        defaultHandlerSuccess: function (this: any, data: any) {
            if (data?.files && data.files.length) {
                for (let i = 0; i < data.files.length; i += 1) {
                    this.selection.insertHTML(
                        `<img src="${data.files[i]}" alt="savol-rasm" style="max-width: 100%; border-radius: 6px; margin: 4px 0;" />`
                    );
                }
            }
        },
        defaultHandlerError: function (this: any, resp: any) {
            toast.error(resp?.msg || resp?.message || 'Rasm yuklashda xatolik yuz berdi');
        },
        error: function (this: any, err: any) {
            logger.error('Jodit upload error', err);
            toast.error('Rasm yuklashda tarmoq xatoligi');
        },
    }), []);

    const questionEditorConfig = useMemo(() => {
        return {
            readonly: false,
            placeholder: 'Savol matnini kiriting...',
            minHeight: 140,
            // `true`: Jodit toolbarni ekran kengligiga qarab yig'adi (buttonsMD/SM/XS
            // to'plamlari quyida yozilgan). `false` da telefonda tugmalar qatori
            // yon tomonga chiqib ketardi.
            toolbarAdaptive: true,
            buttons: [
                'bold', 'italic', 'underline', 'strikethrough', '|',
                'superscript', 'subscript', '|',
                'ul', 'ol', '|',
                'brush', 'image', 'table', '|',
                'undo', 'redo', '|',
                'eraser'
            ],
            buttonsMD: [
                'bold', 'italic', 'underline', '|',
                'superscript', 'subscript', '|',
                'ul', 'ol', '|',
                'image', 'table', '|',
                'undo', 'redo'
            ],
            buttonsSM: [
                'bold', 'italic', '|',
                'superscript', 'subscript', '|',
                'ul', 'ol', '|',
                'image', '|',
                'undo', 'redo'
            ],
            buttonsXS: [
                'bold', 'italic', '|',
                'superscript', 'subscript', '|',
                'image'
            ],
            showCharsCounter: true,
            showWordsCounter: false,
            showXPathInStatusbar: false,
            uploader: uploaderConfig,
        } as any;
    }, [uploaderConfig]);

    const optionEditorConfig = useMemo(() => {
        return {
            readonly: false,
            placeholder: 'Variant matnini kiriting...',
            minHeight: 70,
            height: 80,
            // `true`: Jodit toolbarni ekran kengligiga qarab yig'adi (buttonsMD/SM/XS
            // to'plamlari quyida yozilgan). `false` da telefonda tugmalar qatori
            // yon tomonga chiqib ketardi.
            toolbarAdaptive: true,
            buttons: [
                'bold', 'italic', '|',
                'superscript', 'subscript', '|',
                'brush', 'image', '|',
                'undo', 'redo'
            ],
            buttonsMD: [
                'bold', 'italic', '|',
                'superscript', 'subscript', '|',
                'image'
            ],
            buttonsSM: [
                'bold', 'italic', '|',
                'superscript', 'subscript', '|',
                'image'
            ],
            buttonsXS: [
                'bold', 'italic', '|',
                'image'
            ],
            showCharsCounter: false,
            showWordsCounter: false,
            showXPathInStatusbar: false,
            uploader: uploaderConfig,
        } as any;
    }, [uploaderConfig]);

    /** Havolani muharrirga rasm sifatida qoʻyadi (Kutubxonadan tanlanganda). */
    const insertImage = (url: string, editorInstance: any) => {
        if (!url || !editorInstance) return;
        editorInstance.selection.insertHTML(
            `<img src="${url}" alt="savol-rasm" style="max-width: 100%; border-radius: 6px; margin: 4px 0;" />`
        );
    };

    // Kutubxonadan tanlash: fayl allaqachon serverda, qayta yuklanmaydi.
    const handleLibraryButtonClick = (editorInstance: any) => {
        activeEditorRef.current = editorInstance;
        setIsPickerOpen(true);
    };

    const correctOption = watch('correct_option');

    /**
     * `keepOpen` — «Saqlash va yangisini qo'shish» tugmasi uchun.
     *
     * Ilgari bu bayroq `useState` da turardi va tugma uni submitdan oldingi
     * qatorda o'rnatardi: holat keyingi renderda yangilanadi, `onSubmit` esa
     * allaqachon eski qiymatni yopib olgan bo'lardi. Natijada ikkala tugma
     * bir xil ishlardi — ikkalasi ham sahifadan chiqib ketardi.
     */
    const onSubmit = (data: QuestionFormValues, keepOpen = false) => {
        if (!user) {
            toast.error('Avtorizatsiyadan o\'tilmagan');
            return;
        }

        // Tahrirlashda tur savolning o'zidan olinadi, formadan emas: u
        // `disabled={isEditMode}` bilan baribir o'zgartirilmaydi, lekin forma
        // holati biror sababga ko'ra bo'shab qolsa `<select>` birinchi
        // variantni (`QUIZ`) qaytarib, savol turini jimgina almashtirib
        // yuborardi. Manba bitta bo'lgani ma'qul.
        const questionKind = (isEditMode && question ? question.question_type : data.question_type) as
            QuestionFormValues['question_type'];

        const payload: QuestionCreateRequest = {
            subject_id: parseInt(data.subject_id, 10),
            user_id: user.id,
            text: data.text,
            question_type: questionKind,
            option_a: data.option_a,
            option_b: data.option_b,
            option_c: data.option_c,
            option_d: data.option_d,
            correct_option: data.correct_option,
        };

        if (questionKind === 'TRUE_FALSE') {
            payload.payload = { correct: trueFalseAnswer };
        }

        if (questionKind === 'TYPE_ANSWER') {
            const filled = textAnswers.map((item) => item.trim()).filter(Boolean);
            if (filled.length === 0) {
                toast.error("Kamida bitta to'g'ri javob yozing");
                return;
            }
            payload.payload = { answers: filled };
        }

        if (questionKind === 'PUZZLE') {
            const filled = puzzleItems.map((item) => item.trim()).filter(Boolean);
            if (filled.length < 2) {
                toast.error("Kamida ikkita bo'lak kerak");
                return;
            }
            if (new Set(filled).size !== filled.length) {
                toast.error("Bo'laklar takrorlanmasin");
                return;
            }
            payload.payload = { items: filled };
        }

        if (questionKind === 'MULTI_SELECT') {
            const filled = multiOptions.filter((option) => option.text.trim());
            const correct = filled.map((option, index) => (option.correct ? index : -1)).filter((index) => index >= 0);
            // Serverda ham tekshiriladi, lekin xatoni shu yerda aytish tezroq.
            if (filled.length < 2) {
                toast.error("Kamida ikkita variant kerak");
                return;
            }
            if (correct.length === 0 || correct.length === filled.length) {
                toast.error("Kamida bitta, lekin hammasi emas — to'g'ri javoblarni belgilang");
                return;
            }
            payload.payload = { options: filled.map((option) => option.text.trim()), correct };
        }

        // Editing creates a new version with a new id (see backend Question
        // versioning) — we always navigate away on success rather than staying
        // on this page, so there's no stale id left referencing the old version.
        const onSuccess = () => {
            toast.success(isEditMode ? 'Savol yangilandi' : 'Savol yaratildi');
            if (!isEditMode && keepOpen) {
                reset({
                    subject_id: data.subject_id,
                    question_type: data.question_type,
                    text: '',
                    option_a: '',
                    option_b: '',
                    option_c: '',
                    option_d: '',
                    correct_option: 'a',
                });
                setTextAnswers(['']);
                setPuzzleItems(['', '']);
                setMultiOptions([
                    { text: '', correct: true },
                    { text: '', correct: false },
                ]);
                // Yangi savol formaning boshidan boshlanadi: uzun variant
                // kartochkalaridan keyin foydalanuvchi matn maydonini
                // qidirib qolmasin.
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                navigate(returnTo || '/questions');
            }
        };

        const onError = (error: unknown) => {
            logger.error('Failed to save question', error);
            toast.error('Savolni saqlashda xatolik');
        }

        if (isEditMode && id) {
            updateMutation.mutate({ id: parseInt(id), data: payload }, { onSuccess, onError });
        } else {
            createMutation.mutate(payload, { onSuccess, onError });
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const renderQuestionEditor = (
        field: any,
        error?: string
    ) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground">Savol matni</label>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLibraryButtonClick(field.ref)}
                    className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    title="Ilgari yuklangan rasmni kutubxonadan tanlash"
                >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Kutubxonadan rasm
                </Button>
            </div>
            <div className="rounded-lg overflow-hidden border border-border/80 shadow-sm">
                <JoditEditor
                    ref={(ref: any) => { field.ref = ref; }}
                    value={field.value}
                    config={questionEditorConfig}
                    onBlur={(newContent: string) => field.onChange(newContent)}
                />
            </div>
            {error && <p className="text-xs text-destructive font-medium">{error}</p>}
        </div>
    );

    const renderOptionCard = (
        key: 'a' | 'b' | 'c' | 'd',
        field: any,
        error?: string
    ) => {
        const isCorrect = correctOption === key;
        return (
            <div
                onClick={() => setValue('correct_option', key, { shouldValidate: true })}
                className={`group relative rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${
                    isCorrect
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-border/80 bg-card hover:border-primary/40 hover:bg-muted/20'
                }`}
            >
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                        <span
                            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shadow-sm transition-colors ${
                                isCorrect
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                            }`}
                        >
                            {key.toUpperCase()}
                        </span>
                        <span className={`text-xs font-semibold ${isCorrect ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            {isCorrect ? "✓ To'g'ri javob" : "To'g'ri javob deb tanlash"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLibraryButtonClick(field.ref)}
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                            title="Ilgari yuklangan rasmni kutubxonadan tanlash"
                        >
                            <FolderOpen className="h-3 w-3" />
                            Kutubxona
                        </Button>
                    </div>
                </div>

                <div onClick={(e) => e.stopPropagation()} className="rounded-md overflow-hidden">
                    <JoditEditor
                        ref={(ref: any) => { field.ref = ref; }}
                        value={field.value}
                        config={optionEditorConfig}
                        onBlur={(newContent: string) => field.onChange(newContent)}
                    />
                </div>
                {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
            </div>
        );
    };

    return (
        <div className="space-y-6 w-full mx-auto pb-10">

            <div className="flex items-center gap-3">
                {/* Savol darsdan ochilgan bo'lsa, «Orqaga» o'sha darsga
                    qaytaradi: `return_to` aynan shuning uchun berilgan, lekin
                    faqat saqlashdan keyin ishlatilardi. */}
                <Button variant="ghost" size="sm" onClick={() => navigate(returnTo || '/questions')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="page-title">{isEditMode ? 'Savolni tahrirlash' : 'Yangi savol'}</h1>
                    <p className="page-description mt-0.5">
                        {isEditMode ? 'Savol matni va variantlarini yangilang' : 'Savol matni va variantlarini kiriting'}
                    </p>
                </div>
            </div>

            <Card className="shadow-sm border-border/80">
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit((values) => onSubmit(values))} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">Fan</label>
                                {lessonSubjectId ? (
                                    <>
                                        {/* Dars fani — tanlanmaydi, shunchaki ko'rsatiladi. */}
                                        <p className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                                            {subjects.find((s) => s.id === lessonSubjectId)?.name
                                                ?? lessonData?.teacher_subject?.subject?.name
                                                ?? `#${lessonSubjectId}`}
                                        </p>
                                        <input type="hidden" {...register('subject_id')} />
                                        <p className="text-xs text-muted-foreground">
                                            Fan darsdan olindi: «{lessonData?.topic}».
                                        </p>
                                    </>
                                ) : (
                                    <Combobox
                                        options={subjectOptions}
                                        value={watch('subject_id')}
                                        onSearchChange={setSubjectQuery}
                                        onChange={(value) => {
                                            setValue('subject_id', value, { shouldValidate: true });
                                            setSelectedSubjectOption(
                                                subjectOptions.find((o) => o.value === value) ?? null,
                                            );
                                        }}
                                        placeholder="Fanni tanlang"
                                        searchPlaceholder="Fan nomi bo'yicha qidirish..."
                                    />
                                )}
                                {errors.subject_id && <p className="text-xs text-destructive font-medium">{errors.subject_id.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">Savol turi</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    {...register('question_type')}
                                    disabled={isEditMode}
                                >
                                    <option value="QUIZ">To'rt variant, bitta to'g'ri javob</option>
                                    <option value="MULTI_SELECT">Bir nechta to'g'ri javob</option>
                                    {/* Yangi savol faqat yuqoridagi ikki turda yaratiladi. Qolgan
                                        turlar faqat ilgari yaratilgan savolni tahrirlashda
                                        ko'rinadi — aks holda select bo'sh qolardi. */}
                                    {isEditMode && questionType === 'TRUE_FALSE' && (
                                        <option value="TRUE_FALSE">To'g'ri / Noto'g'ri</option>
                                    )}
                                    {isEditMode && questionType === 'TYPE_ANSWER' && (
                                        <option value="TYPE_ANSWER">Javobni matn bilan yozish</option>
                                    )}
                                    {isEditMode && questionType === 'PUZZLE' && (
                                        <option value="PUZZLE">To'g'ri tartibda joylashtirish</option>
                                    )}
                                </select>
                                {isEditMode && (
                                    <p className="text-xs text-muted-foreground">
                                        Mavjud savolning turi o'zgartirilmaydi — yangi savol yarating.
                                    </p>
                                )}
                            </div>
                        </div>

                        <Controller
                            name="text"
                            control={control}
                            render={({ field }) => renderQuestionEditor(field, errors.text?.message)}
                        />

                        {questionType === 'TRUE_FALSE' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">To'g'ri javob</label>
                                <div className="flex gap-2">
                                    {[true, false].map((value) => (
                                        <Button
                                            key={String(value)}
                                            type="button"
                                            variant={trueFalseAnswer === value ? 'primary' : 'outline'}
                                            onClick={() => setTrueFalseAnswer(value)}
                                        >
                                            {value ? "To'g'ri" : "Noto'g'ri"}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {questionType === 'MULTI_SELECT' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium">Variantlar</label>
                                    <p className="text-xs text-muted-foreground">
                                        To'g'ri javoblarni belgilang. Ball faqat hammasi to'g'ri belgilanganda beriladi.
                                    </p>
                                </div>
                                {multiOptions.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={option.correct}
                                            onChange={(event) => setMultiOptions((prev) => prev.map((item, i) =>
                                                i === index ? { ...item, correct: event.target.checked } : item))}
                                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                            aria-label={`${index + 1}-variant to'g'ri`}
                                        />
                                        <input
                                            value={option.text}
                                            onChange={(event) => setMultiOptions((prev) => prev.map((item, i) =>
                                                i === index ? { ...item, text: event.target.value } : item))}
                                            placeholder={`${index + 1}-variant`}
                                            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                        />
                                        {multiOptions.length > 2 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive"
                                                onClick={() => setMultiOptions((prev) => prev.filter((_, i) => i !== index))}
                                            >
                                                O'chirish
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                {multiOptions.length < 10 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setMultiOptions((prev) => [...prev, { text: '', correct: false }])}
                                    >
                                        Variant qo'shish
                                    </Button>
                                )}
                            </div>
                        )}

                        {questionType === 'TYPE_ANSWER' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium">To'g'ri javoblar</label>
                                    <p className="text-xs text-muted-foreground">
                                        Bir xil ma'noning turli yozilishini qo'shing («H2O», «suv»). Katta-kichik
                                        harf, ortiqcha bo'sh joy va apostrof turi hisobga olinmaydi.
                                    </p>
                                </div>
                                {textAnswers.map((answer, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            value={answer}
                                            onChange={(event) => setTextAnswers((prev) => prev.map((item, i) =>
                                                i === index ? event.target.value : item))}
                                            placeholder={`${index + 1}-variant`}
                                            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                        />
                                        {textAnswers.length > 1 && (
                                            <Button type="button" variant="ghost" size="sm" className="text-destructive"
                                                onClick={() => setTextAnswers((prev) => prev.filter((_, i) => i !== index))}>
                                                O'chirish
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                {textAnswers.length < 10 && (
                                    <Button type="button" variant="outline" size="sm"
                                        onClick={() => setTextAnswers((prev) => [...prev, ''])}>
                                        Yozilish qo'shish
                                    </Button>
                                )}
                            </div>
                        )}

                        {questionType === 'PUZZLE' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium">Bo'laklar — to'g'ri tartibda</label>
                                    <p className="text-xs text-muted-foreground">
                                        Shu tartib to'g'ri javob hisoblanadi. Talabaga ular aralashtirib ko'rsatiladi.
                                    </p>
                                </div>
                                {puzzleItems.map((item, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                            {index + 1}
                                        </span>
                                        <input
                                            value={item}
                                            onChange={(event) => setPuzzleItems((prev) => prev.map((value, i) =>
                                                i === index ? event.target.value : value))}
                                            placeholder={`${index + 1}-bo'lak`}
                                            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                        />
                                        {puzzleItems.length > 2 && (
                                            <Button type="button" variant="ghost" size="sm" className="text-destructive"
                                                onClick={() => setPuzzleItems((prev) => prev.filter((_, i) => i !== index))}>
                                                O'chirish
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                {puzzleItems.length < 10 && (
                                    <Button type="button" variant="outline" size="sm"
                                        onClick={() => setPuzzleItems((prev) => [...prev, ''])}>
                                        Bo'lak qo'shish
                                    </Button>
                                )}
                            </div>
                        )}

                        {questionType === 'QUIZ' && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-foreground">Javob variantlari</label>
                                    <span className="text-xs text-muted-foreground font-medium">
                                        To'g'ri javobni tanlash uchun variant kartasi ustiga bosing
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Controller
                                        name="option_a"
                                        control={control}
                                        render={({ field }) => renderOptionCard('a', field, errors.option_a?.message)}
                                    />
                                    <Controller
                                        name="option_b"
                                        control={control}
                                        render={({ field }) => renderOptionCard('b', field, errors.option_b?.message)}
                                    />
                                    <Controller
                                        name="option_c"
                                        control={control}
                                        render={({ field }) => renderOptionCard('c', field, errors.option_c?.message)}
                                    />
                                    <Controller
                                        name="option_d"
                                        control={control}
                                        render={({ field }) => renderOptionCard('d', field, errors.option_d?.message)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-5 border-t border-border/80">
                            <Button type="button" variant="outline" onClick={() => navigate(returnTo || '/questions')}>
                                Bekor qilish
                            </Button>
                            {!isEditMode && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={isSubmitting}
                                    onClick={() => handleSubmit((values) => onSubmit(values, true))()}
                                >
                                    Saqlash va yangisini qo'shish
                                </Button>
                            )}
                            <Button type="submit" isLoading={isSubmitting}>
                                {isEditMode ? 'Savolni yangilash' : 'Savol yaratish'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <FilePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                multiple={false}
                kind="image"
                title="Kutubxonadan rasm tanlash"
                onSelect={(files) => insertImage(files[0]?.url ?? '', activeEditorRef.current)}
            />
        </div>
    );
};

export default QuestionFormPage;

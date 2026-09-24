import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MessagesSquare, SendHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCourseMessages, useDeleteCourseMessage, useSendCourseMessage } from '@/hooks/useCourseChat';
import {
    COURSE_MESSAGE_MAX_LENGTH,
    courseChatService,
    type CourseMessage,
} from '@/services/courseChatService';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate, formatTime } from '@/utils/date';

/** Pastdan shuncha pikselgacha bo'lsa — foydalanuvchi «oxirida» deb hisoblanadi. */
const STICK_TO_BOTTOM_PX = 80;

const ROLE_BADGE: Partial<Record<CourseMessage['author_role'], string>> = {
    teacher: "O'qituvchi",
    admin: 'Admin',
};

/**
 * Kurs chati: o'qituvchi va talabalarning umumiy muloqoti.
 *
 * Xabarlar ikki manbadan yig'iladi. Oxirgi 50 tasi har 5 soniyada qayta
 * so'raladi (`useCourseMessages`), eskiroqlari esa «Oldingi xabarlar»
 * tugmasi bilan qo'lda yuklanadi. Ikkalasi bitta `Map` da jamlanadi:
 * yangi xabarlar oynani oldinga surganda undan chiqib ketgan xabarlar
 * ekrandan yo'qolmasligi kerak.
 */
export function CourseChat({ courseId, readOnly }: { courseId: number; readOnly: boolean }) {
    const { user } = useAuth();
    const latestQuery = useCourseMessages(courseId);
    const sendMessage = useSendCourseMessage(courseId);
    const deleteMessage = useDeleteCourseMessage(courseId);

    const [store, setStore] = useState<Map<number, CourseMessage>>(() => new Map());
    // `null` — eskiroq sahifa hali yuklanmagan, «yana bormi»ni oxirgi
    // oynaning javobi aytadi.
    const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [draft, setDraft] = useState('');
    const [deleting, setDeleting] = useState<CourseMessage | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const stickToBottom = useRef(true);
    // Eski xabarlar tepaga qo'shilganda ko'rinib turgan joy sakramasligi uchun.
    const heightBeforePrepend = useRef<number | null>(null);

    // ── Oxirgi oynani jamlanmaga qo'shish ────────────────────────────────
    useEffect(() => {
        const latest = latestQuery.data;
        if (!latest) return;
        setStore((prev) => {
            const next = new Map(prev);
            const windowStart = latest.messages[0]?.id;
            // Oyna ichidagi, lekin javobda yo'q xabar — boshqa birov
            // tomonidan o'chirilgan.
            for (const id of next.keys()) {
                if (windowStart === undefined ? !latest.has_more : id >= windowStart) next.delete(id);
            }
            for (const message of latest.messages) next.set(message.id, message);
            return next;
        });
    }, [latestQuery.data]);

    const messages = useMemo(() => [...store.values()].sort((a, b) => a.id - b.id), [store]);
    const hasMore = olderHasMore ?? latestQuery.data?.has_more ?? false;

    // ── Aylantirish ──────────────────────────────────────────────────────
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (heightBeforePrepend.current !== null) {
            el.scrollTop += el.scrollHeight - heightBeforePrepend.current;
            heightBeforePrepend.current = null;
            return;
        }
        // O'qituvchi yuqorida eski xabarni o'qiyotgan bo'lsa, yangi xabar
        // uni pastga sudrab ketmasin.
        if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    };

    const loadOlder = async () => {
        const oldest = messages[0];
        if (!oldest || loadingOlder) return;
        setLoadingOlder(true);
        try {
            const page = await courseChatService.list(courseId, oldest.id);
            heightBeforePrepend.current = scrollRef.current?.scrollHeight ?? null;
            setStore((prev) => {
                const next = new Map(prev);
                for (const message of page.messages) next.set(message.id, message);
                return next;
            });
            setOlderHasMore(page.has_more);
        } catch (cause) {
            toast.error(apiErrorMessage(cause, "Oldingi xabarlarni yuklab bo'lmadi"));
        } finally {
            setLoadingOlder(false);
        }
    };

    // ── Yuborish ─────────────────────────────────────────────────────────
    const resizeTextarea = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        // Scroll paneli faqat matn maksimal balandlikdan oshganda.
        el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden';
    };

    const submit = async () => {
        const body = draft.trim();
        if (!body || sendMessage.isPending) return;
        try {
            const created = await sendMessage.mutateAsync(body);
            stickToBottom.current = true;
            setStore((prev) => new Map(prev).set(created.id, created));
            setDraft('');
            requestAnimationFrame(resizeTextarea);
        } catch (cause) {
            toast.error(apiErrorMessage(cause, "Xabarni yuborib bo'lmadi"));
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteMessage.mutateAsync(deleting.id);
            setStore((prev) => {
                const next = new Map(prev);
                next.delete(deleting.id);
                return next;
            });
            setDeleting(null);
        } catch (cause) {
            toast.error(apiErrorMessage(cause, "Xabarni o'chirib bo'lmadi"));
        }
    };

    // ── Chizish ──────────────────────────────────────────────────────────
    const renderMessages = () => {
        if (latestQuery.isLoading) {
            return (
                <div className="space-y-4 p-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className={cn('h-14 w-2/3 rounded-2xl', index % 2 === 1 && 'ml-auto')} />
                    ))}
                </div>
            );
        }
        if (latestQuery.isError && messages.length === 0) {
            return <ErrorState onRetry={() => { void latestQuery.refetch(); }} />;
        }
        if (messages.length === 0) {
            return (
                <div className="flex h-full items-center justify-center">
                    <EmptyState
                        icon={<MessagesSquare className="h-6 w-6" />}
                        title="Hali xabar yo'q"
                        description={readOnly
                            ? 'Bu kursda muloqot bo\'lmagan.'
                            : "Birinchi bo'lib yozing — savol, e'lon yoki izoh kursdagi hammaga ko'rinadi."}
                    />
                </div>
            );
        }

        return (
            <div className="space-y-1 px-3 py-4 sm:px-4">
                {hasMore && (
                    <div className="flex justify-center pb-3">
                        <Button variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                            {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />}
                            Oldingi xabarlar
                        </Button>
                    </div>
                )}
                {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const day = formatDate(message.created_at);
                    const newDay = !previous || formatDate(previous.created_at) !== day;
                    // Bir muallifning ketma-ket xabarlari bitta blok bo'lib
                    // ko'rinadi — ism va avatar faqat birinchisida.
                    const continued = !newDay && previous?.user_id === message.user_id;
                    const own = message.user_id !== null && message.user_id === user?.id;
                    const badge = ROLE_BADGE[message.author_role];

                    return (
                        <div key={message.id}>
                            {newDay && (
                                <div className="flex items-center gap-3 py-3">
                                    <span className="h-px flex-1 bg-border" />
                                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{day}</span>
                                    <span className="h-px flex-1 bg-border" />
                                </div>
                            )}
                            <div className={cn('group flex items-end gap-2', own && 'flex-row-reverse', !continued && 'mt-3')}>
                                {own ? null : continued ? (
                                    <span className="w-8 shrink-0" />
                                ) : (
                                    <PersonAvatar
                                        id={message.user_id ?? 0}
                                        name={message.author_name}
                                        className="h-8 w-8 rounded-full text-[11px]"
                                    />
                                )}
                                <div className={cn('flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]', own && 'items-end')}>
                                    {!continued && !own && (
                                        <div className="mb-1 flex items-center gap-1.5 px-1">
                                            <span className="truncate text-xs font-semibold text-foreground">{message.author_name}</span>
                                            {badge && (
                                                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                                                    {badge}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className={cn('flex items-center gap-1', own && 'flex-row-reverse')}>
                                        <div
                                            className={cn(
                                                'rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-[0_1px_2px_rgba(16,24,40,0.05)]',
                                                own
                                                    ? 'rounded-br-md bg-primary text-primary-foreground'
                                                    : message.author_role === 'teacher'
                                                        ? 'rounded-bl-md bg-primary/10 text-foreground ring-1 ring-inset ring-primary/20'
                                                        : 'rounded-bl-md bg-muted text-foreground',
                                            )}
                                        >
                                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                            <p
                                                className={cn(
                                                    'mt-0.5 text-right text-[10px] tabular-nums',
                                                    own ? 'text-primary-foreground/70' : 'text-muted-foreground',
                                                )}
                                            >
                                                {formatTime(message.created_at)}
                                            </p>
                                        </div>
                                        {message.can_delete && (
                                            <button
                                                type="button"
                                                aria-label="Xabarni o'chirish"
                                                onClick={() => setDeleting(message)}
                                                className="rounded-lg p-1.5 text-muted-foreground/60 opacity-100 transition hover:bg-muted hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex h-[min(70vh,640px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <div ref={scrollRef} onScroll={onScroll} className="custom-scrollbar flex-1 overflow-y-auto">
                {renderMessages()}
            </div>

            {readOnly ? (
                <div className="border-t border-border/60 bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
                    Kurs arxivda — chat faqat o'qish uchun.
                </div>
            ) : (
                <form
                    className="flex items-end gap-2 border-t border-border/60 bg-card p-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={draft}
                        rows={1}
                        maxLength={COURSE_MESSAGE_MAX_LENGTH}
                        placeholder="Xabar yozing…"
                        aria-label="Xabar matni"
                        onChange={(event) => {
                            setDraft(event.target.value);
                            resizeTextarea();
                        }}
                        onKeyDown={(event) => {
                            // Enter — yuborish, Shift+Enter — yangi qator. IME
                            // (masalan, kirill klaviaturasidagi tanlov) paytida
                            // Enter so'zni tasdiqlaydi, yubormaydi.
                            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                        className="custom-scrollbar max-h-40 min-h-11 flex-1 resize-none overflow-y-hidden rounded-xl border border-input bg-card px-3 py-2.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 md:text-sm"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        aria-label="Yuborish"
                        disabled={!draft.trim() || sendMessage.isPending}
                        className="h-11 w-11 shrink-0 rounded-xl md:h-10 md:w-10"
                    >
                        {sendMessage.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <SendHorizontal className="h-4 w-4" />}
                    </Button>
                </form>
            )}

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={() => void confirmDelete()}
                title="Xabarni o'chirish"
                description="Xabar chatdagi hamma uchun o'chiriladi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
                variant="danger"
                isLoading={deleteMessage.isPending}
            />
        </div>
    );
}

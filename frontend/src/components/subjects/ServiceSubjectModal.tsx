import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCreateServiceSubject } from '@/hooks/useSubjects';
import { apiErrorMessage } from '@/utils/apiError';

const schema = z.object({
    name: z.string().min(2, 'Fan nomi kiritilishi shart'),
});

type FormValues = z.infer<typeof schema>;

interface ServiceSubjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

/**
 * Xizmat fani yaratish.
 *
 * Nega alohida oyna, oddiy «fan qo'shish» emas: fanlar EPMOS ko'zgusi va
 * ularni qo'lda yaratish 2026-09-11 da yopilgan. Bu yerda esa ataylab
 * boshqa turkum — faqat test uchun, hisob-kitobdan tashqarida. Shuning
 * uchun formada bitta maydon: qolgan hamma narsani server qo'yadi
 * (`POST /subject/service` har doim `is_countable=false`).
 */
export const ServiceSubjectModal = ({ isOpen, onClose, onSuccess }: ServiceSubjectModalProps) => {
    const { t } = useTranslation();
    const mutation = useCreateServiceSubject();

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '' } });

    useEffect(() => {
        if (isOpen) reset({ name: '' });
    }, [isOpen, reset]);

    const onSubmit = (data: FormValues) =>
        mutation.mutate(
            { name: data.name.trim() },
            {
                onSuccess: () => {
                    toast.success(t('Xizmat fani yaratildi'));
                    onSuccess?.();
                    onClose();
                },
                onError: (error) =>
                    toast.error(apiErrorMessage(error, t('Fan yaratishda xatolik yuz berdi'))),
            },
        );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('Xizmat fani yaratish')}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {t(
                        'Bu fan faqat test uchun: unga savol yuklanadi va test tuziladi. Natijalari reyting, panel va statistikaga kirmaydi. Kurslar va yuklamada bunday fan ko‘rinmaydi.',
                    )}
                </p>

                <Input
                    label={t('Fan nomi')}
                    placeholder={t('Masalan: Kirish sinovi 2026')}
                    error={errors.name?.message}
                    {...register('name')}
                />

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('Bekor qilish')}
                    </Button>
                    <Button type="submit" isLoading={mutation.isPending}>
                        {t('Yaratish')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

import { useState } from 'react';
import { IdCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useRoleView } from '@/hooks/useRoleView';
import { cn } from '@/lib/utils';
import { StudentBadgeModal } from './StudentBadgeModal';

interface StudentBadgeButtonProps {
    studentId: number;
    className?: string;
}

/**
 * «Bejik yaratish» — talaba profilida, faqat admin ko'rinishida.
 *
 * Tugmani yashirish qulaylik uchun, himoya emas: bejik endpointlari rolni
 * backendda o'zi tekshiradi (`AdminRequired`).
 */
export const StudentBadgeButton = ({ studentId, className }: StudentBadgeButtonProps) => {
    const { t } = useTranslation();
    const { isAdmin } = useRoleView();
    const [isOpen, setIsOpen] = useState(false);

    if (!isAdmin) return null;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className={cn('gap-1.5 font-semibold shadow-sm', className)}
                onClick={() => setIsOpen(true)}
            >
                <IdCard className="h-4 w-4" />
                <span>{t('Bejik yaratish')}</span>
            </Button>
            <StudentBadgeModal isOpen={isOpen} onClose={() => setIsOpen(false)} studentId={studentId} />
        </>
    );
};

export default StudentBadgeButton;

/**
 * Ruxsat yetishmaganda koʻrsatiladigan sahifa.
 *
 * Ilgari bunday holatda foydalanuvchi jimgina bosh sahifaga otib yuborilardi.
 * Amalda bu shunday koʻrinardi: oʻqituvchi natijadagi «Koʻrish» tugmasini
 * bosadi va oʻzini Savollar sahifasida koʻradi — chunki oʻqituvchi uchun bosh
 * sahifa oʻsha. Sababi hech qayerda aytilmasdi va buzilgan tugma kabi
 * tuyulardi.
 *
 * Endi sahifa nima yetishmayotganini aytadi va kimga murojaat qilishni
 * koʻrsatadi.
 */
import { useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AccessDeniedProps {
    /** Yetishmayotgan ruxsat(lar) — adminга aytish uchun koʻrsatiladi. */
    required: string[];
}

export const AccessDenied = ({ required }: AccessDeniedProps) => {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <ShieldOff className="h-6 w-6 text-muted-foreground" />
            </span>

            <div className="space-y-1.5">
                <h1 className="text-xl font-semibold">Bu boʻlim sizga ochiq emas</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                    Sahifani ochish uchun kerakli ruxsat rolingizga biriktirilmagan. Agar bu
                    ish uchun zarur boʻlsa, administratorga murojaat qiling.
                </p>
            </div>

            {/* Ruxsat nomi ataylab koʻrsatiladi: admin uni /roles sahifasidan
                qidirib topishi kerak, «ruxsat yoʻq» degan umumiy gap yetarli emas. */}
            <p className="font-mono text-xs text-muted-foreground">
                Kerakli ruxsat: {required.join(' yoki ')}
            </p>

            <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate(-1)}>
                    Orqaga
                </Button>
                <Button onClick={() => navigate('/')}>Bosh sahifa</Button>
            </div>
        </div>
    );
};

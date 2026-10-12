import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { HEMIS_OAUTH_FROM_KEY, hemisService } from '@/services/hemisService';
import { apiErrorMessage } from '@/utils/apiError';
import { logger } from '@/utils/logger';
import { BRAND } from '@/config/branding';
import logo from '@/assets/logo.png';

/**
 * HEMIS OAuth qaytaradigan sahifa: `?code=...&state=...`.
 *
 * Kod bir martalik, `state` ham — shuning uchun so'rov faqat bir marta
 * yuboriladi (StrictMode effektni ikki marta chaqiradi, ikkinchisi
 * `hemis_oauth_state_invalid` olardi va muvaffaqiyatli kirish ustiga xato
 * chiqardi).
 */
export const HemisOAuthCallback: React.FC = () => {
    const [params] = useSearchParams();
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = React.useState<string | null>(null);
    const started = React.useRef(false);

    React.useEffect(() => {
        if (started.current) return;
        started.current = true;

        const code = params.get('code');
        const state = params.get('state');
        // HEMIS rad etsa (odam «Bekor qilish»ni bosgan) — `?error=access_denied`.
        if (params.get('error') || !code || !state) {
            setError("HEMIS orqali kirish bekor qilindi yoki yakunlanmadi.");
            return;
        }

        (async () => {
            try {
                const { access_token } = await hemisService.completeOAuth(code, state);
                await login(access_token);
                let from = '/';
                try {
                    from = sessionStorage.getItem(HEMIS_OAUTH_FROM_KEY) || '/';
                    sessionStorage.removeItem(HEMIS_OAUTH_FROM_KEY);
                } catch {
                    // sessionStorage yo'q — bosh sahifaga.
                }
                navigate(from, { replace: true });
            } catch (err) {
                logger.error('HEMIS OAuth callback failed', err);
                setError(apiErrorMessage(err, "Kirishda xatolik yuz berdi. Qaytadan urinib ko'ring."));
            }
        })();
    }, [params, login, navigate]);

    return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-4">
            <div className="w-full max-w-[420px] space-y-6 rounded-xl border border-border bg-card p-6 text-center shadow-[var(--surface-shadow)] sm:p-9">
                <img src={logo} alt={BRAND.shortName} className="mx-auto h-14 w-14 rounded-2xl object-contain" />
                {error ? (
                    <>
                        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                        </div>
                        <Link to="/login" replace className="inline-block text-sm font-medium text-primary hover:underline">
                            Kirish sahifasiga qaytish
                        </Link>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>HEMIS orqali kirilmoqda…</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HemisOAuthCallback;

import { useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { hemisService } from '@/services/hemisService';
import { formatDateTime } from '@/utils/date';

/**
 * HEMIS ma'lumot API tokeni: saqlash va tekshirish.
 *
 * Token butun talabalar importining kaliti, shuning uchun u importdan alohida
 * kartochkada turadi: 401 bilan to'xtagan sinxronizatsiyani tuzatish uchun
 * admin shu yerga yangisini qo'yadi.
 */
export const HemisDataToken = () => {
    const queryClient = useQueryClient();
    const [token, setToken] = useState('');

    const settingsQuery = useQuery({
        queryKey: ['hemis-data-settings'],
        queryFn: () => hemisService.getDataSettings(),
    });

    const saveToken = useMutation({
        mutationFn: () => hemisService.saveDataSettings({ token: token.trim() }),
        onSuccess: () => {
            setToken('');
            queryClient.invalidateQueries({ queryKey: ['hemis-data-settings'] });
            toast.success('Token saqlandi');
        },
        onError: () => toast.error("Tokenni saqlab bo'lmadi"),
    });

    const testToken = useMutation({
        mutationFn: () => hemisService.testDataToken(),
        onSuccess: (data) => {
            if (data.ok) toast.success(`Token ishlayapti — ${data.total} ta faol talaba`);
            else toast.error(data.detail || 'Token qabul qilinmadi');
            queryClient.invalidateQueries({ queryKey: ['hemis-data-settings'] });
        },
        onError: () => toast.error('Tekshirib bo‘lmadi'),
    });

    const settings = settingsQuery.data;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeyRound className="h-4 w-4" />
                    HEMIS ma'lumot API tokeni
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {settings?.has_token ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Token saqlangan {settings.token_tail}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Token kiritilmagan
                        </span>
                    )}
                    {settings?.last_ok_at && (
                        <span className="text-xs text-muted-foreground">
                            oxirgi muvaffaqiyatli so'rov: {formatDateTime(settings.last_ok_at)}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="w-full sm:w-[360px]">
                        <Input
                            type="password"
                            // Bu maydon hisob paroli emas — API tokeni. Himoyasiz
                            // qoldirilsa, brauzer uni login formasi deb o'ylab
                            // saqlangan foydalanuvchi nomini sahifadagi boshqa
                            // maydonga (masalan, yon menyu qidiruviga) qo'yib
                            // yuboradi. `new-password` shu evristikani to'xtatadi.
                            autoComplete="new-password"
                            name="hemis-data-token"
                            data-1p-ignore
                            data-lpignore="true"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="Yangi tokenni qo'ying"
                            label="Token"
                        />
                    </div>
                    <Button
                        onClick={() => saveToken.mutate()}
                        disabled={!token.trim() || saveToken.isPending}
                    >
                        Saqlash
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => testToken.mutate()}
                        disabled={testToken.isPending || !settings?.has_token}
                    >
                        {testToken.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Tekshirish
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Token muddati tugaydi. Sinxronizatsiya 401 bilan to'xtasa — shu yerga yangisini qo'ying.
                    Saqlangan token hech qachon qaytarilmaydi, faqat oxirgi to'rt belgisi ko'rinadi.
                </p>
            </CardContent>
        </Card>
    );
};

import { CheckCircle2, AlertCircle } from 'lucide-react';

export function InstructionPreview({ instruction }: { instruction: Record<string, unknown> | null }) {
    if (!instruction) return null;
    const scoring = instruction.scoring as Record<string, unknown> | undefined;
    const method = scoring?.method as string | undefined;
    const interpretation = instruction.interpretation as Array<Record<string, unknown>> | undefined;
    const catInterp = instruction.category_interpretations as Record<string, Array<Record<string, unknown>>> | undefined;
    const reverse = (scoring?.reverse as number[] | undefined) ?? [];

    const ok = !!method && (
        (method === 'sum' && Array.isArray(interpretation) && interpretation.length > 0)
        || (method === 'category' && catInterp && Object.keys(catInterp).length > 0)
    );

    return (
        <div className={`rounded-lg border p-3 text-xs ${ok ? 'border-green-500/40 bg-green-50 dark:bg-green-950/20' : 'border-yellow-500/40 bg-yellow-50 dark:bg-yellow-950/20'}`}>
            <div className="flex items-center gap-2">
                {ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <AlertCircle className="h-4 w-4 text-yellow-600" />}
                <span className={`font-semibold ${ok ? 'text-green-900 dark:text-green-200' : 'text-yellow-900 dark:text-yellow-200'}`}>
                    {ok ? 'Diagnostika sozlandi' : "Diagnostika to'liq sozlanmagan"}
                </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                <span>Rejim: <b className="text-foreground">{method ?? '—'}</b></span>
                {method === 'sum' && (
                    <span>Oraliqlar: <b className="text-foreground">{interpretation?.length ?? 0}</b></span>
                )}
                {method === 'category' && (
                    <span>Kategoriyalar: <b className="text-foreground">{Object.keys(catInterp ?? {}).length}</b></span>
                )}
                {reverse.length > 0 && (
                    <span>Teskari savollar: <b className="text-foreground">{reverse.join(', ')}</b></span>
                )}
            </div>
        </div>
    );
}

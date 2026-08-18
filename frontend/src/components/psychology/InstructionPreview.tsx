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
        <div className={`rounded-lg border p-3 text-xs ${ok ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
            <div className="flex items-center gap-2">
                {ok
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <AlertCircle className="h-4 w-4 text-warning" />}
                <span className="font-semibold text-foreground">
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

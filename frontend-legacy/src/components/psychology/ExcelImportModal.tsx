import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { psychologyService, type QuestionType } from '@/services/psychologyService';

import {
    TYPE_DISPLAY_LABEL,
    buildPayload,
    buildTemplateWorkbook,
    readSheet,
    type ParsedRow,
} from './excelIO';

const ALL_TYPES: QuestionType[] = [
    'text',
    'true_false',
    'scale',
    'image_stimulus',
    'image_choice',
    'multi_choice',
];

export function ExcelImportModal({
    open,
    onClose,
    methodId,
    category,
    nextOrder,
}: {
    open: boolean;
    onClose: () => void;
    methodId: number;
    /** Category these questions will be assigned to. Pass `null` for sum-mode or
     *  single-category methods where category doesn't apply. */
    category: string | null;
    /** First `order` value to use for the imported questions. The modal increments
     *  by 1 per row so each question gets a unique order within the method. */
    nextOrder: number;
}) {
    const qc = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string>('');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [parseError, setParseError] = useState<string>('');

    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<{ done: number; failed: { row: number; reason: string }[] }>({ done: 0, failed: [] });
    const [finished, setFinished] = useState(false);

    const reset = () => {
        setFileName('');
        setRows([]);
        setParseError('');
        setProgress({ done: 0, failed: [] });
        setFinished(false);
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        if (importing) return;
        reset();
        onClose();
    };

    const handleFile = async (file: File) => {
        reset();
        setFileName(file.name);
        try {
            const buf = await file.arrayBuffer();
            const { rows: raw, error } = readSheet(buf);
            if (error) {
                setParseError(error);
                return;
            }
            const parsed = raw.map((r, i) =>
                buildPayload(r, {
                    methodId,
                    rowNumber: i + 2,
                    order: nextOrder + i,
                    category,
                }),
            );
            setRows(parsed);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setParseError(`Faylni o'qib bo'lmadi: ${msg}`);
        }
    };

    const handleTemplateDownload = () => {
        XLSX.writeFile(buildTemplateWorkbook(), 'psychology-template.xlsx');
    };

    const validRows = useMemo(() => rows.filter((r) => r.payload), [rows]);
    const invalidRows = useMemo(() => rows.filter((r) => r.error), [rows]);

    const counts = useMemo(() => {
        const c: Record<QuestionType, number> = {
            text: 0,
            true_false: 0,
            scale: 0,
            image_stimulus: 0,
            image_choice: 0,
            multi_choice: 0,
        };
        for (const r of validRows) {
            if (r.payload) c[r.payload.question_type] += 1;
        }
        return c;
    }, [validRows]);

    const handleImport = async () => {
        if (validRows.length === 0) return;
        setImporting(true);
        setProgress({ done: 0, failed: [] });

        for (const row of validRows) {
            if (!row.payload) continue;
            try {
                await psychologyService.createQuestion(row.payload);
                setProgress((p) => ({ ...p, done: p.done + 1 }));
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                setProgress((p) => ({ ...p, failed: [...p.failed, { row: row.rowNumber, reason }] }));
            }
        }

        setImporting(false);
        setFinished(true);
        qc.invalidateQueries({ queryKey: ['psychology-methods'] });
        qc.invalidateQueries({ queryKey: ['psychology-method', methodId] });
    };

    return (
        <Modal isOpen={open} onClose={handleClose} title="Excel orqali savollar import qilish">
            <div className="flex flex-col gap-4">
                {category && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                        Barcha qatorlar <b className="text-primary">{category}</b> kategoriyasiga biriktiriladi.
                    </div>
                )}

                {!fileName && !parseError && (
                    <div className="flex flex-col gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleTemplateDownload}
                            className="self-start gap-1.5"
                        >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Shablon yuklab olish
                        </Button>
                        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
                            <Upload className="h-6 w-6 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">Excel faylni tanlang</span>
                            <span className="text-[11px] text-muted-foreground">.xlsx fayl, &quot;Savollar&quot; varagʻi shabloniga mos</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFile(f);
                                }}
                            />
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                            Eslatma: import yangi savollarni qo'shadi va mavjudlarini o'zgartirmaydi. Aynan
                            shu fayl ikki marta yuklansa, savollar takrorlanadi.
                        </p>
                    </div>
                )}

                {parseError && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{parseError}</span>
                    </div>
                )}

                {fileName && !parseError && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 truncate">
                                <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                                <span className="truncate font-medium text-foreground">{fileName}</span>
                            </div>
                            {!importing && !finished && (
                                <button onClick={reset} className="text-muted-foreground hover:text-destructive">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                            {ALL_TYPES.map((t) => (
                                <SummaryCell key={t} label={TYPE_DISPLAY_LABEL[t]} value={counts[t]} />
                            ))}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Jami yaroqli: <b className="text-foreground">{validRows.length}</b></span>
                            {invalidRows.length > 0 && (
                                <span className="text-destructive">Xatolar: <b>{invalidRows.length}</b></span>
                            )}
                        </div>

                        {/* Errors list */}
                        {invalidRows.length > 0 && !finished && (
                            <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-destructive/5 p-2">
                                <ul className="space-y-1 text-[11px] text-destructive">
                                    {invalidRows.map((r) => (
                                        <li key={r.rowNumber}>Qator {r.rowNumber}: {r.error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Progress */}
                        {(importing || finished) && (
                            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">
                                        {importing ? "Yuklanmoqda…" : 'Yuklash yakunlandi'}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {progress.done} / {validRows.length}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full bg-primary transition-all"
                                        style={{ width: `${validRows.length === 0 ? 0 : (progress.done / validRows.length) * 100}%` }}
                                    />
                                </div>
                                {progress.failed.length > 0 && (
                                    <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-destructive">
                                        {progress.failed.map((f) => (
                                            <li key={f.row}>Qator {f.row}: {f.reason}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {finished && progress.failed.length === 0 && (
                            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                Hammasi muvaffaqiyatli yuklandi.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                    <Button variant="outline" onClick={handleClose} disabled={importing}>
                        {finished ? 'Yopish' : 'Bekor'}
                    </Button>
                    {!finished && (
                        <Button
                            onClick={handleImport}
                            disabled={importing || validRows.length === 0}
                        >
                            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Yuklash ({validRows.length})
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex flex-col rounded-lg border border-border bg-muted/20 px-2.5 py-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="text-base font-semibold text-foreground">{value}</span>
        </div>
    );
}

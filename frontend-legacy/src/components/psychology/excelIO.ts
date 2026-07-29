import * as XLSX from 'xlsx';

import type {
    MethodResponse,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionType,
} from '@/services/psychologyService';

export type RawRow = Record<string, unknown>;

export interface ParsedRow {
    rowNumber: number;
    payload?: QuestionCreateRequest;
    error?: string;
}

export interface BuildContext {
    methodId: number;
    rowNumber: number;
    order: number;
    category: string | null;
}

const SHEET_NAME = 'Savollar';
const MAX_OPTIONS = 10;

export const TYPE_SYNONYMS: Record<string, QuestionType> = {
    matnli: 'text',
    matn: 'text',
    text: 'text',
    ha_yoq: 'true_false',
    'ha-yoq': 'true_false',
    haqiqiy: 'true_false',
    true_false: 'true_false',
    shkala: 'scale',
    scale: 'scale',
    rasm_stimul: 'image_stimulus',
    matn_rasm: 'image_stimulus',
    image_stimulus: 'image_stimulus',
    rasmli_variant: 'image_choice',
    rasm_variant: 'image_choice',
    image_choice: 'image_choice',
    koplab_tanlov: 'multi_choice',
    koplab: 'multi_choice',
    multi_choice: 'multi_choice',
};

export const TYPE_EXPORT_LABEL: Record<QuestionType, string> = {
    text: 'matnli',
    true_false: 'ha_yoq',
    scale: 'shkala',
    image_stimulus: 'rasm_stimul',
    image_choice: 'rasmli_variant',
    multi_choice: 'koplab_tanlov',
};

export const TYPE_DISPLAY_LABEL: Record<QuestionType, string> = {
    text: 'Matnli',
    true_false: "Ha / Yo'q",
    scale: 'Shkala',
    image_stimulus: 'Rasm + matn',
    image_choice: 'Rasmli variant',
    multi_choice: "Ko'plab tanlov",
};

function variantCols(i: number): string[] {
    return [
        `variant_${i}_matn`,
        `variant_${i}_qiymat`,
        `variant_${i}_tasvir`,
        `variant_${i}_tavsif`,
    ];
}

export const EXCEL_COLUMNS: string[] = [
    'savol_turi',
    'kategoriya',
    'tartib',
    'matn',
    'tasvir',
    'tavsif',
    'shkala_min',
    'shkala_max',
    'shkala_min_belgi',
    'shkala_max_belgi',
    ...Array.from({ length: MAX_OPTIONS }, (_, idx) => variantCols(idx + 1)).flat(),
];

function pick(row: RawRow, ...keys: string[]): unknown {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    return undefined;
}

function asString(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

function asNumber(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
}

function asValue(v: unknown): number | string {
    const n = asNumber(v);
    if (n !== null) return n;
    return asString(v);
}

export function buildPayload(row: RawRow, ctx: BuildContext): ParsedRow {
    const rawType = asString(pick(row, 'savol_turi', 'question_type')).toLowerCase();
    if (!rawType) return { rowNumber: ctx.rowNumber, error: "savol_turi bo'sh" };
    const type = TYPE_SYNONYMS[rawType];
    if (!type) {
        return {
            rowNumber: ctx.rowNumber,
            error: `savol_turi='${rawType}' qo'llab-quvvatlanmaydi`,
        };
    }

    const text = asString(pick(row, 'matn', 'text'));
    const imageUrl = asString(pick(row, 'tasvir', 'image_url'));
    const description = asString(pick(row, 'tavsif', 'description'));
    const orderRaw = asNumber(pick(row, 'tartib', 'order'));
    const categoryRaw = asString(pick(row, 'kategoriya', 'category'));
    const category = categoryRaw || ctx.category;
    const order = orderRaw ?? ctx.order;

    let content: Record<string, unknown> = {};
    let options: Array<Record<string, unknown>> | null = null;

    if (type === 'true_false') {
        if (!text) return { rowNumber: ctx.rowNumber, error: "matn ustuni bo'sh" };
        content = { text };
    } else if (type === 'scale') {
        if (!text) return { rowNumber: ctx.rowNumber, error: "matn ustuni bo'sh" };
        const min = asNumber(pick(row, 'shkala_min', 'scale_min'));
        const max = asNumber(pick(row, 'shkala_max', 'scale_max'));
        if (min === null || max === null) {
            return { rowNumber: ctx.rowNumber, error: 'shkala uchun shkala_min va shkala_max majburiy' };
        }
        if (min >= max) {
            return { rowNumber: ctx.rowNumber, error: "shkala_min < shkala_max bo'lishi kerak" };
        }
        content = { text, min, max };
        const minLabel = asString(pick(row, 'shkala_min_belgi', 'scale_min_label'));
        const maxLabel = asString(pick(row, 'shkala_max_belgi', 'scale_max_label'));
        if (minLabel) content.min_label = minLabel;
        if (maxLabel) content.max_label = maxLabel;
    } else if (type === 'text') {
        if (!text) return { rowNumber: ctx.rowNumber, error: "matn ustuni bo'sh" };
        content = { text };
        const collected = collectOptions(row, ctx, type);
        if (typeof collected === 'string') {
            return { rowNumber: ctx.rowNumber, error: collected };
        }
        options = collected;
    } else if (type === 'image_stimulus') {
        if (!imageUrl) {
            return { rowNumber: ctx.rowNumber, error: "rasm_stimul uchun tasvir (image_url) majburiy" };
        }
        content = { image_url: imageUrl };
        if (text) content.text = text;
        const collected = collectOptions(row, ctx, type);
        if (typeof collected === 'string') {
            return { rowNumber: ctx.rowNumber, error: collected };
        }
        options = collected;
    } else if (type === 'image_choice') {
        content = {};
        if (text) content.text = text;
        const collected = collectOptions(row, ctx, type);
        if (typeof collected === 'string') {
            return { rowNumber: ctx.rowNumber, error: collected };
        }
        options = collected;
    } else if (type === 'multi_choice') {
        if (!text) {
            return { rowNumber: ctx.rowNumber, error: "matn ustuni bo'sh" };
        }
        content = { text };
        if (imageUrl) content.image_url = imageUrl;
        if (description) content.description = description;
        const collected = collectOptions(row, ctx, type);
        if (typeof collected === 'string') {
            return { rowNumber: ctx.rowNumber, error: collected };
        }
        options = collected;
    }

    return {
        rowNumber: ctx.rowNumber,
        payload: {
            method_id: ctx.methodId,
            question_type: type,
            content,
            options,
            order,
            category: category || null,
        },
    };
}

function collectOptions(
    row: RawRow,
    ctx: BuildContext,
    type: QuestionType,
): Array<Record<string, unknown>> | string {
    const opts: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= MAX_OPTIONS; i++) {
        const t = asString(pick(row, `variant_${i}_matn`, `option_${i}_text`));
        const v = pick(row, `variant_${i}_qiymat`, `option_${i}_value`);
        const img = asString(pick(row, `variant_${i}_tasvir`, `option_${i}_image_url`));
        const desc = asString(pick(row, `variant_${i}_tavsif`, `option_${i}_description`));
        const isEmpty = !t && v === undefined && !img && !desc;
        if (isEmpty) continue;

        if (type === 'text' || type === 'image_stimulus') {
            if (!t) {
                return `variant_${i}_matn bo'sh, ammo qiymat berilgan (Qator ${ctx.rowNumber})`;
            }
            opts.push({ text: t, value: asValue(v) });
        } else if (type === 'image_choice') {
            if (!img) {
                return `variant_${i}_tasvir bo'sh, ammo qiymat berilgan (Qator ${ctx.rowNumber})`;
            }
            opts.push({ image_url: img, value: asValue(v) });
        } else if (type === 'multi_choice') {
            const opt: Record<string, unknown> = { value: asValue(v ?? i) };
            if (t) opt.text = t;
            if (img) opt.image_url = img;
            if (desc) opt.description = desc;
            if (!t && !img && !desc) {
                return `variant_${i} uchun matn, tasvir yoki tavsif kerak (Qator ${ctx.rowNumber})`;
            }
            opts.push(opt);
        }
    }

    if (type === 'text' || type === 'image_stimulus') {
        if (opts.length < 2) {
            return `${type} turi uchun kamida 2 ta variant kerak (Qator ${ctx.rowNumber})`;
        }
    } else if (type === 'image_choice') {
        if (opts.length < 2) {
            return `rasmli_variant turi uchun kamida 2 ta variant kerak (Qator ${ctx.rowNumber})`;
        }
    } else if (type === 'multi_choice') {
        if (opts.length < 1) {
            return `koplab_tanlov turi uchun kamida 1 ta variant kerak (Qator ${ctx.rowNumber})`;
        }
    }

    return opts;
}

export function buildExportRow(q: QuestionResponse): RawRow {
    const row: RawRow = {};
    for (const col of EXCEL_COLUMNS) row[col] = '';

    row['savol_turi'] = TYPE_EXPORT_LABEL[q.question_type] ?? q.question_type;
    row['kategoriya'] = q.category ?? '';
    row['tartib'] = q.order;

    const c = q.content ?? {};
    const text = (c['text'] as string | undefined) ?? '';
    const imageUrl = (c['image_url'] as string | undefined) ?? '';
    const description = (c['description'] as string | undefined) ?? '';

    row['matn'] = text;
    row['tasvir'] = imageUrl;
    row['tavsif'] = description;

    if (q.question_type === 'scale') {
        row['shkala_min'] = (c['min'] as number | undefined) ?? '';
        row['shkala_max'] = (c['max'] as number | undefined) ?? '';
        row['shkala_min_belgi'] = (c['min_label'] as string | undefined) ?? '';
        row['shkala_max_belgi'] = (c['max_label'] as string | undefined) ?? '';
    }

    const opts = q.options ?? [];
    opts.slice(0, MAX_OPTIONS).forEach((opt, idx) => {
        const i = idx + 1;
        const o = opt as Record<string, unknown>;
        row[`variant_${i}_matn`] = (o['text'] as string | undefined) ?? '';
        const v = o['value'];
        row[`variant_${i}_qiymat`] =
            v === undefined || v === null ? '' : (v as number | string);
        row[`variant_${i}_tasvir`] = (o['image_url'] as string | undefined) ?? '';
        row[`variant_${i}_tavsif`] = (o['description'] as string | undefined) ?? '';
    });

    return row;
}

function makeSheet(rows: RawRow[]): XLSX.WorkSheet {
    const sheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_COLUMNS });
    const colWidths = EXCEL_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
    sheet['!cols'] = colWidths;
    return sheet;
}

export function buildExportWorkbook(method: MethodResponse): XLSX.WorkBook {
    const rows = [...method.questions]
        .sort((a, b) => a.order - b.order)
        .map(buildExportRow);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(rows), SHEET_NAME);
    return wb;
}

export function buildTemplateWorkbook(): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet([]), SHEET_NAME);
    return wb;
}

export function readSheet(buf: ArrayBuffer): { rows: RawRow[]; error?: string } {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) {
        return { rows: [], error: 'Excel ichida hech qanday list topilmadi.' };
    }
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
    return { rows };
}

export function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'psychology';
}

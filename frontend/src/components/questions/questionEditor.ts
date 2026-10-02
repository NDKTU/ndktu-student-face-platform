import { useMemo } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/config/env';
import { getToken } from '@/services/tokenStorage';
import { logger } from '@/utils/logger';

/**
 * Savol muharriri (Jodit) sozlamalari — kurs savollari va elementar test
 * savollari uchun umumiy.
 *
 * Ikki forma bir xil ko'rinishi va bir xil ishlashi kerak: o'qituvchi bir
 * joyda rasm qo'ya olib, boshqasida qo'ya olmasa, bu xato deb qabul
 * qilinadi. Farq faqat rasm yuklanadigan manzilda — har bo'lim o'z
 * ruxsati bilan.
 */

const IMAGE_STYLE = 'max-width: 100%; border-radius: 6px; margin: 4px 0;';

/** Havolani muharrirga rasm sifatida qo'yadi (kutubxonadan tanlanganda). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertEditorImage = (editorInstance: any, url: string) => {
    if (!url || !editorInstance) return;
    editorInstance.selection.insertHTML(`<img src="${url}" alt="savol-rasm" style="${IMAGE_STYLE}" />`);
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const useQuestionEditorConfigs = (uploadPath: string) => {
    const uploaderConfig = useMemo(() => ({
        url: `${API_BASE_URL}${uploadPath}`,
        format: 'json',
        headers: {
            Authorization: `Bearer ${getToken() || ''}`,
        },
        filesVariableName: () => 'file',
        isSuccess: (resp: any) => Boolean(resp && !resp.error && resp.url),
        process: (resp: any) => ({
            files: resp?.url ? [resp.url] : [],
            path: '',
            baseurl: '',
            error: resp?.error,
            msg: resp?.message || resp?.detail,
        }),
        defaultHandlerSuccess: function (this: any, data: any) {
            if (data?.files && data.files.length) {
                for (let i = 0; i < data.files.length; i += 1) {
                    this.selection.insertHTML(`<img src="${data.files[i]}" alt="savol-rasm" style="${IMAGE_STYLE}" />`);
                }
            }
        },
        defaultHandlerError: function (this: any, resp: any) {
            toast.error(resp?.msg || resp?.message || 'Rasm yuklashda xatolik yuz berdi');
        },
        error: function (this: any, err: any) {
            logger.error('Jodit upload error', err);
            toast.error('Rasm yuklashda tarmoq xatoligi');
        },
    }), [uploadPath]);

    const questionEditorConfig = useMemo(() => ({
        readonly: false,
        placeholder: 'Savol matnini kiriting...',
        minHeight: 140,
        // `true`: Jodit toolbarni ekran kengligiga qarab yig'adi (buttonsMD/SM/XS
        // to'plamlari quyida yozilgan). `false` da telefonda tugmalar qatori
        // yon tomonga chiqib ketardi.
        toolbarAdaptive: true,
        buttons: [
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'superscript', 'subscript', '|',
            'ul', 'ol', '|',
            'brush', 'image', 'table', '|',
            'undo', 'redo', '|',
            'eraser',
        ],
        buttonsMD: [
            'bold', 'italic', 'underline', '|',
            'superscript', 'subscript', '|',
            'ul', 'ol', '|',
            'image', 'table', '|',
            'undo', 'redo',
        ],
        buttonsSM: [
            'bold', 'italic', '|',
            'superscript', 'subscript', '|',
            'ul', 'ol', '|',
            'image', '|',
            'undo', 'redo',
        ],
        buttonsXS: [
            'bold', 'italic', '|',
            'superscript', 'subscript', '|',
            'image',
        ],
        showCharsCounter: true,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        uploader: uploaderConfig,
    }) as any, [uploaderConfig]);

    const optionEditorConfig = useMemo(() => ({
        readonly: false,
        placeholder: 'Variant matnini kiriting...',
        minHeight: 70,
        height: 80,
        toolbarAdaptive: true,
        buttons: [
            'bold', 'italic', '|',
            'superscript', 'subscript', '|',
            'brush', 'image', '|',
            'undo', 'redo',
        ],
        buttonsMD: [
            'bold', 'italic', '|',
            'superscript', 'subscript', '|',
            'image',
        ],
        buttonsSM: [
            'bold', 'italic', '|',
            'superscript', 'subscript', '|',
            'image',
        ],
        buttonsXS: [
            'bold', 'italic', '|',
            'image',
        ],
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        uploader: uploaderConfig,
    }) as any, [uploaderConfig]);

    return { questionEditorConfig, optionEditorConfig };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

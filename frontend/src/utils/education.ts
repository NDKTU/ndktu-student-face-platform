/**
 * Ta'lim shakli — EPOS'dan kelgan qiymatni tarjima qilinadigan kalitga solish.
 *
 * EPOS bir xil shaklni turlicha yozadi («Kunduzgi», «kunduzgi», ba'zan
 * qo'shimcha so'z bilan), lug'atda esa bitta kalit turadi. Qiymatning o'zini
 * `t()` ga bersak, ruscha interfeysda ham «kunduzgi» qolib ketardi — sahifada
 * tillar aralashib ko'rinardi.
 *
 * Tanimagan qiymat o'z holicha qaytadi: EPOS yangi shakl qo'shsa, u hech
 * bo'lmasa o'zbekcha ko'rinadi, bo'sh joy emas.
 */
const SHAPES = ['Kunduzgi', 'Sirtqi', 'Kechki', 'Masofaviy'] as const;

export const educationShapeKey = (form?: string | null): string | null => {
    if (!form) return null;
    const normalized = form.toLowerCase();
    return SHAPES.find((shape) => normalized.includes(shape.toLowerCase())) ?? form;
};

/**
 * HEMIS «3-kurs» / «5-semestr» ko'rinishida beradi — bu ham ma'lumot, ham
 * yozuv. Ruscha interfeysda ular o'zbekcha qolib ketmasin deb, raqamni
 * ajratib olib, tarjima kalitiga solamiz.
 *
 * Tanimagan shakl `null` qaytaradi — chaqiruvchi qiymatni o'z holicha
 * ko'rsatadi, chunki HEMIS yozuvini o'zgartirsa, bo'sh katak yomonroq.
 */
export const hemisOrdinal = (value?: string | null): { key: string; n: number } | null => {
    const match = /^\s*(\d+)\s*-\s*(kurs|semestr)\s*$/i.exec(value ?? '');
    return match ? { key: `{{n}}-${match[2].toLowerCase()}`, n: Number(match[1]) } : null;
};

/**
 * Muharrir qiymati amalda bo'shmi. Jodit bo'sh maydonda ham `<p><br></p>`
 * qaytaradi, lekin faqat rasmdan iborat savol bo'sh emas.
 */
export function isBlankHtml(value: string): boolean {
    if (/<img\b/i.test(value ?? '')) return false;
    const text = (value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text.length === 0;
}

/**
 * «Orqaga» tugmasi uchun manzil.
 *
 * Bitta sahifaga bir necha yo'ldan kelishadi (masalan psixologik testga —
 * talaba sahifasidan va metodlarni boshqarish sahifasidan). «Orqaga» doim
 * bitta joyga olib borsa, foydalanuvchi butunlay boshqa bo'limda qolib
 * ketadi: talaba o'zi ko'rmasligi kerak bo'lgan boshqaruv sahifasiga
 * tushib qoladi.
 *
 * Shuning uchun manzil `return_to` so'rov parametrida uzatiladi, bu
 * funksiya esa uni tekshiradi: faqat ICHKI yo'l qabul qilinadi. Tashqi
 * havola (`//example.com`, `https://…`) bo'lsa, tugma foydalanuvchini
 * saytdan olib chiqib ketardi — ochiq yo'naltirish.
 */
export const safeReturnTo = (value: string | null | undefined, fallback: string): string =>
    value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

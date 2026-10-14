/**
 * Siqmasdan yig'iladigan ZIP arxiv («store»).
 *
 * Bejiklar JPG — allaqachon siqilgan, qayta siqish hajmni deyarli
 * kamaytirmaydi. Shuning uchun fayllar arxivga o'zgarishsiz qo'yiladi va
 * alohida kutubxona kerak bo'lmaydi.
 *
 * Tuzilishi: har bir fayl uchun [mahalliy sarlavha | mazmun], oxirida
 * markaziy katalog va uning yakuniy yozuvi.
 */

export interface ZipEntry {
    name: string;
    blob: Blob;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

/** Bayroq: fayl nomi UTF-8 da (`O‘G‘LI`, kirill) — arxivatorlar to'g'ri o'qiydi. */
const FLAG_UTF8 = 0x0800;
const VERSION = 20;

export const createZip = async (entries: ZipEntry[], modified: Date = new Date()): Promise<Blob> => {
    const encoder = new TextEncoder();
    // MS-DOS vaqti: 1980-yildan boshlanadi, soniya ikkiga bo'linadi.
    const time = (modified.getHours() << 11) | (modified.getMinutes() << 5) | (modified.getSeconds() >> 1);
    const date =
        ((Math.max(modified.getFullYear(), 1980) - 1980) << 9) | ((modified.getMonth() + 1) << 5) | modified.getDate();

    const parts: BlobPart[] = [];
    const central: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const size = entry.blob.size;
        const crc = crc32(new Uint8Array(await entry.blob.arrayBuffer()));

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, VERSION, true);
        lv.setUint16(6, FLAG_UTF8, true);
        lv.setUint16(8, 0, true); // usul: siqilmagan
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, name.length, true);
        local.set(name, 30);

        const record = new Uint8Array(46 + name.length);
        const cv = new DataView(record.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, VERSION, true);
        cv.setUint16(6, VERSION, true);
        cv.setUint16(8, FLAG_UTF8, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        record.set(name, 46);

        parts.push(local, entry.blob);
        central.push(record);
        offset += local.length + size;
    }

    const centralSize = central.reduce((sum, record) => sum + record.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end], { type: 'application/zip' });
};

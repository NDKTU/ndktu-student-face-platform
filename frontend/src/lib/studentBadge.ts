/**
 * Talaba bejigi — eni 7 sm, bo'yi 9 sm (tik), chop etish uchun 300 DPI.
 *
 * Bejik canvas'da chiziladi: oldindan ko'rish ham, yuklab olinadigan JPG ham
 * aynan shu chizma, shuning uchun ekrandagi va qog'ozdagi natija bir xil.
 * Canvas o'lchami piksellarda (827 × 1063) — sahifada u CSS bilan kichraytirib
 * ko'rsatiladi, fayl esa to'liq o'lchamda saqlanadi.
 *
 * Bejikdagi yozuvlar interfeys tiliga bog'liq emas: bu universitet hujjati,
 * u doim bir xil tilda chiqadi.
 */

import qrcode from 'qrcode-generator';

export const BADGE_SIZE_CM = { width: 7, height: 9 } as const;
export const BADGE_DPI = 300;

const cmToPx = (cm: number) => Math.round((cm / 2.54) * BADGE_DPI);

export const BADGE_WIDTH = cmToPx(BADGE_SIZE_CM.width);
export const BADGE_HEIGHT = cmToPx(BADGE_SIZE_CM.height);

export interface BadgeContent {
    fullName: string;
    faculty: string | null;
    groupName: string | null;
    studentIdNumber: string | null;
    universityName: string;
    /** Qisqa nom — pastki tasmaning o'ng chetida. */
    universityShortName: string;
}

export interface BadgeAssets {
    logo: HTMLImageElement | null;
    /** `null` — o'rniga standart siluet chiziladi. */
    photo: HTMLImageElement | null;
}

// ── Rang mavzulari ───────────────────────────────────────────────────────────

export interface BadgeTheme {
    /** Sarlavha gradientining yorug' uchi (o'ng yuqori burchak). */
    main: string;
    /** Sarlavha gradientining o'rtasi. */
    mid: string;
    /** Eng to'q tus: sarlavhaning chap pasti, pastki tasma, familiya, QR kod. */
    dark: string;
    /** Oltin urg'u: qiya chiziq va to'q fondagi kichik yozuvlar. */
    accent: string;
    /** Oq kartadagi yorliqlar — oltinning oq fonda o'qiladigan to'q tusi. */
    accentDeep: string;
    /** «TALABA» yorlig'idagi nuqta. */
    dot: string;
    /** Tana foni. */
    paper: string;
    /** Ikkinchi darajali matn: QR kod ostidagi yozuv. */
    muted: string;
}

// Mavzular ilova mavzusiga (yorug'/qorong'i) bog'liq emas — bejik qog'ozga chiqadi.
const GREEN: BadgeTheme = {
    main: '#3BB583',
    mid: '#22895F',
    dark: '#1A7250',
    accent: '#E6C776',
    accentDeep: '#A07A2C',
    dot: '#6EE7A8',
    paper: '#F4F3EE',
    muted: '#7A827E',
};
// Ko'k — logotip rangi oilasidan: universitetning umumiy mavzusi.
const BLUE: BadgeTheme = {
    main: '#2F3AC6',
    mid: '#1A2187',
    dark: '#11164F',
    accent: '#E6C776',
    accentDeep: '#A07A2C',
    dot: '#7DD3FC',
    paper: '#F3F4F8',
    muted: '#5D6479',
};

/**
 * Fakultet → mavzu. Kalit so'z fakultet nomining ichidan qidiriladi
 * («Konchilik» ham, «Konchilik fakulteti» ham mos keladi). Ro'yxatda yo'q
 * fakultet universitetning ko'k mavzusida chiqadi; boshqa fakultetga rang
 * kerak bo'lsa, shu yerga bitta qator qo'shiladi.
 */
const FACULTY_THEMES: Array<{ keywords: string[]; theme: BadgeTheme }> = [
    { keywords: ['konchilik', 'кончилик'], theme: GREEN },
];

export const badgeThemeFor = (faculty: string | null): BadgeTheme => {
    const name = (faculty ?? '').toLowerCase();
    return FACULTY_THEMES.find((entry) => entry.keywords.some((keyword) => name.includes(keyword)))?.theme ?? BLUE;
};

const COLOR = {
    ink: '#12241D',
    white: '#FFFFFF',
    edge: '#CBD5E1',
    photoBg: '#E9ECF6',
    photoFg: '#BCC4D9',
};

/** `#RRGGBB` → `rgba(...)`. */
const rgba = (hex: string, alpha: number) => {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const SANS = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';

const fontOf = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

const PAD_X = 60;
const RIGHT_X = BADGE_WIDTH - PAD_X;

// Sarlavhaning past cheti qiya: chapda pastroq, o'ngda balandroq.
const HEADER_LEFT_Y = 512;
const HEADER_RIGHT_Y = 398;
const headerEdgeY = (x: number) => HEADER_LEFT_Y - (x / BADGE_WIDTH) * (HEADER_LEFT_Y - HEADER_RIGHT_Y);

const LOGO_R = 56;
const LOGO_CX = PAD_X + LOGO_R;
const LOGO_CY = 100;

// HEMIS surati 297 × 382 — ramka shu nisbatda, surat kesilmaydi.
const PHOTO_BORDER = 8;
const PHOTO_W = 282;
const PHOTO_H = 362;
const PHOTO_X = PAD_X + PHOTO_BORDER;
const PHOTO_Y = 258;
const PHOTO_RADIUS = 20;

// O'ng ustun: «TALABA» yorlig'i, ostida shu kenglikdagi QR karta.
const QR_CARD = 238;
const QR_X = RIGHT_X - QR_CARD;
const PILL_TOP = 262;
const PILL_H = 60;
const QR_Y = PILL_TOP + PILL_H + 30;

const NAME_TOP = 688;
const NAME_LINE_H = 50;

const CARDS_Y = 814;
const CARD_H = 102;
const CARD_GAP = 16;

const FOOTER_TOP = 941;

// ── Matn ─────────────────────────────────────────────────────────────────────

interface FitOptions {
    maxWidth: number;
    maxLines: number;
    /** Eng katta va eng kichik shrift (px). */
    max: number;
    min: number;
    weight: number;
    family?: string;
    /** Qator balandligi — shriftga nisbatan. */
    leading?: number;
    /**
     * Berilsa, matn avval bitta qatorga sig'dirib ko'riladi — shrift shu
     * o'lchamgacha kichrayadi, undan keyingina qatorlarga bo'linadi. Joy tor
     * bo'lgan kartalar uchun: ikki qator har doim bir qatordan baland.
     */
    singleLineMin?: number;
    /** Bitta qatorli urinish shu o'lchamdan boshlanadi (bo'lmasa — `max` dan). */
    singleLineMax?: number;
}

interface FittedText {
    lines: string[];
    size: number;
    lineHeight: number;
    weight: number;
    family: string;
    height: number;
}

/**
 * So'zlarni aynan `lineCount` qatorga shunday bo'ladiki, eng uzun qator imkon
 * qadar qisqa chiqsin: ketma-ket to'ldirishda oxirgi qatorda bitta so'z
 * osilib qoladi. So'zlar kam (fakultet, universitet nomi), shuning uchun
 * barcha bo'linishlar ko'rib chiqiladi.
 */
const balanceLines = (
    ctx: CanvasRenderingContext2D,
    words: string[],
    lineCount: number,
    maxWidth: number,
): string[] | null => {
    const best = { lines: null as string[] | null, width: Infinity };

    const walk = (start: number, lines: string[], widest: number) => {
        const remaining = lineCount - lines.length;
        if (remaining === 1) {
            const line = words.slice(start).join(' ');
            const width = Math.max(widest, ctx.measureText(line).width);
            if (width <= maxWidth && width < best.width) {
                best.lines = [...lines, line];
                best.width = width;
            }
            return;
        }
        for (let end = start + 1; end <= words.length - (remaining - 1); end += 1) {
            const line = words.slice(start, end).join(' ');
            const width = ctx.measureText(line).width;
            if (width > maxWidth) break;
            walk(end, [...lines, line], Math.max(widest, width));
        }
    };

    walk(0, [], 0);
    return best.lines;
};

const wrapWords = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);

    // Qatorlar soni o'zgarmaydi (ketma-ket to'ldirish eng kamini beradi),
    // faqat so'zlar ular orasida tekisroq taqsimlanadi.
    if (lines.length < 2 || words.length > 14) return lines;
    return balanceLines(ctx, words, lines.length, maxWidth) ?? lines;
};

const truncate = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
};

/**
 * Matnni joyga sig'diradi: avval qatorlarga bo'ladi, sig'masa shriftni
 * kichraytiradi. Kesish (`…`) — faqat eng kichik shriftda ham sig'magan
 * holat uchun; mavjud ma'lumotda (F.I.Sh. 44, fakultet 48 belgigacha) unga
 * yetib bormaydi.
 */
const fitText = (ctx: CanvasRenderingContext2D, text: string, options: FitOptions): FittedText => {
    const { maxWidth, maxLines, max, min, weight, family = SANS, leading = 1.2 } = options;
    const done = (lines: string[], size: number): FittedText => {
        const lineHeight = Math.round(size * leading);
        return { lines, size, lineHeight, weight, family, height: lines.length * lineHeight };
    };

    if (options.singleLineMin !== undefined && maxLines > 1) {
        const single = text.split(/\s+/).filter(Boolean).join(' ');
        const from = Math.max(options.singleLineMax ?? max, min);
        for (let size = from; size >= Math.max(options.singleLineMin, min); size -= 1) {
            ctx.font = fontOf(weight, size, family);
            if (ctx.measureText(single).width <= maxWidth) return done([single], size);
        }
    }

    for (let size = Math.max(max, min); size >= min; size -= 1) {
        ctx.font = fontOf(weight, size, family);
        const lines = wrapWords(ctx, text, maxWidth);
        if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
            return done(lines, size);
        }
    }

    ctx.font = fontOf(weight, min, family);
    const wrapped = wrapWords(ctx, text, maxWidth);
    const lines = wrapped.slice(0, maxLines);
    if (wrapped.length > maxLines) lines[maxLines - 1] = wrapped.slice(maxLines - 1).join(' ');
    return done(lines.map((line) => truncate(ctx, line, maxWidth)), min);
};

/** Qatorlarni `top` dan boshlab chizadi; qator qutisi ichida vertikal markazda. */
const drawFitted = (ctx: CanvasRenderingContext2D, fitted: FittedText, x: number, top: number, color: string) => {
    ctx.font = fontOf(fitted.weight, fitted.size, fitted.family);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitted.lines.forEach((line, index) => {
        // 0.36 — Inter'da (ko'tarilish − tushish) / 2: asosiy chiziq shunda
        // qator qutisining o'rtasiga to'g'ri keladi.
        const baseline = top + index * fitted.lineHeight + fitted.lineHeight / 2 + fitted.size * 0.36;
        ctx.fillText(line, x, baseline);
    });
};

/** `letterSpacing` eski brauzerlarda yo'q — o'shanda yozuv oddiy oraliqda chiqadi. */
const setTracking = (ctx: CanvasRenderingContext2D, px: number) => {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
};

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

// ── Logotip ──────────────────────────────────────────────────────────────────

interface Bounds {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}

const logoBounds = new WeakMap<HTMLImageElement, Bounds>();

/**
 * Logotipning shaffof hoshiyasiz qismi. Fayl 1024 × 576, belgi esa uning
 * o'rtasidagi doira: hoshiyasi bilan chizilsa, belgi ikki baravar kichik
 * ko'rinardi. Boshqa universitet logotipi (`public/logo.png` almashtirilganda)
 * uchun ham ishlashi uchun chegara qo'lda yozilmagan, piksellardan topiladi.
 */
const trimmedLogoBounds = (image: HTMLImageElement): Bounds => {
    const cached = logoBounds.get(image);
    if (cached) return cached;

    const full: Bounds = { sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight };
    let bounds = full;
    try {
        const probe = document.createElement('canvas');
        probe.width = full.sw;
        probe.height = full.sh;
        const probeCtx = probe.getContext('2d', { willReadFrequently: true });
        if (probeCtx) {
            probeCtx.drawImage(image, 0, 0);
            const { data } = probeCtx.getImageData(0, 0, full.sw, full.sh);
            let left = full.sw;
            let top = full.sh;
            let right = -1;
            let bottom = -1;
            for (let y = 0; y < full.sh; y += 1) {
                for (let x = 0; x < full.sw; x += 1) {
                    if (data[(y * full.sw + x) * 4 + 3] > 16) {
                        if (x < left) left = x;
                        if (x > right) right = x;
                        if (y < top) top = y;
                        if (y > bottom) bottom = y;
                    }
                }
            }
            if (right >= left && bottom >= top) {
                bounds = { sx: left, sy: top, sw: right - left + 1, sh: bottom - top + 1 };
            }
        }
    } catch {
        // Piksellarni o'qib bo'lmasa — logotip butunligicha chiziladi.
    }
    logoBounds.set(image, bounds);
    return bounds;
};

/** Logotipni `size × size` kvadratga nisbatini saqlab joylaydi. */
const drawLogo = (ctx: CanvasRenderingContext2D, logo: HTMLImageElement, cx: number, cy: number, size: number) => {
    const { sx, sy, sw, sh } = trimmedLogoBounds(logo);
    const scale = Math.min(size / sw, size / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(logo, sx, sy, sw, sh, cx - w / 2, cy - h / 2, w, h);
};

// ── Bo'limlar ────────────────────────────────────────────────────────────────

const fillCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
};

/**
 * Sarlavha fonidagi naqsh: xaritadagi balandlik chiziqlariga o'xshash
 * to'lqinlar va o'ng tomonda halqalar. Chiziqlar formuladan chiqadi — har
 * bejikda bir xil, rasm fayli kerak emas.
 */
const drawContours = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    for (let line = 0; line < 18; line += 1) {
        const base = 186 + line * 23;
        ctx.beginPath();
        for (let x = -20; x <= BADGE_WIDTH + 20; x += 10) {
            const t = x / BADGE_WIDTH;
            // Ikki to'lqin yig'indisi + qiya chetga mos umumiy og'ish.
            const y = base - t * 52 + Math.sin(t * 7.4 + line * 0.36) * 13 + Math.sin(t * 15.8 + line * 0.85) * 4.5;
            if (x === -20) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    for (let ring = 0; ring < 5; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(QR_X + QR_CARD / 2, 330, 60 + ring * 34, 34 + ring * 21, -0.1, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
};

const drawHeader = (
    ctx: CanvasRenderingContext2D,
    content: BadgeContent,
    theme: BadgeTheme,
    logo: HTMLImageElement | null,
) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(BADGE_WIDTH, 0);
    ctx.lineTo(BADGE_WIDTH, HEADER_RIGHT_Y);
    ctx.lineTo(0, HEADER_LEFT_Y);
    ctx.closePath();
    ctx.clip();

    // Yorug'lik o'ng yuqoridan tushgandek: o'sha burchak ochroq.
    const gradient = ctx.createLinearGradient(BADGE_WIDTH, 0, 0, HEADER_LEFT_Y);
    gradient.addColorStop(0, theme.main);
    gradient.addColorStop(0.5, theme.mid);
    gradient.addColorStop(1, theme.dark);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BADGE_WIDTH, HEADER_LEFT_Y);
    drawContours(ctx);
    ctx.restore();

    // Qiya chet bo'ylab oltin chiziq.
    ctx.save();
    const gold = ctx.createLinearGradient(0, HEADER_LEFT_Y, BADGE_WIDTH, HEADER_RIGHT_Y);
    gold.addColorStop(0, '#B98C34');
    gold.addColorStop(0.5, '#F3DC98');
    gold.addColorStop(1, '#C59B3F');
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, headerEdgeY(-10));
    ctx.lineTo(BADGE_WIDTH + 10, headerEdgeY(BADGE_WIDTH + 10));
    ctx.stroke();
    ctx.restore();

    let textX = PAD_X;
    if (logo) {
        // Logotip ko'k va foni shaffof — och halqali oq doira ustiga qo'yiladi.
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        fillCircle(ctx, LOGO_CX, LOGO_CY, LOGO_R + 4);
        ctx.restore();
        ctx.fillStyle = COLOR.white;
        fillCircle(ctx, LOGO_CX, LOGO_CY, LOGO_R);
        drawLogo(ctx, logo, LOGO_CX, LOGO_CY, LOGO_R * 2 - 12);
        textX = LOGO_CX + LOGO_R + 24;
    }

    const name = fitText(ctx, content.universityName.toUpperCase(), {
        maxWidth: RIGHT_X - textX,
        maxLines: 2,
        max: 32,
        min: 15,
        weight: 800,
        leading: 1.26,
    });
    drawFitted(ctx, name, textX, Math.round(LOGO_CY - name.height / 2), COLOR.white);
};

/** «TALABA» yorlig'i — QR karta ustida, u bilan bir kenglikda, yarim shaffof. */
const drawPill = (ctx: CanvasRenderingContext2D, theme: BadgeTheme) => {
    const label = 'TALABA';
    const tracking = 7;
    const middle = PILL_TOP + PILL_H / 2;

    ctx.save();
    roundedRect(ctx, QR_X, PILL_TOP, QR_CARD, PILL_H, PILL_H / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = fontOf(800, 26);
    setTracking(ctx, tracking);
    const textWidth = ctx.measureText(label).width - ('letterSpacing' in ctx ? tracking : 0);
    // Nuqta va yozuv birga yorliq o'rtasida turadi.
    const left = QR_X + Math.round((QR_CARD - (16 + 14 + textWidth)) / 2);
    ctx.fillStyle = rgba(theme.dot, 0.35);
    fillCircle(ctx, left + 8, middle, 12);
    ctx.fillStyle = theme.dot;
    fillCircle(ctx, left + 8, middle, 7.5);

    ctx.fillStyle = COLOR.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + 16 + 14, middle + 2);
    ctx.restore();
};

const drawPhotoPlaceholder = (ctx: CanvasRenderingContext2D) => {
    const cx = PHOTO_X + PHOTO_W / 2;
    ctx.fillStyle = COLOR.photoBg;
    ctx.fillRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
    ctx.fillStyle = COLOR.photoFg;
    fillCircle(ctx, cx, PHOTO_Y + PHOTO_H * 0.39, PHOTO_W * 0.2);
    ctx.beginPath();
    ctx.ellipse(cx, PHOTO_Y + PHOTO_H * 1.04, PHOTO_W * 0.42, PHOTO_H * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
};

const drawPhoto = (ctx: CanvasRenderingContext2D, theme: BadgeTheme, photo: HTMLImageElement | null) => {
    // Oq hoshiya va soya: surat sarlavhaning qiya cheti ustida turadi.
    ctx.save();
    ctx.shadowColor = rgba(theme.dark, 0.3);
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = COLOR.white;
    roundedRect(
        ctx,
        PHOTO_X - PHOTO_BORDER,
        PHOTO_Y - PHOTO_BORDER,
        PHOTO_W + PHOTO_BORDER * 2,
        PHOTO_H + PHOTO_BORDER * 2,
        PHOTO_RADIUS + PHOTO_BORDER,
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, PHOTO_RADIUS);
    ctx.clip();
    if (photo && photo.naturalWidth > 0 && photo.naturalHeight > 0) {
        // Ramkani to'ldiradi; nisbat boshqacha bo'lsa ortiqchasi kesiladi —
        // tik suratda yuz yuqorida bo'lgani uchun pastdan ko'proq.
        const scale = Math.max(PHOTO_W / photo.naturalWidth, PHOTO_H / photo.naturalHeight);
        const sw = PHOTO_W / scale;
        const sh = PHOTO_H / scale;
        const sx = (photo.naturalWidth - sw) / 2;
        const sy = (photo.naturalHeight - sh) * 0.3;
        ctx.drawImage(photo, sx, sy, sw, sh, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
    } else {
        drawPhotoPlaceholder(ctx);
    }
    ctx.restore();
};

/**
 * Talaba ID yozilgan QR kod. Qiymat — ID ning o'zi (havola emas): skaner
 * pastki tasmadagi raqamning aynan o'zini beradi.
 */
const drawQr = (ctx: CanvasRenderingContext2D, theme: BadgeTheme, value: string) => {
    let code: ReturnType<typeof qrcode>;
    try {
        // `Q` — 25% gacha shikastlanishga chidaydi: chop etilgan bejik tirnaladi.
        code = qrcode(0, 'Q');
        code.addData(value);
        code.make();
    } catch {
        // Qiymat QR sig'imidan katta — kod chizilmaydi, bejikning qolgani chiqadi.
        return;
    }

    ctx.save();
    ctx.shadowColor = rgba(theme.dark, 0.16);
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = COLOR.white;
    roundedRect(ctx, QR_X, QR_Y, QR_CARD, QR_CARD, 28);
    ctx.fill();
    ctx.restore();

    // Katak butun pikselda: kasr o'lchamda chetlar xiralashadi va skaner qiynaladi.
    const count = code.getModuleCount();
    const cell = Math.max(1, Math.floor((QR_CARD - 44) / count));
    const size = cell * count;
    const left = QR_X + Math.round((QR_CARD - size) / 2);
    const top = QR_Y + Math.round((QR_CARD - size) / 2);
    ctx.fillStyle = theme.dark;
    for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < count; column += 1) {
            if (code.isDark(row, column)) ctx.fillRect(left + column * cell, top + row * cell, cell, cell);
        }
    }

    ctx.save();
    ctx.font = fontOf(700, 13);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setTracking(ctx, 2.5);
    ctx.fillText('ID · QR KOD', QR_X + QR_CARD / 2 + 1, QR_Y + QR_CARD + 21);
    ctx.restore();
};

/**
 * F.I.Sh. ikki qatorda: familiya, ostida ism va otasining ismi — ikkalasi
 * bir xil yirik yozuvda. HEMIS uni «Familiya Ism Otasining ismi» tartibida
 * beradi. Chapdagi chiziq ikki qatorni bitta blokka birlashtiradi.
 */
const drawName = (ctx: CanvasRenderingContext2D, content: BadgeContent, theme: BadgeTheme) => {
    const textX = PAD_X + 27;
    const [surname, ...rest] = content.fullName.toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [surname, rest.join(' ')].filter(Boolean);
    if (lines.length === 0) return;

    // Ikkala qator bir xil o'lchamda: uzunrog'i sig'adigan shrift tanlanadi.
    const fitted = lines.map((line) =>
        fitText(ctx, line, { maxWidth: RIGHT_X - textX, maxLines: 1, max: 40, min: 18, weight: 800 }),
    );
    const size = Math.min(...fitted.map((line) => line.size));
    const blockHeight = lines.length * NAME_LINE_H;
    // Bitta so'zli ism ikki qatorli joyning o'rtasida turadi.
    const top = NAME_TOP + (2 * NAME_LINE_H - blockHeight) / 2;

    const bar = ctx.createLinearGradient(0, top, 0, top + blockHeight);
    bar.addColorStop(0, theme.accent);
    bar.addColorStop(1, theme.dark);
    ctx.fillStyle = bar;
    roundedRect(ctx, PAD_X, top + 2, 7, blockHeight - 4, 3.5);
    ctx.fill();

    fitted.forEach((line, index) => {
        drawFitted(ctx, { ...line, size, lineHeight: NAME_LINE_H, height: NAME_LINE_H }, textX, top + index * NAME_LINE_H, theme.dark);
    });
};

/** Fakultet va guruh — yonma-yon ikkita oq karta. */
const drawInfoCards = (ctx: CanvasRenderingContext2D, content: BadgeContent, theme: BadgeTheme) => {
    const cardWidth = Math.floor((RIGHT_X - PAD_X - CARD_GAP) / 2);
    const padX = 24;
    const cards = [
        { x: PAD_X, label: 'FAKULTET', value: content.faculty },
        { x: RIGHT_X - cardWidth, label: 'GURUH', value: content.groupName },
    ];

    for (const card of cards) {
        ctx.save();
        ctx.shadowColor = rgba(theme.dark, 0.08);
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = COLOR.white;
        roundedRect(ctx, card.x, CARDS_Y, cardWidth, CARD_H, 20);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = rgba(theme.dark, 0.08);
        ctx.lineWidth = 1.5;
        roundedRect(ctx, card.x, CARDS_Y, cardWidth, CARD_H, 20);
        ctx.stroke();

        ctx.font = fontOf(700, 14);
        ctx.fillStyle = theme.accentDeep;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        setTracking(ctx, 2.6);
        ctx.fillText(card.label, card.x + padX, CARDS_Y + 29);
        ctx.restore();

        // Qiymat avval bitta yirik qatorga sig'dirib ko'riladi; juda uzun nom
        // (masalan, «Agromuhandislik va kommunikatsion texnologiyalar») ikki
        // qatorga bo'linadi — karta balandligi shunga yetadigan shriftda.
        const value = fitText(ctx, card.value || '—', {
            maxWidth: cardWidth - padX * 2,
            maxLines: 2,
            max: 21,
            min: 12,
            weight: 800,
            leading: 1.18,
            singleLineMax: 31,
            singleLineMin: 20,
        });
        const areaTop = CARDS_Y + 42;
        const areaHeight = CARD_H - 42 - 10;
        drawFitted(ctx, value, card.x + padX, areaTop + Math.round((areaHeight - value.height) / 2), COLOR.ink);
    }
};

const drawFooter = (ctx: CanvasRenderingContext2D, content: BadgeContent, theme: BadgeTheme) => {
    ctx.save();
    ctx.fillStyle = theme.dark;
    ctx.fillRect(0, FOOTER_TOP, BADGE_WIDTH, BADGE_HEIGHT - FOOTER_TOP);
    ctx.textBaseline = 'middle';

    // O'ng chet: universitetning qisqa nomi.
    const shortTracking = 9;
    ctx.font = fontOf(900, 46);
    const gold = ctx.createLinearGradient(0, FOOTER_TOP + 36, 0, FOOTER_TOP + 84);
    gold.addColorStop(0, '#D9B45A');
    gold.addColorStop(1, '#F6E3A6');
    ctx.fillStyle = gold;
    ctx.textAlign = 'right';
    setTracking(ctx, shortTracking);
    const shortName = content.universityShortName.toUpperCase();
    const shortNameWidth = shortName ? ctx.measureText(shortName).width : 0;
    // O'lchovga oxirgi harfdan keyingi oraliq ham kiradi — u qaytariladi.
    if (shortName) ctx.fillText(shortName, RIGHT_X + ('letterSpacing' in ctx ? shortTracking : 0), FOOTER_TOP + 60);

    ctx.textAlign = 'left';
    ctx.font = fontOf(700, 14);
    ctx.fillStyle = theme.accent;
    setTracking(ctx, 3);
    ctx.fillText('TALABA ID', PAD_X, FOOTER_TOP + 34);

    // Talaba ID — skaner emas, ko'z bilan o'qish uchun yirik.
    setTracking(ctx, 1);
    const id = fitText(ctx, content.studentIdNumber || '—', {
        maxWidth: RIGHT_X - PAD_X - shortNameWidth - 30,
        maxLines: 1,
        max: 40,
        min: 20,
        weight: 700,
        family: MONO,
    });
    ctx.font = fontOf(id.weight, id.size, id.family);
    ctx.fillStyle = COLOR.white;
    ctx.fillText(id.lines[0], PAD_X - 1, FOOTER_TOP + 70);
    ctx.restore();
};

/**
 * Bejikni canvas'ga chizadi. Sinxron: shriftlar oldindan yuklangan bo'lishi
 * kerak (`loadBadgeFonts`), aks holda birinchi chizma tizim shriftida chiqadi.
 * Mavzu berilmasa, fakultet bo'yicha tanlanadi (`badgeThemeFor`).
 */
export const drawStudentBadge = (
    canvas: HTMLCanvasElement,
    content: BadgeContent,
    assets: BadgeAssets,
    theme: BadgeTheme = badgeThemeFor(content.faculty),
): void => {
    canvas.width = BADGE_WIDTH;
    canvas.height = BADGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // JPG shaffoflikni saqlamaydi — fon to'liq to'ldiriladi.
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT);

    drawHeader(ctx, content, theme, assets.logo);
    drawPill(ctx, theme);
    drawPhoto(ctx, theme, assets.photo);
    if (content.studentIdNumber) drawQr(ctx, theme, content.studentIdNumber);
    drawName(ctx, content, theme);
    drawInfoCards(ctx, content, theme);
    drawFooter(ctx, content, theme);

    // Qirqish chizig'i: tananing och qismi oq qog'ozda chegarasiz qolmasin.
    ctx.strokeStyle = COLOR.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, BADGE_WIDTH - 2, BADGE_HEIGHT - 2);
};

/**
 * Bejikda ishlatiladigan shriftlarni yuklaydi.
 *
 * Sahifadagi `@font-face` shriftni faqat kerak bo'lganda yuklaydi, canvas esa
 * yuklanishini kutmaydi — yuklanmagan shrift o'rniga jimgina tizim shriftini
 * qo'yadi. `sample` — bejikdagi matn: shrift bo'laklarga (lotin, kirill)
 * ajratilgan va faqat matnga keraklisi yuklanadi.
 */
export const loadBadgeFonts = async (sample: string): Promise<void> => {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const specs = [fontOf(600, 32), fontOf(700, 32), fontOf(800, 32), fontOf(900, 32), fontOf(700, 32, MONO)];
    const loading = Promise.all(specs.map((spec) => document.fonts.load(spec, sample).catch(() => undefined)));
    // Shrift serveri javob bermasa ham bejik chiqishi kerak — tizim shriftida.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
    await Promise.race([loading, timeout]);
};

/** Bejikdagi barcha matn — `loadBadgeFonts` uchun namuna. */
export const badgeFontSample = (content: BadgeContent): string => {
    const text = [
        content.fullName,
        content.faculty,
        content.groupName,
        content.studentIdNumber,
        content.universityName,
        content.universityShortName,
        'TALABA ID · QR KOD FAKULTET GURUH — …',
    ]
        .filter(Boolean)
        .join(' ');
    // Ism va universitet nomi bosh harflarda chiziladi.
    return `${text} ${text.toUpperCase()}`;
};

export const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image failed to load'));
        image.src = src;
    });

// ── JPG ──────────────────────────────────────────────────────────────────────

/**
 * JPG sarlavhasiga zichlikni (DPI) yozadi.
 *
 * Brauzer canvas'dan JPG ni 72/96 DPI belgisi bilan chiqaradi yoki umuman
 * belgisiz. Piksellar o'sha-o'sha, lekin Word, Photoshop va chop etish
 * dasturlari rasm o'lchamini shu belgidan hisoblaydi: 827 px 96 DPI da
 * 22 sm bo'lib ochiladi. 300 yozilgach fayl aniq 7 × 9 sm bo'lib ochiladi.
 *
 * JFIF APP0 bo'lagi: FFD8 | FFE0 | uzunlik(2) | "JFIF\0" | versiya(2) |
 * birlik(1) | X zichlik(2) | Y zichlik(2) | ...
 */
export const withJpegDpi = async (blob: Blob, dpi: number): Promise<Blob> => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return blob;

    const hi = (dpi >> 8) & 0xff;
    const lo = dpi & 0xff;
    const hasJfif =
        bytes.length > 18 &&
        bytes[2] === 0xff &&
        bytes[3] === 0xe0 &&
        bytes[6] === 0x4a && // J
        bytes[7] === 0x46 && // F
        bytes[8] === 0x49 && // I
        bytes[9] === 0x46 && // F
        bytes[10] === 0x00;

    if (hasJfif) {
        bytes[13] = 1; // birlik: nuqta/dyuym
        bytes[14] = hi;
        bytes[15] = lo;
        bytes[16] = hi;
        bytes[17] = lo;
        return new Blob([bytes], { type: 'image/jpeg' });
    }

    // JFIF bo'lagi yo'q — SOI dan keyin qo'shiladi.
    const app0 = Uint8Array.of(
        0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, hi, lo, hi, lo, 0x00, 0x00,
    );
    return new Blob([bytes.subarray(0, 2), app0, bytes.subarray(2)], { type: 'image/jpeg' });
};

/** Canvas'dagi bejik — yuqori sifatli, 300 DPI belgili JPG. */
export const badgeToJpeg = async (canvas: HTMLCanvasElement): Promise<Blob> => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) throw new Error('JPEG export failed');
    return withJpegDpi(blob, BADGE_DPI);
};

/**
 * Fayl nomi: `Bejik_FAMILIYA_ISM_310211100123.jpg`.
 *
 * Apostroflar (`O'G'LI`, `Oʻgʻli`) olib tashlanadi, bo'sh joy va fayl nomida
 * mumkin bo'lmagan belgilar `_` ga almashadi; harflar (kirill ham) qoladi.
 */
export const badgeFileName = (fullName: string, studentIdNumber: string | null, studentId: number): string => {
    const clean = (value: string) =>
        value
            .replace(/['`´ʻʼ‘’]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, '_')
            .replace(/^_+|_+$/g, '');
    const parts = ['Bejik', clean(fullName).slice(0, 80), clean(studentIdNumber || '') || `ID${studentId}`];
    return `${parts.filter(Boolean).join('_')}.jpg`;
};

export const saveBlob = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Darhol bekor qilinsa, ba'zi brauzerlar yuklab olishni boshlab ulgurmaydi.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

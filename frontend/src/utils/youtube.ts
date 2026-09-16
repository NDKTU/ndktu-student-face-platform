/**
 * YouTube havolasini tekshirish va pleyer manzilini yig'ish.
 *
 * Bekenddagi `core/utils/youtube_link.py::parse_youtube_link` bilan bir xil
 * qoida. Ikki joyda takrorlanishining sababi `utils/url.ts` dagidek: bekend
 * haqiqatni saqlaydi, frontend esa xatoni maydon yonida, so'rov ketmasdan
 * oldin ko'rsatadi — va o'sha identifikatordan `<iframe>` manzilini quradi.
 */

// 11 ta belgi — YouTube identifikatorining uzunligi. "Yalang'och" identifikator
// qabul qilinmaydi: `not-a-video` ham aynan shu shaklga tushadi.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PATH_ID = /^\/(?:embed|shorts|live|v|e)\/([A-Za-z0-9_-]{11})/;
const ALLOWED_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

const hostAllowed = (hostname: string) => {
    const host = hostname.toLowerCase().replace(/^www\./, '');
    return ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.some((allowed) => host.endsWith(`.${allowed}`));
};

/** Video identifikatori yoki `null` — havola YouTube videosiga o'xshamasa. */
export function youtubeVideoId(raw?: string | null): string | null {
    const value = (raw ?? '').trim();
    if (!value) return null;

    let parsed: URL;
    try {
        parsed = new URL(value.includes('//') ? value : `https://${value}`);
    } catch {
        return null;
    }
    if (!hostAllowed(parsed.hostname)) return null;

    let candidate: string;
    if (parsed.hostname.toLowerCase().replace(/^www\./, '') === 'youtu.be') {
        candidate = parsed.pathname.replace(/^\//, '').split('/')[0];
    } else if (parsed.pathname.replace(/\/$/, '') === '/watch') {
        candidate = parsed.searchParams.get('v') ?? '';
    } else {
        candidate = parsed.pathname.match(PATH_ID)?.[1] ?? '';
    }

    return VIDEO_ID.test(candidate) ? candidate : null;
}

export const isYoutubeUrl = (raw?: string | null) => youtubeVideoId(raw) !== null;

/** Plеyer manzili (`null` — havola yaroqsiz). */
export function youtubeEmbedUrl(raw?: string | null): string | null {
    const videoId = youtubeVideoId(raw);
    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
}

/** Forma uchun xato matni — bekenddagi xabar bilan bir xil ma'noda. */
export const YOUTUBE_LINK_ERROR =
    "Havola YouTube videosiga o'xshamaydi. YouTube'dagi «Share» tugmasidan olingan havolani qo'ying "
    + '(masalan https://www.youtube.com/watch?v=dQw4w9WgXcQ)';

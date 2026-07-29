import { hashStr } from '@/entities/university/mock/rng';
import type { Course, Lesson, Resource, Topic, VideoType } from '../model/types';

/**
 * mulberry32 — быстрый детерминированный PRNG. В прототипе курс строится
 * именно им, с seed от названия предмета, а не общим LCG. Благодаря этому
 * курс воспроизводим сам по себе и не зависит от порядка построения данных.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Темы курса для известных предметов; для остальных — GENERIC. */
const TOPIC_MAP: Record<string, string[]> = {
  'Kon jinslari mexanikasi': [
    'Kirish va asosiy tushunchalar',
    'Kuchlanish va deformatsiya',
    'Mustahkamlik nazariyasi',
    'Kon jinslarining fizik-mexanik xossalari',
    'Yer osti bosimi',
    'Massiv barqarorligi',
    'Amaliy hisoblashlar',
  ],
  'Portlatish ishlari texnologiyasi': [
    'Portlovchi moddalar',
    'Zaryad hisobi',
    'Detonatsiya jarayoni',
    'Shpur va skvajina zaryadlari',
    'Portlash xavfsizligi',
    'Massaviy portlatish texnologiyasi',
  ],
  'Kon aerologiyasi va ventilyatsiya': [
    'Kon havosi tarkibi',
    'Ventilyatsiya asoslari',
    'Havo sarfini hisoblash',
    'Shamollatish tarmoqlari',
    'Gaz rejimi va nazorati',
    'Changga qarshi kurash',
  ],
  'Oliy matematika': [
    'Limitlar va uzluksizlik',
    'Hosila va differensial',
    'Integral hisob',
    "Kop ozgaruvchili funksiyalar",
    'Differensial tenglamalar',
    'Sonli va funksional qatorlar',
  ],
};

const GENERIC_TOPICS = [
  'Kirish va asosiy tushunchalar',
  'Nazariy asoslar',
  'Asosiy usullar va yondashuvlar',
  "Amaliy qoʻllash",
  'Murakkab masalalar va tahlil',
  'Zamonaviy yondashuvlar',
  'Yakuniy loyiha va takrorlash',
];

const LESSON_TITLES = [
  'Nazariy kirish',
  "Asosiy tushunchalar va taʼriflar",
  'Asosiy qonuniyatlar',
  'Amaliy misollar tahlili',
  'Masalalar yechish',
  "Amaliy mashgʻulot",
  'Seminar va muhokama',
  'Uslubiy yondashuvlar',
  'Mustaqil ish',
  'Takrorlash va nazorat',
];

const RESOURCES: { name: string; type: Resource['type'] }[] = [
  { name: "Maʼruza matni", type: 'pdf' },
  { name: 'Taqdimot slaydlari', type: 'pptx' },
  { name: 'Amaliy topshiriq', type: 'docx' },
  { name: "Qoʻshimcha adabiyot", type: 'pdf' },
  { name: 'Namuna materiallar', type: 'zip' },
];

const HOMEWORK = [
  'Berilgan masalalarni yeching va yechim faylini yuklang.',
  "Maʼruza mavzusi boʻyicha qisqacha konspekt tayyorlang.",
  'Amaliy topshiriqni bajaring va hisobot taqdim eting.',
  "Qoʻshimcha adabiyotni oʻqib chiqing va asosiy tushunchalarni yozib oling.",
];

const HOMEWORK_DEADLINES = ['24.07.2026', '29.07.2026', '05.08.2026', '12.07.2026', '01.08.2026'];

const VIDEO_BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
const VIDEO_NAMES = [
  'BigBuckBunny',
  'ElephantsDream',
  'ForBiggerBlazes',
  'ForBiggerEscapes',
  'ForBiggerFun',
  'Sintel',
];
const VIDEOS = VIDEO_NAMES.map((n) => ({
  src: `${VIDEO_BASE}${n}.mp4`,
  poster: `${VIDEO_BASE}images/${n}.jpg`,
}));

/**
 * Строит курс: 5–6 тем, в каждой 3–5 уроков. Полностью детерминирован
 * по паре (fan, seedExtra) — одно и то же название даёт один и тот же курс.
 */
export function buildCourse(
  fan: string,
  oqituvchi: string,
  semestr: number,
  seedExtra = '',
): Course {
  const rnd = mulberry32(hashStr(fan + seedExtra));
  const topics = TOPIC_MAP[fan] ?? GENERIC_TOPICS;

  const topicCount = 5 + Math.floor(rnd() * 2);
  let globalLesson = 0;
  const mavzular: Topic[] = [];

  for (let i = 0; i < topicCount; i++) {
    const lessonCount = 3 + Math.floor(rnd() * 3);
    const darslar: Lesson[] = [];

    for (let j = 0; j < lessonCount; j++) {
      const videoType: VideoType = globalLesson % 4 === 2 ? 'youtube' : 'upload';
      const video = VIDEOS[globalLesson % VIDEOS.length]!;

      const resourceCount = 1 + Math.floor(rnd() * 3);
      const used = new Set<number>();
      const resurslar: Resource[] = [];
      for (let r = 0; r < resourceCount; r++) {
        let ri = Math.floor(rnd() * RESOURCES.length);
        while (used.has(ri)) ri = (ri + 1) % RESOURCES.length;
        used.add(ri);
        const resource = RESOURCES[ri]!;
        resurslar.push({
          name: resource.name,
          type: resource.type,
          size: `${(0.4 + rnd() * 4).toFixed(1)} MB`,
        });
      }

      const title = LESSON_TITLES[(i * 2 + j) % LESSON_TITLES.length]!;
      darslar.push({
        id: i * 100 + j,
        no: j + 1,
        title,
        videoType,
        videoSrc: video.src,
        poster: video.poster,
        dur: `${8 + Math.floor(rnd() * 38)} daq`,
        done: false,
        desc: `Ushbu darsda “${fan}” fanining “${topics[i % topics.length]}” mavzusi doirasida ${title.toLowerCase()} batafsil koʻrib chiqiladi. Video maʼruzani tomosha qiling, soʻng quyidagi resurslar va uy vazifasi bilan tanishing.`,
        resurslar,
        uy:
          rnd() < 0.55
            ? {
                text: HOMEWORK[globalLesson % HOMEWORK.length]!,
                deadline: HOMEWORK_DEADLINES[globalLesson % HOMEWORK_DEADLINES.length]!,
              }
            : null,
      });
      globalLesson++;
    }

    mavzular.push({ id: i, no: i + 1, title: topics[i % topics.length]!, darslar });
  }

  const total = globalLesson;
  const done = Math.max(1, Math.min(total - 1, Math.round(total * (0.3 + rnd() * 0.5))));
  let counter = 0;
  mavzular.forEach((m) =>
    m.darslar.forEach((d) => {
      d.done = counter < done;
      counter++;
    }),
  );

  return { fan, oqituvchi, semestr, mavzular, total, doneCount: done };
}

/** Цвета иконки ресурса по типу. Перенесено из resStyle() прототипа. */
export function resourceStyle(type: Resource['type']) {
  const map: Record<Resource['type'], { bg: string; fg: string }> = {
    pdf: { bg: '#FDECEC', fg: '#C4363B' },
    docx: { bg: '#E7ECFB', fg: '#2749C4' },
    pptx: { bg: '#FBEEDD', fg: '#B45309' },
    zip: { bg: '#EDE9F7', fg: '#6D28D9' },
  };
  return map[type];
}

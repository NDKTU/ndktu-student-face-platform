/**
 * Справочники прототипа (reference/app.js, buildData).
 * Извлечены автоматически — не редактировать вручную.
 */
import type { EduForm, FacultyColor } from '../model/types';

/** Общеобразовательные предметы — идут у всех специальностей. */
export const GENERAL_SUBJECTS = [
  "Oliy matematika",
  "Fizika",
  "Kimyo",
  "Informatika va axborot texnologiyalari",
  "Chizmachilik va muhandislik grafikasi",
  "O'zbekiston tarixi",
  "Chiziqli algebra va analitik geometriya",
  "Falsafa",
  "Xorijiy til",
  "Ona tili va nutq madaniyati",
  "Ekologiya va atrof-muhit muhofazasi",
  "Ehtimollar nazariyasi va matematik statistika",
  "Ma'naviyat va dinshunoslik asoslari",
  "Differensial tenglamalar",
  "Hayot faoliyati xavfsizligi",
  "Jismoniy tarbiya",
  "Iqtisodiy nazariyalar asoslari",
  "Huquqshunoslik asoslari"
] as const;

/** Общеинженерные предметы. */
export const ENGINEERING_SUBJECTS = [
  "Nazariy mexanika",
  "Materiallar qarshiligi",
  "Muhandislik va kompyuter grafikasi",
  "Elektrotexnika va elektronika asoslari",
  "Termodinamika va issiqlik texnikasi",
  "Gidravlika va gidromexanika",
  "Metrologiya, standartlashtirish va sertifikatlashtirish",
  "Konstruksion materialshunoslik",
  "Avtomatlashtirish va boshqaruv asoslari",
  "Muhandislik loyihalash asoslari",
  "Texnik tizimlarni modellashtirish",
  "Kasbiy xavfsizlik va mehnat muhofazasi"
] as const;

/** Практики и итоговая аттестация — в каталог предметов не попадают. */
export const CAPSTONE_SUBJECTS = [
  "O'quv amaliyoti",
  "Ishlab chiqarish amaliyoti",
  "Malakaviy amaliyot",
  "Kurs ishi",
  "Bitiruv malakaviy ishi",
  "Yakuniy davlat attestatsiyasi"
] as const;

/** Профильные предметы, по индексу факультета. */
export const DOMAIN_SUBJECTS: Record<number, readonly string[]> = {
  "0": [
    "Konchilik ishi asoslari",
    "Kon jinslari mexanikasi",
    "Ochiq kon ishlari texnologiyasi",
    "Yer osti qazish texnologiyasi",
    "Kon aerologiyasi va ventilyatsiya",
    "Portlatish ishlari texnologiyasi",
    "Kon mashinalari va komplekslari",
    "Konchilik geomexanikasi",
    "Foydali qazilmalarni boyitish",
    "Shaxta va yer osti inshootlari qurilishi",
    "Kon korxonalarini loyihalash",
    "Marksheyderlik ishi",
    "Kon elektromexanikasi",
    "Konda mehnat muhofazasi",
    "Konchilik ekologiyasi",
    "Foydali qazilma konlari geologiyasi"
  ],
  "1": [
    "Metallurgiya nazariyasi",
    "Rangli metallar metallurgiyasi",
    "Qora metallar metallurgiyasi",
    "Metallshunoslik va termik ishlov berish",
    "Quyish ishlab chiqarishi",
    "Metallarga bosim bilan ishlov berish",
    "Payvandlash ishlab chiqarishi",
    "Metallurgik pechlar",
    "Rudalarni boyitish jarayonlari",
    "Kukun metallurgiyasi",
    "Korroziya va metallarni himoya qilish",
    "Ferroqotishmalar metallurgiyasi",
    "Metallurgiya korxonalarini loyihalash",
    "Elektrometallurgiya",
    "Metallurgik jarayonlar termodinamikasi"
  ],
  "2": [
    "Dasturlash asoslari",
    "Ma'lumotlar tuzilmasi va algoritmlar",
    "Ob'ektga yo'naltirilgan dasturlash",
    "Ma'lumotlar bazasini boshqarish tizimlari",
    "Kompyuter tarmoqlari",
    "Veb-texnologiyalar va dasturlash",
    "Sun'iy intellekt asoslari",
    "Operatsion tizimlar",
    "Axborot xavfsizligi asoslari",
    "Mobil ilovalarni ishlab chiqish",
    "Bulutli texnologiyalar",
    "Dasturiy ta'minotni loyihalash",
    "Katta ma'lumotlarni tahlil qilish",
    "Kompyuter grafikasi va vizualizatsiya",
    "DevOps va CI/CD amaliyoti",
    "Mashinali o'rganish asoslari"
  ],
  "3": [
    "Elektrotexnikaning nazariy asoslari",
    "Elektr mashinalari",
    "Elektr ta'minoti tizimlari",
    "Energiya tejamkorligi va audit",
    "Qayta tiklanuvchi energiya manbalari",
    "Yuqori kuchlanish texnikasi",
    "Rele himoyasi va avtomatika",
    "Elektr yuritma",
    "Elektr stansiya va podstansiyalari",
    "Elektr tarmoqlari va tizimlari",
    "Yorug'lik texnikasi",
    "Sanoat elektronikasi",
    "Elektrotexnik o'lchashlar",
    "Elektr uskunalarini ekspluatatsiya qilish",
    "Energetika tizimlari rejimlari"
  ],
  "4": [
    "Mikroiqtisodiyot",
    "Makroiqtisodiyot",
    "Menejment asoslari",
    "Marketing asoslari",
    "Buxgalteriya hisobi",
    "Moliya va kredit",
    "Iqtisodiy statistika",
    "Ekonometrika",
    "Loyihalarni boshqarish",
    "Soliqlar va soliqqa tortish",
    "Bank ishi",
    "Xalqaro iqtisodiy munosabatlar",
    "Korxona iqtisodiyoti",
    "Audit asoslari",
    "Biznesni rejalashtirish",
    "Raqamli iqtisodiyot"
  ],
  "5": [
    "Umumiy geologiya",
    "Geodeziya asoslari",
    "Mineralogiya va petrografiya",
    "Gidrogeologiya",
    "Kartografiya asoslari",
    "Muhandislik geodeziyasi",
    "Kadastr va yer tuzish",
    "Aerofotogeodeziya",
    "Struktura geologiyasi",
    "Foydali qazilma konlarini qidirish",
    "Geofizik qidiruv usullari",
    "Global navigatsiya tizimlari (GNSS)",
    "Fotogrammetriya va masofaviy zondlash",
    "Topografik xaritalash",
    "Geoaxborot tizimlari (GIS)"
  ]
};

/** Палитра факультетов — по кругу, в порядке объявления. */
export const FACULTY_COLORS: readonly FacultyColor[] = [
  {
    "bg": "#E7E9FB",
    "fg": "#2836C7"
  },
  {
    "bg": "#FBEEDD",
    "fg": "#B45309"
  },
  {
    "bg": "#DBF1F2",
    "fg": "#0E7C86"
  },
  {
    "bg": "#DDF3E6",
    "fg": "#157A43"
  },
  {
    "bg": "#EEE7FB",
    "fg": "#6D28D9"
  },
  {
    "bg": "#FBE4EB",
    "fg": "#A33254"
  }
];

export interface SpecialityDef {
  name: string;
  kod: string;
  shakl: EduForm;
  /** Сколько групп создать. */
  g: number;
}

export interface DepartmentDef {
  name: string;
  spec: SpecialityDef[];
}

export interface FacultyDef {
  name: string;
  kaf: DepartmentDef[];
}

/** Реальная структура НДКТУ: 6 факультетов. */
export const FACULTY_DEFS: readonly FacultyDef[] = [
  {
    "name": "Konchilik fakulteti",
    "kaf": [
      {
        "name": "Konchilik ishi kafedrasi",
        "spec": [
          {
            "name": "Konchilik ishi",
            "kod": "60720400",
            "shakl": "Kunduzgi",
            "g": 3
          },
          {
            "name": "Foydali qazilmalarni ochiq usulda qazish",
            "kod": "60720500",
            "shakl": "Sirtqi",
            "g": 2
          }
        ]
      },
      {
        "name": "Kon-muhandislik ishi kafedrasi",
        "spec": [
          {
            "name": "Marksheyderlik ishi",
            "kod": "60720700",
            "shakl": "Kunduzgi",
            "g": 2
          },
          {
            "name": "Shaxta va yer osti inshootlari qurilishi",
            "kod": "60730300",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      },
      {
        "name": "Geotexnologiya kafedrasi",
        "spec": [
          {
            "name": "Kon-texnologik mashinalar",
            "kod": "60711800",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  },
  {
    "name": "Metallurgiya fakulteti",
    "kaf": [
      {
        "name": "Metallurgiya kafedrasi",
        "spec": [
          {
            "name": "Metallurgiya",
            "kod": "60730600",
            "shakl": "Kunduzgi",
            "g": 3
          },
          {
            "name": "Rangli metallar metallurgiyasi",
            "kod": "60730700",
            "shakl": "Sirtqi",
            "g": 2
          }
        ]
      },
      {
        "name": "Materialshunoslik kafedrasi",
        "spec": [
          {
            "name": "Materialshunoslik va yangi materiallar texnologiyasi",
            "kod": "60730800",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      },
      {
        "name": "Kimyoviy texnologiya kafedrasi",
        "spec": [
          {
            "name": "Kimyoviy texnologiya",
            "kod": "60540400",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  },
  {
    "name": "Axborot texnologiyalari fakulteti",
    "kaf": [
      {
        "name": "Dasturiy injiniring kafedrasi",
        "spec": [
          {
            "name": "Dasturiy injiniring",
            "kod": "60610300",
            "shakl": "Kunduzgi",
            "g": 3
          },
          {
            "name": "Dasturiy injiniring",
            "kod": "60610300",
            "shakl": "Sirtqi",
            "g": 2
          }
        ]
      },
      {
        "name": "Kompyuter injiniringi kafedrasi",
        "spec": [
          {
            "name": "Kompyuter injiniringi",
            "kod": "60610200",
            "shakl": "Kunduzgi",
            "g": 2
          },
          {
            "name": "Sun'iy intellekt",
            "kod": "60610500",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      },
      {
        "name": "Axborot xavfsizligi kafedrasi",
        "spec": [
          {
            "name": "Kiberxavfsizlik",
            "kod": "60611100",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  },
  {
    "name": "Energetika fakulteti",
    "kaf": [
      {
        "name": "Elektr energetikasi kafedrasi",
        "spec": [
          {
            "name": "Elektr energetikasi",
            "kod": "60711000",
            "shakl": "Kunduzgi",
            "g": 3
          },
          {
            "name": "Elektr ta'minoti",
            "kod": "60710700",
            "shakl": "Sirtqi",
            "g": 2
          }
        ]
      },
      {
        "name": "Muqobil energetika kafedrasi",
        "spec": [
          {
            "name": "Muqobil energiya manbalari",
            "kod": "60711200",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  },
  {
    "name": "Iqtisodiyot va menejment fakulteti",
    "kaf": [
      {
        "name": "Iqtisodiyot kafedrasi",
        "spec": [
          {
            "name": "Iqtisodiyot",
            "kod": "60310100",
            "shakl": "Kunduzgi",
            "g": 3
          },
          {
            "name": "Iqtisodiyot",
            "kod": "60310100",
            "shakl": "Sirtqi",
            "g": 2
          }
        ]
      },
      {
        "name": "Menejment kafedrasi",
        "spec": [
          {
            "name": "Menejment",
            "kod": "60410100",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      },
      {
        "name": "Buxgalteriya hisobi kafedrasi",
        "spec": [
          {
            "name": "Buxgalteriya hisobi va audit",
            "kod": "60411200",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  },
  {
    "name": "Geologiya va geodeziya fakulteti",
    "kaf": [
      {
        "name": "Geologiya kafedrasi",
        "spec": [
          {
            "name": "Geologiya va foydali qazilma konlarini qidirish",
            "kod": "60720100",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      },
      {
        "name": "Geodeziya va kartografiya kafedrasi",
        "spec": [
          {
            "name": "Geodeziya, kartografiya va kadastr",
            "kod": "60730100",
            "shakl": "Kunduzgi",
            "g": 2
          }
        ]
      }
    ]
  }
];

/**
 * Кафедра, ведущая предмет. Общеобразовательные предметы закреплены за своими
 * кафедрами явно; общеинженерные идут за «Umumtexnika fanlari kafedrasi»;
 * остальные (профильные) остаются за выпускающей кафедрой.
 */
export const SUBJECT_DEPARTMENTS: Record<string, string> = {
  "Oliy matematika": "Oliy matematika kafedrasi",
  "Chiziqli algebra va analitik geometriya": "Oliy matematika kafedrasi",
  "Ehtimollar nazariyasi va matematik statistika": "Oliy matematika kafedrasi",
  "Differensial tenglamalar": "Oliy matematika kafedrasi",
  "Fizika": "Fizika kafedrasi",
  "Kimyo": "Kimyo kafedrasi",
  "Informatika va axborot texnologiyalari": "Axborot texnologiyalari kafedrasi",
  "Chizmachilik va muhandislik grafikasi": "Muhandislik grafikasi kafedrasi",
  "O'zbekiston tarixi": "Ijtimoiy-gumanitar fanlar kafedrasi",
  "Falsafa": "Ijtimoiy-gumanitar fanlar kafedrasi",
  "Ma'naviyat va dinshunoslik asoslari": "Ijtimoiy-gumanitar fanlar kafedrasi",
  "Huquqshunoslik asoslari": "Ijtimoiy-gumanitar fanlar kafedrasi",
  "Xorijiy til": "Chet tillari kafedrasi",
  "Ona tili va nutq madaniyati": "Chet tillari kafedrasi",
  "Ekologiya va atrof-muhit muhofazasi": "Ekologiya kafedrasi",
  "Iqtisodiy nazariyalar asoslari": "Iqtisodiyot va menejment kafedrasi",
  "Hayot faoliyati xavfsizligi": "Hayot faoliyati xavfsizligi kafedrasi",
  "Jismoniy tarbiya": "Jismoniy tarbiya va sport kafedrasi"
};

export const ENGINEERING_DEPARTMENT = 'Umumtexnika fanlari kafedrasi';

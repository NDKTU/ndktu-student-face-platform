import type { Role } from './roles';

/**
 * Данные профиля по ролям. Перенесены из profilData() прототипа —
 * там они захардкожены, реального источника пока нет.
 */
export interface ProfileData {
  /** Подразделение: боshqarma, факультет, кафедра или специальность. */
  org: string;
  email: string;
  phone: string;
  /** Пары «подпись — значение»; набор строк у каждой роли свой. */
  rows: [string, string][];
}

export const PROFILES: Record<Role, ProfileData> = {
  "super_admin": {
    "org": "Axborot texnologiyalari boshqarmasi",
    "email": "sardor.aliyev@ndktu.uz",
    "phone": "+998 90 123 45 67",
    "rows": [
      [
        "Lavozim",
        "Tizim administratori"
      ],
      [
        "Boʻlim",
        "AT boshqarmasi"
      ],
      [
        "Ishga qabul",
        "2022-yil"
      ],
      [
        "Holat",
        "Faol"
      ]
    ]
  },
  "admin": {
    "org": "Oʻquv boshqarmasi",
    "email": "nodira.karimova@ndktu.uz",
    "phone": "+998 90 234 56 78",
    "rows": [
      [
        "Lavozim",
        "Administrator"
      ],
      [
        "Boʻlim",
        "Oʻquv boshqarmasi"
      ],
      [
        "Holat",
        "Faol"
      ]
    ]
  },
  "dekan": {
    "org": "Konchilik fakulteti",
    "email": "rustam.qodirov@ndktu.uz",
    "phone": "+998 91 345 67 89",
    "rows": [
      [
        "Lavozim",
        "Dekan"
      ],
      [
        "Fakultet",
        "Konchilik ishi"
      ],
      [
        "Ilmiy daraja",
        "DSc"
      ]
    ]
  },
  "kafedra_mudiri": {
    "org": "Geodeziya kafedrasi",
    "email": "malika.yusupova@ndktu.uz",
    "phone": "+998 93 456 78 90",
    "rows": [
      [
        "Lavozim",
        "Kafedra mudiri"
      ],
      [
        "Kafedra",
        "Geodeziya va kartografiya"
      ],
      [
        "Ilmiy daraja",
        "PhD"
      ]
    ]
  },
  "oqituvchi": {
    "org": "Konchilik ishi kafedrasi",
    "email": "jasur.bozorov@ndktu.uz",
    "phone": "+998 91 234 56 78",
    "rows": [
      [
        "Kafedra",
        "Konchilik ishi kafedrasi"
      ],
      [
        "Lavozim",
        "Katta oʻqituvchi"
      ],
      [
        "Fanlar soni",
        "4 ta"
      ],
      [
        "Ilmiy daraja",
        "PhD"
      ]
    ]
  },
  "talaba": {
    "org": "Dasturiy injiniring",
    "email": "islom.abdullayev@student.ndktu.uz",
    "phone": "+998 93 345 67 89",
    "rows": [
      [
        "Guruh",
        "DI-24-01"
      ],
      [
        "Mutaxassislik",
        "Dasturiy injiniring"
      ],
      [
        "Kurs",
        "2-kurs"
      ],
      [
        "Talaba ID",
        "ST-2024-04871"
      ],
      [
        "Oʻqish shakli",
        "Kunduzgi"
      ]
    ]
  }
};

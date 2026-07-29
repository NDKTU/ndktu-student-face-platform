/**
 * Ленты уведомлений по ролям. Извлечены из прототипа (notifsFor).
 * Реального источника пока нет — это фиксированный демо-набор.
 */
export type NotificationType =
  | 'user' | 'plan' | 'system' | 'test' | 'submit'
  | 'deadline' | 'grade' | 'lesson' | 'guruh' | 'fan' | 'kurs';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  sub: string;
  time: string;
  unread: boolean;
}

const FEEDS: Record<string, AppNotification[]> = {
  "super_admin": [
    {
      "id": "a1",
      "type": "user",
      "title": "Yangi talaba roʻyxatga olindi",
      "sub": "DI-24-01 guruhi",
      "time": "5 daqiqa oldin",
      "unread": true
    },
    {
      "id": "a2",
      "type": "plan",
      "title": "Oʻquv reja tasdiqlandi",
      "sub": "Metallurgiya · 2-kurs",
      "time": "2 soat oldin",
      "unread": true
    },
    {
      "id": "a3",
      "type": "user",
      "title": "Kafedra mudiri tayinlandi",
      "sub": "Geodeziya kafedrasi",
      "time": "kecha",
      "unread": true
    },
    {
      "id": "a4",
      "type": "system",
      "title": "Tizim zaxira nusxasi yaratildi",
      "sub": "Avtomatik · muvaffaqiyatli",
      "time": "2 kun oldin",
      "unread": false
    },
    {
      "id": "a5",
      "type": "test",
      "title": "847 ta test yakunlandi",
      "sub": "Bu hafta · barcha fakultetlar",
      "time": "3 kun oldin",
      "unread": false
    }
  ],
  "oqituvchi": [
    {
      "id": "t1",
      "type": "submit",
      "title": "Yangi vazifa topshirildi",
      "sub": "Sultonova Feruza · Nazariy kirish",
      "time": "12 daqiqa oldin",
      "unread": true
    },
    {
      "id": "t2",
      "type": "test",
      "title": "Test yakunlandi",
      "sub": "KI-24-01 · Kon jinslari mexanikasi",
      "time": "1 soat oldin",
      "unread": true
    },
    {
      "id": "t3",
      "type": "submit",
      "title": "3 ta yangi topshirma",
      "sub": "Portlatish ishlari texnologiyasi",
      "time": "3 soat oldin",
      "unread": true
    },
    {
      "id": "t4",
      "type": "deadline",
      "title": "Test muddati bugun tugaydi",
      "sub": "Kon aerologiyasi · KI-24-02",
      "time": "bugun",
      "unread": false
    },
    {
      "id": "t5",
      "type": "system",
      "title": "Savollar banki yangilandi",
      "sub": "12 ta yangi savol qoʻshildi",
      "time": "kecha",
      "unread": false
    }
  ],
  "talaba": [
    {
      "id": "s1",
      "type": "grade",
      "title": "Vazifa baholandi — 85/100",
      "sub": "Nazariy kirish · Differensial tenglamalar",
      "time": "20 daqiqa oldin",
      "unread": true
    },
    {
      "id": "s2",
      "type": "lesson",
      "title": "Yangi dars qoʻshildi",
      "sub": "Differensial tenglamalar · 4-mavzu",
      "time": "2 soat oldin",
      "unread": true
    },
    {
      "id": "s3",
      "type": "deadline",
      "title": "Test muddati yaqinlashmoqda",
      "sub": "Fizika · 2 kundan soʻng tugaydi",
      "time": "5 soat oldin",
      "unread": true
    },
    {
      "id": "s4",
      "type": "test",
      "title": "Test natijasi eʼlon qilindi",
      "sub": "Algoritmlar · 78/100",
      "time": "kecha",
      "unread": false
    },
    {
      "id": "s5",
      "type": "system",
      "title": "Yangi eʼlon",
      "sub": "Dekanat · imtihon jadvali",
      "time": "2 kun oldin",
      "unread": false
    }
  ]
};

/**
 * У ролей admin / dekan / kafedra_mudiri своей ленты нет —
 * в прототипе они получают ленту супер-администратора.
 */
export function notificationsForRole(role: string): AppNotification[] {
  return FEEDS[role] ?? FEEDS.super_admin!;
}

# WowDash uslubida frontend redizayni — katta reja

Sana: 2026-08-22
Holat: **reja** (kod o'zgartirilmagan)
Namuna: https://wowdash.wowtheme7.com/php/demo/invoice-list.html (va `index.html` — dashboard)

Bu hujjat — faqat reja. Frontend kodi, ma'lumotlar qatlami (React Query, axios servislar, Zod sxemalar) va backend API o'zgartirilmaydi. Oldingi redizayn (`docs/frontend-redesign-plan.md`, 2026-08-18) bajarilgan; bu reja **uning ustiga** qo'yiladi — mavjud dizayn tizimi (tokenlar, Radix, DataTable, sonner) saqlanadi, faqat vizual til va ro'yxat sahifalarining tuzilmasi WowDash'ga yaqinlashtiriladi.

---

## 1. Maqsad va chegaralar

**Maqsad.** Admin va o'qituvchi kabinetlaridagi ro'yxat sahifalarini (testlar, natijalar, talabalar, guruhlar, foydalanuvchilar va h.k.) WowDash «Invoice List» namunasidagi kabi bir xil, toza va tanish ko'rinishga keltirish: *sahifa sarlavhasi + breadcrumb → bitta karta ichida toolbar → jadval → «Showing X to Y of Z» + paginatsiya*. Dashboard'ni WowDash stat-kartalari uslubida yangilash.

**Chegaralar (nimani qilmaymiz).**

- Bootstrap'ga o'tmaymiz. Stek o'zgarmaydi: React 19 + Tailwind v4 + Radix + lucide. WowDash'dan faqat **vizual qarorlar** olinadi.
- Ma'lumotlar qatlami, marshrutlar, ruxsatlar (`PermissionRoute`, `PermissionGate`) o'zgarmaydi.
- Proktoring (`QuizTestPage`, WebSocket) va `FocusLayout` — tegilmaydi.
- Backend'da yo'q narsa uchun soxta UI qilinmaydi (masalan, bildirishnoma qo'ng'irog'i, agar endpoint bo'lmasa — ko'rsatilmaydi).

---

## 2. WowDash tahlili — nimani ko'rdik

### 2.1 Umumiy karkas

| Element | WowDash'da qanday |
|---|---|
| Fon | Juda och kulrang-ko'k (`#f5f6fa` ga yaqin), kartalar oq, yumshoq soya |
| Sidebar | Oq, guruhlangan bo'limlar, akkordeon, yig'iladigan (hamburger navbar'da) |
| Navbar | Oq, chap tomonda hamburger; o'ng tomonda **doira shaklidagi** icon-tugmalar: mavzu (quyosh), til (bayroq), xabarlar, bildirishnomalar, avatar |
| Sahifa sarlavhasi | Chapda katta qalin sarlavha («Invoice List»), **o'ngda** breadcrumb: `🏠 Dashboard - Invoice List` |
| Karta | Radius ~12–16px, chegarasiz, yengil soya; ichida `card-header` (toolbar) va `card-body` (jadval) |
| Footer | «© 2024 WowDash. All Rights Reserved.» / «Made by …» — ikki ustunli |

### 2.2 Ro'yxat kartasi (Invoice List)

**Toolbar (card-header):** bitta qatorda, chapdan o'ngga:
1. `Show [10 ▾]` — sahifa hajmi (10 / 15 / 20)
2. Qidiruv maydoni (ichida lupa ikonkasi, placeholder «Search»)
3. *(bo'sh joy)*
4. Holat select (`Status ▾`: Paid / Pending)
5. Asosiy tugma `+ Create Invoice` (to'ldirilgan ko'k, ikonka + matn)

**Jadval:**
- Sarlavha qatori och kulrang fonda, matn qalin, kichik.
- Ustunlar: `☐` (checkbox) · `S.L` (tartib raqami, 01, 02…) · `Invoice` (ko'k **link** `#526534`) · `Name` (doira avatar + ism) · `Issued Date` · `Amount` · `Status` (badge) · `Action`.
- Qatorlar orasida ingichka chiziq, balandlik ~72px — havodor.
- **Status badge:** to'liq yumaloq, yumshoq fon + to'q matn: yashil `Paid`, sariq `Pending`.
- **Action:** uchta **doira icon-tugma**, har biri o'z rangida yumshoq fonda: ko'k «ko'z» (ko'rish), yashil «qalam» (tahrirlash), qizil «savat» (o'chirish). Hover'da fon to'yinadi.

**Footer (card-body pastki qismi):** chapda `Showing 1 to 10 of 12 entries`, o'ngda paginatsiya: `«  1  2  3  »` — faol sahifa to'ldirilgan ko'k kvadrat, qolganlari och ko'k fon.

### 2.3 Dashboard (index.html)

- **Stat-kartalar:** 2 ustunli grid (keng ekranda 3–5), har biri **yumshoq gradient fonda** (ko'k→oq, binafsha→oq, yashil→oq, qizil→oq), chapda label + katta raqam + trend qatori (`▲ +5000  Last 30 days users`, yashil/qizil), o'ngda **to'ldirilgan doira ikonka** (ko'k, binafsha, yashil, qizil).
- **Grafik kartasi:** sarlavha «Sales Statistic», o'ngda davr select (`Yearly ▾`), ostida katta raqam + foiz-badge + izoh, so'ng silliq chiziqli grafik.
- Widgetlar: «Top Performer», «Top Countries», foydalanuvchilar jadvali (avatar + email + reja + status).

### 2.4 Xulosa — WowDash'ning kuchli tomonlari

1. **Bir xil ro'yxat andozasi** — har qanday ro'yxat bir xil ko'rinadi, foydalanuvchi o'rganishi shart emas.
2. **Toolbar ichida hamma narsa** — qidiruv, filtr, hajm, asosiy tugma bitta qatorda, alohida «filtr kartasi» yo'q.
3. **Rangli action-tugmalar** — ko'rish/tahrirlash/o'chirish bir qarashda farqlanadi.
4. **«Showing X to Y of Z»** — foydalanuvchi qayerdaligini biladi.
5. **Gradient stat-kartalar + trend** — dashboard «tirik» ko'rinadi.

---

## 3. Hozirgi frontend holati (qisqa diagnostika)

Manba: `frontend/src/` (tahlil 2026-08-22).

| Soha | Hozir | WowDash bilan farq |
|---|---|---|
| Tokenlar | `index.css` — `--primary` #242CBB, `--success/--warning/--destructive`, sidebar tokenlari; radius 12px | Asos mos. Yetishmaydi: **soft (yumshoq) rang tokenlari** badge/icon-tugmalar uchun (`info`, `success-soft`…), gradient stat-kartalar uchun tokenlar |
| Sidebar | To'q ko'k brend rangida («Universitet premium»), hamma bo'limlar ochiq, yig'ilmaydi | WowDash'da oq va yig'iladi. **Qaror:** to'q ko'k sidebar **saqlanadi** (brend identifikatsiyasi), lekin **yig'ilish** (collapse → faqat ikonkalar) qo'shiladi — `--sidebar-width-collapsed: 3.5rem` tokeni allaqachon bor, ishlatilmaydi |
| Navbar | Chapda breadcrumb (`Bosh sahifa / Sahifa`), o'ngda matnli `UZ/RU`, mavzu, profil (chegarali tugma) | WowDash'da breadcrumb navbar'da emas — **sahifa sarlavhasi qatorida o'ngda**; tugmalar doira shaklida |
| PageHeader | `title + description + actions` | Breadcrumb yo'q; WowDash'da description o'rniga breadcrumb o'ngda |
| Ro'yxat sahifalari | `PageHeader` → alohida **filtr kartasi** (`QuizFilters`, `CourseFilters` — 4–5 ta Combobox, har biri label bilan) → jadval → `Pagination` | WowDash'da filtr **toolbar ichida** ixcham; bizda filtr kartasi juda baland (2 qator), har sahifada boshqacha |
| DataTable | skeleton/error/empty + `renderCard` mobil | Toolbar va footer sloti yo'q; S.L ustuni, checkbox yo'q; qator balandligi zich |
| Pagination | Faqat `‹ 1 2 3 4 5 ›`, markazda | «Showing X to Y of Z» yo'q; «birinchi/oxirgi» yo'q; sahifa hajmi tanlanmaydi (`pageSize = 10` kodga qotirilgan) |
| Action tugmalar | `Button variant="ghost" size="icon"` — rangsiz, bir xil | WowDash'da rangli doira (ko'k/yashil/qizil) |
| Badge | `.badge-*` CSS yordamchilari (primary/success/destructive/warning/muted) | Mavjud, lekin React komponenti yo'q, sahifalarda har xil ishlatiladi |
| StatCard | Oq karta, chegarali, o'ngda pastel kvadrat ikonka, doim `TrendingUp` ikonkasi (trend bo'lmasa ham) | Gradient fon, doira to'ldirilgan ikonka, haqiqiy trend (▲/▼ + rang) |
| Dashboard | 8 ta StatCard + bitta bar-chart (jami sonlar) + tezkor havolalar | Davr selektori va trend uchun backend'da ma'lumot yo'q |
| Footer | Yo'q | WowDash'da bor |
| Katta fayllar | `ResultsPage` 788, `QuestionsPage` 650, `StudentsPage` 489, `UsersPage` 423 qator | Andozaga o'tkazishda bo'lish imkoniyati |

---

## 4. Dizayn qarorlari — nimani olamiz, nimani yo'q

### Olamiz ✅

| # | WowDash elementi | Bizda qanday bo'ladi |
|---|---|---|
| 1 | Sahifa sarlavhasi + o'ngda breadcrumb | `PageHeader` ga `breadcrumb` qo'shiladi; Navbar'dan breadcrumb olib tashlanadi (`PATH_LABELS` lug'ati `PageHeader`/alohida `Breadcrumb` ga ko'chadi) |
| 2 | Bitta «ro'yxat kartasi» andozasi | Yangi `ListCard` (yoki `DataTable` ga `toolbar`/`footer` slotlari) — barcha ro'yxat sahifalari shu andozaga o'tadi |
| 3 | Toolbar: Show N · Qidiruv · Filtrlar · Asosiy tugma | `ListToolbar` komponenti; filtrlar Combobox'lar label'siz, placeholder bilan («Barcha fakultetlar»); 3 tadan ko'p filtr bo'lsa — «Filtrlar» tugmasi ostida popover/drawer |
| 4 | S.L ustuni | `DataTable` ga `showIndex` prop (`(page-1)*size + i`, `01` formatida) |
| 5 | Avatar + ism ustuni | `Avatar` komponenti (rasm bo'lsa rasm, bo'lmasa bosh harflar — `lib/avatarTiles.ts` allaqachon bor) |
| 6 | Link-ID ustuni (`#526534`) | Test/natija ID yoki nomi `text-primary` havola sifatida, detallar sahifasiga olib boradi |
| 7 | Status badge (pill) | `Badge` komponenti: `success / warning / destructive / info / muted` — faol/nofaol, tugallangan/jarayonda, eduplan/hemis/qo'lda |
| 8 | Rangli doira action-tugmalar | `IconButton` komponenti `tone="info|success|danger|warning|muted"` — ko'rish (ko'k), tahrirlash (yashil), o'chirish (qizil), boshqa amallar (binafsha/sariq) |
| 9 | «Showing X to Y of Z» + `« 1 2 3 »` | `Pagination` ga `total`, `pageSize` → «Jami Z tadan X–Y ko'rsatilmoqda»; birinchi/oxirgi tugmalari; chapga matn, o'ngga tugmalar |
| 10 | Sahifa hajmi tanlash | `PageSizeSelect` (10/20/50); `pageSize` holatga o'tadi; tanlov `localStorage` da saqlanadi |
| 11 | Doira icon-tugmalar navbar'da | Mavzu, til, profil — `h-10 w-10 rounded-full bg-muted`; til uchun bayroq emas, `UZ`/`RU` matnli doira (bayroq siyosiy noaniq, hozirgi yechim to'g'ri) |
| 12 | Sidebar yig'ilishi | Hamburger desktop'da ham ishlaydi: sidebar → 3.5rem, faqat ikonkalar + tooltip (Radix Tooltip allaqachon o'rnatilgan); holat `localStorage` |
| 13 | Gradient stat-kartalar | `StatCard` ga `variant="gradient"`; 4–5 rang preseti (brend ko'k, binafsha, yashil, sariq, qizil); ikonka — to'ldirilgan doira |
| 14 | Trend qatori | `StatCard` ga `trend?: { value: number; label: string }` — ▲ yashil / ▼ qizil; **trend bo'lmasa ikonka ko'rsatilmaydi** (hozir doim `TrendingUp`) |
| 15 | Grafik kartasi sarlavhasi | «Platforma ko'lami» kartasiga sarlavha + o'ngda select uslubi; haqiqiy davr filtri backend bo'lganda |
| 16 | Footer | `MainLayout` pastiga: `© 2026 {BRAND.universityName}` / versiya; `branding.ts` dan |
| 17 | Checkbox ustuni | Faqat **ommaviy amallar bor sahifalarda** (masalan Students → guruhga ko'chirish, Users → faol/nofaol). Boshqa joyda bo'sh checkbox qo'yilmaydi |

### Olmaymiz ❌

| WowDash elementi | Sabab |
|---|---|
| Oq sidebar | To'q ko'k brend sidebar — universitet identifikatsiyasi, 2026-08-18 da qabul qilingan |
| Xabarlar (✉) va bildirishnoma (🔔) tugmalari | Backend'da chat/bildirishnoma yo'q — soxta «05» ko'rsatilmaydi. Kelajakda «faol testlar soni» kabi haqiqiy hisoblagich bo'lishi mumkin (6-bo'lim) |
| Bayroq ikonkali til | `UZ/RU` matnli — aniqroq va neytral |
| 10 xil dashboard varianti, Kanban, Email, Calendar | Loyihaga aloqasi yo'q |
| Bootstrap rang palitrasi (`#487fff` ko'k) | Brend `#242CBB` qoladi |
| Har qatorda checkbox | Ommaviy amal bo'lmasa — shovqin |
| Ko'p rangli (8 ta) stat-karta ikonkalari | 5 ta preset yetarli; ranglar semantik tokenlardan |

---

## 5. Yangi / o'zgaradigan komponentlar (spetsifikatsiya)

Barchasi `frontend/src/components/ui/` da. Mavjud API'lar buzilmaydi — yangi proplar ixtiyoriy.

### 5.1 Tokenlar (`index.css`)

Yangi yumshoq (soft) tokenlar — badge, icon-tugma va gradientlar uchun, ikkala mavzuda:

```
--info / --info-foreground            (ko'k — «ko'rish», ma'lumot)
--soft-primary / --soft-success / --soft-warning / --soft-destructive / --soft-info
--gradient-primary / -success / -warning / -destructive / -violet   (stat-kartalar)
```

Qoida saqlanadi: sahifalarda xom Tailwind palitrasi (`bg-blue-100`) yo'q — faqat tokenlar. `StatCard` dagi mavjud `colorMap` (indigo/violet/teal…) gradient tokenlarga ko'chadi.

### 5.2 `Breadcrumb`

- `items: { label, href? }[]`, oxirgisi faol (havolasiz).
- Birinchi element — uy ikonkasi + «Bosh sahifa».
- `PageHeader` ichida o'ngda (`sm:` dan boshlab), mobil — sarlavha ostida.
- `Navbar.tsx` dagi `PATH_LABELS` / `DYNAMIC_LABELS` → `constants/breadcrumbs.ts` ga ko'chadi, `useBreadcrumbs()` hook avtomatik zanjir quradi (`/roles/5/permissions` → Bosh sahifa › Rollar › Rol ruxsatlari).

### 5.3 `PageHeader` (kengaytiriladi)

```
title, description?, actions?, breadcrumb?: boolean | BreadcrumbItem[]
```

WowDash'da sarlavha qatorida faqat sarlavha + breadcrumb; `actions` ro'yxat sahifalarida toolbar'ga ko'chadi (CRUD bo'lmagan sahifalarda — sarlavhada qoladi).

### 5.4 `ListCard` + `ListToolbar`

`ListCard` — karta: `toolbar` sloti (header), `children` (jadval), `footer` sloti.

`ListToolbar` proplari:
- `pageSize`, `onPageSizeChange`, `pageSizeOptions=[10,20,50]`
- `search`, `onSearchChange`, `searchPlaceholder` (debounce ichida — hozir har sahifada `useEffect` bilan takrorlanadi, `useDebouncedValue` hook'ga chiqariladi)
- `filters?: ReactNode` — Combobox/Select'lar, label'siz
- `primaryAction?: ReactNode` — `+ Yangi …` tugmasi
- `activeFilterCount` → «Tozalash ✕» tugmasi

Layout: `flex-wrap`, mobil — ikki qator (qidiruv to'liq kenglik, tugma to'liq kenglik).

### 5.5 `DataTable` (kengaytiriladi)

- `showIndex?: boolean`, `indexOffset?: number` → `S.L` ustuni (`01`, `02`…).
- `selectable?: boolean`, `selected`, `onSelectedChange` → checkbox ustuni (faqat ommaviy amal bor joyda).
- Qator balandligi `h-16` (hozir zichroq), sarlavha `bg-muted/50`, chegara `border-border/60`.
- `onRowClick` bor qatorlar `hover:bg-accent/40`.

### 5.6 `Pagination` (kengaytiriladi)

- Yangi proplar: `total`, `pageSize` → chapda «Jami {total} tadan {from}–{to} ko'rsatilmoqda».
- Tugmalar: `«` (birinchi) `‹` `1 2 3` `›` `»` (oxirgi); faol — `bg-primary text-primary-foreground`, qolganlari — `bg-soft-primary text-primary`.
- `totalPages <= 1` bo'lsa ham «Showing…» matni ko'rinadi (hozir butunlay yashiriladi).

### 5.7 `Badge`

`variant: primary | success | warning | destructive | info | muted`, `dot?: boolean`. Mavjud `.badge-*` CSS klasslari komponent ichiga o'raladi; sahifalardagi qo'lda yozilgan `<span className="badge badge-success">` lar almashtiriladi.

Xaritalash (bir joyda, `constants/statusBadges.ts`):
- Test: faol → `success` «Faol», nofaol → `muted` «Nofaol»
- Natija: tugallangan → `success`, jarayonda → `warning`, muddati o'tgan → `destructive`
- Manba: `eduplan` → `info`, `hemis` → `primary`, qo'lda → `muted` (`ExternalSourceBadge` ichida `Badge` ishlatadi)
- Foydalanuvchi: faol/nofaol

### 5.8 `IconButton`

```
tone: 'info' | 'success' | 'danger' | 'warning' | 'primary' | 'muted'
size: 'sm' | 'md'     // 32px / 36px, rounded-full
label: string         // aria-label + Tooltip
```

Fon `bg-soft-{tone}`, ikonka `text-{tone}`, hover — to'yinroq. Standart ketma-ketlik action ustunida: **ko'rish (info) · tahrirlash (success) · o'chirish (danger)**; qo'shimcha amallar (takrorlash, boshlash, proktoring) — `primary`/`warning`, 4 tadan ko'p bo'lsa — `⋯` DropdownMenu (Radix allaqachon bor).

### 5.9 `Avatar`

`src?`, `name`, `size`; rasm bo'lmasa — `avatarTiles` dan rang + bosh harflar. Students, Users, Teachers, Employees, Results jadvallarida «ism» ustuni = Avatar + ism + ostida kichik kulrang (guruh / login).

### 5.10 `StatCard` (kengaytiriladi)

```
variant?: 'flat' | 'gradient'     // flat — hozirgi
tone?: 'primary' | 'violet' | 'success' | 'warning' | 'destructive'
trend?: { value: number; label: string }   // ▲ +12 «oxirgi 30 kun»
href?: string                      // karta bosiladigan
```

Gradient: `linear-gradient(135deg, var(--gradient-{tone}) 0%, var(--card) 100%)`; ikonka — `h-12 w-12 rounded-full bg-{tone} text-white`. Qorong'i mavzuda gradient 10–15% shaffoflikda.

### 5.11 `Sidebar` (kengaytiriladi)

- `collapsed` holati (`localStorage: sidebar-collapsed`), desktop'da hamburger uni almashtiradi.
- Yig'ilganda: logo ikonka, bo'lim sarlavhalari yashirinadi (chiziq qoladi), har bandda Radix Tooltip o'ngda.
- `MainLayout` kontent kengligi `--sidebar-width` / `--sidebar-width-collapsed` tokenlari orqali (ikkalasi ham allaqachon e'lon qilingan).

### 5.12 `Navbar` (o'zgaradi)

- Chapda: hamburger (desktop'da ham) + **hech narsa** (breadcrumb `PageHeader` ga ketdi) — yoki ixcham global qidiruv (keyingi bosqich, 6-bo'lim).
- O'ngda: doira tugmalar `UZ/RU` → mavzu → avatar (dropdown: Profil, Chiqish). Hammasi `h-10 w-10 rounded-full bg-muted hover:bg-accent`.

### 5.13 `Footer`

`MainLayout` pastida: `© {yil} {BRAND.universityName}. Barcha huquqlar himoyalangan.` / o'ngda `{BRAND.appName} · v{VITE_APP_VERSION}`. Mobil — bir ustun.

---

## 6. Sahifalar bo'yicha qo'llash

Andoza: **PageHeader(+breadcrumb) → ListCard[ListToolbar → DataTable(showIndex) → Pagination(showing)]**.

### 6.1 Admin — CRUD ma'lumotnomalar

| Sahifa | Toolbar filtrlari | Ustunlar (S.L dan keyin) | Action | Izoh |
|---|---|---|---|---|
| `/users` | Rol select, holat select | Avatar+login, rollar (Badge'lar), holat Badge, yaratilgan | ko'rish·tahrir·o'chir | Checkbox: ommaviy faol/nofaol (agar endpoint bo'lsa) |
| `/students` | Fakultet, guruh, (kurs) | Avatar+FISh (ost: guruh), HEMIS ID, guruh, manba Badge | ko'rish·guruh almashtirish·o'chir | 489 qator → `StudentTable`, `StudentFilters` ga bo'linadi |
| `/teachers` | Kafedra | Avatar+FISh, kafedra, fanlar soni, manba | ko'rish·tahrir | EduPlan qatorlarida tahrir yashirin (`ensure_editable`) |
| `/employees` | Bo'lim | Avatar+FISh, lavozim, bo'lim, manba | tahrir | |
| `/faculties`, `/kafedras`, `/groups`, `/subjects` | Yuqori darajadagi filtr (fakultet → kafedra → guruh) | Nom (link), ota-element, ichki soni (`_count`), manba Badge, holat | tahrir·o'chir | `KafedraSpecialitiesView`, `speciality/` komponentlari ham andozaga |
| `/courses` | Fan, o'qituvchi | Nom (link → `/courses/:id`), fan, darslar soni | ko'rish·tahrir·o'chir | `CourseFilters` → toolbar ichiga |
| `/roles`, `/permissions` | — | Nom, tavsif, soni | ruxsatlar·tahrir·o'chir | Kichik ro'yxat, paginatsiya shart emas — «Showing» baribir |
| `/teacher-ranking` | Fakultet, kafedra, davr | Avatar+FISh, ko'rsatkichlar, reyting Badge | ko'rish | Eksport (`xlsx`) tugmasi toolbar'da `outline` |

### 6.2 Testlar va natijalar

| Sahifa | Toolbar | Ustunlar | Action |
|---|---|---|---|
| `/quizzes` | Fakultet·Fan·Guruh·O'qituvchi·Holat — 5 ta → toolbar'da 2 ta (Fan, Holat) + «Filtrlar (3)» popover | Nom (link → `/quizzes/:id`), fan, guruh, o'qituvchi (Avatar), sana, holat Badge (+Switch admin uchun) | ko'rish·tahrir·takrorlash·o'chir (4 ta → oxirgisi `⋯` ga) |
| `/active-quizzes` | Fan, guruh | **Karta rejimi qoladi** (`variant='cards'`) — talaba/o'qituvchi uchun qulay; karta stili gradient-StatCard'ga yaqinlashtiriladi | boshlash (primary), proktoring rejimi |
| `/results` | Fakultet·Guruh·Fan·Test·Sana — «Filtrlar» popover | Avatar+FISh, test (link), fan, ball (rangli — `--grade-*`), foiz, sana, holat Badge | ko'rish (drawer)·javoblar | 788 qator → `ResultsTable`, `ResultsFilters`, `ResultDrawer` ga bo'linadi |
| `/results/answers` | Test, talaba | Savol raqami, savol, javob, to'g'ri/noto'g'ri Badge | — | |
| `/questions` | Fan, tur, qiyinlik | Savol matni (qisqartirilgan, sanitized), fan, tur Badge, variantlar soni | ko'rish·tahrir·o'chir | 650 qator → ro'yxat va detal modal ajratiladi |
| `/lessons` | Kurs, guruh | Mavzu (link), kurs, sana, resurslar soni | ko'rish·tahrir·o'chir | |

### 6.3 Psixologiya

- `/psychology` — metodlar ro'yxati: andozaga (nom, tur Badge — hozirgi 6 rangli palitra `info/primary/violet…` tonlarga xaritalanadi, savollar soni, holat).
- `/psychology/results` — `/results` bilan bir xil andoza.
- `/psychology/student`, `/psychology/test/:id` — **tegilmaydi** (talaba oqimi, FocusLayout).

### 6.4 Sinxronizatsiya

- `/admin/eduplan-sync`, `/admin/hemis-sync` — wizard uslubi qoladi; ichidagi proposal jadvallari `DataTable(showIndex)` + `Badge` (create/link/update/conflict/deactivate → `success/info/primary/warning/destructive`) ga o'tadi. Toolbar: «Faqat konfliktlar» switch.

### 6.5 Dashboard (`/dashboard`)

- 8 ta StatCard → `variant="gradient"`, 4 ustunli grid (`sm:2 xl:4`), har biri `href` bilan tegishli bo'limga.
- Trend: **backend'da 30 kunlik o'zgarish yo'q** → trend ko'rsatilmaydi (ikonka ham). Backend'ga talab: `GET /api/dashboard/stats` — `{ total, delta_30d }` har ko'rsatkich uchun (ixtiyoriy, keyingi bosqich).
- «Platforma ko'lami» bar-chart → WowDash grafik kartasi uslubida: sarlavha, o'ngda select (hozircha bitta variant — «Jami»), ostida katta raqam (jami natijalar) + izoh.
- «Tezkor o'tish» — saqlanadi, kartalar `IconButton` tonlariga mos ranglarda.
- Ikkinchi qator widget (keyingi bosqich, endpoint kerak): «So'nggi natijalar» jadvali (Avatar + test + ball + sana) — WowDash'dagi foydalanuvchilar jadvali o'rnida.

### 6.6 Talaba kabineti (`StudentDashboardPage`)

- Faqat stat-kartalar gradient variantiga o'tadi («Mavjud testlar», «Psixologik metodlar», «So'nggi ball»). Boshqa tuzilma o'zgarmaydi — mobil-first yechim 2026-08-18 da tekshirilgan.

---

## 7. Navbar'dagi «bildirishnomalar» — haqiqiy variant

WowDash'dagi 🔔 ni soxta qilmaymiz, lekin o'rnida foydali indikator bo'lishi mumkin (backend'ga kichik so'rov):

| Rol | Indikator | Manba |
|---|---|---|
| Admin | EduPlan sync'da hal qilinmagan `conflict` soni | mavjud preview natijasi Redis'da — `GET .../status` |
| O'qituvchi | Hozir faol (jarayondagi) testlar soni | `read:active_quiz` |
| Talaba | Ochiq testlar soni | `quiz_process` |

Bu **ixtiyoriy** va alohida bosqich; endpoint bo'lmasa — tugma ko'rsatilmaydi.

---

## 8. Mobil, qorong'i mavzu, i18n

- **Mobil:** `ListToolbar` ikki qatorga o'tadi; `DataTable.renderCard` saqlanadi — kartada Avatar + asosiy matn + Badge + action `IconButton`lar pastda. S.L mobilda yashirin. Paginatsiya: «Showing» yuqorida, tugmalar markazda.
- **Qorong'i mavzu:** soft/gradient tokenlar `.dark` da alohida (gradient 10–15% shaffoflik, soft fonlar `color-mix` bilan). `IconButton` tonlari kontrastdan o'tishi shart (WCAG AA matn 4.5:1, ikonka 3:1).
- **i18n:** barcha yangi satrlar `t('...')` (tabiiy kalitlar) + `ru.json` juftligi: «Jami {{total}} tadan {{from}}–{{to}} ko'rsatilmoqda», «Ko'rsatish», «Filtrlar», «Tozalash», «Barcha huquqlar himoyalangan» va h.k.

---

## 9. Bosqichlar va taxminiy hajm

Bitta dasturchi; bosqichlar ketma-ket, har biridan keyin deploy qilish mumkin.

| Bosqich | Ish | Hajm |
|---|---|---|
| **0. Poydevor** | Soft/gradient tokenlar; `Badge`, `IconButton`, `Avatar`, `Breadcrumb`, `PageSizeSelect`, `useDebouncedValue`; `Pagination` (showing, «»), `DataTable` (showIndex, selectable), `PageHeader` (breadcrumb), `ListCard`/`ListToolbar`; `Footer`; Storybook o'rniga — `/dev/ui` yashirin namoyish sahifasi (faqat dev build'da) | ~1 hafta |
| **1. Karkas** | Navbar (doira tugmalar, breadcrumb olib tashlash), Sidebar collapse + tooltip, MainLayout kengligi, Footer | 2–3 kun |
| **2. Testlar bloki** | `/quizzes`, `/results` (bo'lish!), `/results/answers`, `/questions` (bo'lish), `/lessons`, `/active-quizzes` karta stili | ~1.5 hafta |
| **3. Admin ma'lumotnomalar** | Users, Students (bo'lish), Teachers, Employees, Faculties, Kafedras, Groups, Subjects, Courses, Roles, Permissions, TeacherRanking | ~1.5 hafta |
| **4. Dashboard + psixologiya + sync** | Gradient StatCard, grafik kartasi, «So'nggi natijalar» (endpoint bo'lsa), psychology ro'yxatlari, sync jadvallari | ~1 hafta |
| **5. Sayqal** | Qorong'i mavzu auditi, mobil tekshiruv (375px), klaviatura/aria, i18n ru.json, eski `.badge-*` ishlatilgan joylarni tozalash, `StatCard.colorMap` ni o'chirish | 3–4 kun |

Jami: **~6 hafta**. 0 va 1 bosqichlar bajarilgach, qolgan sahifalar bir xil andoza bo'yicha mexanik o'tkaziladi va parallel qilinishi mumkin.

---

## 10. Har bir sahifa uchun «Bajarildi» mezoni

- [ ] `PageHeader` + breadcrumb (o'ngda), Navbar'da breadcrumb yo'q
- [ ] `ListCard`: toolbar (Show N · qidiruv · filtrlar · asosiy tugma) → jadval → «Showing…» + paginatsiya
- [ ] `S.L` ustuni; ism ustunida `Avatar`; holatlar `Badge` orqali; action — `IconButton` (info/success/danger tartibi)
- [ ] Sahifa hajmi tanlanadi va saqlanadi
- [ ] Mobil karta rejimi ishlaydi (375px da gorizontal skroll yo'q)
- [ ] Qorong'i mavzu — faqat tokenlar, xom palitra yo'q
- [ ] Yangi satrlar `t()` + `ru.json`
- [ ] Sahifa fayli < 300 qator (jadval / filtrlar / modal alohida)
- [ ] Skeleton / bo'sh / xato holatlari (DataTable orqali) saqlangan
- [ ] `npm run build` va `npm run lint` toza

---

## 11. Risklar va ochiq savollar

| Risk / savol | Yechim |
|---|---|
| Filtrlarni toolbar'ga siqish — 5 ta Combobox sig'maydi | 2 ta eng muhimi toolbar'da, qolganlari «Filtrlar (n)» popover'da; faol filtrlar chip sifatida jadval ustida |
| `pageSize` o'zgarishi — ba'zi backend endpointlar `limit` ni cheklaydimi? | Tekshirish: `limit` maks qiymati (50 yetarli); yo'q bo'lsa 10/20/50 dan faqat ruxsat etilganlar |
| Sidebar collapse — brend matni (`BRAND.appName`) yashirinadi | Yig'ilganda logo tooltip'ida to'liq nom |
| Trend va «So'nggi natijalar» uchun endpoint yo'q | Frontend trendsiz ishlaydi; backend talabi alohida taskka (`GET /api/dashboard/stats`, `GET /api/results?limit=5&sort=-created_at` mavjud bo'lishi mumkin — tekshirish) |
| `ResultsPage` (788) va `QuestionsPage` (650) ni bo'lishda regressiya | Avval komponentlarga bo'lish (xulq o'zgarmaydi), keyin andozaga o'tkazish — ikki alohida commit |
| Rangli action-tugmalar — daltonizm | Rang + ikonka + tooltip (faqat rangga tayanmaymiz) |
| Prod ma'lumotlari lokal bazada | Faqat o'qish/ko'rish orqali tekshirish, ommaviy amallar test akkauntlarda |
| `tutor` roli | Hali ham ochiq mahsulot savoli — bu rejada hisobga olinmagan |

---

## 12. Bu rejaga kirmaydi (keyingi hujjatlar)

- Global qidiruv (⌘K) navbar'da.
- Jadval ustunlarini sozlash / saralash (server tomonidan `sort_by` kerak).
- Excel eksport barcha ro'yxatlarda (hozir faqat reyting va natijalarda).
- Bildirishnomalar tizimi (7-bo'lim — faqat hisoblagich varianti).

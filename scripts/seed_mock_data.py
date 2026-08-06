#!/usr/bin/env python3
"""Генератор мок-данных для NDKTU LMS.

Запуск:
    python3 scripts/seed_mock_data.py            # напишет mock.sql рядом со скриптом
    docker exec -i database psql -U nusmt -d basic_database -v ON_ERROR_STOP=1 -q < mock.sql

ВНИМАНИЕ: скрипт делает TRUNCATE всех бизнес-таблиц. Сохраняются только
permissions / roles / role_permissions / alembic_version.


Пишет один .sql файл: TRUNCATE всех таблиц кроме permissions/roles/
role_permissions/alembic_version, затем INSERT'ы с явными id и setval
последовательностей в конце.

Роли (id) берутся из существующей БД: Admin=1, Teacher=2, Student=3,
User=4, Psixologik=5, dekan=6.
"""

import json
import random
from datetime import date, datetime, timedelta

random.seed(20260804)

ADMIN_HASH = "$2b$12$dsepCb.69h5d6Hn93llqI.oNzRs.iXj647uOIAvnSMFevQR0SAAC."
MOCK_HASH = "$2b$12$L0bwozC2IAbHSCooFaRH9.IRjpPv0vPCgPreTa9uqM/wBdjGauYj6"

ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT, ROLE_USER, ROLE_PSY, ROLE_DEKAN = 1, 2, 3, 4, 5, 6

UNIVERSITY = "Navoiy davlat konchilik va texnologiyalar universiteti"
TODAY = date(2026, 8, 4)

# ── SQL helpers ────────────────────────────────────────────────────────────


def normalized(value: str) -> str:
    """То же правило, что normalized_name в app/core/schemas.py.

    База хранит каноническую форму — нижний регистр, схлопнутые пробелы,
    обычный апостроф; красивое написание рисует фронтенд. Сид пишет SQL мимо
    Pydantic, так что правило приходится повторять здесь: иначе поиск по имени
    (вход из HEMIS) не найдёт засеянные записи.
    """
    for ch in "‘’ʻʼ`":
        value = value.replace(ch, "'")
    return " ".join(value.split()).lower()


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        return "'" + v.isoformat(sep=" ") + "'"
    if isinstance(v, date):
        return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


OUT = []


def emit(sql):
    OUT.append(sql)


def insert(table, cols, rows, chunk=500):
    """Многострочный INSERT пачками."""
    if not rows:
        return
    collist = ", ".join('"%s"' % c for c in cols)
    for i in range(0, len(rows), chunk):
        part = rows[i : i + chunk]
        values = ",\n  ".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in part)
        emit('INSERT INTO "%s" (%s) VALUES\n  %s;' % (table, collist, values))


# ── Справочники имён ───────────────────────────────────────────────────────

MALE_FIRST = [
    "Akmal", "Bekzod", "Doston", "Elyor", "Farrux", "Gʻayrat", "Husan", "Islom",
    "Jasur", "Kamol", "Lutfulla", "Muhammad", "Nodir", "Otabek", "Rustam",
    "Sardor", "Temur", "Ulugʻbek", "Zafar", "Shohruh", "Abror", "Behruz",
    "Diyor", "Eldor", "Fazliddin", "Javohir", "Xurshid", "Sanjar", "Oybek", "Ravshan",
]
FEMALE_FIRST = [
    "Aziza", "Barno", "Dilnoza", "Feruza", "Gulnora", "Hilola", "Iroda",
    "Jamila", "Kamola", "Lola", "Madina", "Nilufar", "Ozoda", "Rayhona",
    "Sevara", "Shahnoza", "Umida", "Zilola", "Nargiza", "Malika", "Mohira",
    "Zebo", "Nozima", "Muslima", "Sabina", "Dilfuza", "Gulbahor", "Xurshida",
]
LAST_BASE = [
    "Abdullayev", "Bekmurodov", "Ergashev", "Fayzullayev", "Gʻaniyev",
    "Hasanov", "Ibrohimov", "Joʻrayev", "Karimov", "Mahmudov", "Nazarov",
    "Olimov", "Qodirov", "Rahimov", "Saidov", "Toʻxtayev", "Usmonov",
    "Xolmatov", "Yusupov", "Zokirov", "Sultonov", "Turgʻunov", "Sharipov",
    "Muminov", "Rasulov", "Alimov", "Nabiyev", "Xasanov", "Yoʻldoshev", "Qurbonov",
]
REGIONS = [
    ("Navoiy", ["Karmana", "Nurota", "Qiziltepa", "Konimex", "Xatirchi"]),
    ("Buxoro", ["Gʻijduvon", "Kogon", "Romitan", "Vobkent"]),
    ("Samarqand", ["Urgut", "Kattaqoʻrgʻon", "Payariq", "Bulungʻur"]),
    ("Qashqadaryo", ["Qarshi", "Shahrisabz", "Koson", "Kitob"]),
    ("Jizzax", ["Zomin", "Gallaorol", "Doʻstlik"]),
    ("Toshkent", ["Chirchiq", "Angren", "Yangiyoʻl", "Boʻka"]),
]
SOCIAL = [None, None, None, "Kam taʼminlangan oila", "Nogironligi bor", "Yetim"]
BENEFIT = [None, None, None, None, "Davlat granti", "Ijtimoiy nafaqa"]


def make_person(gender):
    first = random.choice(MALE_FIRST if gender == "Erkak" else FEMALE_FIRST)
    last = random.choice(LAST_BASE)
    if gender == "Ayol":
        last = last + "a"
    third = random.choice(MALE_FIRST) + (" oʻgʻli" if gender == "Erkak" else " qizi")
    return first, last, third


def phone():
    return "+998%d%d %d%d%d-%d%d-%d%d" % tuple(random.randint(0, 9) for _ in range(9))


def jshshir():
    return "".join(str(random.randint(0, 9)) for _ in range(14))


def passport():
    return "AA" + "".join(str(random.randint(0, 9)) for _ in range(7))


# ── 1. Пользователи (админ) ────────────────────────────────────────────────

users = []
user_roles = []
uid = 0


def new_user(username, role_id, pw=MOCK_HASH, created=None):
    global uid
    uid += 1
    users.append({"id": uid, "username": username, "password": pw,
                  "created_at": created or datetime(2026, 1, 15, 9, 0),
                  "updated_at": created or datetime(2026, 1, 15, 9, 0)})
    user_roles.append({"user_id": uid, "role_id": role_id})
    return uid


ADMIN_UID = new_user("admin", ROLE_ADMIN, ADMIN_HASH, datetime(2026, 1, 10, 8, 0))

# ── 2. Факультеты ──────────────────────────────────────────────────────────

FACULTY_DEFS = [
    ("Konchilik fakulteti", "KON", "#EEF2FF", "#3730A3"),
    ("Metallurgiya fakulteti", "MET", "#FEF3C7", "#92400E"),
    ("Energetika va mexanika fakulteti", "ENM", "#DCFCE7", "#166534"),
    ("Axborot texnologiyalari fakulteti", "AXT", "#E0F2FE", "#075985"),
    ("Iqtisodiyot va menejment fakulteti", "IQM", "#FCE7F3", "#9D174D"),
]
faculties = []
for i, (name, code, bg, fg) in enumerate(FACULTY_DEFS, start=1):
    faculties.append({"id": i, "name": normalized(name), "code": code, "color_bg": bg,
                      "color_fg": fg, "position": i, "dekan_employee_id": None})

# ── 3. Кафедры ─────────────────────────────────────────────────────────────

KAFEDRA_DEFS = [
    (1, "Foydali qazilmalar konlarini qazib olish"),
    (1, "Markshayderlik ishi va geodeziya"),
    (1, "Geologiya va foydali qazilmalarni qidirish"),
    (2, "Metallurgiya"),
    (2, "Kimyoviy texnologiya"),
    (3, "Elektr energetikasi"),
    (3, "Texnologik mashinalar va jihozlar"),
    (3, "Muhandislik grafikasi va mexanika"),
    (4, "Axborot tizimlari va texnologiyalari"),
    (4, "Dasturiy injiniring"),
    (5, "Iqtisodiyot"),
    (5, "Menejment va marketing"),
]
kafedras = []
for i, (fac, name) in enumerate(KAFEDRA_DEFS, start=1):
    kafedras.append({"id": i, "faculty_id": fac, "name": normalized(name), "position": i,
                     "mudir_employee_id": None})

# ── 4. Отделы (для не-преподавательского персонала) ────────────────────────

DEPT_DEFS = [
    "Oʻquv-uslubiy boshqarma", "Kadrlar boʻlimi", "Buxgalteriya",
    "Axborot texnologiyalari boʻlimi", "Yoshlar bilan ishlash boʻlimi",
    "Ilmiy tadqiqotlar boʻlimi",
]
departments = [{"id": i, "name": n} for i, n in enumerate(DEPT_DEFS, start=1)]

# ── 5. Направления (specialities) ──────────────────────────────────────────

SPEC_DEFS = [
    (1, "Konchilik ishi", "60712300", "Kunduzgi"),
    (2, "Geodeziya va geoinformatika", "60711500", "Kunduzgi"),
    (3, "Geologiya, qidiruv va konlar geologiyasi", "60710800", "Kunduzgi"),
    (4, "Metallurgiya", "60712400", "Kunduzgi"),
    (5, "Kimyoviy texnologiya", "60710400", "Sirtqi"),
    (6, "Elektr energetikasi", "60713000", "Kunduzgi"),
    (7, "Texnologik mashinalar va jihozlar", "60712900", "Kunduzgi"),
    (9, "Axborot tizimlari va texnologiyalari", "60610300", "Kunduzgi"),
    (10, "Dasturiy injiniring", "60610200", "Kunduzgi"),
    (11, "Iqtisodiyot (tarmoqlar boʻyicha)", "60310100", "Sirtqi"),
    (12, "Menejment", "60411100", "Kunduzgi"),
]
specialities = []
for i, (kaf, name, code, form) in enumerate(SPEC_DEFS, start=1):
    specialities.append({"id": i, "kafedra_id": kaf, "name": normalized(name), "code": code,
                         "education_form": form, "academic_year": "2025/2026",
                         "position": i})

SPEC_FACULTY = {s["id"]: KAFEDRA_DEFS[s["kafedra_id"] - 1][0] for s in specialities}
SPEC_PREFIX = {
    1: "KON", 2: "GEO", 3: "GLG", 4: "MET", 5: "KIM", 6: "ELE",
    7: "TMJ", 8: "AXT", 9: "DIN", 10: "IQT", 11: "MEN",
}

# ── 6. Группы ──────────────────────────────────────────────────────────────

groups = []
gid = 0
for sp in specialities:
    pref = SPEC_PREFIX[sp["id"]]
    # 2-3 курса на направление → ~26 групп всего
    kurs_list = [(1, 2, 3), (2, 4), (1, 3, 4), (1, 2)][(sp["id"] - 1) % 4]
    for kurs in kurs_list:
        for k in range(1, 2):
            gid += 1
            enroll_year = 2026 - kurs
            groups.append({
                "id": gid,
                "speciality_id": sp["id"],
                "name": normalized("%s-%02d-%02d" % (pref, enroll_year % 100, k)),
                "kurs": kurs,
                # Форма обучения теперь на группе, а не на специальности.
                "education_form": sp["education_form"],
                "sardor_student_id": None,
                "position": gid,
            })

# ── 7. Предметы ────────────────────────────────────────────────────────────

SUBJECT_DEFS = [
    (1, "Konchilik ishi asoslari", "KON101", 6, 1),
    (1, "Ochiq konchilik ishlari", "KON203", 5, 3),
    (1, "Yer osti konchilik texnologiyasi", "KON305", 6, 5),
    (1, "Konchilikda mehnat muhofazasi", "KON402", 4, 7),
    (2, "Geodeziya", "GEO102", 5, 1),
    (2, "Markshayderlik ishi", "GEO204", 6, 4),
    (2, "Geoinformatika tizimlari", "GEO306", 5, 6),
    (3, "Umumiy geologiya", "GLG101", 5, 1),
    (3, "Mineralogiya va petrografiya", "GLG202", 5, 3),
    (3, "Qidiruv ishlari metodikasi", "GLG304", 4, 5),
    (4, "Metallurgiya nazariyasi", "MET201", 6, 2),
    (4, "Rangli metallar metallurgiyasi", "MET303", 6, 5),
    (5, "Umumiy kimyo", "KIM101", 5, 1),
    (5, "Fizik kimyo", "KIM205", 5, 3),
    (5, "Kimyoviy texnologiya jarayonlari", "KIM307", 6, 6),
    (6, "Elektrotexnika nazariy asoslari", "ELE201", 6, 2),
    (6, "Elektr mashinalari", "ELE304", 5, 5),
    (6, "Elektr taʼminoti tizimlari", "ELE402", 5, 7),
    (7, "Nazariy mexanika", "TMJ201", 5, 2),
    (7, "Mashina detallari", "TMJ303", 5, 4),
    (8, "Chizma geometriya va muhandislik grafikasi", "MGR101", 4, 1),
    (8, "Materiallar qarshiligi", "MGR202", 5, 3),
    (9, "Axborot texnologiyalari", "AXT101", 5, 1),
    (9, "Maʼlumotlar bazasi", "AXT204", 6, 3),
    (9, "Kompyuter tarmoqlari", "AXT305", 5, 5),
    (9, "Axborot xavfsizligi", "AXT403", 5, 7),
    (10, "Dasturlash asoslari", "DIN102", 6, 1),
    (10, "Obyektga yoʻnaltirilgan dasturlash", "DIN203", 6, 3),
    (10, "Veb-texnologiyalar", "DIN304", 5, 5),
    (10, "Dasturiy taʼminot arxitekturasi", "DIN405", 5, 7),
    (11, "Iqtisodiyot nazariyasi", "IQT101", 5, 1),
    (11, "Makroiqtisodiyot", "IQT202", 5, 3),
    (11, "Buxgalteriya hisobi", "IQT304", 5, 5),
    (12, "Menejment asoslari", "MEN101", 5, 1),
    (12, "Marketing", "MEN203", 5, 3),
    (12, "Loyihalarni boshqarish", "MEN305", 4, 6),
    (None, "Oʻzbekiston tarixi", "UMU101", 3, 1),
    (None, "Chet tili (ingliz)", "UMU102", 4, 1),
    (None, "Oliy matematika", "UMU103", 6, 1),
    (None, "Fizika", "UMU104", 5, 2),
]
subjects = []
for i, (kaf, name, code, credit, sem) in enumerate(SUBJECT_DEFS, start=1):
    subjects.append({
        "id": i, "kafedra_id": kaf, "name": name, "code": code,
        "credit": credit, "semester": sem,
        "description": "%s fani boʻyicha oʻquv kursi. Ma'ruza, amaliy va mustaqil ta'lim mashgʻulotlarini oʻz ichiga oladi." % name,
    })

SUBJ_BY_KAFEDRA = {}
for s in subjects:
    SUBJ_BY_KAFEDRA.setdefault(s["kafedra_id"], []).append(s["id"])

# ── 8. Сотрудники и преподаватели ──────────────────────────────────────────

# Должности — справочник job_titles, а не строка на сотруднике.
JOB_TITLE_DEFS = [
    "Professor", "Dotsent", "Katta oʻqituvchi", "Oʻqituvchi", "Assistent",
    "Boʻlim boshligʻi", "Bosh mutaxassis", "Yetakchi mutaxassis",
    "Mutaxassis", "Inspektor", "Buxgalter",
]
job_titles = [{"id": i, "name": n} for i, n in enumerate(JOB_TITLE_DEFS, start=1)]
JOB_TITLE_ID = {n: i for i, n in enumerate(JOB_TITLE_DEFS, start=1)}

employees = []
teachers = []
used_fullnames = set()
POSITIONS = ["Professor", "Dotsent", "Katta oʻqituvchi", "Oʻqituvchi", "Assistent"]

emp_id = 0
teacher_id = 0
teachers_by_kafedra = {}

for kaf in kafedras:
    n = random.randint(3, 5)
    for _ in range(n):
        gender = random.choice(["Erkak", "Erkak", "Ayol"])
        first, last, third = make_person(gender)
        full = "%s %s %s" % (last, first, third)
        while full in used_fullnames:
            first, last, third = make_person(gender)
            full = "%s %s %s" % (last, first, third)
        used_fullnames.add(full)

        emp_id += 1
        u = new_user("teacher%03d" % emp_id, ROLE_TEACHER)
        hire = TODAY - timedelta(days=random.randint(400, 5200))
        employees.append({
            "id": emp_id, "user_id": u, "department_id": None,
            "last_name": last, "first_name": first, "third_name": third,
            "full_name": full, "phone_number": phone(),
            "image_url": None,
            "job_title_id": JOB_TITLE_ID[random.choice(POSITIONS)],
            "work_email": "teacher%03d@ndktu.uz" % emp_id,
            "work_phone": "+998 79 %03d-%02d-%02d" % (random.randint(100, 999), random.randint(10, 99), random.randint(10, 99)),
            "gender": gender,
            "birth_date": date(random.randint(1965, 1995), random.randint(1, 12), random.randint(1, 28)),
            "hire_date": hire,
            "jshshir": jshshir(), "passport": passport(),
            "personal_phone": phone(),
            "address": "%s viloyati, %s tumani" % random.choice([(r, random.choice(d)) for r, d in REGIONS]),
        })
        teacher_id += 1
        teachers.append({"id": teacher_id, "kafedra_id": kaf["id"], "employee_id": emp_id})
        teachers_by_kafedra.setdefault(kaf["id"], []).append(teacher_id)

TEACHER_USER = {t["id"]: employees[t["employee_id"] - 1]["user_id"] for t in teachers}
TEACHER_NAME = {t["id"]: employees[t["employee_id"] - 1]["full_name"] for t in teachers}
EMP_BY_TEACHER = {t["id"]: t["employee_id"] for t in teachers}

# Административный персонал: сотрудники без Teacher-записи, привязаны к отделам.
STAFF_POSITIONS = [
    "Boʻlim boshligʻi", "Bosh mutaxassis", "Yetakchi mutaxassis",
    "Mutaxassis", "Inspektor", "Buxgalter",
]
staff_count = 0
for dept in departments:
    for _ in range(random.randint(2, 3)):
        gender = random.choice(["Erkak", "Ayol"])
        first, last, third = make_person(gender)
        full = "%s %s %s" % (last, first, third)
        while full in used_fullnames:
            first, last, third = make_person(gender)
            full = "%s %s %s" % (last, first, third)
        used_fullnames.add(full)
        staff_count += 1
        emp_id += 1
        u = new_user("xodim%03d" % staff_count, ROLE_USER)
        employees.append({
            "id": emp_id, "user_id": u, "department_id": dept["id"],
            "last_name": last, "first_name": first, "third_name": third,
            "full_name": full, "phone_number": phone(), "image_url": None,
            "job_title_id": JOB_TITLE_ID[random.choice(STAFF_POSITIONS)],
            "work_email": "xodim%03d@ndktu.uz" % staff_count,
            "work_phone": "+998 79 %03d-%02d-%02d" % (random.randint(100, 999), random.randint(10, 99), random.randint(10, 99)),
            "gender": gender,
            "birth_date": date(random.randint(1970, 1998), random.randint(1, 12), random.randint(1, 28)),
            "hire_date": TODAY - timedelta(days=random.randint(200, 4000)),
            "jshshir": jshshir(), "passport": passport(), "personal_phone": phone(),
            "address": "%s viloyati, %s tumani" % random.choice([(r, random.choice(d)) for r, d in REGIONS]),
        })

# Психолог + один декан-пользователь с ролью dekan
PSY_UID = new_user("psixolog", ROLE_PSY)

# Деканы и заведующие кафедрами — из числа преподавателей.
for fac in faculties:
    kaf_ids = [k["id"] for k in kafedras if k["faculty_id"] == fac["id"]]
    cand = [t for k in kaf_ids for t in teachers_by_kafedra.get(k, [])]
    t = cand[0]
    fac["dekan_employee_id"] = EMP_BY_TEACHER[t]
    user_roles.append({"user_id": TEACHER_USER[t], "role_id": ROLE_DEKAN})

for kaf in kafedras:
    cand = teachers_by_kafedra.get(kaf["id"], [])
    t = cand[-1]
    kaf["mudir_employee_id"] = EMP_BY_TEACHER[t]

# ── 9. Студенты ────────────────────────────────────────────────────────────

STATUS_CHOICES = ["Oʻqimoqda"] * 22 + ["Akademik taʼtilda", "Chetlashtirilgan"]
PAYMENT = ["Toʻlov-kontrakt"] * 3 + ["Davlat granti"]
EDU_TYPE = ["Bakalavr"] * 5 + ["Magistr"]

students = []
sid = 0
students_by_group = {}

for g in groups:
    spec = specialities[g["speciality_id"] - 1]
    # Факультет — только через специальность: прямой ссылки у группы больше нет.
    fac = faculties[SPEC_FACULTY[spec["id"]] - 1]
    n = random.randint(20, 26)
    for _ in range(n):
        gender = random.choice(["Erkak", "Erkak", "Ayol"])
        first, last, third = make_person(gender)
        region, districts = random.choice(REGIONS)
        sid += 1
        u = new_user("student%04d" % sid, ROLE_STUDENT)
        enroll_year = 2026 - g["kurs"]
        level = "%d-kurs" % g["kurs"]
        semester = "%d-semestr" % (g["kurs"] * 2 - random.choice([1, 0]))
        students.append({
            "id": sid, "user_id": u, "group_id": g["id"],
            "first_name": first, "last_name": last, "third_name": third,
            "full_name": "%s %s %s" % (last, first, third),
            "student_id_number": "%d%05d" % (enroll_year, sid),
            "image_path": "",
            "birth_date": date(enroll_year - random.randint(17, 21), random.randint(1, 12), random.randint(1, 28)),
            "phone": phone(), "gender": gender,
            "university": UNIVERSITY,
            "specialty": spec["name"],
            "student_status": random.choice(STATUS_CHOICES),
            "education_type": random.choice(EDU_TYPE),
            "payment_form": random.choice(PAYMENT),
            "education_lang": random.choice(["Oʻzbek"] * 8 + ["Rus", "Ingliz"]),
            "faculty": fac["name"], "level": level, "semester": semester,
            "address": "%s viloyati, %s tumani" % (region, random.choice(districts)),
            "avg_gpa": round(random.uniform(2.6, 4.9), 2),
            "enrollment_date": date(enroll_year, 9, 2),
            "graduation_date": date(enroll_year + 4, 6, 30) if g["kurs"] == 4 else None,
            "jshshir": jshshir(), "passport": passport(),
            "region": region, "district": random.choice(districts),
            "social_category": random.choice(SOCIAL),
            "benefit": random.choice(BENEFIT),
        })
        students_by_group.setdefault(g["id"], []).append(sid)

STUDENT_USER = {s["id"]: s["user_id"] for s in students}

for g in groups:
    g["sardor_student_id"] = students_by_group[g["id"]][0]

# ── 10. Учебный план (curriculum) ──────────────────────────────────────────

curriculum = []
cur_id = 0
for sp in specialities:
    kaf_subjects = SUBJ_BY_KAFEDRA.get(sp["kafedra_id"], [])
    common = SUBJ_BY_KAFEDRA.get(None, [])
    kaf_teachers = teachers_by_kafedra.get(sp["kafedra_id"], [])
    for sem in range(1, 9):
        pool = list(kaf_subjects) + list(common)
        random.shuffle(pool)
        for pos, subj_id in enumerate(pool[:4], start=1):
            subj = subjects[subj_id - 1]
            t = random.choice(kaf_teachers) if kaf_teachers else None
            cur_id += 1
            curriculum.append({
                "id": cur_id, "speciality_id": sp["id"], "subject_id": subj_id,
                "subject_name": subj["name"], "semester": sem,
                "credit": subj["credit"],
                # Ссылка на карточку преподавателя; ФИО в плане больше не хранится.
                "teacher_id": t,
                "position": pos,
            })

# ── 11. subject_teachers / teacher_assignments / group_teachers ────────────

subject_teachers = []
st_id = 0
st_by_subject = {}
all_teacher_ids = [t["id"] for t in teachers]

for s in subjects:
    pool = teachers_by_kafedra.get(s["kafedra_id"]) or all_teacher_ids
    chosen = random.sample(pool, min(len(pool), random.randint(1, 3)))
    for t in chosen:
        st_id += 1
        subject_teachers.append({"id": st_id, "subject_id": s["id"], "teacher_id": t})
        st_by_subject.setdefault(s["id"], []).append((st_id, t))

teacher_assignments = []
ta_id = 0
ta_seen = set()
for g in groups:
    sp = specialities[g["speciality_id"] - 1]
    subj_pool = (SUBJ_BY_KAFEDRA.get(sp["kafedra_id"], []) + SUBJ_BY_KAFEDRA.get(None, []))
    for subj_id in random.sample(subj_pool, min(len(subj_pool), 5)):
        pairs = st_by_subject.get(subj_id, [])
        if not pairs:
            continue
        _, t = random.choice(pairs)
        key = (t, subj_id, g["id"])
        if key in ta_seen:
            continue
        ta_seen.add(key)
        ta_id += 1
        teacher_assignments.append({"id": ta_id, "teacher_id": t, "subject_id": subj_id, "group_id": g["id"]})

group_teachers = []
gt_id = 0
for g in groups:
    sp = specialities[g["speciality_id"] - 1]
    pool = teachers_by_kafedra.get(sp["kafedra_id"]) or all_teacher_ids
    gt_id += 1
    group_teachers.append({"id": gt_id, "group_id": g["id"], "teacher_id": TEACHER_USER[random.choice(pool)]})

# ── 12. Курсы ──────────────────────────────────────────────────────────────

courses = []
course_groups = []
cg_id = 0
course_id = 0
course_meta = []  # (course_id, subject_id, teacher_id(teachers.id), [group_ids])

# По одному курсу на «интересные» связки предмет↔группа: берём по 2 группы
# на курс, всего 18 курсов.
course_seed = []
for sp in specialities:
    sp_groups = [g for g in groups if g["speciality_id"] == sp["id"]]
    kaf_subjects = SUBJ_BY_KAFEDRA.get(sp["kafedra_id"], [])
    if not kaf_subjects or not sp_groups:
        continue
    for subj_id in kaf_subjects[:2]:
        course_seed.append((sp, subj_id, sp_groups))

for sp, subj_id, sp_groups in course_seed[:18]:
    subj = subjects[subj_id - 1]
    pairs = st_by_subject.get(subj_id, [])
    st_row_id, t = random.choice(pairs)
    course_id += 1
    picked = sp_groups[: min(2, len(sp_groups))]
    courses.append({
        "id": course_id,
        "name": subj["name"],
        "description": "%s — %s yoʻnalishi talabalari uchun %d-semestr kursi. Video darslar, ma'ruza matnlari va amaliy topshiriqlar." % (
            subj["name"], sp["name"], subj["semester"]),
        "subject_id": subj_id,
        "teacher_id": TEACHER_USER[t],
        "semester_number": subj["semester"],
        "faculty_id": SPEC_FACULTY[sp["id"]],
        "kafedra_id": sp["kafedra_id"],
        "speciality_id": sp["id"],
    })
    for g in picked:
        cg_id += 1
        course_groups.append({"id": cg_id, "course_id": course_id, "group_id": g["id"]})
    course_meta.append((course_id, subj_id, t, st_row_id, [g["id"] for g in picked]))

# ── 13. Темы и материалы курса ─────────────────────────────────────────────

TOPIC_TEMPLATES = [
    "Kirish va asosiy tushunchalar",
    "Nazariy asoslar",
    "Amaliy usullar va hisob-kitoblar",
    "Zamonaviy texnologiyalar",
    "Tahlil va natijalarni baholash",
    "Yakuniy loyiha va takrorlash",
]
MATERIAL_KINDS = [
    ("upload", "Video dars"),
    ("youtube", "Video maʼruza"),
    (None, "Maʼruza matni"),
]

course_topics = []
course_materials = []
topic_id = 0
material_id = 0
materials_by_course = {}

for c in courses:
    for pos, tname in enumerate(TOPIC_TEMPLATES[: random.randint(4, 6)], start=1):
        topic_id += 1
        course_topics.append({"id": topic_id, "course_id": c["id"],
                              "title": "%d-mavzu. %s" % (pos, tname), "position": pos})
        for mpos in range(1, random.randint(3, 4) + 1):
            kind, label = random.choice(MATERIAL_KINDS)
            material_id += 1
            course_materials.append({
                "id": material_id, "topic_id": topic_id,
                "title": "%s %d.%d — %s" % (label, pos, mpos, tname),
                "description": "%s mavzusi boʻyicha oʻquv materiali." % tname,
                "video_type": kind,
                "video_url": ("https://www.youtube.com/watch?v=dQw4w9WgXcQ" if kind == "youtube"
                              else ("/uploads/course_resources/mock-lesson-%d.mp4" % material_id if kind == "upload" else None)),
                "poster_url": None,
                "duration_label": "%d daq" % random.randint(8, 45) if kind else None,
                "attachments": ([{"name": "Maʼruza-%d.pdf" % material_id,
                                  "url": "/uploads/course_resources/maruza-%d.pdf" % material_id,
                                  "size": random.randint(120000, 4500000)}]
                                if random.random() < 0.6 else []),
                "position": mpos,
            })
            materials_by_course.setdefault(c["id"], []).append(material_id)

# ── 14. Занятия (lessons) и журнал ─────────────────────────────────────────

LESSON_TYPES = ["lecture", "seminar", "independent", "lab"]
ATTENDANCE = ["present"] * 8 + ["absent", "late"]

lessons = []
lesson_results = []
lesson_id = 0
lr_id = 0

for (cid, subj_id, t, st_row_id, gids) in course_meta:
    for g_id in gids:
        start = TODAY - timedelta(days=random.randint(70, 100))
        for w in range(6):
            lesson_id += 1
            ldate = start + timedelta(days=7 * w)
            lessons.append({
                "id": lesson_id, "subject_teacher_id": st_row_id, "group_id": g_id,
                "course_id": cid, "lesson_type": random.choice(LESSON_TYPES),
                "topic": "%d-mashgʻulot. %s" % (w + 1, TOPIC_TEMPLATES[w % len(TOPIC_TEMPLATES)]),
                "date": ldate,
                "description": "Mavzu boʻyicha maʼruza va amaliy mashqlar.",
            })
            for s_id in students_by_group.get(g_id, []):
                att = random.choice(ATTENDANCE)
                lr_id += 1
                lesson_results.append({
                    "id": lr_id, "lesson_id": lesson_id, "user_id": STUDENT_USER[s_id],
                    "attendance": att,
                    "grade": random.randint(55, 100) if att == "present" and random.random() < 0.7 else None,
                    "notes": None,
                })

# ── 15. Задания и сдачи ────────────────────────────────────────────────────

assignments = []
submissions = []
a_id = 0
sub_id = 0

for (cid, subj_id, t, st_row_id, gids) in course_meta:
    course_lessons = [l["id"] for l in lessons if l["course_id"] == cid]
    mats = materials_by_course.get(cid, [])
    for k in range(2):
        a_id += 1
        deadline = TODAY + timedelta(days=random.randint(-20, 25))
        assignments.append({
            "id": a_id, "course_id": cid,
            "lesson_id": random.choice(course_lessons) if course_lessons and k == 0 else None,
            "material_id": random.choice(mats) if mats and k == 1 else None,
            "created_by_user_id": TEACHER_USER[t],
            "title": "%d-topshiriq: %s" % (k + 1, random.choice([
                "mustaqil ish", "amaliy hisobot", "referat", "laboratoriya bayonnomasi"])),
            "description": "Topshiriqni belgilangan muddatgacha yuklang. Ishning hajmi 5-10 bet.",
            "deadline": datetime.combine(deadline, datetime.min.time()) + timedelta(hours=23, minutes=59),
            "max_grade": random.choice([50, 100]),
            "allow_file": True,
            "allow_text": random.random() < 0.7,
            "allowed_file_types": random.choice([["pdf", "docx"], ["pdf"], ["pdf", "docx", "zip"]]),
        })
        for g_id in gids:
            for s_id in students_by_group.get(g_id, [])[:14]:
                roll = random.random()
                if roll < 0.15:
                    continue  # не сдал
                sub_id += 1
                is_graded = roll > 0.45
                submitted_at = datetime.combine(deadline, datetime.min.time()) - timedelta(
                    days=random.randint(0, 5), hours=random.randint(0, 20))
                submissions.append({
                    "id": sub_id, "assignment_id": a_id, "user_id": STUDENT_USER[s_id],
                    "submitted_text": "Topshiriq boʻyicha bajarilgan ish qisqacha izohi." if random.random() < 0.5 else None,
                    "submitted_files": [{"name": "ish-%d.pdf" % sub_id,
                                         "url": "/uploads/course_resources/ish-%d.pdf" % sub_id,
                                         "size": random.randint(80000, 2500000)}],
                    "submitted_at": submitted_at,
                    "status": "graded" if is_graded else "submitted",
                    "grade": random.randint(40, 100) if is_graded else None,
                    "feedback": random.choice([
                        "Ish toʻliq bajarilgan.", "Hisob-kitoblarda kichik xatolar bor.",
                        "Yaxshi, lekin manbalar koʻrsatilmagan.", None]) if is_graded else None,
                    "graded_by_user_id": TEACHER_USER[t] if is_graded else None,
                    "graded_at": submitted_at + timedelta(days=random.randint(1, 6)) if is_graded else None,
                })

# ── 16. Прогресс по материалам ─────────────────────────────────────────────

progress = []
p_id = 0
prog_seen = set()
for (cid, subj_id, t, st_row_id, gids) in course_meta:
    mats = materials_by_course.get(cid, [])
    for g_id in gids:
        for s_id in students_by_group.get(g_id, [])[:12]:
            for m_id in mats:
                if random.random() < 0.45:
                    key = (m_id, STUDENT_USER[s_id])
                    if key in prog_seen:
                        continue
                    prog_seen.add(key)
                    p_id += 1
                    progress.append({
                        "id": p_id, "material_id": m_id, "user_id": STUDENT_USER[s_id],
                        "completed_at": datetime(2026, random.randint(5, 8), random.randint(1, 28),
                                                 random.randint(9, 21), random.randint(0, 59)),
                    })

# ── 17. Ресурсы ────────────────────────────────────────────────────────────

resources = []
r_id = 0
for (cid, subj_id, t, st_row_id, gids) in course_meta:
    for k in range(random.randint(2, 4)):
        r_id += 1
        rtype = random.choice(["file", "link", "text"])
        resources.append({
            "id": r_id, "lesson_id": None, "course_id": cid,
            "resource_type": rtype,
            "title": random.choice([
                "Adabiyotlar roʻyxati", "Uslubiy koʻrsatma", "Qoʻshimcha maqola",
                "Taqdimot slaydlari", "Foydali havola"]),
            "file_url": "/uploads/course_resources/resurs-%d.pdf" % r_id if rtype == "file" else None,
            "link_url": "https://ndktu.uz/resurs/%d" % r_id if rtype == "link" else None,
            "text_content": "Ushbu kurs boʻyicha qoʻshimcha uslubiy materiallar." if rtype == "text" else None,
            "order_index": k,
            "created_by_user_id": TEACHER_USER[t],
        })

# ── 18. Вопросы для тестов ─────────────────────────────────────────────────

QUESTION_TEMPLATES = [
    ("{s} fanining asosiy predmeti nima?", ["Jarayonlarni oʻrganish", "Faqat tarixiy maʼlumotlar",
                                            "Adabiy tahlil", "Sport nazariyasi"]),
    ("{s} boʻyicha quyidagilardan qaysi biri toʻgʻri?", ["Nazariya amaliyot bilan bogʻliq",
                                                          "Nazariya keraksiz", "Amaliyot keraksiz",
                                                          "Hech qaysi biri"]),
    ("{s} kursida qaysi usul asosiy hisoblanadi?", ["Tizimli yondashuv", "Tasodifiy tanlov",
                                                     "Faqat kuzatish", "Hech qanday usul"]),
    ("{s} fanida hisob-kitoblar qaysi birlikda olib boriladi?", ["SI tizimida", "Faqat foizda",
                                                                  "Oʻlchovsiz", "Ixtiyoriy"]),
    ("{s} boʻyicha natijalarni baholashda nima muhim?", ["Aniqlik va takrorlanuvchanlik",
                                                          "Faqat tezlik", "Hajm", "Rang"]),
]
questions = []
q_id = 0
questions_by_subject = {}

quiz_subject_ids = sorted({m[1] for m in course_meta}) or [s["id"] for s in subjects[:12]]
for subj_id in quiz_subject_ids:
    subj = subjects[subj_id - 1]
    pairs = st_by_subject.get(subj_id, [])
    author = TEACHER_USER[pairs[0][1]] if pairs else ADMIN_UID
    for n in range(30):
        tpl, opts = QUESTION_TEMPLATES[n % len(QUESTION_TEMPLATES)]
        shuffled = opts[:]
        correct_text = opts[0]
        random.shuffle(shuffled)
        correct_letter = "abcd"[shuffled.index(correct_text)]
        q_id += 1
        questions.append({
            "id": q_id, "subject_id": subj_id, "user_id": author,
            "text": "%d. %s" % (n + 1, tpl.format(s=subj["name"])),
            "option_a": shuffled[0], "option_b": shuffled[1],
            "option_c": shuffled[2], "option_d": shuffled[3],
            "correct_option": correct_letter,
            "version": 1, "is_latest": True, "original_question_id": None,
            "is_active": True,
        })
        questions_by_subject.setdefault(subj_id, []).append(q_id)

QUESTION_BY_ID = {q["id"]: q for q in questions}

# ── 19. Тесты, результаты, ответы ──────────────────────────────────────────

quizzes = []
quiz_questions = []
results = []
user_answers = []
quiz_id = 0
qq_id = 0
res_id = 0
ua_id = 0

for (cid, subj_id, t, st_row_id, gids) in course_meta[:12]:
    pool = questions_by_subject.get(subj_id, [])
    if len(pool) < 20:
        continue
    g_id = gids[0]
    quiz_id += 1
    picked_q = random.sample(pool, 20)
    is_active = quiz_id <= 2
    created = datetime(2026, 7, random.randint(1, 28), random.randint(9, 16), 0)
    quizzes.append({
        "id": quiz_id, "user_id": TEACHER_USER[t], "group_id": g_id, "subject_id": subj_id,
        "title": "%s — oraliq nazorat" % subjects[subj_id - 1]["name"],
        "question_number": 20,
        "duration": random.choice([30, 45, 60]),
        "pin": "%06d" % random.randint(100000, 999999),
        "is_active": is_active,
        "proctoring_mode": random.choice(["standard", "face"]),
        "attempt": 1,
        "created_at": created, "updated_at": created,
    })
    for q in picked_q:
        qq_id += 1
        quiz_questions.append({"id": qq_id, "quiz_id": quiz_id, "question_id": q})

    if is_active:
        continue  # активный тест: результатов ещё нет

    for s_id in students_by_group.get(g_id, []):
        if random.random() < 0.12:
            continue  # не проходил
        res_id += 1
        started = created + timedelta(days=random.randint(1, 5), hours=random.randint(0, 6))
        correct = 0
        answers_rows = []
        for q in picked_q:
            qq = QUESTION_BY_ID[q]
            correct_text = getattr_opt = qq["option_" + qq["correct_option"]]
            if random.random() < 0.68:
                given = correct_text
                ok = True
                correct += 1
            else:
                wrong = [qq["option_a"], qq["option_b"], qq["option_c"], qq["option_d"]]
                wrong.remove(correct_text)
                given = random.choice(wrong)
                ok = False
            answers_rows.append((q, given, correct_text, ok))
        wrong_n = 20 - correct
        cheated = random.random() < 0.07
        results.append({
            "id": res_id, "user_id": STUDENT_USER[s_id], "quiz_id": quiz_id,
            "subject_id": subj_id, "group_id": g_id,
            "status": "completed",
            "finished_at": started + timedelta(minutes=random.randint(12, 55)),
            "correct_answers": correct, "wrong_answers": wrong_n,
            "grade": int(round(correct / 20 * 100)),
            "cheating_detected": cheated,
            "reason_for_stop": "Kadrda boshqa shaxs aniqlandi" if cheated else None,
            "cheating_image_url": "/uploads/cheating_evidence/mock-%d.jpg" % res_id if cheated else None,
            "created_at": started, "updated_at": started,
        })
        for (q, given, correct_text, ok) in answers_rows:
            ua_id += 1
            user_answers.append({
                "id": ua_id, "user_id": STUDENT_USER[s_id], "quiz_id": quiz_id,
                "question_id": q, "result_id": res_id, "answer": given,
                "correct_answer": correct_text, "is_correct": ok,
            })

# ── 20. Психологические методики ───────────────────────────────────────────

psy_methods = []
psy_questions = []
psy_results = []
pm_id = 0
pq_id = 0
pr_id = 0

# 20.1 Айзенк — темперамент (category)
pm_id += 1
eysenck_id = pm_id
psy_methods.append({
    "id": pm_id, "name": "Ayzenk temperament testi",
    "description": "Shaxs temperamenti turini aniqlash uchun qisqartirilgan Ayzenk soʻrovnomasi.",
    "instruction": {
        "text": "Har bir savolga 'Ha' yoki 'Yoʻq' deb javob bering. Uzoq oʻylamang — birinchi javob eng toʻgʻrisi.",
        "scoring": {
            "method": "category",
            "reverse": [],
            "categories": {"Ekstraversiya": [], "Neyrotizm": []},
        },
        "category_interpretations": {
            "Ekstraversiya": [
                {"min": 0, "max": 3, "label": "Introvert", "description": "Yopiq, oʻz ichki dunyosiga yoʻnaltirilgan."},
                {"min": 4, "max": 7, "label": "Ambivert", "description": "Muvozanatli, vaziyatga qarab moslashuvchan."},
                {"min": 8, "max": 12, "label": "Ekstravert", "description": "Ochiq, muloqotchan, tashqi faoliyatga yoʻnaltirilgan."},
            ],
            "Neyrotizm": [
                {"min": 0, "max": 3, "label": "Barqaror", "description": "Hissiy jihatdan barqaror."},
                {"min": 4, "max": 7, "label": "Oʻrtacha", "description": "Stressga oʻrtacha darajada javob beradi."},
                {"min": 8, "max": 12, "label": "Beqaror", "description": "Hissiy beqarorlik belgilari mavjud."},
            ],
        },
    },
})
EYS_E = [
    "Sizga yangi odamlar bilan tanishish yoqadimi?",
    "Koʻp odamli tadbirlarda oʻzingizni erkin his qilasizmi?",
    "Suhbatda koʻpincha tashabbusni oʻz qoʻlingizga olasizmi?",
    "Yolgʻiz qolishdan koʻra doʻstlar davrasini afzal koʻrasizmi?",
    "Notanish auditoriya oldida gapirish sizga oson kechadimi?",
    "Rejalarni tez oʻzgartirishga tayyormisiz?",
]
EYS_N = [
    "Kayfiyatingiz tez-tez oʻzgaradimi?",
    "Kichik muammolar ham sizni uzoq bezovta qiladimi?",
    "Tunda uyquga ketish qiyin boʻladigan holatlar boʻladimi?",
    "Oʻzingizni asabiy his qilasizmi?",
    "Koʻpincha sababsiz xavotirlanasizmi?",
    "Tanqidni ogʻir qabul qilasizmi?",
]
order = 0
for text in EYS_E:
    order += 1
    pq_id += 1
    psy_questions.append({"id": pq_id, "method_id": eysenck_id, "question_type": "true_false",
                          "content": {"text": text}, "options": None, "order": order,
                          "category": "Ekstraversiya"})
for text in EYS_N:
    order += 1
    pq_id += 1
    psy_questions.append({"id": pq_id, "method_id": eysenck_id, "question_type": "true_false",
                          "content": {"text": text}, "options": None, "order": order,
                          "category": "Neyrotizm"})

# 20.2 Шкала тревожности (sum)
pm_id += 1
anx_id = pm_id
psy_methods.append({
    "id": pm_id, "name": "Talaba xavotir darajasi shkalasi",
    "description": "Oʻquv jarayonidagi xavotir darajasini oʻlchovchi 8 savolli shkala.",
    "instruction": {
        "text": "Har bir holatni 1 dan 5 gacha baholang: 1 — umuman toʻgʻri emas, 5 — toʻliq toʻgʻri.",
        "scoring": {"method": "sum", "reverse": [7, 8]},
        "interpretation": [
            {"min": 8, "max": 16, "label": "Past xavotir", "description": "Xavotir darajasi past, oʻquv yuklamasi qulay qabul qilinmoqda."},
            {"min": 17, "max": 28, "label": "Oʻrtacha xavotir", "description": "Meʼyoriy daraja. Imtihon davrida vaqtni rejalashtirish tavsiya etiladi."},
            {"min": 29, "max": 40, "label": "Yuqori xavotir", "description": "Yuqori daraja. Psixolog bilan suhbat tavsiya etiladi."},
        ],
    },
})
ANX_Q = [
    "Imtihon oldidan kuchli hayajonlanaman.",
    "Baho olishdan qoʻrqaman.",
    "Auditoriyada javob berishda qoʻlim titraydi.",
    "Yangi fan boshlanganda oʻzimni yoʻqotib qoʻyaman.",
    "Guruhdoshlarim oldida xato qilishdan uyalaman.",
    "Topshiriq muddati yaqinlashganda uxlay olmayman.",
    "Oʻquv rejasini bemalol bajara olaman.",
    "Qiyin vaziyatda ham xotirjam qola olaman.",
]
for i, text in enumerate(ANX_Q, start=1):
    pq_id += 1
    psy_questions.append({"id": pq_id, "method_id": anx_id, "question_type": "scale",
                          "content": {"text": text, "min": 1, "max": 5,
                                      "min_label": "Umuman toʻgʻri emas", "max_label": "Toʻliq toʻgʻri"},
                          "options": None, "order": i, "category": None})

# 20.3 Мотивация обучения (sum, text-варианты)
pm_id += 1
mot_id = pm_id
psy_methods.append({
    "id": pm_id, "name": "Oʻquv motivatsiyasi soʻrovnomasi",
    "description": "Talabaning oʻqishga boʻlgan ichki va tashqi motivatsiyasini baholaydi.",
    "instruction": {
        "text": "Har bir savol uchun oʻzingizga eng mos javobni tanlang.",
        "scoring": {"method": "sum", "reverse": []},
        "interpretation": [
            {"min": 0, "max": 8, "label": "Past motivatsiya", "description": "Oʻquv motivatsiyasi past — tyutor bilan ishlash tavsiya etiladi."},
            {"min": 9, "max": 16, "label": "Oʻrtacha motivatsiya", "description": "Motivatsiya barqaror, lekin qoʻshimcha ragʻbat foydali."},
            {"min": 17, "max": 24, "label": "Yuqori motivatsiya", "description": "Kuchli ichki motivatsiya — ilmiy faoliyatga jalb etish mumkin."},
        ],
    },
})
MOT_Q = [
    "Darsga tayyorgarlik koʻrishga qancha vaqt ajratasiz?",
    "Qoʻshimcha adabiyot oʻqiysizmi?",
    "Ilmiy toʻgaraklarda qatnashasizmi?",
    "Tanlagan yoʻnalishingiz sizga qiziqarlimi?",
    "Kelajakda shu sohada ishlashni rejalashtiryapsizmi?",
    "Yuqori baho olish siz uchun muhimmi?",
    "Mustaqil loyihalar qilasizmi?",
    "Oʻqituvchidan qoʻshimcha savol berasizmi?",
]
MOT_OPTS = [
    {"text": "Deyarli hech qachon", "value": 0},
    {"text": "Baʼzan", "value": 1},
    {"text": "Tez-tez", "value": 2},
    {"text": "Doimo", "value": 3},
]
for i, text in enumerate(MOT_Q, start=1):
    pq_id += 1
    psy_questions.append({"id": pq_id, "method_id": mot_id, "question_type": "text",
                          "content": {"text": text}, "options": MOT_OPTS, "order": i,
                          "category": None})

# Результаты психологических тестов
psy_q_by_method = {}
for q in psy_questions:
    psy_q_by_method.setdefault(q["method_id"], []).append(q)

respondents = random.sample([s["id"] for s in students], 150)
for s_id in respondents:
    for m_id in random.sample([eysenck_id, anx_id, mot_id], random.randint(1, 3)):
        qs = psy_q_by_method[m_id]
        answers = []
        total = 0
        cat_scores = {}
        for q in qs:
            if q["question_type"] == "true_false":
                v = random.choice([0, 1])
            elif q["question_type"] == "scale":
                v = random.randint(1, 5)
            else:
                v = random.choice([0, 1, 2, 3])
            answers.append({"question_id": q["id"], "value": v})
            if m_id == eysenck_id:
                cat_scores[q["category"]] = cat_scores.get(q["category"], 0) + v
            else:
                score = v
                if m_id == anx_id and q["order"] in (7, 8):
                    score = 6 - v
                total += score

        if m_id == eysenck_id:
            interp = psy_methods[eysenck_id - 1]["instruction"]["category_interpretations"]
            cats = []
            for cname, cscore in cat_scores.items():
                band = next((b for b in interp[cname] if b["min"] <= cscore <= b["max"]), None)
                cats.append({"name": cname, "score": cscore,
                             "label": band["label"] if band else "",
                             "description": band["description"] if band else ""})
            diagnosis = {"type": "category", "scores": cat_scores, "categories": cats}
        else:
            items = psy_methods[m_id - 1]["instruction"]["interpretation"]
            band = next((b for b in items if b["min"] <= total <= b["max"]), None)
            diagnosis = ({"type": "sum", "total": total, "label": band["label"],
                          "description": band["description"]} if band else None)

        pr_id += 1
        created = datetime(2026, random.randint(4, 8), random.randint(1, 28),
                           random.randint(9, 19), random.randint(0, 59))
        psy_results.append({"id": pr_id, "method_id": m_id, "user_id": STUDENT_USER[s_id],
                            "answers": answers, "diagnosis": diagnosis,
                            "created_at": created, "updated_at": created})

# ── Генерация SQL ──────────────────────────────────────────────────────────

WIPE = [
    "user_answers", "results", "quiz_questions", "quizzes", "questions",
    "psychology_results", "psychology_questions", "psychology_methods",
    "assignment_submissions", "assignments", "course_material_progress",
    "course_materials", "course_topics", "resources", "lesson_results",
    "lessons", "course_groups", "courses", "teacher_assignments",
    "subject_teachers", "group_teachers", "curriculum", "teachers",
    "employees", "students", "groups", "specialities", "subjects",
    "kafedras", "faculties", "departments", "job_titles", "user_roles", "users",
]

emit("BEGIN;")
emit("TRUNCATE TABLE %s RESTART IDENTITY CASCADE;" % ", ".join('"%s"' % t for t in WIPE))

USER_COLS = ["id", "username", "password", "created_at", "updated_at"]
insert("users", USER_COLS, users)
insert("user_roles", ["user_id", "role_id"], user_roles)

insert("departments", ["id", "name"], departments)
insert("job_titles", ["id", "name"], job_titles)
# employees идут раньше faculties и kafedras: декан и заведующий ссылаются
# теперь на карточку сотрудника, а не на учётку.
insert("employees", ["id", "user_id", "department_id", "last_name", "first_name",
                     "third_name", "full_name", "phone_number", "image_url",
                     "job_title_id", "work_email", "work_phone", "gender",
                     "birth_date", "hire_date",
                     "jshshir", "passport", "personal_phone", "address"], employees)
insert("faculties", ["id", "name", "code", "dekan_employee_id",
                     "color_bg", "color_fg", "position"], faculties)
insert("kafedras", ["id", "faculty_id", "name", "mudir_employee_id", "position"], kafedras)
insert("specialities", ["id", "kafedra_id", "name", "code",
                        "academic_year", "position"], specialities)
insert("subjects", ["id", "kafedra_id", "name", "code", "credit", "semester", "description"], subjects)

insert("groups", ["id", "speciality_id", "name", "kurs", "education_form",
                  "sardor_student_id", "position"],
       [{**g, "sardor_student_id": None} for g in groups])

insert("teachers", ["id", "kafedra_id", "employee_id"], teachers)

insert("students", ["id", "user_id", "group_id", "first_name", "last_name",
                    "third_name", "full_name", "student_id_number", "image_path",
                    "birth_date", "phone", "gender", "university", "specialty",
                    "student_status", "education_type",
                    "payment_form", "education_lang", "faculty", "level",
                    "semester", "address", "avg_gpa", "enrollment_date",
                    "graduation_date", "jshshir", "passport", "region",
                    "district", "social_category", "benefit"], students)

# старост проставляем после студентов
for g in groups:
    emit('UPDATE "groups" SET "sardor_student_id" = %d WHERE "id" = %d;'
         % (g["sardor_student_id"], g["id"]))

insert("curriculum", ["id", "speciality_id", "subject_id", "subject_name", "semester",
                      "credit", "teacher_id", "position"], curriculum)
insert("subject_teachers", ["id", "subject_id", "teacher_id"], subject_teachers)
insert("teacher_assignments", ["id", "teacher_id", "subject_id", "group_id"], teacher_assignments)
insert("group_teachers", ["id", "group_id", "teacher_id"], group_teachers)

insert("courses", ["id", "name", "description", "subject_id", "teacher_id",
                   "semester_number", "faculty_id", "kafedra_id", "speciality_id"], courses)
insert("course_groups", ["id", "course_id", "group_id"], course_groups)
insert("course_topics", ["id", "course_id", "title", "position"], course_topics)
insert("course_materials", ["id", "topic_id", "title", "description", "video_type",
                            "video_url", "poster_url", "duration_label",
                            "attachments", "position"], course_materials)
insert("lessons", ["id", "subject_teacher_id", "group_id", "course_id", "lesson_type",
                   "topic", "date", "description"], lessons)
insert("lesson_results", ["id", "lesson_id", "user_id", "attendance", "grade", "notes"], lesson_results)
insert("assignments", ["id", "course_id", "lesson_id", "material_id", "created_by_user_id",
                       "title", "description", "deadline", "max_grade", "allow_file",
                       "allow_text", "allowed_file_types"], assignments)
insert("assignment_submissions", ["id", "assignment_id", "user_id", "submitted_text",
                                  "submitted_files", "submitted_at", "status", "grade",
                                  "feedback", "graded_by_user_id", "graded_at"], submissions)
insert("course_material_progress", ["id", "material_id", "user_id", "completed_at"], progress)
insert("resources", ["id", "lesson_id", "course_id", "resource_type", "title",
                     "file_url", "link_url", "text_content", "order_index",
                     "created_by_user_id"], resources)

insert("questions", ["id", "subject_id", "user_id", "text", "option_a", "option_b",
                     "option_c", "option_d", "correct_option", "version", "is_latest",
                     "original_question_id", "is_active"], questions)
insert("quizzes", ["id", "user_id", "group_id", "subject_id", "title", "question_number",
                   "duration", "pin", "is_active", "proctoring_mode", "attempt",
                   "created_at", "updated_at"], quizzes)
insert("quiz_questions", ["id", "quiz_id", "question_id"], quiz_questions)
insert("results", ["id", "user_id", "quiz_id", "subject_id", "group_id", "status",
                   "finished_at", "correct_answers", "wrong_answers", "grade",
                   "cheating_detected", "reason_for_stop", "cheating_image_url",
                   "created_at", "updated_at"], results)
insert("user_answers", ["id", "user_id", "quiz_id", "question_id", "result_id",
                        "answer", "correct_answer", "is_correct"], user_answers)

insert("psychology_methods", ["id", "name", "description", "instruction"], psy_methods)
insert("psychology_questions", ["id", "method_id", "question_type", "content",
                                "options", "order", "category"], psy_questions)
insert("psychology_results", ["id", "method_id", "user_id", "answers", "diagnosis",
                              "created_at", "updated_at"], psy_results)


# Синхронизация последовательностей
for t in WIPE:
    if t in ("user_roles",):
        emit("SELECT setval(pg_get_serial_sequence('%s','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM \"%s\"),1));" % (t, t))
    else:
        emit("SELECT setval(pg_get_serial_sequence('%s','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM \"%s\"),1));" % (t, t))

emit("COMMIT;")

sql = "\n".join(OUT) + "\n"
import os
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mock.sql")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(sql)

stats = [
    ("users", len(users)), ("user_roles", len(user_roles)),
    ("faculties", len(faculties)), ("kafedras", len(kafedras)),
    ("departments", len(departments)), ("specialities", len(specialities)),
    ("groups", len(groups)), ("subjects", len(subjects)),
    ("employees", len(employees)), ("teachers", len(teachers)),
    ("students", len(students)), ("curriculum", len(curriculum)),
    ("subject_teachers", len(subject_teachers)),
    ("teacher_assignments", len(teacher_assignments)),
    ("group_teachers", len(group_teachers)), ("courses", len(courses)),
    ("course_groups", len(course_groups)), ("course_topics", len(course_topics)),
    ("course_materials", len(course_materials)), ("lessons", len(lessons)),
    ("lesson_results", len(lesson_results)), ("assignments", len(assignments)),
    ("assignment_submissions", len(submissions)),
    ("course_material_progress", len(progress)), ("resources", len(resources)),
    ("questions", len(questions)), ("quizzes", len(quizzes)),
    ("quiz_questions", len(quiz_questions)), ("results", len(results)),
    ("user_answers", len(user_answers)),
    ("psychology_methods", len(psy_methods)),
    ("psychology_questions", len(psy_questions)),
    ("psychology_results", len(psy_results)),
]
for name, n in stats:
    print("%-28s %6d" % (name, n))
print("%-28s %6.1f MB" % ("mock.sql", len(sql.encode()) / 1024 / 1024))

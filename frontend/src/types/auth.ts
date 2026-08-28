export interface Kafedra {
    id: number;
    name: string;
}

export interface EmployeeTeacherInfo {
    id: number;
    kafedra: Kafedra | null;
}

/** `/user/me` javobidagi o'qituvchi kartochkasi: `employee` bilan birlashtirilgan,
 *  shuning uchun ism maydonlari to'g'ridan-to'g'ri shu yerda. */
export interface UserTeacher {
    id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    image_url: string | null;
    kafedra: Kafedra | null;
}

export interface Employee {
    id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    phone_number: string | null;
    image_url: string | null;
    teacher?: EmployeeTeacherInfo | null;
}

export interface Group {
    id: number;
    name: string;
}

export interface Student {
    id: number;
    first_name: string;
    last_name: string;
    middle_name: string;
    third_name: string;
    full_name: string;
    image_path: string | null;
    group_id: number;
    group: Group;
    student_id_number: string | null;  // Bug#16 fix: was missing from type definition
    university: string | null;
    specialty: string | null;
    education_form: string | null;
    education_type: string | null;
    payment_form: string | null;
    education_lang: string | null;
    faculty: string | null;
    level: string | null;
    semester: string | null;
    address: string | null;
    avg_gpa: number | null;
}

export interface UserPermission {
    id: number;
    name: string;
}

export interface UserRole {
    id: number;
    name: string;
    permissions?: UserPermission[];
}

export interface User {
    id: number;
    username: string;
    is_active: boolean;
    /** Foydalanuvchi o'zi yuklagan profil surati. Yuz nazoratida etalon. */
    avatar_path?: string | null;
    roles: UserRole[];
    teacher?: UserTeacher | null;
    student?: Student;
    created_at: string;
    updated_at: string;
}

export interface UserCreateRequest {
    username: string;
    password?: string;
    role_id: number;
    is_active: boolean;
}

export interface Role {
    id: number;
    name: string;
}

export interface LoginResponse {
    access_token: string;
    type: string;
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

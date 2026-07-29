/** На бэкенде это флаг is_active — третьего состояния там нет. */
export type TestStatus = 'Faol' | 'Yopiq';

export interface TestMeta {
  id: number;
  name: string;
  fan: string;
  oqituvchi: string;
  guruh: string;
  savollar: number;
  davomiylik: number;
  holati: TestStatus;
  /** 6-значный PIN для входа в тест. У студенческих тестов может отсутствовать. */
  pin?: string;
}

export interface QuizOption {
  letter: 'A' | 'B' | 'C' | 'D';
  text: string;
  image: boolean;
}

export interface QuizQuestion {
  /** Есть при прохождении теста: ответ адресуется по id вопроса. */
  id?: number;
  text: string;
  image: boolean;
  options: QuizOption[];
  /**
   * Индекс правильного варианта (0..3). При прохождении теста сервер его не
   * присылает — балл считается на бэкенде; поле есть только в аналитике.
   */
  correct?: number;
}

export interface QuizResult {
  correct: number;
  wrong: number;
  total: number;
  pct: number;
  /** Затраченное время в секундах. */
  spent: number;
}

/** Попытка студента: ответы, балл и время. */
export interface StudentAttempt {
  id: number;
  fish: string;
  initials: string;
  submitted: boolean;
  /** Ответы: индекс вопроса → выбранный вариант (0..3). */
  answers: Record<number, number>;
  ball: number;
  total: number;
  pct: number;
  time: string;
  secsN: number;
  sana: string;
}

/** Разбор одного вопроса по всем сданным работам. */
export interface QuestionStat {
  no: number;
  text: string;
  correctN: number;
  wrongN: number;
  pct: number;
}

/** Аналитика теста целиком — то, что отдаёт `GET /testlar/{id}/detail`. */
export interface TestDetailData {
  questions: QuizQuestion[];
  students: StudentAttempt[];
  stats: {
    submitted: number;
    total: number;
    avg: number;
    max: string;
    min: string;
    avgTime: string;
  };
  perQuestion: QuestionStat[];
}

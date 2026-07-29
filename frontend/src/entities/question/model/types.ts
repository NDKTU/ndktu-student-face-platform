export type OptionLetter = 'A' | 'B' | 'C' | 'D';

export interface QuestionOption {
  letter: OptionLetter;
  text: string;
  /** Текст варианта — ссылка на загруженную картинку, а не подпись. */
  image: boolean;
  correct: boolean;
}

export interface Question {
  id: number;
  /** Предмет, к которому относится вопрос. */
  subjectId: number;
  text: string;
  correct: OptionLetter;
  hasImage: boolean;
  options: QuestionOption[];
}

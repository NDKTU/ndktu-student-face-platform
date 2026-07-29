export type OptionLetter = 'A' | 'B' | 'C' | 'D';

export interface QuestionOption {
  letter: OptionLetter;
  text: string;
  image: boolean;
  correct: boolean;
}

export interface Question {
  id: number;
  /** id предмета преподавателя (ts1..ts4) — по нему группируется банк. */
  subjectId: string;
  text: string;
  correct: OptionLetter;
  hasImage: boolean;
  options: QuestionOption[];
}

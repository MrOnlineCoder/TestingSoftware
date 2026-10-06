export const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'number', 'free_text'] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface ChoiceOption {
  id: string;
  text: string;
}

export type CorrectAnswer =
  | { type: 'single_choice'; optionId: string }
  | { type: 'multiple_choice'; optionIds: string[] }
  | { type: 'number'; value: number; tolerance?: number }
  | { type: 'free_text'; referenceAnswer: string };

export type StudentAnswer =
  | { type: 'single_choice'; optionId: string | null }
  | { type: 'multiple_choice'; optionIds: string[] }
  | { type: 'number'; value: number | null }
  | { type: 'free_text'; text: string };

export interface Test {
  id: string;
  collectionId: string;
  /** 0-based order within the collection */
  position: number;
  type: QuestionType;
  /** markdown */
  prompt: string;
  /** markdown, may be empty */
  explanation: string;
  score: number;
  /** only for single_choice / multiple_choice, else [] */
  options: ChoiceOption[];
  correctAnswer: CorrectAnswer;
  createdAt: Date;
  updatedAt: Date;
}

export function isChoiceType(type: QuestionType): type is 'single_choice' | 'multiple_choice' {
  return type === 'single_choice' || type === 'multiple_choice';
}

/** A test inside a JSON snapshot column: JSON has no dates, so they are stored as ISO strings */
export type SerializedTest = Omit<Test, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };

export function serializeTests(tests: Test[]): SerializedTest[] {
  return tests.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));
}

export function deserializeTests(tests: SerializedTest[]): Test[] {
  return tests.map((t) => ({ ...t, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) }));
}

// Mirror of specs/api-contract.md. Copied on purpose: do not import from the backend.

export type QuestionType = 'single_choice' | 'multiple_choice' | 'number' | 'free_text';

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

export interface Collection {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  testsCount: number;
  activeSessionsCount: number;
}

export interface Test {
  id: string;
  collectionId: string;
  position: number;
  type: QuestionType;
  prompt: string;
  explanation: string;
  score: number;
  options: ChoiceOption[];
  correctAnswer: CorrectAnswer;
  createdAt: string;
  updatedAt: string;
}

export type CollectionWithTests = Collection & { tests: Test[] };

export type StudentTest = Omit<Test, 'correctAnswer' | 'explanation' | 'collectionId' | 'createdAt' | 'updatedAt'>;

export type ExamSessionStatus = 'created' | 'in_progress' | 'submitted';
export type ExamSessionOrigin = 'online' | 'offline';

export interface ExamSessionSettings {
  allowNavigation: boolean;
  showCorrectAnswer: boolean;
  showScore: boolean;
  timeLimitMinutes: number | null;
}

export interface ExamSession {
  id: string;
  collectionId: string | null;
  collectionTitle: string;
  studentName: string;
  studentId: string | null;
  settings: ExamSessionSettings;
  status: ExamSessionStatus;
  origin: ExamSessionOrigin;
  createdAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  deadlineAt: string | null;
  totalScore: number | null;
  maxScore: number;
}

export interface ExamAnswer {
  testId: string;
  answer: StudentAnswer | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  answeredAt: string | null;
  locked: boolean;
}

/** Answer as returned to the student: correct answer revealed only if settings allow */
export interface StudentExamAnswer extends ExamAnswer {
  correctAnswer: CorrectAnswer | null;
  explanation: string | null;
}

export type ExamSessionDetail = ExamSession & {
  tests: Test[];
  answers: ExamAnswer[];
  pendingManualGrading: number;
};

export interface ResultsQuestion {
  testId: string;
  answer: StudentAnswer | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  correctAnswer: CorrectAnswer | null;
  explanation: string | null;
}

export interface ResultsView {
  totalScore: number | null;
  maxScore: number;
  perQuestion: ResultsQuestion[];
}

export interface StudentExamView {
  session: ExamSession;
  tests: StudentTest[];
  answers: StudentExamAnswer[];
  results?: ResultsView;
}

export interface CreateCollectionInput {
  title: string;
  description?: string;
}

export interface TestInput {
  type: QuestionType;
  prompt: string;
  explanation?: string;
  score?: number;
  options?: Array<{ id?: string; text: string }>;
  correctAnswer: CorrectAnswer;
}

export interface CreateExamSessionInput {
  collectionId: string;
  studentName: string;
  studentId?: string | null;
  settings: ExamSessionSettings;
}

// ---- offline exams ----

export interface OfflineExam {
  id: string;
  collectionId: string | null;
  collectionTitle: string;
  createdAt: string;
  testsCount: number;
  skippedTestIds: string[];
  questionsUrl: string;
  answerSheetUrl: string;
}

export type OfflineExamDetail = OfflineExam & { tests: Test[] };

export type DetectionStatus = 'ok' | 'ambiguous' | 'empty' | 'manual';

export interface Detection {
  testId: string;
  answer: StudentAnswer | null;
  confidence: number;
  status: DetectionStatus;
  raw: Array<{ bubbleIndex: number; optionId: string; fillRatio: number }>;
}

export interface ScanResult {
  offlineExamId: string;
  detections: Detection[];
  overlayImage: string;
}

export interface FinalizeOfflineExamInput {
  studentName: string;
  studentId?: string | null;
  answers: Record<string, StudentAnswer | null>;
}

export type ErrorCode = 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

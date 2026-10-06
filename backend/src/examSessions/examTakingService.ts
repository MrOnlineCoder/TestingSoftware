import { AppError, ErrorCode } from '../errors.js';
import { grade, isAnswered, normaliseStudentAnswer } from '../grading/grader.js';
import type { ChoiceOption, CorrectAnswer, QuestionType, StudentAnswer, Test } from '../tests/test.js';
import { round2 } from '../utils/math.js';
import { now } from '../utils/time.js';
import {
  computeTotalScore,
  getSessionDeadline,
  sortAnswersBySnapshot,
  type ExamAnswer,
  type ExamSession,
} from './examSession.js';
import type { ExamSessionsRepository } from './examSessionsRepository.js';
import { gradeAnswersForSubmission } from './sessionGrading.js';

/** Test as exposed to a student: no correct answer, no explanation */
export interface StudentTest {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  score: number;
  options: ChoiceOption[];
}

/** Answer as exposed to a student; grading fields are null unless the settings allow them */
export interface StudentAnswerView {
  testId: string;
  answer: StudentAnswer | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  answeredAt: Date | null;
  locked: boolean;
  /** only when settings.showCorrectAnswer and the question is locked */
  correctAnswer: CorrectAnswer | null;
  explanation: string | null;
}

export interface ResultsView {
  totalScore: number | null;
  maxScore: number;
  perQuestion: Array<{
    testId: string;
    answer: StudentAnswer | null;
    isCorrect: boolean | null;
    scoreAwarded: number | null;
    correctAnswer: CorrectAnswer | null;
    explanation: string | null;
  }>;
}

export interface StudentExamView {
  session: ExamSession;
  tests: StudentTest[];
  answers: StudentAnswerView[];
  results?: ResultsView;
}

function toStudentTest(test: Test): StudentTest {
  return {
    id: test.id,
    position: test.position,
    type: test.type,
    prompt: test.prompt,
    score: test.score,
    options: test.options,
  };
}

/** The session as the student may see it: no total score unless allowed */
function toStudentSession(session: ExamSession): ExamSession {
  return session.settings.showScore ? session : { ...session, totalScore: null };
}

function toStudentAnswer(session: ExamSession, test: Test | undefined, answer: ExamAnswer): StudentAnswerView {
  const reveal = session.settings.showCorrectAnswer && answer.locked && isAnswered(answer.answer);
  const revealAfterSubmit = session.settings.showCorrectAnswer && session.status === 'submitted';
  const showCorrect = (reveal || revealAfterSubmit) && test !== undefined;
  return {
    testId: answer.testId,
    answer: answer.answer,
    isCorrect: reveal ? answer.isCorrect : null,
    scoreAwarded: reveal ? answer.scoreAwarded : null,
    answeredAt: answer.answeredAt,
    locked: answer.locked,
    correctAnswer: showCorrect ? test.correctAnswer : null,
    explanation: showCorrect ? test.explanation : null,
  };
}

export function buildResultsView(session: ExamSession, answers: ExamAnswer[]): ResultsView {
  const { showCorrectAnswer, showScore } = session.settings;
  const answersByTest = new Map(answers.map((a) => [a.testId, a]));
  return {
    totalScore: showScore ? session.totalScore : null,
    maxScore: session.maxScore,
    perQuestion: session.testsSnapshot.map((test) => {
      const answer = answersByTest.get(test.id);
      return {
        testId: test.id,
        answer: answer?.answer ?? null,
        isCorrect: showCorrectAnswer && test.type !== 'free_text' ? (answer?.isCorrect ?? false) : null,
        scoreAwarded: showScore ? (answer?.scoreAwarded ?? (test.type === 'free_text' ? null : 0)) : null,
        correctAnswer: showCorrectAnswer ? test.correctAnswer : null,
        explanation: showCorrectAnswer ? test.explanation : null,
      };
    }),
  };
}

/** Student-side exam flow. No auth: the session id is the capability. */
export class ExamTakingService {
  constructor(private readonly examSessionsRepository: ExamSessionsRepository) {}

  async view(id: string): Promise<StudentExamView> {
    const session = await this.enforceDeadline(await this.getOrThrow(id));
    const answers = sortAnswersBySnapshot(session, await this.examSessionsRepository.findAnswers(id));
    const testsById = new Map(session.testsSnapshot.map((t) => [t.id, t]));
    return {
      session: toStudentSession(session),
      tests: session.testsSnapshot.map(toStudentTest),
      answers: answers.map((a) => toStudentAnswer(session, testsById.get(a.testId), a)),
      results: session.status === 'submitted' ? buildResultsView(session, answers) : undefined,
    };
  }

  async start(id: string): Promise<ExamSession> {
    const session = await this.getOrThrow(id);
    if (session.status !== 'created') {
      throw new AppError(ErrorCode.CONFLICT, 'Exam has already been started');
    }
    const started: ExamSession = { ...session, status: 'in_progress', startedAt: now() };
    await this.examSessionsRepository.update(started);
    return toStudentSession(started);
  }

  async answer(id: string, testId: string, studentAnswer: StudentAnswer): Promise<StudentAnswerView> {
    const session = await this.getOrThrow(id);
    const current = await this.enforceDeadline(session);
    if (current.status === 'submitted' && session.status === 'in_progress') {
      throw new AppError(ErrorCode.CONFLICT, 'Time is over');
    }
    if (current.status !== 'in_progress') {
      throw new AppError(
        ErrorCode.CONFLICT,
        current.status === 'created' ? 'Exam has not been started yet' : 'Exam has already been submitted',
      );
    }

    const test = current.testsSnapshot.find((t) => t.id === testId);
    if (!test) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Question not found in this exam');
    }
    const existing = await this.examSessionsRepository.findAnswer(id, testId);
    if (!existing) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Answer slot not found');
    }
    if (existing.locked) {
      throw new AppError(ErrorCode.CONFLICT, 'This answer is locked and cannot be changed');
    }

    const normalised = normaliseStudentAnswer(test, studentAnswer);
    const answered = isAnswered(normalised);
    const { showCorrectAnswer, allowNavigation } = current.settings;

    let updated: ExamAnswer = {
      ...existing,
      answer: normalised,
      answeredAt: now(),
      isCorrect: null,
      scoreAwarded: null,
    };
    // an empty answer (nothing selected) neither locks nor reveals anything
    if (answered && showCorrectAnswer) {
      const result = grade(test, normalised);
      updated = { ...updated, isCorrect: result.isCorrect, scoreAwarded: result.scoreAwarded, locked: true };
    } else if (answered && !allowNavigation) {
      updated = { ...updated, locked: true };
    }

    await this.examSessionsRepository.updateAnswer(updated);
    return toStudentAnswer(current, test, updated);
  }

  async submit(id: string): Promise<{ session: ExamSession; results: ResultsView }> {
    const session = await this.getOrThrow(id);
    if (session.status === 'created') {
      throw new AppError(ErrorCode.CONFLICT, 'Exam has not been started yet');
    }
    const submitted = session.status === 'submitted' ? session : await this.doSubmit(session);
    const answers = await this.examSessionsRepository.findAnswers(id);
    return { session: toStudentSession(submitted), results: buildResultsView(submitted, answers) };
  }

  /** Auto-submits an in-progress session whose deadline has passed; returns the up-to-date session */
  private async enforceDeadline(session: ExamSession): Promise<ExamSession> {
    const deadline = getSessionDeadline(session);
    if (session.status === 'in_progress' && deadline && now().getTime() > deadline.getTime()) {
      return this.doSubmit(session);
    }
    return session;
  }

  private async doSubmit(session: ExamSession): Promise<ExamSession> {
    const answers = gradeAnswersForSubmission(
      session.testsSnapshot,
      await this.examSessionsRepository.findAnswers(session.id),
    );
    const submitted: ExamSession = {
      ...session,
      status: 'submitted',
      submittedAt: now(),
      totalScore: round2(computeTotalScore(answers)),
    };
    await this.examSessionsRepository.updateWithAnswers(submitted, answers);
    return submitted;
  }

  private async getOrThrow(id: string): Promise<ExamSession> {
    const session = await this.examSessionsRepository.findById(id);
    if (!session) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Exam session not found');
    }
    return session;
  }
}

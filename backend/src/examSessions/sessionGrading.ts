import { grade, isAnswered } from '../grading/grader.js';
import type { Test } from '../tests/test.js';
import { makeEntityId } from '../utils/id.js';
import type { ExamAnswer } from './examSession.js';

/** One empty answer row per snapshot test */
export function makeEmptyAnswers(sessionId: string, tests: Test[]): ExamAnswer[] {
  return tests.map((test) => ({
    id: makeEntityId(),
    sessionId,
    testId: test.id,
    answer: null,
    isCorrect: null,
    scoreAwarded: null,
    locked: false,
    answeredAt: null,
  }));
}

/**
 * Final grading at submission: every auto-gradable answer gets isCorrect/scoreAwarded,
 * free-text answers keep whatever manual grade they have (null = pending). All answers get locked.
 */
export function gradeAnswersForSubmission(tests: Test[], answers: ExamAnswer[]): ExamAnswer[] {
  const testsById = new Map(tests.map((t) => [t.id, t]));
  return answers.map((answer) => {
    const test = testsById.get(answer.testId);
    if (!test) {
      return { ...answer, locked: true };
    }
    if (test.type === 'free_text') {
      return { ...answer, isCorrect: null, locked: true };
    }
    const result = grade(test, isAnswered(answer.answer) ? answer.answer : null);
    return { ...answer, isCorrect: result.isCorrect, scoreAwarded: result.scoreAwarded, locked: true };
  });
}

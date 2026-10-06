import { AppError, ErrorCode } from '../errors.js';
import type { StudentAnswer, Test } from '../tests/test.js';
import { round2 } from '../utils/math.js';

export interface GradeResult {
  /** null for free_text: never auto-graded */
  isCorrect: boolean | null;
  /** null for free_text until the teacher grades it manually */
  scoreAwarded: number | null;
}

function full(test: Test, isCorrect: boolean): GradeResult {
  return { isCorrect, scoreAwarded: isCorrect ? test.score : 0 };
}

/**
 * Grades one answer against the test's correct answer. Pure function, rules as in api-contract.md.
 * The answer is expected to be normalised already (see `normaliseStudentAnswer`).
 */
export function grade(test: Test, answer: StudentAnswer | null): GradeResult {
  const correct = test.correctAnswer;

  if (correct.type === 'free_text') {
    return { isCorrect: null, scoreAwarded: null };
  }

  if (answer === null || answer.type !== correct.type) {
    return { isCorrect: false, scoreAwarded: 0 };
  }

  switch (correct.type) {
    case 'single_choice': {
      const given = (answer as Extract<StudentAnswer, { type: 'single_choice' }>).optionId;
      return full(test, given !== null && given === correct.optionId);
    }
    case 'multiple_choice': {
      const selected = new Set((answer as Extract<StudentAnswer, { type: 'multiple_choice' }>).optionIds);
      const correctIds = new Set(correct.optionIds);
      if (correctIds.size === 0) {
        return { isCorrect: false, scoreAwarded: 0 };
      }
      let correctSelected = 0;
      let wrongSelected = 0;
      for (const id of selected) {
        if (correctIds.has(id)) {
          correctSelected++;
        } else {
          wrongSelected++;
        }
      }
      const ratio = Math.max(0, (correctSelected - wrongSelected) / correctIds.size);
      const scoreAwarded = round2(test.score * ratio);
      return { isCorrect: scoreAwarded === test.score, scoreAwarded };
    }
    case 'number': {
      const value = (answer as Extract<StudentAnswer, { type: 'number' }>).value;
      const tolerance = correct.tolerance ?? 0;
      // small epsilon so that e.g. 0.1 + 0.2 vs 0.3 with tolerance 0 is still accepted
      return full(test, value !== null && Math.abs(value - correct.value) <= tolerance + 1e-9);
    }
  }
}

/**
 * Validates a student's answer against the test it is given for, and returns a canonical copy
 * (deduplicated option ids, trimmed shape). Throws VALIDATION_ERROR on mismatch.
 */
export function normaliseStudentAnswer(test: Test, answer: StudentAnswer): StudentAnswer {
  if (answer.type !== test.type) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Answer type "${answer.type}" does not match question type "${test.type}"`,
    );
  }

  const optionIds = new Set(test.options.map((o) => o.id));

  switch (answer.type) {
    case 'single_choice':
      if (answer.optionId !== null && !optionIds.has(answer.optionId)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Option "${answer.optionId}" does not exist in this question`);
      }
      return { type: 'single_choice', optionId: answer.optionId };
    case 'multiple_choice': {
      const unique = [...new Set(answer.optionIds)];
      const unknown = unique.find((id) => !optionIds.has(id));
      if (unknown !== undefined) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Option "${unknown}" does not exist in this question`);
      }
      // keep the question's option order for stable output
      return { type: 'multiple_choice', optionIds: test.options.map((o) => o.id).filter((id) => unique.includes(id)) };
    }
    case 'number':
      if (answer.value !== null && !Number.isFinite(answer.value)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Number answer must be a finite number');
      }
      return { type: 'number', value: answer.value };
    case 'free_text':
      return { type: 'free_text', text: answer.text };
  }
}

/** True if the answer actually contains something (an empty selection counts as unanswered) */
export function isAnswered(answer: StudentAnswer | null): boolean {
  if (answer === null) {
    return false;
  }
  switch (answer.type) {
    case 'single_choice':
      return answer.optionId !== null;
    case 'multiple_choice':
      return answer.optionIds.length > 0;
    case 'number':
      return answer.value !== null;
    case 'free_text':
      return answer.text.trim() !== '';
  }
}

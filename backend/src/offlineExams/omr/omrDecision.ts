import type { StudentAnswer, Test } from '../../tests/test.js';
import type { SheetLayout } from '../sheetLayout.js';

/** Fixed thresholds (no sensitivity UI, see open question Q8) */
export const OMR_THRESHOLDS = {
  /** a bubble at or above this fill ratio counts as filled */
  filled: 0.45,
  /** between this and `filled` a bubble is ambiguous (half-filled, erased, tick...) */
  maybe: 0.25,
  /** single choice: the winner must be at least this many times darker than the runner-up */
  dominance: 2,
} as const;

export type DetectionStatus = 'ok' | 'ambiguous' | 'empty' | 'manual';
export type BubbleState = 'filled' | 'empty' | 'ambiguous';

export interface Detection {
  testId: string;
  answer: StudentAnswer | null;
  confidence: number;
  status: DetectionStatus;
  raw: Array<{ bubbleIndex: number; optionId: string; fillRatio: number }>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** How sure we are about one bubble's classification, 0..1 */
function bubbleConfidence(fill: number): number {
  const { filled, maybe } = OMR_THRESHOLDS;
  if (fill >= filled) {
    return clamp01(0.5 + (fill - filled) / (2 * (1 - filled)));
  }
  if (fill < maybe) {
    return clamp01(0.5 + (maybe - fill) / (2 * maybe));
  }
  return 0;
}

export function bubbleState(fill: number): BubbleState {
  if (fill >= OMR_THRESHOLDS.filled) {
    return 'filled';
  }
  return fill >= OMR_THRESHOLDS.maybe ? 'ambiguous' : 'empty';
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Turns per-bubble fill ratios into answers per test (pure) */
export function decideAnswers(tests: Test[], layout: SheetLayout, fills: number[]): Detection[] {
  const bubblesByTest = new Map<string, Array<{ optionId: string; fill: number }>>();
  layout.bubbles.forEach((b, i) => {
    const list = bubblesByTest.get(b.testId) ?? [];
    list.push({ optionId: b.optionId, fill: fills[i] ?? 0 });
    bubblesByTest.set(b.testId, list);
  });

  return tests.map((test): Detection => {
    const bubbles = bubblesByTest.get(test.id);
    if (!bubbles || (test.type !== 'single_choice' && test.type !== 'multiple_choice')) {
      return { testId: test.id, answer: null, confidence: 0, status: 'manual', raw: [] };
    }

    const raw = bubbles.map((b, bubbleIndex) => ({ bubbleIndex, optionId: b.optionId, fillRatio: round3(b.fill) }));
    const confidence = round3(Math.min(...bubbles.map((b) => bubbleConfidence(b.fill))));
    const filled = bubbles.filter((b) => bubbleState(b.fill) === 'filled');
    const anyAmbiguous = bubbles.some((b) => bubbleState(b.fill) === 'ambiguous');

    if (test.type === 'multiple_choice') {
      const answer: StudentAnswer = { type: 'multiple_choice', optionIds: filled.map((b) => b.optionId) };
      if (anyAmbiguous) {
        return { testId: test.id, answer, confidence, status: 'ambiguous', raw };
      }
      return filled.length === 0
        ? { testId: test.id, answer: null, confidence, status: 'empty', raw }
        : { testId: test.id, answer, confidence, status: 'ok', raw };
    }

    // single choice
    const sorted = [...bubbles].sort((a, b) => b.fill - a.fill);
    const [top, second] = sorted;
    if (!top) {
      return { testId: test.id, answer: null, confidence: 0, status: 'empty', raw };
    }
    const secondFill = second?.fill ?? 0;
    const bestGuess: StudentAnswer = { type: 'single_choice', optionId: top.optionId };

    if (filled.length === 1 && !anyAmbiguous && top.fill >= OMR_THRESHOLDS.dominance * secondFill) {
      return { testId: test.id, answer: bestGuess, confidence, status: 'ok', raw };
    }
    if (filled.length === 0 && !anyAmbiguous) {
      return { testId: test.id, answer: null, confidence, status: 'empty', raw };
    }
    // several filled, or half-filled bubbles: propose the darkest one, the teacher must confirm
    return { testId: test.id, answer: bestGuess, confidence, status: 'ambiguous', raw };
  });
}

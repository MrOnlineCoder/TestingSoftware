import type { CollectionsService } from '../collections/collectionsService.js';
import { AppError, ErrorCode } from '../errors.js';
import { makeEntityId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { isChoiceType, type ChoiceOption, type CorrectAnswer, type QuestionType, type Test } from './test.js';
import type { TestsRepository } from './testsRepository.js';

export interface ChoiceOptionInput {
  /** omitted for new options: the server assigns an id */
  id?: string;
  text: string;
}

export interface CreateTestInput {
  type: QuestionType;
  prompt: string;
  explanation?: string;
  score?: number;
  options?: ChoiceOptionInput[];
  correctAnswer: CorrectAnswer;
}

export type UpdateTestInput = Partial<CreateTestInput>;

function invalid(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/**
 * Assigns ids to options sent without one. A correct answer may reference such an option by its
 * 0-based index in the `options` array, written as a string (e.g. `"0"`); it is rewritten to the new id.
 */
function resolveOptions(
  inputOptions: ChoiceOptionInput[],
  correctAnswer: CorrectAnswer,
): { options: ChoiceOption[]; correctAnswer: CorrectAnswer } {
  const indexToId = new Map<string, string>();
  const options = inputOptions.map((o, index) => {
    if (o.id) {
      return { id: o.id, text: o.text };
    }
    const id = makeEntityId();
    indexToId.set(String(index), id);
    return { id, text: o.text };
  });
  const remap = (id: string) => indexToId.get(id) ?? id;

  switch (correctAnswer.type) {
    case 'single_choice':
      return { options, correctAnswer: { type: 'single_choice', optionId: remap(correctAnswer.optionId) } };
    case 'multiple_choice':
      return { options, correctAnswer: { type: 'multiple_choice', optionIds: correctAnswer.optionIds.map(remap) } };
    default:
      return { options, correctAnswer };
  }
}

/** Implements the validation rules of api-contract.md and returns the canonical options / correct answer */
export function validateTestPayload(
  type: QuestionType,
  options: ChoiceOption[],
  correctAnswer: CorrectAnswer,
): { options: ChoiceOption[]; correctAnswer: CorrectAnswer } {
  if (correctAnswer.type !== type) {
    invalid(`correctAnswer.type "${correctAnswer.type}" does not match question type "${type}"`);
  }

  if (!isChoiceType(type)) {
    if (correctAnswer.type === 'number') {
      if (!Number.isFinite(correctAnswer.value)) {
        invalid('correctAnswer.value must be a finite number');
      }
      if (correctAnswer.tolerance !== undefined && !(correctAnswer.tolerance >= 0)) {
        invalid('correctAnswer.tolerance must be >= 0');
      }
    }
    // options are meaningless for number / free_text questions
    return { options: [], correctAnswer };
  }

  if (options.length < 2) {
    invalid('Choice questions need at least 2 options');
  }
  const trimmed = options.map((o) => ({ id: o.id, text: o.text.trim() }));
  if (trimmed.some((o) => o.text === '')) {
    invalid('Option texts must not be empty');
  }
  const ids = new Set(trimmed.map((o) => o.id));
  if (ids.size !== trimmed.length) {
    invalid('Option ids must be unique');
  }

  if (correctAnswer.type === 'single_choice') {
    if (!ids.has(correctAnswer.optionId)) {
      invalid('correctAnswer.optionId must reference one of the options');
    }
    return { options: trimmed, correctAnswer };
  }

  if (correctAnswer.type === 'multiple_choice') {
    const correctIds = [...new Set(correctAnswer.optionIds)];
    if (correctIds.length < 1) {
      invalid('Multiple choice questions need at least one correct option');
    }
    if (correctIds.some((id) => !ids.has(id))) {
      invalid('correctAnswer.optionIds must reference existing options');
    }
    return { options: trimmed, correctAnswer: { type: 'multiple_choice', optionIds: correctIds } };
  }

  return invalid('Unsupported correct answer');
}

function validatePrompt(prompt: string): string {
  if (prompt.trim() === '') {
    invalid('Prompt must not be empty');
  }
  return prompt;
}

function validateScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    invalid('Score must be greater than 0');
  }
  return score;
}

export class TestsService {
  constructor(
    private readonly testsRepository: TestsRepository,
    private readonly collectionsService: CollectionsService,
  ) {}

  async create(collectionId: string, input: CreateTestInput): Promise<Test> {
    await this.collectionsService.assertEditable(collectionId);

    const resolved = resolveOptions(input.options ?? [], input.correctAnswer);
    const { options, correctAnswer } = validateTestPayload(input.type, resolved.options, resolved.correctAnswer);
    const timestamp = now();

    const test: Test = {
      id: makeEntityId(),
      collectionId,
      position: (await this.testsRepository.maxPosition(collectionId)) + 1,
      type: input.type,
      prompt: validatePrompt(input.prompt),
      explanation: input.explanation ?? '',
      score: validateScore(input.score ?? 1),
      options,
      correctAnswer,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.testsRepository.create(test);
    await this.collectionsService.touch(collectionId);
    return test;
  }

  async update(collectionId: string, testId: string, input: UpdateTestInput): Promise<Test> {
    await this.collectionsService.assertEditable(collectionId);
    const existing = await this.getOrThrow(collectionId, testId);

    const type = input.type ?? existing.type;
    let correctAnswer = input.correctAnswer ?? existing.correctAnswer;
    if (input.type !== undefined && input.type !== existing.type && input.correctAnswer === undefined) {
      invalid('correctAnswer is required when changing the question type');
    }

    // existing option ids are kept as long as the client sends them back, so correct answers stay stable
    let options: ChoiceOption[] = existing.options;
    if (input.options !== undefined) {
      const resolved = resolveOptions(input.options, correctAnswer);
      options = resolved.options;
      correctAnswer = resolved.correctAnswer;
    }

    const validated = validateTestPayload(type, options, correctAnswer);

    const test: Test = {
      ...existing,
      type,
      prompt: input.prompt !== undefined ? validatePrompt(input.prompt) : existing.prompt,
      explanation: input.explanation ?? existing.explanation,
      score: input.score !== undefined ? validateScore(input.score) : existing.score,
      options: validated.options,
      correctAnswer: validated.correctAnswer,
      updatedAt: now(),
    };

    await this.testsRepository.update(test);
    await this.collectionsService.touch(collectionId);
    return test;
  }

  async delete(collectionId: string, testId: string): Promise<void> {
    await this.collectionsService.assertEditable(collectionId);
    const test = await this.getOrThrow(collectionId, testId);
    await this.testsRepository.deleteAndCompact(test);
    await this.collectionsService.touch(collectionId);
  }

  async reorder(collectionId: string, testIds: string[]): Promise<Test[]> {
    await this.collectionsService.assertEditable(collectionId);
    const tests = await this.testsRepository.findByCollection(collectionId);

    const current = new Set(tests.map((t) => t.id));
    const requested = new Set(testIds);
    if (requested.size !== testIds.length || requested.size !== current.size || testIds.some((id) => !current.has(id))) {
      invalid('testIds must contain every test of the collection exactly once');
    }

    await this.testsRepository.reorder(collectionId, testIds, now());
    await this.collectionsService.touch(collectionId);
    return this.testsRepository.findByCollection(collectionId);
  }

  private async getOrThrow(collectionId: string, testId: string): Promise<Test> {
    const test = await this.testsRepository.findById(collectionId, testId);
    if (!test) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Test not found');
    }
    return test;
  }
}

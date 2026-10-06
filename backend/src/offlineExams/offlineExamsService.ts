import type { CollectionsService } from '../collections/collectionsService.js';
import { AppError, ErrorCode } from '../errors.js';
import type { ExamSession } from '../examSessions/examSession.js';
import type { ExamSessionsService } from '../examSessions/examSessionsService.js';
import { normaliseStudentAnswer } from '../grading/grader.js';
import type { StudentAnswer } from '../tests/test.js';
import type { TestsRepository } from '../tests/testsRepository.js';
import { makeEntityId } from '../utils/id.js';
import { now } from '../utils/time.js';
import type { AnswerSheetCache } from './answerSheetCache.js';
import { renderAnswerSheetPdf } from './answerSheetRenderer.js';
import type { OfflineExam } from './offlineExam.js';
import type { OfflineExamsRepository } from './offlineExamsRepository.js';
import { decideAnswers, type Detection } from './omr/omrDecision.js';
import type { OmrEngine } from './omr/omrEngine.js';
import type { QuestionsRenderer } from './questionsRenderer.js';
import { buildLayout, makeQrPayload, parseQrPayload } from './sheetLayoutBuilder.js';

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

const LAYOUT_ERRORS = {
  NO_CHOICE_QUESTIONS: 'The collection has no single/multiple choice questions to put on an answer sheet',
  TOO_MANY_QUESTIONS: 'Too many questions for a single answer sheet',
  TOO_MANY_OPTIONS: 'A question has too many options to fit on the answer sheet',
} as const;

export class OfflineExamsService {
  constructor(
    private readonly offlineExamsRepository: OfflineExamsRepository,
    private readonly collectionsService: CollectionsService,
    private readonly testsRepository: TestsRepository,
    private readonly examSessionsService: ExamSessionsService,
    private readonly omrEngine: OmrEngine,
    private readonly questionsRenderer: QuestionsRenderer,
    private readonly answerSheetCache: AnswerSheetCache,
  ) {}

  /** Reuses the latest printable version if the collection did not change since; otherwise snapshots it anew */
  async createOrReuse(collectionId: string): Promise<{ exam: OfflineExam; reused: boolean }> {
    const collection = await this.collectionsService.getOrThrow(collectionId);

    const latest = await this.offlineExamsRepository.findLatestByCollection(collectionId);
    if (latest && latest.createdAt.getTime() > collection.updatedAt.getTime()) {
      return { exam: latest, reused: true };
    }

    const tests = await this.testsRepository.findByCollection(collectionId);
    const layout = buildLayout(tests);
    if (typeof layout === 'string') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, LAYOUT_ERRORS[layout]);
    }

    const exam: OfflineExam = {
      id: makeEntityId(),
      collectionId: collection.id,
      collectionTitle: collection.title,
      testsSnapshot: tests,
      layout,
      settings: { showScore: true },
      createdAt: now(),
    };
    await this.offlineExamsRepository.create(exam);
    return { exam, reused: false };
  }

  async get(id: string): Promise<OfflineExam> {
    const exam = await this.offlineExamsRepository.findById(id);
    if (!exam) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Offline exam not found');
    }
    return exam;
  }

  async renderQuestionsHtml(id: string): Promise<string> {
    const exam = await this.get(id);
    return this.questionsRenderer.render(exam.collectionTitle, exam.testsSnapshot);
  }

  async renderAnswerSheetPdf(id: string): Promise<Uint8Array> {
    const exam = await this.get(id);
    const cached = await this.answerSheetCache.get(exam.id);
    if (cached) {
      return cached;
    }
    const pdf = await renderAnswerSheetPdf(exam.layout, {
      title: exam.collectionTitle,
      qrPayload: makeQrPayload(exam.id),
    });
    await this.answerSheetCache.put(exam.id, pdf);
    return pdf;
  }

  /** Stateless: detects the marks and returns them for review; nothing is stored */
  async scan(id: string, image: Buffer): Promise<ScanResult> {
    const exam = await this.get(id);
    const measurement = await this.omrEngine.measure(image, exam.layout);

    const qr = parseQrPayload(measurement.qrText);
    if (!qr) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'QR code unreadable: it does not look like an answer sheet of this app');
    }
    if (qr.o !== exam.id) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'This sheet belongs to a different exam');
    }

    return {
      offlineExamId: exam.id,
      detections: decideAnswers(exam.testsSnapshot, exam.layout, measurement.fills),
      overlayImage: await this.omrEngine.renderOverlay(measurement, exam.layout),
    };
  }

  /** Creates a submitted, graded exam session from the reviewed answers */
  async finalize(id: string, input: FinalizeOfflineExamInput): Promise<ExamSession> {
    const exam = await this.get(id);
    const testsById = new Map(exam.testsSnapshot.map((t) => [t.id, t]));

    const answers = new Map<string, StudentAnswer | null>();
    for (const [testId, answer] of Object.entries(input.answers)) {
      const test = testsById.get(testId);
      if (!test) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Question ${testId} is not part of this offline exam`);
      }
      answers.set(testId, answer === null ? null : normaliseStudentAnswer(test, answer));
    }

    return this.examSessionsService.createSubmitted({
      collectionId: exam.collectionId,
      collectionTitle: exam.collectionTitle,
      studentName: input.studentName,
      studentId: input.studentId ?? null,
      // offline results are reviewed by the teacher, so everything may be shown on the results page
      settings: { allowNavigation: true, showCorrectAnswer: true, showScore: exam.settings.showScore, timeLimitMinutes: null },
      tests: exam.testsSnapshot,
      answers,
    });
  }
}

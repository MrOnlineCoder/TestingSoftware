import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { IdParamsSchema, TEACHER_SECURITY, withErrors } from '../apiSchemas.js';
import { requireTeacher } from '../auth/requireTeacher.js';
import type { Deps } from '../deps.js';
import { AppError, ErrorCode } from '../errors.js';
import { ExamSessionSchema, toExamSessionDto } from '../examSessions/examSessionSchemas.js';
import {
  CreatedOfflineExamSchema,
  FinalizeOfflineExamBodySchema,
  OfflineExamDetailSchema,
  ScanResultSchema,
  toOfflineExamDetailDto,
  toOfflineExamDto,
} from './offlineExamSchemas.js';

const ACCEPTED_SCAN_TYPES = new Set(['image/png', 'image/jpeg']);

/** Mounted under /api (paths span /collections/:id/offline-exams and /offline-exams/:id) */
export function makeOfflineExamsRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.addHook('preHandler', requireTeacher(deps));

    app.post(
      '/collections/:id/offline-exams',
      {
        schema: {
          tags: ['offline-exams'],
          description:
            'Create the printable offline exam for a collection, or reuse the latest one if the collection ' +
            'has not changed since. 400 if there are no choice questions or they do not fit one A4 page.',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 201: CreatedOfflineExamSchema }),
        },
      },
      async (req, reply) => {
        const { exam, reused } = await deps.offlineExamsService.createOrReuse(req.params.id);
        return reply.code(201).send({ ...toOfflineExamDto(exam), reused });
      },
    );

    app.get(
      '/offline-exams/:id',
      {
        schema: {
          tags: ['offline-exams'],
          description: 'Offline exam with its snapshot tests (for the scan review screen)',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 200: OfflineExamDetailSchema }),
        },
      },
      async (req) => toOfflineExamDetailDto(await deps.offlineExamsService.get(req.params.id)),
    );

    app.get(
      '/offline-exams/:id/questions.html',
      {
        schema: {
          tags: ['offline-exams'],
          description: 'Printable HTML document with all questions',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          produces: ['text/html'],
        },
      },
      async (req, reply) => {
        const html = await deps.offlineExamsService.renderQuestionsHtml(req.params.id);
        return reply.type('text/html; charset=utf-8').send(html);
      },
    );

    app.get(
      '/offline-exams/:id/answer-sheet.pdf',
      {
        schema: {
          tags: ['offline-exams'],
          description: 'OMR answer sheet (A4 PDF)',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          produces: ['application/pdf'],
        },
      },
      async (req, reply) => {
        const pdf = await deps.offlineExamsService.renderAnswerSheetPdf(req.params.id);
        return reply
          .type('application/pdf')
          .header('Content-Disposition', `inline; filename="answer-sheet-${req.params.id}.pdf"`)
          .send(Buffer.from(pdf));
      },
    );

    app.post(
      '/offline-exams/:id/scans',
      {
        schema: {
          tags: ['offline-exams'],
          description:
            'Upload one scanned/photographed answer sheet (multipart, field `file`, PNG or JPEG, ≤ 20 MB). ' +
            'Returns detected answers for review; nothing is stored.',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          consumes: ['multipart/form-data'],
          response: withErrors({ 200: ScanResultSchema }),
        },
      },
      async (req) => {
        const file = await req.file();
        if (!file) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'No file uploaded');
        }
        if (!ACCEPTED_SCAN_TYPES.has(file.mimetype)) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'Only PNG and JPEG images are supported');
        }
        const image = await file.toBuffer();
        return deps.offlineExamsService.scan(req.params.id, image);
      },
    );

    app.post(
      '/offline-exams/:id/finalize',
      {
        schema: {
          tags: ['offline-exams'],
          description:
            'Create a submitted, graded exam session (origin "offline") from the reviewed answers. ' +
            'Omitted tests count as unanswered; free text stays pending manual grading.',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          body: FinalizeOfflineExamBodySchema,
          response: withErrors({ 201: ExamSessionSchema }),
        },
      },
      async (req, reply) => {
        const session = await deps.offlineExamsService.finalize(req.params.id, req.body);
        return reply.code(201).send(toExamSessionDto(session));
      },
    );
  };
}

import fs from 'node:fs/promises';
import path from 'node:path';

/** Rendered answer sheets are immutable per offline exam, so they are cached on disk */
export interface AnswerSheetCache {
  get(offlineExamId: string): Promise<Uint8Array | null>;
  put(offlineExamId: string, pdf: Uint8Array): Promise<void>;
}

export class FileAnswerSheetCache implements AnswerSheetCache {
  constructor(private readonly folder: string) {}

  async get(offlineExamId: string): Promise<Uint8Array | null> {
    try {
      return await fs.readFile(this.pathFor(offlineExamId));
    } catch {
      return null;
    }
  }

  async put(offlineExamId: string, pdf: Uint8Array): Promise<void> {
    await fs.mkdir(this.folder, { recursive: true });
    await fs.writeFile(this.pathFor(offlineExamId), pdf);
  }

  private pathFor(offlineExamId: string): string {
    // ids are validated UUIDs at the HTTP layer; basename() is an extra guard against traversal
    return path.join(this.folder, `${path.basename(offlineExamId)}.pdf`);
  }
}

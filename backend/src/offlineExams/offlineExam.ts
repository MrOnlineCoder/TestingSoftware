import type { Test } from '../tests/test.js';
import type { SheetLayout } from './sheetLayout.js';

export interface OfflineExamSettings {
  showScore: boolean;
}

export interface OfflineExam {
  id: string;
  collectionId: string | null;
  collectionTitle: string;
  testsSnapshot: Test[];
  layout: SheetLayout;
  settings: OfflineExamSettings;
  createdAt: Date;
}

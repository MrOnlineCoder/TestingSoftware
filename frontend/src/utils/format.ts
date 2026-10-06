import type { ChoiceOption, CorrectAnswer, ExamSessionStatus, QuestionType, StudentAnswer } from '@/api/types';

export const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: 'Одна відповідь',
  multiple_choice: 'Кілька відповідей',
  number: 'Число',
  free_text: 'Вільна відповідь',
};

export const STATUS_LABELS: Record<ExamSessionStatus, string> = {
  created: 'Не розпочато',
  in_progress: 'Триває',
  submitted: 'Здано',
};

export const STATUS_SEVERITY: Record<ExamSessionStatus, 'secondary' | 'info' | 'success'> = {
  created: 'secondary',
  in_progress: 'info',
  submitted: 'success',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '–';
  return new Date(value).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return value.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

export function optionLabel(options: ChoiceOption[], optionId: string): string {
  const index = options.findIndex((o) => o.id === optionId);
  return index < 0 ? '?' : `${OPTION_LETTERS[index] ?? '?'}. ${options[index]!.text}`;
}

export function isAnswered(answer: StudentAnswer | null | undefined): boolean {
  if (!answer) return false;
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

/** One-line human summary of a student's answer */
export function describeAnswer(options: ChoiceOption[], answer: StudentAnswer | null | undefined): string {
  if (!answer || !isAnswered(answer)) return 'Немає відповіді';
  switch (answer.type) {
    case 'single_choice':
      return optionLabel(options, answer.optionId!);
    case 'multiple_choice':
      return answer.optionIds.map((id) => optionLabel(options, id)).join(', ');
    case 'number':
      return String(answer.value);
    case 'free_text':
      return answer.text.length > 120 ? `${answer.text.slice(0, 117)}…` : answer.text;
  }
}

export function describeCorrectAnswer(options: ChoiceOption[], correct: CorrectAnswer): string {
  switch (correct.type) {
    case 'single_choice':
      return optionLabel(options, correct.optionId);
    case 'multiple_choice':
      return correct.optionIds.map((id) => optionLabel(options, id)).join(', ');
    case 'number':
      return correct.tolerance ? `${correct.value} (± ${correct.tolerance})` : String(correct.value);
    case 'free_text':
      return correct.referenceAnswer || '(без еталонної відповіді)';
  }
}

export function emptyAnswer(type: QuestionType): StudentAnswer {
  switch (type) {
    case 'single_choice':
      return { type, optionId: null };
    case 'multiple_choice':
      return { type, optionIds: [] };
    case 'number':
      return { type, value: null };
    case 'free_text':
      return { type, text: '' };
  }
}

export function sameAnswer(a: StudentAnswer | null | undefined, b: StudentAnswer | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function examUrl(sessionId: string): string {
  return `${window.location.origin}/exam/${sessionId}`;
}

/** PrimeVue InputNumber `input` event value → number | null (the v-model itself only updates on blur) */
export function numberFromInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Ukrainian plural form: pluralUk(n, ['питання', 'питання', 'питань']) → one / few (2–4) / many */
export function pluralUk(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** "5 питань" */
export function countUk(n: number, forms: [one: string, few: string, many: string]): string {
  return `${n} ${pluralUk(n, forms)}`;
}

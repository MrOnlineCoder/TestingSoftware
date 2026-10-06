import { Eta } from 'eta';
import { marked } from 'marked';
import type { QuestionType, Test } from '../tests/test.js';
import { OPTION_LABELS } from './sheetLayoutBuilder.js';

const KIND_LABELS: Record<QuestionType, string> = {
  single_choice: 'Single choice - answer sheet',
  multiple_choice: 'Multiple choice (all that apply) - answer sheet',
  number: 'Number - write on this sheet',
  free_text: 'Free text - write on this sheet',
};

export class QuestionsRenderer {
  private readonly eta: Eta;

  constructor(resourcesDir: string) {
    this.eta = new Eta({ views: resourcesDir, autoEscape: true, cache: true });
  }

  /** Printable HTML of all questions, numbered like the answer sheet rows */
  render(title: string, tests: Test[]): string {
    const questions = tests.map((test, index) => ({
      number: index + 1,
      type: test.type,
      kindLabel: KIND_LABELS[test.type],
      score: test.score,
      // prompts are authored by the teacher (trusted) in markdown
      promptHtml: marked.parse(test.prompt, { async: false }),
      options: test.options.map((o, i) => ({ letter: OPTION_LABELS[i] ?? '?', text: o.text })),
    }));
    return this.eta.render('offline-questions.html.eta', { title, questions });
  }
}

import { randomUUID } from 'node:crypto';

export function makeEntityId(): string {
  return randomUUID();
}

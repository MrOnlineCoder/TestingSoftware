export interface Collection {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Collection enriched with computed counters, as shown to the teacher */
export interface CollectionWithStats extends Collection {
  testsCount: number;
  activeSessionsCount: number;
}

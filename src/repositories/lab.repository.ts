export type Lab = {
  id: number;
  classId: number;
  deadline: string;
  pendingReviews: number;
  publishedAt: string | null;
};

export interface LabRepository {
  findById(id: number): Lab | null;
  publish(id: number, publishedAt: string): Lab | null;
}

/** Small in-memory adapter for the PA2 endpoint; replace with persistence later. */
export class InMemoryLabRepository implements LabRepository {
  private readonly labs = new Map<number, Lab>();

  constructor(seed: Lab[] = []) {
    for (const lab of seed) this.labs.set(lab.id, { ...lab });
  }

  findById(id: number): Lab | null {
    const lab = this.labs.get(id);
    return lab ? { ...lab } : null;
  }

  publish(id: number, publishedAt: string): Lab | null {
    const lab = this.labs.get(id);
    if (!lab) return null;
    if (!lab.publishedAt) lab.publishedAt = publishedAt;
    return { ...lab };
  }
}

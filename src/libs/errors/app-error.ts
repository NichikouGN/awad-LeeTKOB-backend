export const sendFail = (
  set: { status?: number | string },
  status: number,
  message: unknown,
) => {
  set.status = status;
  return { success: false, message };
};

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly problemType?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

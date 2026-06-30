export class ApiError extends Error {
  status: number;
  code: string;
  expose: boolean;

  constructor(status: number, code: string, message: string, expose = true) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export const sendApiError = (res: any, error: unknown, context: string) => {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.', false);

  if (apiError.status >= 500) {
    console.error(`${context}:`, {
      name: error instanceof Error ? error.name : 'UnknownError',
      code: apiError.code,
      status: apiError.status,
    });
  }

  return res.status(apiError.status).json({
    error: apiError.expose ? apiError.message : 'The request could not be completed.',
    code: apiError.code,
  });
};

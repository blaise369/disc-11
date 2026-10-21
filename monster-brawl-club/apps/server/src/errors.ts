import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
export const forbidden = (code: string, message?: string) => new HttpError(403, code, message);
export const notFound = (what = 'not_found') => new HttpError(404, what);

/** Parse input with zod, turning failures into a 400. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('invalid_input', r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

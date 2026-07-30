/**
 * Express middleware: validate body/query/params with Zod schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { sendError } from '../lib/apiResponse';

type RequestSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

function replaceObjectContents(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
    .join('; ');
}

/** Validate and replace req.body / query / params using Zod schemas. */
export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        const parsedParams = schemas.params.parse(req.params) as Record<string, unknown>;
        replaceObjectContents(req.params as Record<string, unknown>, parsedParams);
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query) as Record<string, unknown>;
        replaceObjectContents(req.query as Record<string, unknown>, parsedQuery);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendError(res, 400, {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: formatZodError(error),
        });
        return;
      }
      next(error);
    }
  };
}

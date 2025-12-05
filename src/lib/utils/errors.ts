import { NextResponse } from 'next/server';

/**
 * Base application error class.
 * Extends Error with status code and error code for API responses.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Validation error (400 Bad Request).
 * Use when request data is invalid or missing.
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Not found error (404).
 * Use when a requested resource doesn't exist.
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized error (401).
 * Use when user is not authenticated.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error (403).
 * Use when user is authenticated but lacks permission.
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * External service error (502).
 * Use when an external API (Saptiva, Weaviate) fails.
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.name = 'ExternalServiceError';
  }
}

/**
 * Rate limit error (429).
 * Use when API rate limits are exceeded.
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

/**
 * Error response structure for API responses.
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: string;
}

/**
 * Handle API errors and return appropriate response.
 * Logs the error and returns a standardized error response.
 */
export function handleApiError(error: unknown, context?: string): {
  response: ErrorResponse;
  statusCode: number;
} {
  // Log the error with context
  const prefix = context ? `[${context}]` : '[API]';
  console.error(`${prefix} Error:`, error);

  // Handle known AppError types
  if (error instanceof AppError) {
    return {
      response: {
        success: false,
        error: error.message,
        code: error.code,
      },
      statusCode: error.statusCode,
    };
  }

  // Handle standard Error
  if (error instanceof Error) {
    return {
      response: {
        success: false,
        error: error.message,
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      statusCode: 500,
    };
  }

  // Handle unknown error types
  return {
    response: {
      success: false,
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    },
    statusCode: 500,
  };
}

/**
 * Create a NextResponse from an error.
 * Convenience function for API routes.
 */
export function errorResponse(error: unknown, context?: string): NextResponse {
  const { response, statusCode } = handleApiError(error, context);
  return NextResponse.json(response, { status: statusCode });
}

/**
 * Assert a condition and throw ValidationError if false.
 */
export function assertValid(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new ValidationError(message);
  }
}

/**
 * Assert a value exists and throw NotFoundError if not.
 */
export function assertFound<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(message);
  }
}

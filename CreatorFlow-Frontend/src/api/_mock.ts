/**
 * Shared mock API utilities.
 * Replace `mockDelay` internals with real axios/fetch calls when connecting to Spring Boot.
 */

export const mockDelay = (ms = 400): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

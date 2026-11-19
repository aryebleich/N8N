/** An error with a plain-language message that is safe to show to the owner. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

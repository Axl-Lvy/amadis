// Typed domain error for the service layer. Services are framework-free, so they
// never translate or render — they throw a ServiceError carrying a stable `code`
// that maps 1:1 to an i18n key under the `errors` namespace. The web actions,
// GraphQL resolvers and MCP tools each decide how to surface it.
export type ServiceErrorCode =
  | "bookNotFound"
  | "bookTitleRequired"
  | "passageNotFound"
  | "passageNumberInvalid"
  | "tagNotFound"
  | "tagNameRequired"
  | "tagTypeRequired"
  | "tagParentInvalid"
  | "placementNotFound"
  | "invalidField"
  | "invalidSpan"
  | "emptyPlacement"
  | "variantNotFound"
  | "invalidScanKey"
  | "invalidPdfKey"
  | "invalidPageCount"
  | "refSourceNotFound"
  | "refTargetNotFound"
  | "invalidTargetType"
  | "markInvalid"
  | "markNotFound";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

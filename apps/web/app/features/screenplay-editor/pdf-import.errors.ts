export class InvalidPdfError {
  readonly _tag = "InvalidPdfError" as const;
  readonly message: string;
  constructor(reason = "Not a valid PDF file") {
    this.message = reason;
  }
}

export class EncryptedPdfError {
  readonly _tag = "EncryptedPdfError" as const;
  readonly message = "This PDF is password-protected and cannot be imported.";
}

export class EmptyPdfError {
  readonly _tag = "EmptyPdfError" as const;
  readonly message =
    "No text could be extracted from this PDF. It may be a scanned image.";
}

export class FileTooLargeError {
  readonly _tag = "FileTooLargeError" as const;
  readonly message = "PDF must be under 10 MB.";
}

export type ImportPdfError =
  | InvalidPdfError
  | EncryptedPdfError
  | EmptyPdfError
  | FileTooLargeError;

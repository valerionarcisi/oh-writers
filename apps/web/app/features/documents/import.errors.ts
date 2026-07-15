export class UnsupportedFormatError {
  readonly _tag = "UnsupportedFormatError" as const;
  readonly message: string;

  constructor(readonly extension: string) {
    this.message = `Unsupported import format: ${extension}`;
  }
}

export class InvalidPdfError {
  readonly _tag = "InvalidPdfError" as const;
  readonly message = "Invalid or unreadable PDF file";
}

export class EncryptedPdfError {
  readonly _tag = "EncryptedPdfError" as const;
  readonly message = "PDF is password-protected";
}

export class InvalidDocxError {
  readonly _tag = "InvalidDocxError" as const;
  readonly message = "Invalid or unreadable DOCX file";
}

export class EmptyImportError {
  readonly _tag = "EmptyImportError" as const;
  readonly message = "No extractable text in the imported file";
}

export class FileTooLargeError {
  readonly _tag = "FileTooLargeError" as const;
  readonly message = "Imported file exceeds the 25 MB limit";
}

export type ImportDocumentError =
  | UnsupportedFormatError
  | InvalidPdfError
  | EncryptedPdfError
  | InvalidDocxError
  | EmptyImportError
  | FileTooLargeError;

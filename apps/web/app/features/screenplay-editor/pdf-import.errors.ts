// User-facing messages (IT — shown directly in the import error banner).
export class InvalidPdfError {
  readonly _tag = "InvalidPdfError" as const;
  readonly message: string;
  constructor(reason = "File PDF non valido.") {
    this.message = reason;
  }
}

export class EncryptedPdfError {
  readonly _tag = "EncryptedPdfError" as const;
  readonly message =
    "Questo PDF è protetto da password e non può essere importato.";
}

export class EmptyPdfError {
  readonly _tag = "EmptyPdfError" as const;
  readonly message =
    "Nessun testo estraibile da questo PDF. Potrebbe essere una scansione (immagine).";
}

export class FileTooLargeError {
  readonly _tag = "FileTooLargeError" as const;
  readonly message = "Il PDF deve essere inferiore a 25 MB.";
}

export type ImportPdfError =
  | InvalidPdfError
  | EncryptedPdfError
  | EmptyPdfError
  | FileTooLargeError;

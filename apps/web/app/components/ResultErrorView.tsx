import { match } from "ts-pattern";
import { EmptyState } from "@oh-writers/ui";

// Deep module: this file is the ONLY place that knows the catalogue of
// domain error tags. Routes and components hand it any tagged error and get
// back a standardized presentation in Italian.

export interface ErrorView {
  readonly title: string;
  readonly message: string;
}

interface TaggedError {
  readonly _tag: string;
  readonly message?: string;
}

export const toErrorView = (error: TaggedError): ErrorView =>
  match(error._tag)
    .with("ProjectNotFoundError", () => ({
      title: "Progetto non trovato",
      message: "Il progetto richiesto non esiste o è stato rimosso.",
    }))
    .with("DocumentNotFoundError", () => ({
      title: "Documento non trovato",
      message: "Il documento richiesto non esiste o è stato rimosso.",
    }))
    .with("ScreenplayNotFoundError", () => ({
      title: "Sceneggiatura non trovata",
      message: "Non è stato possibile aprire la sceneggiatura.",
    }))
    .with("SubjectNotFoundError", () => ({
      title: "Soggetto non trovato",
      message: "Il soggetto richiesto non esiste.",
    }))
    .with("VersionNotFoundError", () => ({
      title: "Versione non trovata",
      message: "Questa versione non esiste o è stata rimossa.",
    }))
    .with("BreakdownSceneNotFoundError", () => ({
      title: "Scena non trovata",
      message: "La scena richiesta non è disponibile.",
    }))
    .with("BreakdownElementNotFoundError", () => ({
      title: "Elemento non trovato",
      message: "L'elemento di breakdown non è disponibile.",
    }))
    .with("ForbiddenError", () => ({
      title: "Accesso negato",
      message: "Non hai i permessi per visualizzare questo contenuto.",
    }))
    .with("ValidationError", () => ({
      title: "Dati non validi",
      message: error.message ?? "I dati forniti non sono validi.",
    }))
    .with("InvalidLabelError", () => ({
      title: "Etichetta non valida",
      message: error.message ?? "L'etichetta fornita non è valida.",
    }))
    .with("CannotDeleteLastManualError", () => ({
      title: "Operazione non consentita",
      message: "Non puoi eliminare l'ultima versione manuale rimasta.",
    }))
    .with("ResequenceConflictError", () => ({
      title: "Conflitto di ordinamento",
      message: "L'ordine delle scene è cambiato. Ricarica e riprova.",
    }))
    .with("RateLimitedError", () => ({
      title: "Troppe richieste",
      message: "Hai raggiunto il limite di richieste. Riprova tra un istante.",
    }))
    .with("AnthropicError", () => ({
      title: "Errore di generazione",
      message: "L'assistente AI non è disponibile. Riprova fra poco.",
    }))
    .with("EncryptedPdfError", () => ({
      title: "PDF protetto",
      message: "Il PDF è cifrato. Rimuovi la protezione e riprova.",
    }))
    .with("InvalidPdfError", () => ({
      title: "PDF non valido",
      message: "Il file non è un PDF leggibile.",
    }))
    .with("EmptyPdfError", () => ({
      title: "PDF vuoto",
      message: "Il PDF non contiene testo da importare.",
    }))
    .with("FileTooLargeError", () => ({
      title: "File troppo grande",
      message: "Il file supera la dimensione massima consentita.",
    }))
    .with("DbError", () => ({
      title: "Errore di sistema",
      message: "Si è verificato un problema. Riprova fra poco.",
    }))
    .otherwise(() => ({
      title: "Errore",
      message: error.message ?? "Si è verificato un problema imprevisto.",
    }));

export interface ResultErrorViewProps {
  error: TaggedError;
  className?: string;
}

export function ResultErrorView({ error, className }: ResultErrorViewProps) {
  const view = toErrorView(error);
  return (
    <EmptyState
      title={view.title}
      description={view.message}
      className={className}
    />
  );
}

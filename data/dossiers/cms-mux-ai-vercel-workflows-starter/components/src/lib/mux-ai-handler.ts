import { MuxAiError } from "./mux-ai-error";

export function toPublicErrorResponse(error: unknown) {
  if (error instanceof MuxAiError) {
    return {
      status: error.publicType === "validation_error" ? 400 : error.publicType === "timeout_error" ? 504 : 500,
      body: {
        error: {
          type: error.publicType,
          message: error.publicMessage,
          retryable: error.retryable,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        type: "processing_error",
        message: "An internal error occurred while processing the workflow.",
        retryable: false,
      },
    },
  };
}

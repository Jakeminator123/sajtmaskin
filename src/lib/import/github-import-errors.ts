import type { ImportErrorCode, ImportErrorStep } from "./import-init-contract";

export class ImportInitError extends Error {
  readonly code: ImportErrorCode;
  readonly step: ImportErrorStep;
  readonly status: number;
  readonly requiresAuth: boolean;

  constructor(params: {
    message: string;
    code: ImportErrorCode;
    step: ImportErrorStep;
    status: number;
    requiresAuth?: boolean;
  }) {
    super(params.message);
    this.name = "ImportInitError";
    this.code = params.code;
    this.step = params.step;
    this.status = params.status;
    this.requiresAuth = params.requiresAuth === true;
  }
}

export function importErrorJson(error: ImportInitError): {
  success: false;
  error: string;
  code: ImportErrorCode;
  step: ImportErrorStep;
  requiresAuth?: boolean;
} {
  return {
    success: false,
    error: error.message,
    code: error.code,
    step: error.step,
    ...(error.requiresAuth ? { requiresAuth: true } : {}),
  };
}

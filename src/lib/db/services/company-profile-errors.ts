export class CompanyProfileNotFoundError extends Error {
  readonly code = "COMPANY_PROFILE_NOT_FOUND" as const;
  constructor() {
    super("Profile not found");
    this.name = "CompanyProfileNotFoundError";
  }
}

export class CompanyProfileAccessDeniedError extends Error {
  readonly code = "COMPANY_PROFILE_ACCESS_DENIED" as const;
  constructor() {
    super("Access denied");
    this.name = "CompanyProfileAccessDeniedError";
  }
}

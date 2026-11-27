export class MediaUploadPolicyError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message);
    this.name = "MediaUploadPolicyError";
  }
}

export function getVideoGenerationCredentials() {
  const apiKey = process.env.RUNWAY_API_KEY?.trim();
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return apiKey && blobToken ? { apiKey, blobToken } : null;
}

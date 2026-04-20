export const sfccConfig = {
  shortCode: process.env.SFCC_SHORT_CODE ?? "",
  organizationId: process.env.SFCC_ORGANIZATION_ID ?? "",
  siteId: process.env.SFCC_SITE_ID ?? "",
  clientId: process.env.SFCC_CLIENT_ID ?? "",
  clientSecret: process.env.SFCC_CLIENT_SECRET ?? "",
  slasPrivateClientId: process.env.SFCC_SLAS_PRIVATE_CLIENT_ID ?? "",
  slasPrivateClientSecret: process.env.SFCC_SLAS_PRIVATE_CLIENT_SECRET ?? "",
  baseUrl:
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
};

export function validateSfccEnv() {
  const required = [
    "SFCC_SHORT_CODE",
    "SFCC_ORGANIZATION_ID",
    "SFCC_SITE_ID",
    "SFCC_CLIENT_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Salesforce Commerce Cloud environment variables:\n${missing.join("\n")}`,
    );
  }
}

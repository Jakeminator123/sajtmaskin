export const bigCommerceConfig = {
  storeHash: process.env.BIGCOMMERCE_STORE_HASH ?? '',
  channelId: process.env.BIGCOMMERCE_CHANNEL_ID ?? '',
  apiUrl: process.env.BIGCOMMERCE_API_URL ?? 'https://api.bigcommerce.com',
  canonicalStoreDomain: process.env.BIGCOMMERCE_CANONICAL_STORE_DOMAIN ?? '',
  cdnHostname: process.env.BIGCOMMERCE_CDN_HOSTNAME ?? ''
};

export function assertBigCommerceConfig() {
  const missing = Object.entries({
    BIGCOMMERCE_STORE_HASH: bigCommerceConfig.storeHash,
    BIGCOMMERCE_CHANNEL_ID: bigCommerceConfig.channelId,
    BIGCOMMERCE_API_URL: bigCommerceConfig.apiUrl,
    BIGCOMMERCE_CANONICAL_STORE_DOMAIN: bigCommerceConfig.canonicalStoreDomain,
    BIGCOMMERCE_CDN_HOSTNAME: bigCommerceConfig.cdnHostname,
    BIGCOMMERCE_ACCESS_TOKEN: process.env.BIGCOMMERCE_ACCESS_TOKEN ?? ''
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing BigCommerce configuration: ${missing.join(', ')}`);
  }
}

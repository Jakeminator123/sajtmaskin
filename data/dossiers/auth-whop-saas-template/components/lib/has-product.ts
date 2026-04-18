type MinimalMembership = {
  product?: { id?: string | null } | null;
  product_id?: string | null;
  status?: string | null;
};

type UserOauthSdk = {
  memberships?: {
    list?: () => Promise<MinimalMembership[]>;
  };
};

export async function hasWhopProductAccess(
  sdk: UserOauthSdk,
  allowedProducts: string | string[]
) {
  const allowed = Array.isArray(allowedProducts)
    ? allowedProducts
    : allowedProducts.split(",").map((value) => value.trim()).filter(Boolean);

  if (!allowed.length) return null;

  const memberships = (await sdk.memberships?.list?.()) ?? [];

  return (
    memberships.find((membership) => {
      const productId = membership.product?.id ?? membership.product_id ?? null;
      const status = membership.status?.toLowerCase?.() ?? "active";
      return Boolean(productId && allowed.includes(productId) && status !== "expired" && status !== "cancelled");
    }) ?? null
  );
}

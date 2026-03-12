# core/app/[locale]/(default)/cart/page.tsx

Reason: Useful structural reference

```text
import { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { Streamable } from '@/vibes/soul/lib/streamable';
import { Cart as CartComponent, CartEmptyState } from '@/vibes/soul/sections/cart';
import { CartAnalyticsProvider } from '~/app/[locale]/(default)/cart/_components/cart-analytics-provider';
import { getCartId } from '~/lib/cart';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { exists } from '~/lib/utils';

import { updateCouponCode } from './_actions/update-coupon-code';
import { updateGiftCertificate } from './_actions/update-gift-certificate';
import { updateLineItem } from './_actions/update-line-item';
import { updateShippingInfo } from './_actions/update-shipping-info';
import { CartViewed } from './_components/cart-viewed';
import { CheckoutPreconnect } from './_components/checkout-preconnect';
import { getCart, getShippingCountries } from './page-data';

interface Props {
  params: Promise<{ locale: string }>;
}

const CHECKOUT_URL = process.env.TRAILING_SLASH !== 'false' ? '/checkout/' : '/checkout';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'Cart' });

  return {
    title: t('title'),
  };
}

const getAnalyticsData = async (cartId: string) => {
  const data = await getCart({ cartId });

  const cart = data.site.cart;

  if (!cart) {
    return [];
  }

  const lineItems = [...cart.lineItems.physicalItems, ...cart.lineItems.digitalItems].filter(
    (item) => !item.parentEntityId, // Only include top-level items
  );

  return lineItems.map((item) => {
    return {
      entityId: item.entityId,
      id: item.productEntityId,
      name: item.name,
      brand: item.brand ?? '',
      sku: item.sku ?? '',
      price: item.listPrice.value,
      quantity: item.quantity,
      currency: item.listPrice.currencyCode,
    };
  });
};

// eslint-disable-next-line complexity
export default async function Cart({ params }: Props) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations('Cart');
  const tGiftCertificates = await getTranslations('GiftCertificates');
  const format = await getFormatter();
  const cartId = await

// ... truncated
```

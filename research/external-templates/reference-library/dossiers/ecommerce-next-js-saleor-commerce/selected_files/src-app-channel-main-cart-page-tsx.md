# src/app/[channel]/(main)/cart/page.tsx

Reason: Useful structural reference

```text
import { Suspense } from "react";
import Image from "next/image";
import { CheckoutLink } from "./checkout-link";
import { DeleteLineButton } from "./delete-line-button";
import * as Checkout from "@/lib/checkout";
import { formatMoney, getHrefForVariant } from "@/lib/utils";
import { LinkWithChannel } from "@/ui/atoms/link-with-channel";

export const metadata = {
	title: "Shopping Cart · Saleor Storefront example",
};

export default function Page(props: { params: Promise<{ channel: string }> }) {
	return (
		<section className="mx-auto max-w-7xl p-8">
			<h1 className="mt-8 text-3xl font-bold text-neutral-900">Your Shopping Cart</h1>
			{/* Cart content is dynamic (reads cookies) - wrap in Suspense */}
			<Suspense fallback={<CartSkeleton />}>
				<CartContent params={props.params} />
			</Suspense>
		</section>
	);
}

/**
 * Dynamic cart content - reads cookies at request time.
 * With Cache Components, this streams in after the static shell.
 */
async function CartContent({ params: paramsPromise }: { params: Promise<{ channel: string }> }) {
	const params = await paramsPromise;
	const checkoutId = await Checkout.getIdFromCookies(params.channel);
	const checkout = await Checkout.find(checkoutId);

	if (!checkout || checkout.lines.length < 1) {
		return (
			<div className="mt-12">
				<p className="my-12 text-sm text-neutral-500">
					Looks like you haven&apos;t added any items to the cart yet.
				</p>
				<LinkWithChannel
					href="/products"
					className="inline-block max-w-full rounded border border-transparent bg-neutral-900 px-6 py-3 text-center font-medium text-neutral-50 hover:bg-neutral-800 aria-disabled:cursor-not-allowed aria-disabled:bg-neutral-500 sm:px-16"
				>
					Explore products
				</LinkWithChannel>
			</div>
		);
	}

	return (
		<form className="mt-12">
			<ul
				data-testid="CartProductList"
				role="list"
				className="divide-y divide-neutral-200 border-b border-t border-neutral-200"
			>
				{checkout.lines.map((item) => (
					<li key={item.id} className="flex py-4">
						<div className="aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-md border bg-neutral-50 sm:h-32 sm:w-32">
							{item.variant?.product?.thumbnail?.url && (
								<Image
									src={item.variant.product.thumbnail.url}
									alt={item.variant.product.thumbnail.alt ?? ""}

// ... truncated
```

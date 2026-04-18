import { stripe } from "../../../lib/stripe";

type SearchParams = Promise<{ session_id?: string }>;

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return <p>Missing checkout session.</p>;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  if (session.status !== "complete") {
    return <p>Your payment has not been completed.</p>;
  }

  return (
    <main>
      <h1>Payment successful</h1>
      <p>Thank you for your order.</p>
      <p>Session: {session.id}</p>
    </main>
  );
}

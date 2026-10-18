import { CartContents } from "../../components/cart-contents";

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Din demokorg</h1>
      <CartContents />
    </div>
  );
}

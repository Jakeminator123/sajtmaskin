import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack';

export default async function DashboardPage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    redirect('/handler/sign-in');
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {user.primaryEmail ?? user.id}</p>
    </main>
  );
}

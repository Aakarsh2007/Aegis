import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('aegis_session');
  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}

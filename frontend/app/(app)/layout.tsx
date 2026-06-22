import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NavBar from '@/components/NavBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get('aegis_session');

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#020817] text-slate-100 relative">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

      <NavBar />

      <main className="pt-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12">
        {children}
      </main>
    </div>
  );
}

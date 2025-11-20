import WelcomeForm from '@/components/WelcomeForm';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-black/20 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm text-white/80">Thrive</span>
          </div>
        </div>
      </header>
      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-16">
          <WelcomeForm />
        </div>
      </div>
    </main>
  );
}




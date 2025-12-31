import WelcomeForm from '@/components/WelcomeForm';
import PushNotificationManager from '@/components/PushNotificationManager';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';

export default function Page() {
  return (
    <main className="min-h-screen flex flex-col">
      <IOSInstallPrompt />
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
          
          <div className="mt-8 border-t border-white/10 pt-8">
            <h2 className="text-xl font-bold mb-4 text-white">Debug Tools</h2>
            <PushNotificationManager />
          </div>
        </div>
      </div>
    </main>
  );
}

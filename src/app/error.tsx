'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-8"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900"><p className="text-sm font-semibold text-blue-600">AIGENTS VOICE</p><h1 className="my-4 text-2xl font-semibold">We couldn’t load this page</h1><p className="mb-6 text-slate-600">Your account data hasn’t been changed. Try again, or return to sign in. If this continues, check the service configuration.</p><button onClick={reset} className="rounded-lg bg-blue-600 px-5 py-3 text-white">Try again</button><a className="ml-5 text-blue-700" href="/login">Sign in</a></div></main>;
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, AudioLines, Check, Loader2, Radio, ShieldCheck } from "lucide-react";

export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const signup = mode === "signup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, email: form.get("email"), password: form.get("password"), name: form.get("name") || undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to sign in. Please try again.");
      if (result.redirect) window.location.assign(result.redirect); else { setMessage(result.message || "Check your email to confirm your account."); setBusy(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-story"><Link className="brand" href="/"><span className="brand-mark"><Radio size={24} /></span>aigents<span className="brand-tag">VOICE</span></Link><div className="auth-story-main"><span className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</span><h1>A little less chasing.<br /><em>A lot more connecting.</em></h1><p>Your voice command center, built for the way mortgage professionals work.</p><div className="auth-voice-art"><div className="voice-orbit"><AudioLines size={50} strokeWidth={1.2} /></div><div className="art-wave">{Array.from({ length: 37 }, (_, i) => <i key={i} style={{ height: `${12 + Math.abs(Math.sin(i * 1.8)) * (70 - Math.abs(i - 18) * 3)}px` }} />)}</div><span>Personalized conversations. Human connections.</span></div><ul><li><Check size={17} /> One place for every conversation</li><li><Check size={17} /> An agent that knows your business</li><li><Check size={17} /> Clear activity, outcomes, and insights</li></ul></div><div className="auth-story-footer"><ShieldCheck size={16} /> Private by design. Built for your business.</div></section>
    <section className="auth-form-side"><div className="auth-top-link">{signup ? "Already have an account?" : "New to AIGents?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"} <ArrowRight size={14} /></Link></div><div className="auth-form-wrap"><span className="eyebrow">AIGENTS VOICE</span><h2>{signup ? "Make room for more." : "Welcome back."}</h2><p>{signup ? "Create your account. Your next great conversation is waiting." : "Your agent and your conversations, right where you left them."}</p>
      {!configured && <div className="alert info">Account setup is awaiting the Supabase connection. You can explore the clearly labeled preview below.</div>}
      <form onSubmit={submit}>{signup && <label>Your name<input name="name" autoComplete="name" placeholder="Alex Morgan" maxLength={100} required /></label>}<label>Work email<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label><label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} placeholder={signup ? "At least 8 characters" : "Enter your password"} required /></label>
        {error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}<button className="button primary auth-submit" disabled={busy || !configured}>{busy ? <Loader2 size={18} className="spin" /> : <>{signup ? "Create account" : "Sign in"}<ArrowRight size={17} /></>}</button>
      </form><div className="auth-divider"><span>or take a look around</span></div><Link href="/demo" className="button secondary auth-submit">Explore the demo <ArrowRight size={16} /></Link><p className="auth-footnote">Demo activity is simulated. No real calls are placed.</p></div><div className="auth-copyright">© {new Date().getFullYear()} AIGents Voice</div></section>
  </main>;
}

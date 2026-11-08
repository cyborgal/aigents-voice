"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2, Radio, ShieldCheck } from "lucide-react";
import type { Business } from "@/lib/types";

export function businessFormData(form: HTMLFormElement) {
  const values = new FormData(form);
  return {
    officer_name: String(values.get("officer_name") || ""),
    business_email: String(values.get("business_email") || ""),
    company_name: String(values.get("company_name") || ""),
    nmls_id: String(values.get("nmls_id") || ""),
    business_phone: String(values.get("business_phone") || ""),
    timezone: String(values.get("timezone") || "America/Los_Angeles"),
    calling_days: values.getAll("calling_days").map(Number),
    calling_start: String(values.get("calling_start") || "09:00"),
    calling_end: String(values.get("calling_end") || "17:00"),
    agent_name: String(values.get("agent_name") || "AIGents Assistant"),
  };
}

export function BusinessFields({ email, initial, settings = false }: { email: string; initial?: Business | null; settings?: boolean }) {
  return <>
    <div className="form-grid">
      <label>Full name<input name="officer_name" autoComplete="name" required maxLength={100} defaultValue={initial?.officer_name} placeholder="Alex Morgan" /></label>
      <label>Business email<input name="business_email" type="email" autoComplete="email" required defaultValue={initial?.business_email || email} placeholder="alex@yourcompany.com" /></label>
      <label>Company name<input name="company_name" autoComplete="organization" required maxLength={150} defaultValue={initial?.company_name} placeholder="Your mortgage company" /></label>
      <label>NMLS ID<input name="nmls_id" inputMode="numeric" pattern="[0-9]{1,12}" required defaultValue={initial?.nmls_id} placeholder="123456" /></label>
      <label>Business phone<input name="business_phone" type="tel" autoComplete="tel" required pattern="\+[1-9][0-9]{7,14}" defaultValue={initial?.business_phone} placeholder="+14155550123" /><span className="field-hint">Include country code, starting with +.</span></label>
      <label>Timezone<select name="timezone" defaultValue={initial?.timezone || "America/Los_Angeles"}>
        <option value="America/Los_Angeles">Pacific · Los Angeles</option><option value="America/Denver">Mountain · Denver</option><option value="America/Phoenix">Arizona · Phoenix</option><option value="America/Chicago">Central · Chicago</option><option value="America/New_York">Eastern · New York</option><option value="America/Anchorage">Alaska · Anchorage</option><option value="Pacific/Honolulu">Hawaii · Honolulu</option>
      </select></label>
    </div>
    {settings && <label className="agent-name-field">Agent display name<input name="agent_name" required maxLength={80} defaultValue={initial?.agent_name || "AIGents Assistant"} /><span className="field-hint">Your shared voice agent is personalized with your business information.</span></label>}
    <div className="form-divider" />
    <div className="section-heading"><h3>Calling preferences</h3><p>Your agent follows the schedule in your selected timezone.</p></div>
    <fieldset className="days-field"><legend>Calling days</legend><div className="days-picker">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => <label key={day}><input type="checkbox" name="calling_days" value={i} defaultChecked={(initial?.calling_days || [1, 2, 3, 4, 5]).includes(i)} /><span>{day}</span></label>)}</div></fieldset>
    <div className="form-grid hours-grid"><label>Start time<input name="calling_start" type="time" required defaultValue={initial?.calling_start?.slice(0, 5) || "09:00"} /></label><label>End time<input name="calling_end" type="time" required defaultValue={initial?.calling_end?.slice(0, 5) || "17:00"} /></label></div>
  </>;
}

export function OnboardingForm({ email, initial }: { email: string; initial?: Business | null }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const body = businessFormData(event.currentTarget);
    if (!body.calling_days.length || body.calling_start >= body.calling_end) { setError("Choose at least one calling day and an end time later than the start time."); setBusy(false); return; }
    try {
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t save your business details.");
      window.location.assign("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); setBusy(false); }
  }
  return <main className="onboarding-page"><a className="brand onboarding-brand" href="/"><span className="brand-mark"><Radio size={24} /></span>aigents<span className="brand-tag">VOICE</span></a>
    <div className="onboarding-progress"><span className="done"><Check size={13} /> Account created</span><i /><span className="current">2 <b>Business details</b></span><i /><span>3 <b>Activate agent</b></span></div>
    <div className="onboarding-intro"><div className="eyebrow">LET’S MAKE IT YOURS</div><h1>Your business. Your voice.</h1><p>A few details help your agent represent you with confidence.</p></div>
    <form className="onboarding-card" onSubmit={submit}><div className="section-heading"><h3>Meet your business</h3><p>This information personalizes your voice agent.</p></div><BusinessFields email={email} initial={initial} />
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="onboarding-footer"><span><ShieldCheck size={17} /> Your business details stay private</span><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <>Save & continue <ArrowRight size={17} /></>}</button></div>
    </form><p className="onboarding-note">You can update these preferences anytime in Settings.</p>
  </main>;
}

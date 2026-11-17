"use client";

import { useState } from "react";
import { Headphones, Loader2, Play } from "lucide-react";

type Props = { callId: string };

export function RecordingPlayer({ callId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRecording() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(callId)}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result: { url?: string; error?: string } = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Recording unavailable.");
      setUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recording unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="recording-player" aria-label="Call recording">
      <h3><Headphones size={17} /> Call recording</h3>
      {url ? (
        <>
          <audio controls preload="none" src={url} aria-label="Play call recording" />
          <button className="recording-refresh" onClick={loadRecording} disabled={loading}>
            {loading ? "Refreshing playback link…" : "Refresh playback link"}
          </button>
        </>
      ) : (
        <button className="button secondary" type="button" onClick={loadRecording} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {loading ? "Loading recording…" : "Play recording"}
        </button>
      )}
      {error && <p role="alert" className="recording-error">{error}</p>}
      <p className="recording-privacy">Private recording · Playback link expires after 5 minutes.</p>
    </section>
  );
}

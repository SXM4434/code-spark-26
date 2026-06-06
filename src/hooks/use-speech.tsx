import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (browser-only)
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(opts?: { continuous?: boolean; lang?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    setSupported(!!Ctor);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = opts?.continuous ?? true;
    rec.interimResults = true;
    rec.lang = opts?.lang ?? "en-US";
    rec.onresult = (e: any) => {
      let interimStr = "";
      let finalStr = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalStr += r[0].transcript;
        else interimStr += r[0].transcript;
      }
      if (interimStr) setInterim(interimStr);
      if (finalStr) {
        setFinalText((prev) => (prev ? prev + " " : "") + finalStr.trim());
        setInterim("");
      }
    };
    rec.onerror = () => {};
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setFinalText("");
    setInterim("");
    rec.start();
    setListening(true);
  }, [opts?.continuous, opts?.lang]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterim("");
  }, []);

  return { supported, listening, interim, finalText, start, stop, reset };
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Heart,
  Mic,
  MicOff,
  Send,
  Settings,
  Loader2,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/theme-provider";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { Bubble } from "@/components/chat/bubble";
import { VoiceSettingsModal } from "@/components/settings/voice-settings-modal";
import { sendToBackend, playAudioStream } from "@/lib/chat-api";
import { stopAudioPlayback } from "@/lib/audio-player";

export default function Home() {
  const { theme, setTheme } = useTheme();

  const [ttsEnabled, setTtsEnabled] = usePersistentState("settings.ttsEnabled", true);

  // Legacy TTS state removed (rate, pitch, volume, voiceURI, voices)

  const [cosyEnabled, setCosyEnabled] = usePersistentState("settings.cosyEnabled", false);
  const [ttsEngine, setTtsEngine] = usePersistentState<'cosyvoice' | 'cartesia' | 'qwen'>("settings.ttsEngine", 'cartesia');
  const [cartesiaVoiceId, setCartesiaVoiceId] = usePersistentState("settings.cartesiaVoiceId", "78386a09-04ef-484d-9b9d-efd13087b792");

  const [streamingEnabled, setStreamingEnabled] = usePersistentState("settings.streamingEnabled", false);
  const [promptWavPath, setPromptWavPath] = usePersistentState("settings.promptWavPath", "public/resources/cosyvoice/xianzhe_sample.wav");
  const [promptText, setPromptText] = usePersistentState("settings.promptText", "猜猜我在哪？我听你说话有点卡卡的。你敢不敢往后看看？我说实话。");

  const [dashscopeApiKey, setDashscopeApiKey] = usePersistentState("settings.dashscopeApiKey", "");
  const [qwenVoiceId, setQwenVoiceId] = usePersistentState("settings.qwenVoiceId", "");

  const [recognitionLang, setRecognitionLang] = usePersistentState(
    "settings.recognitionLang",
    typeof navigator !== "undefined" ? navigator.language : "en-US"
  );
  const [geminiApiKey, setGeminiApiKey] = usePersistentState("settings.geminiApiKey", "");
  const [cartesiaApiKey, setCartesiaApiKey] = usePersistentState("settings.cartesiaApiKey", "");

  async function safeSpeak(text: string) {
    if (cosyEnabled) {
      if (!promptWavPath || !promptText) {
        console.warn("CosyVoice enabled but missing prompt wav/text");
        return;
      }
      try {
        await playAudioStream(text, { engine: 'cosyvoice', promptText, promptWavPath, streaming: streamingEnabled });
      } catch (e) {
        console.error("CosyVoice error:", e);
      }
      return;
    }

    if (ttsEngine === 'cartesia') {
      if (!cartesiaVoiceId) return;
      try {
        await playAudioStream(text, { engine: 'cartesia', voiceId: cartesiaVoiceId, streaming: streamingEnabled, cartesiaApiKey });
      } catch (e) {
        console.error("Cartesia error:", e);
      }
      return;
    }

    if (ttsEngine === 'qwen') {
      if (!dashscopeApiKey || !qwenVoiceId) {
        console.warn("Qwen TTS missing API Key or Voice ID");
        return;
      }
      try {
        await playAudioStream(text, {
          engine: 'qwen',
          voiceId: qwenVoiceId,
          streaming: true, // Always stream for now? Python script streams.
          dashscopeApiKey
        });
      } catch (e) {
        console.error("Qwen TTS error:", e);
      }
      return;
    }
  }

  function stopSpeak() {
    stopAudioPlayback();
  }

  const [listening, setListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState("");

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = usePersistentState<Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    meta: { ts: Date; tag?: string };
  }>>("chat.history", () => [
    {
      id: String(Math.random()),
      role: "assistant" as const,
      content: "Hi, I’m Molly. I’m here with you.",
      meta: { ts: new Date(), tag: "Welcome" }
    }
  ], (key, value) => {
    if (key === 'ts') return new Date(value);
    return value;
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Removed system voices loading useEffect

  // Speech Recognition Ref
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = recognitionLang;

      recognitionRef.current.onstart = () => {
        setListening(true);
        setMicError("");
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          setMicError("Microphone access blocked. Please allow permissions.");
        } else {
          setMicError(`Recognition error: ${event.error}`);
        }
        setListening(false);
      };

      recognitionRef.current.onend = () => {
        setListening(false);
        setIsTranscribing(false);
      };

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setDraft((prev) => (prev ? prev + " " + finalTranscript : finalTranscript));
          // Optional: Auto-send if desired
          // handleSend();
        }
      };
    }
  }, [recognitionLang]);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        setMicError("Speech recognition not supported in this browser.");
        return;
      }
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  async function handleSend() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");

    stopSpeak();
    setSpeakingId(null);

    const userMsg = {
      id: String(Math.random()),
      role: "user" as const,
      content: text,
      meta: { ts: new Date() }
    };

    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    try {
      const payload = {
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        geminiApiKey,
        ttsEngine,
        voiceId: ttsEngine === 'qwen' ? qwenVoiceId : undefined,
        dashscopeApiKey
      };

      // Create placeholder message
      const assistantId = String(Math.random());
      const placeholderMsg = {
        id: assistantId,
        role: "assistant" as const,
        content: "",
        meta: { ts: new Date(), tag: "Thinking..." }
      };
      setMessages((m) => [...m, placeholderMsg]);

      const res = await sendToBackend({
        ...payload,
        onStream: (text) => {
          setMessages((previous) =>
            previous.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: text, meta: { ...msg.meta, tag: "Reply" } }
                : msg
            )
          );
        }
      });

      // Final update to ensure sync
      const finalMsg = {
        id: assistantId,
        role: "assistant" as const,
        content: res.text,
        meta: { ts: new Date(), tag: res.tag || "Support" }
      };

      setMessages((m) => m.map(msg => msg.id === assistantId ? finalMsg : msg));

      if (ttsEnabled) {
        setSpeakingId(finalMsg.id);
        // If Qwen, audio was already streamed. For others, we trigger TTS now.
        if (ttsEngine !== 'qwen') {
          safeSpeak(finalMsg.content);
        }
      }
    } catch {
      const assistantMsg = {
        id: String(Math.random()),
        role: "assistant" as const,
        content: "Something went wrong sending that.",
        meta: { ts: new Date(), tag: "Error" }
      };
      setMessages((m) => [...m, assistantMsg]);
    } finally {
      setBusy(false);
    }
  }

  function speakMessage(msg: any) {
    if (!cosyEnabled && ttsEngine !== 'cartesia' && ttsEngine !== 'qwen') return;

    if (speakingId === msg.id) {
      stopSpeak();
      setSpeakingId(null);
      return;
    }

    setSpeakingId(msg.id);
    safeSpeak(msg.content);
  }

  function handleNewChat() {
    stopSpeak();
    setMessages([
      {
        id: String(Math.random()),
        role: "assistant",
        content: "Hi, I’m Molly. I’m here with you.",
        meta: { ts: new Date(), tag: "Welcome" }
      }
    ]);
  }

  useEffect(() => {
    if (!ttsEnabled) {
      stopSpeak();
      setSpeakingId(null);
    }
  }, [ttsEnabled]);

  return (
    <div className="h-dvh w-full bg-gradient-to-b from-amber-50 via-rose-50 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 text-foreground flex flex-col overflow-hidden">
      <div className="mx-auto w-full max-w-3xl p-0 sm:p-4 flex-1 flex flex-col min-h-0">
        <Card className="rounded-none sm:rounded-3xl border-0 sm:border border-white/50 dark:border-border/50 bg-white/40 dark:bg-card/40 backdrop-blur shadow-none sm:shadow-lg flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-3 flex-none">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-card/70 border shadow-sm">
                    <Heart className="h-5 w-5" />
                  </span>
                  Molly
                </CardTitle>
                <div className="text-sm text-muted-foreground">Always online.</div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="rounded-2xl" onClick={handleNewChat}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Chat
                </Button>
                <Button variant="secondary" className="rounded-2xl" onClick={() => setSettingsOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
            <div className="flex flex-col gap-3 h-full">

              <div className="rounded-3xl bg-card/20 backdrop-blur p-3 flex-1 min-h-0 flex flex-col">
                <ScrollArea className="flex-1 pr-3 min-h-0">
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {messages.map((m: any) => (
                        <Bubble
                          key={m.id}
                          role={m.role}
                          text={m.content}
                          meta={m.meta}
                          speaking={speakingId === m.id}
                          onSpeak={() => speakMessage(m)}
                        />
                      ))}
                    </AnimatePresence>

                    <AnimatePresence>
                      {busy ? (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="flex justify-start"
                        >
                          <div className="rounded-3xl border bg-card/70 px-4 py-3 shadow-sm">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Molly is typing…
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Say something..."
                    className="h-12 rounded-full border-none bg-card/70 px-5 shadow-sm backdrop-blur focus-visible:ring-1"
                    disabled={busy || listening}
                  />
                  <div className="absolute right-2 top-2">
                    <Button
                      size="icon" // changed from "icon" - wait size should be proper
                      variant={listening ? "destructive" : "secondary"}
                      className="h-8 w-8 rounded-full shadow-none"
                      onClick={toggleListening}
                      disabled={busy}
                    >
                      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  size="icon"
                  className="h-12 w-12 rounded-full shadow-sm" // increased size
                  onClick={handleSend}
                  disabled={!draft.trim() || busy || listening}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>

              <AnimatePresence>
                {micError ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-center text-xs text-red-500 font-medium"
                  >
                    {micError}
                  </motion.div>
                ) : null}
              </AnimatePresence>

            </div>
          </CardContent>
        </Card>
      </div>

      <VoiceSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        ttsEnabled={ttsEnabled}
        setTtsEnabled={setTtsEnabled}
        cosyEnabled={cosyEnabled}
        setCosyEnabled={setCosyEnabled}
        ttsEngine={ttsEngine}
        setTtsEngine={setTtsEngine}
        cartesiaVoiceId={cartesiaVoiceId}
        setCartesiaVoiceId={setCartesiaVoiceId}
        streamingEnabled={streamingEnabled}
        setStreamingEnabled={setStreamingEnabled}
        promptWavPath={promptWavPath}
        setPromptWavPath={setPromptWavPath}
        promptText={promptText}
        setPromptText={setPromptText}
        recognitionLang={recognitionLang}
        setRecognitionLang={setRecognitionLang}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
        cartesiaApiKey={cartesiaApiKey}
        setCartesiaApiKey={setCartesiaApiKey}
        dashscopeApiKey={dashscopeApiKey}
        setDashscopeApiKey={setDashscopeApiKey}
        qwenVoiceId={qwenVoiceId}
        setQwenVoiceId={setQwenVoiceId}
      />
    </div>
  );
}

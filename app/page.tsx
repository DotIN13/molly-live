"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Settings,
  Shield,
  Smile,
  Loader2,
  X,
  Moon,
  Sun,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const supportsTTS = typeof window !== "undefined" && "speechSynthesis" in window;

function formatTime(ts: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(ts);
  } catch {
    return "";
  }
}

function safeSpeakLegacy(
  text: string,
  { rate = 1, pitch = 1, volume = 1, voiceURI }: { rate?: number; pitch?: number; volume?: number; voiceURI?: string } = {}
) {
  if (!supportsTTS) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = pitch;
  u.volume = volume;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const match = voices.find((v) => v.voiceURI === voiceURI);
  if (match) u.voice = match;
  window.speechSynthesis.speak(u);
}

function stopSpeakLegacy() {
  if (!supportsTTS) return;
  window.speechSynthesis.cancel();
}

function Bubble({
  role,
  text,
  meta,
  onSpeak,
  speaking
}: {
  role: "user" | "assistant";
  text: string;
  meta?: { ts?: Date; tag?: string };
  onSpeak?: () => void;
  speaking?: boolean;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-3xl px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-card/70 backdrop-blur border"
        )}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-200 to-amber-100 border" />
              <div className="text-xs font-medium">Molly</div>
            </div>
            {meta?.tag ? (
              <Badge variant="secondary" className="rounded-full">
                {meta.tag}
              </Badge>
            ) : null}
            <div className="ml-auto text-[11px] text-muted-foreground">{formatTime(meta?.ts || new Date())}</div>
          </div>
        )}

        <div className={cn("whitespace-pre-wrap text-[15px] leading-relaxed", isUser ? "" : "text-foreground")}>
          {text}
        </div>

        {!isUser && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full"
              onClick={onSpeak}
              disabled={false}
              aria-label="Speak this message"
            >
              {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span className="ml-2 text-xs">{speaking ? "Stop" : "Read"}</span>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}


const COSY_SAMPLE_RATE = 24000;
const CARTESIA_SAMPLE_RATE = 44100;

class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private queue: Float32Array[] = [];
  private scheduledSources: AudioBufferSourceNode[] = [];

  constructor() {
    // Lazy initialization in resume()
  }

  async resume() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  stop() {
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // ignore
      }
    });
    this.scheduledSources = [];
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  scheduleChunk(chunk: ArrayBuffer, sampleRate: number = COSY_SAMPLE_RATE, format: 'int16' | 'float32' = 'int16') {
    if (!this.audioContext) return;

    let float32Array: Float32Array<ArrayBuffer>;

    if (format === 'int16') {
      const int16Array = new Int16Array(chunk);
      float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }
    } else {
      // Float32
      float32Array = new Float32Array(chunk);
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule playback
    if (this.nextStartTime < this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime;
    }

    source.start(this.nextStartTime);
    this.scheduledSources.push(source);

    this.nextStartTime += audioBuffer.duration;

    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }
    };
  }
}

const streamingPlayer = new StreamingAudioPlayer();

function stopAudioPlayback() {
  streamingPlayer.stop();
}

async function playAudioStream(
  text: string,
  options: {
    engine: 'cosyvoice' | 'cartesia',
    promptText?: string,
    promptWavPath?: string,
    voiceId?: string,
    streaming: boolean,
    cartesiaApiKey?: string
  }
) {
  stopAudioPlayback();
  await streamingPlayer.resume();

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ttsText: text,
        ...options,
        stream: options.streaming
      })
    });

    if (!response.ok || !response.body) {
      console.error("TTS Error", await response.text());
      return;
    }

    const reader = response.body.getReader();
    const sampleRateHeader = response.headers.get('X-Sample-Rate');
    const audioFormatHeader = response.headers.get('X-Audio-Format');

    const sampleRate = sampleRateHeader ? parseInt(sampleRateHeader, 10) : (options.engine === 'cartesia' ? CARTESIA_SAMPLE_RATE : COSY_SAMPLE_RATE);
    const audioFormat = (audioFormatHeader === 'pcm_f32le' || options.engine === 'cartesia') ? 'float32' : 'int16';

    let leftover = new Uint8Array(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const temp = new Uint8Array(leftover.length + value.length);
        temp.set(leftover);
        temp.set(value, leftover.length);
        leftover = temp;

        const bytesPerSample = audioFormat === 'float32' ? 4 : 2;
        const totalLength = leftover.length;
        const remainder = totalLength % bytesPerSample;
        const processableLength = totalLength - remainder;

        if (processableLength > 0) {
          const chunkToProcess = leftover.slice(0, processableLength);
          leftover = leftover.slice(processableLength);
          streamingPlayer.scheduleChunk(chunkToProcess.buffer, sampleRate, audioFormat);
        }
      }
    }

  } catch (e) {
    console.error(e);
  }
}

function VoiceSettingsModal({
  open,
  onClose,
  ttsEnabled,
  setTtsEnabled,
  voices,
  voiceURI,
  setVoiceURI,
  rate,
  setRate,
  pitch,
  setPitch,
  volume,
  setVolume,
  cosyEnabled,
  setCosyEnabled,
  streamingEnabled,
  setStreamingEnabled,
  promptWavPath,
  setPromptWavPath,
  promptText,
  setPromptText,
  ttsEngine,
  setTtsEngine,
  cartesiaVoiceId,
  setCartesiaVoiceId,
  recognitionLang,
  setRecognitionLang,
  cartesiaApiKey,
  setCartesiaApiKey,
  geminiApiKey,
  setGeminiApiKey,
}: {
  open: boolean;
  onClose: () => void;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  setVoiceURI: (u: string) => void;
  rate: number;
  setRate: (n: number) => void;
  pitch: number;
  setPitch: (n: number) => void;
  volume: number;
  setVolume: (n: number) => void;
  cosyEnabled: boolean;
  setCosyEnabled: (v: boolean) => void;
  streamingEnabled: boolean;
  setStreamingEnabled: (v: boolean) => void;
  promptWavPath: string;
  setPromptWavPath: (v: string) => void;
  promptText: string;
  setPromptText: (v: string) => void;
  ttsEngine: 'cosyvoice' | 'cartesia';
  setTtsEngine: (v: 'cosyvoice' | 'cartesia') => void;
  cartesiaVoiceId: string;
  setCartesiaVoiceId: (v: string) => void;
  recognitionLang: string;
  setRecognitionLang: (v: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (v: string) => void;
  cartesiaApiKey: string;
  setCartesiaApiKey: (v: string) => void;
}) {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md max-h-[85vh] overflow-y-auto"
          >
            <Card className="rounded-3xl border-border/50 bg-card/95 backdrop-blur shadow-xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Settings</CardTitle>
                  <Button variant="ghost" size="icon" className="rounded-2xl" onClick={onClose} aria-label="Close">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/50 p-3">
                  <div className="font-medium">Appearance</div>
                  <div className="flex items-center gap-1 rounded-full border bg-background p-1">
                    <Button
                      variant={theme === "light" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={theme === "dark" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={theme === "system" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7 rounded-full text-xs font-medium"
                      onClick={() => setTheme("system")}
                    >
                      Auto
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/50 p-3">
                  <div className="font-medium">Auto-read Molly’s replies</div>
                  <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} disabled={!supportsTTS && !cosyEnabled} />
                </div>

                {/* Speech Recognition Language */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/50 p-3">
                  <div className="font-medium">Recognition Language</div>
                  <select
                    value={recognitionLang}
                    onChange={(e) => setRecognitionLang(e.target.value)}
                    className="h-8 rounded-lg border bg-background px-2 text-xs"
                  >
                    {[
                      { code: "en-US", name: "English (US)" },
                      { code: "zh-CN", name: "Chinese (Simplified)" },
                      { code: "es-ES", name: "Spanish" },
                      { code: "fr-FR", name: "French" },
                      { code: "de-DE", name: "German" },
                      { code: "ja-JP", name: "Japanese" },
                      { code: "ko-KR", name: "Korean" },
                      { code: "ru-RU", name: "Russian" },
                      { code: "pt-BR", name: "Portuguese (Brazil)" },
                    ].map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* API Keys */}
                <div className="space-y-3 rounded-2xl border bg-muted/50 p-3">
                  <div className="font-medium">Gemini API Key</div>
                  <div className="space-y-1">
                    <Input
                      value={geminiApiKey}
                      onChange={e => setGeminiApiKey(e.target.value)}
                      placeholder="Leave empty to use server settings"
                      type="password"
                      autoComplete="new-password"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* TTS Engine Selection */}
                <div className="space-y-3 rounded-2xl border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">TTS Engine</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={cosyEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setCosyEnabled(true); setTtsEngine('cosyvoice'); }}
                      className="flex-1 rounded-xl text-xs"
                    >
                      CosyVoice
                    </Button>
                    <Button
                      variant={ttsEngine === 'cartesia' && !cosyEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setCosyEnabled(false); setTtsEngine('cartesia'); }}
                      className="flex-1 rounded-xl text-xs"
                    >
                      Cartesia
                    </Button>
                    <Button
                      variant={!cosyEnabled && ttsEngine !== 'cartesia' ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setCosyEnabled(false); setTtsEngine('cosyvoice'); /* fallback to system by disabling custom */ }}
                      className="flex-1 rounded-xl text-xs"
                    >
                      System
                    </Button>
                  </div>

                  {/* CosyVoice Settings */}
                  {cosyEnabled && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">Stream Response</div>
                        <Switch checked={streamingEnabled} onCheckedChange={setStreamingEnabled} className="scale-75" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Prompt WAV Path</div>
                        <Input
                          value={promptWavPath}
                          onChange={e => setPromptWavPath(e.target.value)}
                          placeholder="Absolute path to .wav"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Prompt Text</div>
                        <Input
                          value={promptText}
                          onChange={e => setPromptText(e.target.value)}
                          placeholder="Text content of the WAV"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Cartesia Settings */}
                  {ttsEngine === 'cartesia' && !cosyEnabled && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">Stream Response</div>
                        <Switch checked={streamingEnabled} onCheckedChange={setStreamingEnabled} className="scale-75" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Cartesia API Key</div>
                        <Input
                          value={cartesiaApiKey}
                          onChange={e => setCartesiaApiKey(e.target.value)}
                          placeholder="Leave empty to use server settings"
                          type="password"
                          autoComplete="new-password"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Voice ID</div>
                        <Input
                          value={cartesiaVoiceId}
                          onChange={e => setCartesiaVoiceId(e.target.value)}
                          placeholder="Cartesia Voice ID"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* System Settings */}
                  {!cosyEnabled && ttsEngine !== 'cartesia' && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <div className="font-medium text-xs text-muted-foreground">Voice</div>
                        <select
                          value={voiceURI}
                          onChange={(e) => setVoiceURI(e.target.value)}
                          className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                          disabled={!supportsTTS}
                        >
                          {voices.length ? (
                            voices.map((v) => (
                              <option key={v.voiceURI} value={v.voiceURI}>
                                {v.name} ({v.lang})
                              </option>
                            ))
                          ) : (
                            <option value="">No voices found</option>
                          )}
                        </select>
                      </div>

                      <div className="space-y-3">
                        <div className="font-medium text-xs text-muted-foreground">Speech Parameters</div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">Rate</div>
                            <div className="text-xs font-medium">{rate.toFixed(2)}</div>
                          </div>
                          <Slider value={[rate]} min={0.75} max={1.25} step={0.01} onValueChange={(v) => setRate(v[0])} disabled={!supportsTTS} />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">Pitch</div>
                            <div className="text-xs font-medium">{pitch.toFixed(2)}</div>
                          </div>
                          <Slider value={[pitch]} min={0.75} max={1.25} step={0.01} onValueChange={(v) => setPitch(v[0])} disabled={!supportsTTS} />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">Volume</div>
                            <div className="text-xs font-medium">{volume.toFixed(2)}</div>
                          </div>
                          <Slider value={[volume]} min={0.2} max={1} step={0.01} onValueChange={(v) => setVolume(v[0])} disabled={!supportsTTS} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/50 p-3">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="rounded-2xl flex-1"
                      onClick={() => {
                        if (cosyEnabled) {
                          playAudioStream("Hi, I’m Molly.", {
                            engine: 'cosyvoice',
                            promptText,
                            promptWavPath,
                            streaming: streamingEnabled
                          }).catch(err => console.error(err));
                        } else if (ttsEngine === 'cartesia') {
                          playAudioStream("Hi, I’m Molly. Checking my voice.", {
                            engine: 'cartesia',
                            voiceId: cartesiaVoiceId,
                            streaming: streamingEnabled,
                            cartesiaApiKey
                          }).catch(err => console.error(err));
                        } else {
                          safeSpeakLegacy("Hi, I’m Molly.", {
                            rate,
                            pitch,
                            volume,
                            voiceURI
                          })
                        }
                      }}
                      disabled={(!supportsTTS && !cosyEnabled && ttsEngine !== 'cartesia') || (cosyEnabled && (!promptWavPath || !promptText)) || (ttsEngine === 'cartesia' && !cartesiaVoiceId)}
                    >
                      <Volume2 className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      variant="secondary"
                      className="rounded-2xl"
                      onClick={() => {
                        stopSpeakLegacy();
                        stopAudioPlayback();
                      }}
                      disabled={!supportsTTS && !cosyEnabled && ttsEngine !== 'cartesia'}
                    >
                      <VolumeX className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                </div>

              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      ) : null
      }
    </AnimatePresence >
  );
}

async function sendToBackend({
  messages,
  geminiApiKey
}: {
  messages: Array<{ role: string; content: string }>;
  geminiApiKey?: string;
}) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, geminiApiKey })
    });
    if (!response.ok) {
      throw new Error('API Error');
    }
    const data = await response.json();
    return { text: data.text, tag: "Reply" };
  } catch (e) {
    console.error(e);
    return { text: "I'm having trouble connecting right now.", tag: "Error" };
  }
}

// Custom hook for persistent state
function usePersistentState<T>(key: string, initialValue: T | (() => T), reviver?: (this: any, key: string, value: any) => any): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialValue as T);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setState(JSON.parse(item, reviver));
      }
    } catch (error) {
      console.error(error);
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (loaded) {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error(error);
      }
    }
  }, [key, state, loaded]);

  return [state, setState];
}

export default function Home() {


  const [ttsEnabled, setTtsEnabled] = usePersistentState("settings.ttsEnabled", true);
  const [rate, setRate] = usePersistentState("settings.rate", 1);
  const [pitch, setPitch] = usePersistentState("settings.pitch", 1);
  const [volume, setVolume] = usePersistentState("settings.volume", 1);
  const [voiceURI, setVoiceURI] = usePersistentState("settings.voiceURI", "");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [cosyEnabled, setCosyEnabled] = usePersistentState("settings.cosyEnabled", false);
  const [ttsEngine, setTtsEngine] = usePersistentState<'cosyvoice' | 'cartesia'>("settings.ttsEngine", 'cartesia');
  const [cartesiaVoiceId, setCartesiaVoiceId] = usePersistentState("settings.cartesiaVoiceId", "78386a09-04ef-484d-9b9d-efd13087b792");

  const [streamingEnabled, setStreamingEnabled] = usePersistentState("settings.streamingEnabled", false);
  const [promptWavPath, setPromptWavPath] = usePersistentState("settings.promptWavPath", "public/resources/cosyvoice/xianzhe_sample.wav");
  const [promptText, setPromptText] = usePersistentState("settings.promptText", "猜猜我在哪？我听你说话有点卡卡的。你敢不敢往后看看？我说实话。");

  const [recognitionLang, setRecognitionLang] = usePersistentState(
    "settings.recognitionLang",
    typeof navigator !== "undefined" ? navigator.language : "en-US"
  );
  const [geminiApiKey, setGeminiApiKey] = usePersistentState("settings.geminiApiKey", "");
  const [cartesiaApiKey, setCartesiaApiKey] = usePersistentState("settings.cartesiaApiKey", "");

  async function safeSpeak(
    text: string,
    options: { rate?: number; pitch?: number; volume?: number; voiceURI?: string } = {}
  ) {
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

    if (!supportsTTS) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = options.rate ?? 1;
    u.pitch = options.pitch ?? 1;
    u.volume = options.volume ?? 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const match = voices.find((v) => v.voiceURI === options.voiceURI);
    if (match) u.voice = match;
    window.speechSynthesis.speak(u);
  }

  function stopSpeak() {
    stopAudioPlayback();
    if (!supportsTTS) return;
    window.speechSynthesis.cancel();
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

  useEffect(() => {
    if (!supportsTTS) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices?.() || [];
      setVoices(v);
      if (!voiceURI && v[0]?.voiceURI) setVoiceURI(v[0].voiceURI);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceURI]);

  // Speech Recognition Ref
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) {
      const r = new (window as any).webkitSpeechRecognition();
      r.continuous = true;
      r.interimResults = true;
      r.lang = recognitionLang;

      r.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript || interimTranscript) {
          setDraft((prev) => {
            // Basic strategy: if we assume the user is dictating, we might want to just append.
            // But managing cursor position with interim results is tricky. 
            // Simplest approach: Text area just shows what you said.
            // We'll just append final results, and maybe show interim in a placeholder or just append?
            // Actually, for a chat input, usually we just set the value. 
            // Let's stick to appending final results to the draft.

            // Issue: 'draft' state ref in closure is stale. 
            // We need to use the functional update correctly, but 'interim' replaces current typing? 
            // Let's keep it simple: Just append final results.
            if (finalTranscript) {
              return (prev + " " + finalTranscript).trimStart();
            }
            return prev;
          });
        }
      };

      r.onend = () => {
        setListening(false);
      };

      r.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          setMicError("Microphone access denied.");
        }
        setListening(false);
      };

      recognitionRef.current = r;
    }
  }, [recognitionLang]);

  function toggleListening() {
    if (!recognitionRef.current) {
      setMicError("Speech recognition not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setMicError("");
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || busy) return;

    stopSpeak();
    // Ensure AudioContext is resumed immediately upon user interaction (critical for iOS)
    streamingPlayer.resume().catch(console.error);

    setSpeakingId(null);

    const userMsg = {
      id: String(Math.random()),
      role: "user" as const,
      content: text,
      meta: { ts: new Date() }
    };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setBusy(true);

    try {
      const payload = {
        messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        geminiApiKey
      };

      const res = await sendToBackend(payload);

      const assistantMsg = {
        id: String(Math.random()),
        role: "assistant" as const,
        content: res.text,
        meta: { ts: new Date(), tag: res.tag || "Support" }
      };
      setMessages((m) => [...m, assistantMsg]);

      if (ttsEnabled) {
        setSpeakingId(assistantMsg.id);
        safeSpeak(assistantMsg.content, { rate, pitch, volume, voiceURI });
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
    if (!supportsTTS && !cosyEnabled) return;
    if (speakingId === msg.id) {
      stopSpeak();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msg.id);
    safeSpeak(msg.content, { rate, pitch, volume, voiceURI });
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
                      size="icon"
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
                  className="h-12 w-12 rounded-full shadow-sm"
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
        voices={voices}
        voiceURI={voiceURI}
        setVoiceURI={setVoiceURI}
        rate={rate}
        setRate={setRate}
        pitch={pitch}
        setPitch={setPitch}
        volume={volume}
        setVolume={setVolume}
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
      />
    </div>
  );
}

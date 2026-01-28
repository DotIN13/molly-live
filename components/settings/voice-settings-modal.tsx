"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Loader2, X, Sun, Moon, Volume2, VolumeX } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { motion, AnimatePresence } from "framer-motion";
import { playAudioStream } from "@/lib/chat-api";
import { stopAudioPlayback } from "@/lib/audio-player";

export function VoiceSettingsModal({
    open,
    onClose,
    ttsEnabled,
    setTtsEnabled,
    cosyVoiceId,
    setCosyVoiceId,
    ttsEngine,
    setTtsEngine,
    recognitionLang,
    setRecognitionLang,
    geminiApiKey,
    setGeminiApiKey,
    dashscopeApiKey,
    setDashscopeApiKey,
    qwenVoiceId,
    setQwenVoiceId,
}: {
    open: boolean;
    onClose: () => void;
    ttsEnabled: boolean;
    setTtsEnabled: (v: boolean) => void;
    cosyVoiceId: string;
    setCosyVoiceId: (v: string) => void;
    ttsEngine: 'cosyvoice' | 'qwen';
    setTtsEngine: (v: 'cosyvoice' | 'qwen') => void;
    recognitionLang: string;
    setRecognitionLang: (v: string) => void;
    geminiApiKey: string;
    setGeminiApiKey: (v: string) => void;
    dashscopeApiKey: string;
    setDashscopeApiKey: (v: string) => void;
    qwenVoiceId: string;
    setQwenVoiceId: (v: string) => void;
}) {
    const { theme, setTheme } = useTheme();
    const [cloneFile, setCloneFile] = useState<File | null>(null);
    const [isCloning, setIsCloning] = useState(false);


    const handleCloneVoice = async () => {
        if (!cloneFile) return;
        setIsCloning(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const audioData = e.target?.result as string;
                // audioData is a data: URL, which our backend now accepts

                try {
                    const res = await fetch('/api/voice-clone', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ audioData, apiKey: dashscopeApiKey })
                    });

                    const data = await res.json();
                    if (res.ok && data.voiceId) {
                        setQwenVoiceId(data.voiceId);
                        alert(`Voice cloned successfully! ID: ${data.voiceId}`);
                        setCloneFile(null);
                    } else {
                        alert(`Error cloning voice: ${data.error}`);
                    }
                } catch (err: any) {
                    console.error(err);
                    alert('Failed to clone voice');
                } finally {
                    setIsCloning(false);
                }
            };
            reader.readAsDataURL(cloneFile);

        } catch (e) {
            console.error(e);
            alert('Failed to clone voice');
            setIsCloning(false);
        }
    };

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
                                    <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
                                </div>

                                {/* Speech Recognition Language */}
                                <div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/50 p-3">
                                    <div className="font-medium">Recognition Language</div>
                                    <select
                                        value={recognitionLang}
                                        onChange={(e) => setRecognitionLang(e.target.value)}
                                        className="rounded-lg border bg-background px-2 py-1 text-xs"
                                    >
                                        {["en-US", "zh-CN", "ja-JP", "es-ES", "fr-FR"].map(lang => (
                                            <option key={lang} value={lang}>{lang}</option>
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
                                            variant={ttsEngine === 'cosyvoice' ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => { setTtsEngine('cosyvoice'); }}
                                            className="flex-1 rounded-xl text-xs"
                                        >
                                            CosyVoice
                                        </Button>
                                        <Button
                                            variant={ttsEngine === 'qwen' ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => { setTtsEngine('qwen'); }}
                                            className="flex-1 rounded-xl text-xs"
                                        >
                                            Aliyun Qwen
                                        </Button>
                                    </div>

                                    {/* CosyVoice Settings */}
                                    {ttsEngine === 'cosyvoice' && (
                                        <div className="space-y-3 pt-2">
                                            <div className="space-y-1">
                                                <div className="text-xs text-muted-foreground">DashScope API Key</div>
                                                <Input
                                                    value={dashscopeApiKey}
                                                    onChange={e => setDashscopeApiKey(e.target.value)}
                                                    placeholder="Leave empty to use server settings"
                                                    type="password"
                                                    autoComplete="new-password"
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-xs text-muted-foreground">Voice ID</div>
                                                <Input
                                                    value={cosyVoiceId}
                                                    onChange={e => setCosyVoiceId(e.target.value)}
                                                    placeholder="longanyang"
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}


                                    {/* Qwen Settings */}
                                    {ttsEngine === 'qwen' && (
                                        <div className="space-y-3 pt-2">
                                            <div className="flex items-center justify-between">
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-xs text-muted-foreground">DashScope API Key</div>
                                                <Input
                                                    value={dashscopeApiKey}
                                                    onChange={e => setDashscopeApiKey(e.target.value)}
                                                    placeholder="Leave empty to use server settings"
                                                    type="password"
                                                    autoComplete="new-password"
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-xs text-muted-foreground">Voice ID</div>
                                                <Input
                                                    value={qwenVoiceId}
                                                    onChange={e => setQwenVoiceId(e.target.value)}
                                                    placeholder="Voice ID"
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>

                                            {/* Voice Cloning UI */}
                                            <div className="pt-2">
                                                <div className="rounded-xl border border-dashed p-3 bg-muted/30">
                                                    <div className="text-xs font-medium mb-2">Voice Cloning</div>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="file"
                                                            accept="audio/*"
                                                            onChange={e => setCloneFile(e.target.files?.[0] || null)}
                                                            className="h-8 text-xs flex-1 file:text-xs file:mr-2"
                                                        />
                                                        <Button size="sm" onClick={handleCloneVoice} disabled={isCloning || !cloneFile || !dashscopeApiKey} className="h-8 text-xs">
                                                            {isCloning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Clone"}
                                                        </Button>
                                                    </div>
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
                                                if (ttsEngine === 'cosyvoice') {
                                                    playAudioStream("Hi, I’m Molly.", {
                                                        engine: 'cosyvoice',
                                                        voiceId: cosyVoiceId,
                                                        streaming: true,
                                                        dashscopeApiKey
                                                    }).catch(err => console.error(err));
                                                } else if (ttsEngine === 'qwen') {
                                                    playAudioStream("Hi, I’m Molly. Checking my voice.", {
                                                        engine: 'qwen',
                                                        voiceId: qwenVoiceId,
                                                        streaming: true,
                                                        dashscopeApiKey
                                                    }).catch(err => console.error(err));
                                                }
                                            }}
                                            disabled={(ttsEngine === 'cosyvoice' && (!cosyVoiceId || !dashscopeApiKey)) || (ttsEngine === 'qwen' && (!qwenVoiceId || !dashscopeApiKey))}
                                        >
                                            <Volume2 className="mr-2 h-4 w-4" />
                                            Preview
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            className="rounded-2xl"
                                            onClick={() => {
                                                stopAudioPlayback();
                                            }}
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

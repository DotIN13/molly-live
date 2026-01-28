"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";

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

export function Bubble({
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, SkipForward, LogOut, Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Screen = "idle" | "searching" | "chatting" | "ended";

type Message = {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  created_at: string;
};

type Session = {
  id: string;
  partner_pseudo: string;
};

function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("blabla_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("blabla_user_id", id);
  }
  return id;
}

function HomePage() {
  const [screen, setScreen] = useState<Screen>("idle");
  const [pseudo, setPseudo] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState("");
  const waitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUserId(getUserId());
    const saved = localStorage.getItem("blabla_pseudo");
    if (saved) setPseudo(saved);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Realtime subscription when in a session
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${session.id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          const s = payload.new as { status: string; ended_by: string | null };
          if (s.status === "ended") {
            setScreen("ended");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const stopPolling = () => {
    if (waitingPollRef.current) {
      clearInterval(waitingPollRef.current);
      waitingPollRef.current = null;
    }
  };

  const startSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const cleanPseudo = pseudo.trim().slice(0, 24) || `Anon-${Math.floor(Math.random() * 9999)}`;
    setPseudo(cleanPseudo);
    localStorage.setItem("blabla_pseudo", cleanPseudo);
    setScreen("searching");
    setMessages([]);

    const tryMatch = async () => {
      const { data, error } = await supabase.rpc("find_or_create_match", {
        p_user_id: userId,
        p_pseudo: cleanPseudo,
      });
      if (error) {
        toast.error("Erreur de mise en relation");
        stopPolling();
        setScreen("idle");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.session_id) {
        stopPolling();
        setSession({ id: row.session_id, partner_pseudo: row.partner_pseudo });
        setScreen("chatting");
      }
    };

    await tryMatch();
    // Poll for a match every 2s (in case someone else joined right after us)
    stopPolling();
    waitingPollRef.current = setInterval(async () => {
      // Check if a session was created where we are user_a
      const { data } = await supabase
        .from("chat_sessions")
        .select("id, pseudo_a, pseudo_b, user_a, user_b, status")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const s = data[0];
        const partner = s.user_a === userId ? s.pseudo_b : s.pseudo_a;
        stopPolling();
        setSession({ id: s.id, partner_pseudo: partner });
        setScreen("chatting");
      }
    }, 2000);
  };

  const cancelSearch = async () => {
    stopPolling();
    await supabase.rpc("cancel_wait", { p_user_id: userId });
    setScreen("idle");
  };

  const endCurrent = async () => {
    if (session) {
      await supabase.rpc("end_session", { p_session_id: session.id, p_user_id: userId });
    }
  };

  const nextPartner = async () => {
    await endCurrent();
    setSession(null);
    setMessages([]);
    await startSearch();
  };

  const leave = async () => {
    await endCurrent();
    setSession(null);
    setMessages([]);
    setScreen("idle");
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const content = input.trim().slice(0, 2000);
    if (!content || !session) return;
    setInput("");
    const { error } = await supabase.from("messages").insert({
      session_id: session.id,
      sender_id: userId,
      sender_pseudo: pseudo,
      content,
    });
    if (error) toast.error("Message non envoyé");
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MessageCircle className="size-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Blabla</span>
          </div>
          {screen === "chatting" && session && (
            <span className="text-xs text-muted-foreground">
              avec <span className="font-medium text-foreground">{session.partner_pseudo}</span>
            </span>
          )}
        </header>

        {screen === "idle" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-8 pb-16 text-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="size-3" />
                100% anonyme, sans compte
              </div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Discute avec un inconnu.
              </h1>
              <p className="mx-auto max-w-md text-muted-foreground">
                Un pseudo, un clic, et te voilà en tête-à-tête avec quelqu'un au hasard.
              </p>
            </div>

            <form onSubmit={startSearch} className="w-full max-w-sm space-y-3">
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Ton pseudo (optionnel)"
                maxLength={24}
                className="w-full rounded-xl border border-input bg-card px-4 py-3 text-center text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.99]"
              >
                Commencer à discuter
              </button>
            </form>
          </section>
        )}

        {screen === "searching" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 pb-16 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <div className="relative grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Recherche d'un inconnu…</h2>
              <p className="mt-1 text-sm text-muted-foreground">On te met en relation dans un instant.</p>
            </div>
            <button
              onClick={cancelSearch}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-secondary"
            >
              Annuler
            </button>
          </section>
        )}

        {(screen === "chatting" || screen === "ended") && session && (
          <>
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto py-4"
            >
              <div className="mx-auto max-w-fit rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                Tu discutes avec {session.partner_pseudo}
              </div>
              {messages.map((m) => {
                const mine = m.sender_id === userId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        mine
                          ? "max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                          : "max-w-[75%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2 text-sm text-secondary-foreground"
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}
              {screen === "ended" && (
                <div className="mx-auto max-w-fit rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                  La conversation est terminée
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-border bg-background/80 py-3 backdrop-blur">
              {screen === "chatting" ? (
                <form onSubmit={sendMessage} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={nextPartner}
                    title="Nouvel inconnu"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card transition hover:bg-secondary"
                  >
                    <SkipForward className="size-4" />
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Écris un message…"
                    maxLength={2000}
                    className="flex-1 rounded-xl border border-input bg-card px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Send className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={leave}
                    title="Quitter"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card transition hover:bg-secondary"
                  >
                    <LogOut className="size-4" />
                  </button>
                </form>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={nextPartner}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    <SkipForward className="size-4" />
                    Nouvel inconnu
                  </button>
                  <button
                    onClick={() => {
                      setSession(null);
                      setMessages([]);
                      setScreen("idle");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition hover:bg-secondary"
                  >
                    Accueil
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

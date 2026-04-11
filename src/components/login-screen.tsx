"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { motion } from "framer-motion";

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const nextPath = useMemo(() => {
    const requested = searchParams.get("next");
    if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
      return "/";
    }
    return requested;
  }, [searchParams]);

  const configError = searchParams.get("error") === "config";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, username }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Não foi possível entrar agora.");
      }

      router.push(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Não foi possível entrar agora.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ backgroundColor: "#060A14" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.28em]" style={{ color: "#22D3EE" }}>
            Radar de Valor
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
            Entrar no painel
          </h1>
        </div>

        {/* Card */}
        <div
          className="rounded-[28px] p-6"
          style={{
            backgroundColor: "#0C1424",
            border: "1px solid #1a2840",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          }}
        >
          {configError ? (
            <InlineAlert
              tone="amber"
              message="Autenticação não configurada. Defina AUTH_SECRET e pelo menos um login nas variáveis de ambiente."
            />
          ) : null}
          {error ? <InlineAlert tone="rose" message={error} /> : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field
              icon={UserRound}
              label="Usuário"
              type="text"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              placeholder="Seu usuário"
            />
            <Field
              icon={LockKeyhole}
              label="Senha"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Sua senha"
            />

            <button
              type="submit"
              disabled={isPending}
              className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition-all disabled:cursor-wait disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, #22D3EE 0%, #0EA5E9 100%)",
                color: "#060A14",
                boxShadow: isPending ? "none" : "0 0 24px rgba(34,211,238,0.30)",
              }}
            >
              {isPending ? "Validando..." : "Entrar"}
              {!isPending && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span
        className="mb-2 block text-[10px] font-medium uppercase tracking-[0.2em]"
        style={{ color: "#64748B" }}
      >
        {label}
      </span>
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors focus-within:border-[#22D3EE]"
        style={{ backgroundColor: "#0a1020", border: "1px solid #1e2d42" }}
      >
        <Icon className="h-4 w-4 flex-shrink-0 text-slate-500" />
        <input
          className="w-full border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
        />
      </div>
    </label>
  );
}

function InlineAlert({ tone, message }: { tone: "amber" | "rose"; message: string }) {
  const styles = {
    amber: {
      backgroundColor: "rgba(251,191,36,0.10)",
      border: "1px solid rgba(251,191,36,0.22)",
      color: "#FCD34D",
    },
    rose: {
      backgroundColor: "rgba(244,63,94,0.10)",
      border: "1px solid rgba(244,63,94,0.18)",
      color: "#FDA4AF",
    },
  }[tone];

  return (
    <div className="mb-4 rounded-2xl px-4 py-3 text-sm leading-6" style={styles}>
      {message}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";
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
        body: JSON.stringify({
          password,
          username,
        }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Não foi possível entrar agora.");
      }

      router.push(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível entrar agora.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
      style={{ backgroundColor: "#060A14" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 15% 18%, rgba(34,211,238,0.16), transparent 30%), radial-gradient(circle at 82% 12%, rgba(249,115,22,0.18), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.02), transparent 45%)",
        }}
      />

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch gap-6 xl:grid-cols-[1.1fr_460px]">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[32px] border p-8 sm:p-10 xl:p-12"
          style={{
            background:
              "linear-gradient(145deg, rgba(10,15,27,0.96), rgba(16,24,42,0.92))",
            borderColor: "rgba(148,163,184,0.15)",
            boxShadow: "0 24px 120px rgba(2,6,23,0.55)",
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "linear-gradient(120deg, rgba(34,211,238,0.06), transparent 36%, rgba(249,115,22,0.08) 88%)",
            }}
          />

          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Tag label="Acesso privado" />
                <Tag label="Sessão assinada" />
                <Tag label="Painel pessoal" />
              </div>

              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
                  Radar de Valor
                </p>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.08em] text-white sm:text-5xl xl:text-[4.25rem]">
                  Seu painel entra só com credencial válida e sessão protegida.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
                  O login agora bloqueia o site inteiro antes da renderização. A sessão
                  fica em cookie assinado, `httpOnly` e fora do alcance do navegador.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={ShieldCheck}
                title="Barreira real"
                description="Sem login, o dashboard e a API ficam fechados."
              />
              <FeatureCard
                icon={LockKeyhole}
                title="Cookie seguro"
                description="Sessão assinada, `sameSite=lax` e `secure` em produção."
              />
              <FeatureCard
                icon={Sparkles}
                title="Fluxo limpo"
                description="Entrou, analisa. Saiu, o site fecha de novo."
              />
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          className="flex min-h-full flex-col justify-center rounded-[32px] border p-6 sm:p-8"
          style={{
            background:
              "linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.92))",
            borderColor: "rgba(255,255,255,0.14)",
            boxShadow: "0 24px 90px rgba(15,23,42,0.30)",
          }}
        >
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
              Login seguro
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
              Entrar no painel
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Use um dos logins definidos nas variáveis de ambiente do projeto.
            </p>
          </div>

          {configError ? (
            <InlineAlert
              tone="amber"
              message="Autenticação ainda não configurada neste ambiente. Defina AUTH_SECRET e pelo menos um login em AUTH_USERNAME/AUTH_PASSWORD ou AUTH_USERS_JSON."
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
              className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition-all disabled:cursor-wait disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, #0F172A, #111827 45%, #0EA5E9 180%)",
                color: "#F8FAFC",
              }}
            >
              {isPending ? "Validando acesso..." : "Entrar"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Segurança aplicada
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>Bloqueio do painel por rota antes da renderização.</li>
              <li>Cookie de sessão assinado e invisível ao JavaScript.</li>
              <li>Proteção também na API, não só na interface.</li>
            </ul>
          </div>
        </motion.section>
      </div>
    </main>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]"
      style={{
        backgroundColor: "rgba(15,23,42,0.52)",
        border: "1px solid rgba(148,163,184,0.18)",
        color: "#CFFAFE",
      }}
    >
      {label}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-3xl p-5"
      style={{
        backgroundColor: "rgba(8,13,24,0.56)",
        border: "1px solid rgba(148,163,184,0.12)",
      }}
    >
      <div
        className="inline-flex rounded-2xl p-3"
        style={{
          backgroundColor: "rgba(34,211,238,0.10)",
          border: "1px solid rgba(34,211,238,0.20)",
        }}
      >
        <Icon className="h-5 w-5 text-cyan-300" />
      </div>
      <p className="mt-4 text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
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
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors focus-within:border-slate-950/20">
        <Icon className="h-4 w-4 text-slate-400" />
        <input
          className="w-full border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
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

function InlineAlert({
  tone,
  message,
}: {
  tone: "amber" | "rose";
  message: string;
}) {
  const toneStyles = {
    amber: {
      backgroundColor: "rgba(251,191,36,0.12)",
      border: "1px solid rgba(251,191,36,0.24)",
      color: "#92400E",
    },
    rose: {
      backgroundColor: "rgba(244,63,94,0.10)",
      border: "1px solid rgba(244,63,94,0.18)",
      color: "#9F1239",
    },
  }[tone];

  return (
    <div className="mb-4 rounded-2xl px-4 py-3 text-sm leading-6" style={toneStyles}>
      {message}
    </div>
  );
}

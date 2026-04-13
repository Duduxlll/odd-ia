import { Loader2 } from "lucide-react";

export default function ProgressionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        <p className="text-sm text-slate-500">Carregando progressão...</p>
      </div>
    </div>
  );
}

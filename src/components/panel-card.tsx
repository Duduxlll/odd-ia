import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export function PanelCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] p-5 sm:p-6"
      style={{
        backgroundColor: "#0C1424",
        border: "1px solid #1a2840",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{subtitle}</p>
          <h2 className="mt-1.5 truncate text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">
            {title}
          </h2>
        </div>
        <div
          className="flex-shrink-0 rounded-2xl p-3"
          style={{
            backgroundColor: "rgba(34,211,238,0.12)",
            border: "1px solid rgba(34,211,238,0.22)",
          }}
        >
          <Icon className="h-4 w-4 text-[#22D3EE] sm:h-5 sm:w-5" />
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

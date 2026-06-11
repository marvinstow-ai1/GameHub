"use client";

import { motion } from "framer-motion";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- Button ---------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "display inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-all",
        "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none",
        size === "sm" && "px-3 py-2 text-sm",
        size === "md" && "px-5 py-3 text-base",
        size === "lg" && "px-7 py-4 text-lg",
        variant === "primary" &&
          "bg-[var(--accent)] text-[#0e0e10] shadow-[0_4px_24px_var(--accent-soft)] hover:brightness-110",
        variant === "ghost" &&
          "border border-[var(--line)] bg-transparent text-[var(--fg)] hover:bg-[var(--bg-3)]",
        variant === "soft" && "bg-[var(--accent-soft)] text-[var(--fg)] hover:brightness-125",
        variant === "danger" && "bg-coral text-white hover:brightness-110",
        className
      )}
      {...props}
    />
  );
});

/* ---------------- Panel ---------------- */

export function Panel({
  className,
  children,
  glow,
}: {
  className?: string;
  children: React.ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--line)] bg-[var(--bg-2)]/80 backdrop-blur-xl p-5",
        glow && "shadow-[0_0_60px_-12px_var(--accent-soft)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ---------------- Input ---------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-3)] px-4 py-3",
          "text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none",
          "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all",
          className
        )}
        {...props}
      />
    );
  }
);

/* ---------------- Avatar (Initials) ---------------- */

export function Avatar({
  name,
  hue,
  size = 40,
  online,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/[\s_-]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className="display flex h-full w-full items-center justify-center rounded-full font-bold text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 50) % 360} 80% 45%))`,
          fontSize: size * 0.38,
        }}
      >
        {initials || "?"}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-[var(--bg-2)]",
            online ? "bg-mint" : "bg-[var(--fg-muted)]"
          )}
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </span>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--bg-2)] p-6 shadow-2xl"
      >
        {title && <h3 className="mb-4 text-xl font-bold">{title}</h3>}
        {children}
      </motion.div>
    </div>
  );
}

/* ---------------- Badges & bits ---------------- */

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-3)] px-3 py-1 text-xs font-medium text-[var(--fg-muted)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent",
        className
      )}
    />
  );
}

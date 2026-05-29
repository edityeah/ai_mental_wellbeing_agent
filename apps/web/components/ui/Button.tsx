import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-sage text-cream hover:bg-sage-dark",
        variant === "ghost" && "text-sage hover:bg-cream-warm",
        className,
      )}
      {...props}
    />
  );
}

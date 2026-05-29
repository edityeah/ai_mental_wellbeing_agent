import { cn } from "@/lib/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-cream-edge bg-white px-4 py-2.5 text-sm placeholder:text-mute focus:border-sage focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

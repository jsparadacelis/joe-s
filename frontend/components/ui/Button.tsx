import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "point";
export type ButtonSize = "md" | "sm";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
};

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-surface text-ink border-hair hover:border-line",
  primary: "bg-ink text-bg border-ink hover:bg-ink-2",
  point: "bg-point text-on-point border-point hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-3 py-[7px] text-s",
  sm: "px-[9px] py-1 text-xs",
};

/** Classes of a button; shared with `ButtonLink` so a link that looks like a button uses the same tokens. */
export function buttonClassName(variant: ButtonVariant = "default", size: ButtonSize = "md", className = ""): string {
  return `inline-flex items-center gap-2 rounded-base border font-medium disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant = "default",
  size = "md",
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...rest} />;
}

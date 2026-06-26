import "./CalendarMonthLayout.css";
import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: "overview" | "page";
};

export function CalendarMonthLayout({ children, variant = "page", className, ...props }: Props) {
  const classes = ["cal-month-layout", `cal-month-layout--${variant}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

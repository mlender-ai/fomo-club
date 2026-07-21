import type { CSSProperties, ReactNode } from "react";

type DepthSectionVariant = "card" | "list";

export function DepthSection({
  title,
  description,
  aside,
  variant = "card",
  children,
  className = "",
  ariaLabelledby,
}: {
  title?: string;
  description?: string;
  aside?: ReactNode;
  variant?: DepthSectionVariant;
  children: ReactNode;
  className?: string;
  ariaLabelledby?: string;
}) {
  const shell = variant === "card"
    ? "rounded-lg border border-hairline bg-surface px-4 py-4"
    : "border-y border-hairline";
  const header = variant === "card" ? "mb-3" : "px-0 py-3";

  return (
    <section className={`${shell} ${className}`.trim()} aria-labelledby={ariaLabelledby}>
      {(title || description || aside) && (
        <div className={`flex items-start justify-between gap-3 ${header}`}>
          <div className="min-w-0">
            {title && <h2 className="font-pixel text-sm text-whiteout">{title}</h2>}
            {description && <p className="mt-1 text-[11px] leading-5 text-muted">{description}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      )}
      <div className={variant === "list" ? "divide-y divide-hairline" : ""}>{children}</div>
    </section>
  );
}

export function DepthLine({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`py-3 ${className}`.trim()} style={style}>{children}</div>;
}

export function DepthFold({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-y border-hairline">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-whiteout">
        <span>
          {title}
          {summary && <span className="ml-2 text-[11px] font-normal text-muted">{summary}</span>}
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

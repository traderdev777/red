import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * The only way to render an icon in RED. Lucide, 1.5px stroke, sized on the 4px grid.
 * Decorative by default (aria-hidden); pass `label` when the icon carries meaning alone.
 */
export function Icon({
  as: Glyph,
  size = 16,
  label,
  ...rest
}: { as: LucideIcon; size?: 12 | 16 | 20 | 24; label?: string } & Omit<LucideProps, "size">) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      absoluteStrokeWidth
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      {...rest}
    />
  );
}

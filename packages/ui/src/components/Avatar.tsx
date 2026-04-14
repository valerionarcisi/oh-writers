import styles from "./Avatar.module.css";

type Size = "sm" | "md" | "lg";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: Size;
  className?: string;
}

const initials = (name: string): string =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const classes = [styles.avatar, styles[size], className ?? ""]
    .filter(Boolean)
    .join(" ");

  if (src) {
    return <img className={classes} src={src} alt={name} />;
  }

  return (
    <span className={classes} aria-label={name}>
      {initials(name)}
    </span>
  );
}

// packages/ui/src/icons/Icon.tsx
import {
  Home,
  Search,
  Bell,
  Clock,
  Plus,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Download,
  Upload,
  RefreshCw,
  Pin,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  MessageSquare,
  AtSign,
  Mic,
  Play,
  Pause,
  ArrowLeftRight,
  GitBranch,
  Compass,
  MapPin,
  Camera,
  Clipboard,
  Check,
  Book,
  FileText,
  HelpCircle,
  X,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "./icon-names";
import styles from "./Icon.module.css";

// Every ICON_NAME maps to its lucide-react component. Kept as a plain map
// (not a switch) so adding a name to icon-names.ts and forgetting to map it
// here is a type error, not a silent blank icon.
const LUCIDE_ICONS: Record<IconName, LucideIcon> = {
  home: Home,
  search: Search,
  bell: Bell,
  clock: Clock,
  plus: Plus,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  external: ExternalLink,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  pin: Pin,
  lock: Lock,
  unlock: Unlock,
  eye: Eye,
  "eye-off": EyeOff,
  comment: MessageSquare,
  at: AtSign,
  mic: Mic,
  play: Play,
  pause: Pause,
  "arrows-lr": ArrowLeftRight,
  "git-branch": GitBranch,
  compass: Compass,
  "map-pin": MapPin,
  camera: Camera,
  clipboard: Clipboard,
  check: Check,
  book: Book,
  "file-text": FileText,
  help: HelpCircle,
  close: X,
  more: MoreHorizontal,
};

export type IconProps = {
  name: IconName;
  size?: number | string;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
};

export function Icon({
  name,
  size = 16,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: IconProps) {
  const isDecorative = ariaLabel === undefined;
  const LucideComponent = LUCIDE_ICONS[name];
  return (
    <LucideComponent
      className={[styles.icon, className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      strokeWidth={1.8}
      role={isDecorative ? "presentation" : "img"}
      aria-hidden={isDecorative ? true : ariaHidden}
      aria-label={ariaLabel}
    />
  );
}

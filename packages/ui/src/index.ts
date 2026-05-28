export { Button } from "./components/Button";
export { Badge } from "./components/Badge";
export { Input } from "./components/Input";
export { FormField } from "./components/FormField";
export { Avatar } from "./components/Avatar";
export { Skeleton, SkeletonCard } from "./components/Skeleton";
export { EmptyState } from "./components/EmptyState";
export { Kbd } from "./components/Kbd";
export { Tabs } from "./components/Tabs";
export { Dialog } from "./components/Dialog";
export { Toast } from "./components/Toast";
export { ToastProvider, useToast } from "./components/ToastProvider";
export type {
  ToastOptions,
  ToastVariant,
  UseToast,
} from "./components/ToastProvider";
export { ConfirmDialog } from "./components/ConfirmDialog";
export type { ConfirmDialogProps } from "./components/ConfirmDialog";
export {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "./components/ConfirmDialogProvider";
export type {
  ConfirmOptions,
  UseConfirmDialog,
} from "./components/ConfirmDialogProvider";
export { Tag } from "./components/Tag";
export type { TagProps, TagVariant } from "./components/Tag";
export { Banner } from "./components/Banner";
export type {
  BannerProps,
  BannerVariant,
  BannerAction,
} from "./components/Banner";
export { ContextMenu } from "./components/ContextMenu";
export type {
  ContextMenuProps,
  ContextMenuItem,
} from "./components/ContextMenu";
export { DropdownMenu } from "./components/DropdownMenu";
export type {
  DropdownMenuProps,
  DropdownMenuItem,
  DropdownMenuAlign,
} from "./components/DropdownMenu";
export { DataTable } from "./components/DataTable";
export type { DataTableProps, Column } from "./components/DataTable";
export { EditableCell } from "./components/EditableCell";
export type { EditableCellProps } from "./components/EditableCell";
export { MatrixGrid } from "./components/MatrixGrid";
export type {
  MatrixGridProps,
  MatrixColumn,
  MatrixRow,
} from "./components/MatrixGrid";
export { Progress } from "./components/Progress";
export type { ProgressProps } from "./components/Progress";
export { StreamingProgressBanner } from "./components/StreamingProgressBanner";
export type { StreamingProgressBannerProps } from "./components/StreamingProgressBanner";
export { InlineGenerateButton } from "./components/InlineGenerateButton";
export type { InlineGenerateButtonProps } from "./components/InlineGenerateButton";
export { SubjectFooter } from "./components/SubjectFooter";
export type {
  SubjectFooterProps,
  SubjectFooterLabels,
  SubjectLength,
} from "./components/SubjectFooter";

// ─── DS-v2 ──────────────────────────────────────────────────
export { Icon } from "./icons/Icon";
export type { IconProps } from "./icons/Icon";
export type { IconName } from "./icons/icon-names";
export { ICON_NAMES } from "./icons/icon-names";
export { SpriteLoader } from "./icons/SpriteLoader";

// ─── DS-v2 Primitives ───────────────────────────────────────
export { Scrim } from "./primitives/Scrim/Scrim";
export type { ScrimProps } from "./primitives/Scrim/Scrim";

export { Pill } from "./primitives/Pill/Pill";
export type { PillProps, PillTone, PillSize } from "./primitives/Pill/Pill";

export { ToggleChip } from "./primitives/ToggleChip/ToggleChip";
export type { ToggleChipProps } from "./primitives/ToggleChip/ToggleChip";

export { Tooltip } from "./primitives/Tooltip/Tooltip";
export type {
  TooltipProps,
  TooltipKind,
  TooltipPlacement,
} from "./primitives/Tooltip/Tooltip";

export { Popover } from "./primitives/Popover/Popover";
export type {
  PopoverProps,
  PopoverPlacement,
} from "./primitives/Popover/Popover";

export { Drawer } from "./primitives/Drawer/Drawer";
export type { DrawerProps, DrawerSide } from "./primitives/Drawer/Drawer";

export { SavePill } from "./primitives/SavePill/SavePill";
export type { SavePillProps, SaveState } from "./primitives/SavePill/SavePill";

export { Presence } from "./primitives/Presence/Presence";
export type {
  PresenceProps,
  PresenceUser,
} from "./primitives/Presence/Presence";

export { Button as DsButton } from "./primitives/Button/Button";
export type {
  ButtonProps as DsButtonProps,
  ButtonVariant,
  ButtonSize,
} from "./primitives/Button/Button";

export { Modal } from "./primitives/Modal/Modal";
export type { ModalProps, ModalSize } from "./primitives/Modal/Modal";

export { DocStats } from "./primitives/DocStats/DocStats";
export type { DocStatsProps, DocStat } from "./primitives/DocStats/DocStats";

export { VersionTrigger } from "./primitives/VersionTrigger/VersionTrigger";
export type {
  VersionTriggerProps,
  VersionTriggerVariant,
  VersionMenuItem,
} from "./primitives/VersionTrigger/VersionTrigger";

export { ViewSwitcher } from "./primitives/ViewSwitcher/ViewSwitcher";
export type {
  ViewSwitcherProps,
  ViewSwitcherOption,
} from "./primitives/ViewSwitcher/ViewSwitcher";

export { SegmentedControl } from "./primitives/SegmentedControl/SegmentedControl";
export type {
  SegmentedControlProps,
  SegmentedControlOption,
} from "./primitives/SegmentedControl/SegmentedControl";

// ─── DS-v2 Shell ────────────────────────────────────────────
export { SkipLink } from "./shell/SkipLink/SkipLink";
export type { SkipLinkProps } from "./shell/SkipLink/SkipLink";

export { TopBar } from "./shell/TopBar/TopBar";
export type {
  TopBarProps,
  TopBarSection,
  TopBarSectionGroup,
} from "./shell/TopBar/TopBar";
export { ProjectSwitcherPopover } from "./shell/TopBar/ProjectSwitcherPopover";
export type {
  ProjectSwitcherItem,
  ProjectSwitcherPopoverProps,
} from "./shell/TopBar/ProjectSwitcherPopover";

export { Viewbar, ViewbarSep } from "./shell/Viewbar/Viewbar";
export type { ViewbarProps } from "./shell/Viewbar/Viewbar";

export { FloatingDock } from "./shell/FloatingDock/FloatingDock";
export type {
  FloatingDockProps,
  DockAction,
} from "./shell/FloatingDock/FloatingDock";

export { CommandPalette } from "./shell/CommandPalette/CommandPalette";
export type {
  CommandPaletteProps,
  CommandPaletteItem,
} from "./shell/CommandPalette/CommandPalette";

// ─── DS-v2 Composites ───────────────────────────────────────
export { HeroKPI } from "./composites/HeroKPI/HeroKPI";
export type {
  HeroKPIProps,
  DeltaDirection,
} from "./composites/HeroKPI/HeroKPI";

export { MarginNote } from "./composites/MarginNote/MarginNote";
export type {
  MarginNoteProps,
  MarginNoteKind,
} from "./composites/MarginNote/MarginNote";

export { CollapsibleNote } from "./composites/CollapsibleNote/CollapsibleNote";
export type {
  CollapsibleNoteProps,
  CollapsibleNoteKind,
} from "./composites/CollapsibleNote/CollapsibleNote";

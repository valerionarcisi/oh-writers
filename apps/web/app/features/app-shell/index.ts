export { AppShell } from "./components/AppShell";
export { RouteErrorBoundary } from "./components/RouteErrorBoundary";
export { SaveStatusIndicator } from "./components/SaveStatusIndicator";
export { CesareLiveDiff } from "./components/CesareLiveDiff";
export {
  getLiveDiffState,
  flashLiveDiff,
  subscribeLiveDiff,
} from "./cesare-live-diff-store";
export type {
  LiveDiffState,
  LiveDiffFlash,
  LiveDiffMode,
  LiveDiffSegment,
} from "./cesare-live-diff-store";
export {
  peekSearchSchema,
  parseCesarePeek,
  isCesarePeek,
  CESARE_PEEK_TOKEN,
  InvalidPeekError,
} from "./cesare-peek";
export type { CesarePeek, PeekSearch } from "./cesare-peek";
export {
  versionsSearchSchema,
  parseVersionsPeek,
  parseVersionsCompare,
  serializeVersionsCompare,
  InvalidVersionsPeekError,
  InvalidVersionsCompareError,
  VERSIONS_SURFACE_STATES,
} from "./versions-peek";
export type {
  VersionsPeek,
  VersionsCompare,
  VersionsSearch,
  VersionsSurfaceState,
} from "./versions-peek";
export { useRoutedSurface } from "./use-routed-surface";
export type {
  UseRoutedSurfaceResult,
  UseRoutedSurfaceOptions,
} from "./use-routed-surface";
export { useContextActions } from "./use-context-actions";
export type {
  ContextActionHandler,
  ContextActionHandlers,
} from "./use-context-actions";
export {
  SaveStateProvider,
  useSaveStatePublisher,
  useSaveStateValue,
} from "./save-state-context";
export {
  TopBarSlotsProvider,
  useTopBarSlots,
  useTopBarSlotPublisher,
} from "./top-bar-slots-context";
export { useCesareOpen } from "./cesare-context";
export { useCesareSessionFocus } from "./cesare-session-focus-context";
export {
  useShellFocusRequest,
  useRequestShellFocus,
} from "./shell-focus-request-context";
export {
  CesareSurfaceProvider,
  useCesareSurface,
  useRegisterCesareSurface,
} from "./cesare-surface-context";
export {
  SplitDrawerProvider,
  useSplitDrawer,
  useBellOpener,
} from "./split-drawer-context";
export type {
  SplitDrawerPayload,
  SplitDrawerPreviewPayload,
  SplitDrawerPreviewDiff,
  SplitDrawerNotificationsPayload,
} from "./split-drawer-context";
export {
  SplitToggleProvider,
  useSplitToggle,
  useRegisterSplitOpener,
} from "./split-toggle-context";
export {
  getLiveEditState,
  getLiveEditsFor,
  publishLiveEdits,
  dismissLiveEdit,
  clearLiveEdits,
  subscribeLiveEdit,
  reportCurrentVersion,
} from "./cesare-live-edit-store";
export type {
  LiveEdit,
  LiveEditState,
  LiveEditSegment,
} from "./cesare-live-edit-store";
export {
  ActiveSceneProvider,
  useActiveScene,
  useSetActiveScene,
  useActiveRequirementId,
  useSetActiveRequirementId,
  useActiveDocument,
  useSetActiveDocument,
  useActiveShootingDay,
  useSetActiveShootingDay,
} from "./active-scene-context";
export type { ActiveDocument, ActiveShootingDay } from "./active-scene-context";
export {
  CesareNotificationProvider,
  useCesareNotifications,
} from "./cesare-notification-context";
export type {
  CesareNotification,
  NotificationStatus,
  AffectedEntity,
  AffectedEntityKind,
} from "./cesare-notification-context";

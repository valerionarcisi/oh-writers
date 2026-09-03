/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider } from "@oh-writers/ui";
import { UserSettingsPage } from "./UserSettingsPage";
import { FeatureProvider } from "~/features/feature-flags";
import { LocaleProvider } from "~/features/i18n";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => (
      <a {...props}>{children}</a>
    ),
  };
});

vi.mock("../server/user-settings.server", () => ({
  updateUserProfile: vi.fn(),
  updateUserLocale: vi.fn(),
  userProfileQueryOptions: () => ({
    queryKey: ["user", "profile"],
    queryFn: async () => ({
      isOk: true,
      value: { name: "User", email: "user@example.com", avatarUrl: null },
    }),
  }),
  userAccountProvidersQueryOptions: () => ({
    queryKey: ["user", "providers"],
    queryFn: async () => ({ isOk: true, value: { hasPassword: false } }),
  }),
  userTeamsQueryOptions: () => ({
    queryKey: ["user", "teams"],
    queryFn: async () => ({ isOk: true, value: [] }),
  }),
}));

function renderSettings({
  isAiEnabled,
}: {
  isAiEnabled: boolean;
}): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale="en">
        <FeatureProvider
          locale="en"
          isDevEnvironment={false}
          isAiEnabled={isAiEnabled}
        >
          <ConfirmDialogProvider>
            <UserSettingsPage userName="User" userEmail="user@example.com" />
          </ConfirmDialogProvider>
        </FeatureProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("UserSettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the SSO explanatory message instead of a password form when the account has no password", async () => {
    renderSettings({ isAiEnabled: true });

    expect(await screen.findByText(/no password to manage here/i)).toBeTruthy();
    expect(screen.queryByTestId("current-password-input")).toBeNull();
  });

  it("hides the AI settings section when Features.AI_ENABLED is off", async () => {
    renderSettings({ isAiEnabled: false });

    await screen.findByText(/no password to manage here/i);
    expect(screen.queryByTestId("ai-settings-link")).toBeNull();
  });

  it("shows the AI settings section when Features.AI_ENABLED is on", async () => {
    renderSettings({ isAiEnabled: true });

    expect(await screen.findByTestId("ai-settings-link")).toBeTruthy();
  });
});

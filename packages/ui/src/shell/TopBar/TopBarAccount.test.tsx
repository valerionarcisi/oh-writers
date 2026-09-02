// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TopBarAccount, type TopBarAccountActions } from "./TopBarAccount";

afterEach(cleanup);

const labels = {
  notifications: "Notifiche",
  notificationsUnread: "Notifiche — nuove",
  profile: "Profilo",
  settings: "Impostazioni",
  account: "Account",
  toggleSplit: "Attiva/disattiva split",
};

const baseAccount: TopBarAccountActions = {
  onBell: vi.fn(),
  onAvatar: vi.fn(),
  hasUnreadNotifications: false,
  avatarLabel: "VN",
  avatarImageUrl: null,
};

describe("TopBarAccount — avatar", () => {
  it("shows initials when avatarImageUrl is null", () => {
    const { getByText, queryByRole } = render(
      <TopBarAccount account={baseAccount} labels={labels} />,
    );
    expect(getByText("VN")).toBeTruthy();
    expect(queryByRole("img")).toBeNull();
  });

  it("shows the profile photo when avatarImageUrl is set", () => {
    const { getByRole, queryByText } = render(
      <TopBarAccount
        account={{
          ...baseAccount,
          avatarImageUrl: "https://example.com/a.png",
        }}
        labels={labels}
      />,
    );
    const img = getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/a.png");
    expect(img.alt).toBe("VN");
    expect(queryByText("VN")).toBeNull();
  });

  it("falls back to initials when the image fails to load", () => {
    const { getByRole, getByText, queryByRole } = render(
      <TopBarAccount
        account={{
          ...baseAccount,
          avatarImageUrl: "https://example.com/broken.png",
        }}
        labels={labels}
      />,
    );
    fireEvent.error(getByRole("img"));
    expect(getByText("VN")).toBeTruthy();
    expect(queryByRole("img")).toBeNull();
  });

  it("shows the profile photo inside the avatar dropdown when avatarMenuItems is set", () => {
    const { getByRole } = render(
      <TopBarAccount
        account={{
          ...baseAccount,
          avatarImageUrl: "https://example.com/a.png",
          avatarMenuItems: [{ label: "Sign out", onClick: vi.fn() }],
        }}
        labels={labels}
      />,
    );
    expect((getByRole("img") as HTMLImageElement).src).toBe(
      "https://example.com/a.png",
    );
  });
});

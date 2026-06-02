import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  act,
  within,
} from "@testing-library/react";
import { VersionTrigger } from "./VersionTrigger";

const flushRaf = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

afterEach(cleanup);

describe("VersionTrigger — no menu (action mode)", () => {
  it("calls onClick when pressed and advertises a dialog popup", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v3" onClick={onClick} />,
    );
    const trigger = getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the version label for the pill variant", () => {
    const { getByText } = render(
      <VersionTrigger variant="pill" versionLabel="Bozza 2" />,
    );
    expect(getByText("Bozza 2")).toBeTruthy();
  });
});

describe("VersionTrigger — menu mode", () => {
  const buildItems = () => {
    const onSelectA = vi.fn();
    const onSelectB = vi.fn();
    return {
      onSelectA,
      onSelectB,
      items: [
        { id: "a", label: "Compara", onSelect: onSelectA },
        { id: "b", label: "Apri versioni", onSelect: onSelectB },
      ],
    };
  };

  it("advertises a menu popup and is closed initially", () => {
    const { onSelectA, onSelectB, items } = buildItems();
    void onSelectA;
    void onSelectB;
    const { getByRole, queryByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    const trigger = getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(queryByRole("menu")).toBeNull();
  });

  it("opens the menu on trigger press and renders the items", () => {
    const { items } = buildItems();
    const { getByRole, getAllByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    const trigger = getByRole("button", { expanded: false });
    fireEvent.click(trigger);
    expect(getByRole("menu")).toBeTruthy();
    expect(getAllByRole("menuitem")).toHaveLength(2);
    // The trigger is the only button advertising aria-expanded (the Popover's
    // hidden DismissButtons are also `button` role but carry no aria-expanded).
    expect(getByRole("button", { expanded: true })).toBeTruthy();
  });

  it("moves focus through items with ArrowDown / ArrowUp", async () => {
    const { items } = buildItems();
    const { getByRole, getAllByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    fireEvent.click(getByRole("button"));
    await flushRaf();
    const menu = getByRole("menu");
    const menuItems = getAllByRole("menuitem");

    // autoFocus lands on the first item.
    expect(document.activeElement).toBe(menuItems[0]);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(menuItems[1]);

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(menuItems[0]);
  });

  it("fires onSelect and closes when Enter is pressed on an item", async () => {
    const { onSelectB, items } = buildItems();
    const { getByRole, getAllByRole, queryByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    fireEvent.click(getByRole("button", { expanded: false }));
    await flushRaf();
    const menu = getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const second = getAllByRole("menuitem")[1]!;
    fireEvent.keyDown(second, { key: "Enter" });
    fireEvent.keyUp(second, { key: "Enter" });
    expect(onSelectB).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
  });

  it("fires onSelect on click and closes", () => {
    const { onSelectA, items } = buildItems();
    const { getByRole, queryByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    fireEvent.click(getByRole("button"));
    const item = within(getByRole("menu")).getByText("Compara");
    fireEvent.click(item);
    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { items } = buildItems();
    const { getByRole, queryByRole } = render(
      <VersionTrigger variant="pill" versionLabel="v1" menuItems={items} />,
    );
    const trigger = getByRole("button");
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    await flushRaf();
    expect(document.activeElement).toBe(trigger);
  });

  it("applies the muted class to muted-tone items", () => {
    const { getByRole, getByText } = render(
      <VersionTrigger
        variant="pill"
        versionLabel="v1"
        menuItems={[
          { id: "x", label: "Corrente", onSelect: vi.fn(), tone: "default" },
          { id: "y", label: "Vecchia", onSelect: vi.fn(), tone: "muted" },
        ]}
      />,
    );
    fireEvent.click(getByRole("button"));
    expect(getByText("Vecchia").className).toMatch(/menuItemMuted/);
    expect(getByText("Corrente").className).not.toMatch(/menuItemMuted/);
  });
});

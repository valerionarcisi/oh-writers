import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { ViewSwitcher } from "./ViewSwitcher";

const flushRaf = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

afterEach(cleanup);

const options = [
  { id: "list", label: "Lista" },
  { id: "board", label: "Bacheca", hint: "drag & drop" },
  { id: "calendar", label: "Calendario" },
] as const;

describe("ViewSwitcher", () => {
  it("renders the active label and a menu popup trigger", () => {
    const { getByRole } = render(
      <ViewSwitcher options={options} activeId="board" onSelect={vi.fn()} />,
    );
    const trigger = getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Bacheca");
  });

  it("uses the custom aria-label when provided", () => {
    const { getByRole } = render(
      <ViewSwitcher
        options={options}
        activeId="list"
        onSelect={vi.fn()}
        ariaLabel="Cambia vista"
      />,
    );
    expect(getByRole("button").getAttribute("aria-label")).toBe("Cambia vista");
  });

  it("opens the menu and marks the active option with aria-current", () => {
    const { getByRole, getAllByRole } = render(
      <ViewSwitcher options={options} activeId="board" onSelect={vi.fn()} />,
    );
    fireEvent.click(getByRole("button"));
    const items = getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    const current = items.filter(
      (el) => el.getAttribute("aria-current") === "true",
    );
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Bacheca");
  });

  it("renders hints for options that have them", () => {
    const { getByRole, getByText } = render(
      <ViewSwitcher options={options} activeId="list" onSelect={vi.fn()} />,
    );
    fireEvent.click(getByRole("button"));
    expect(getByText("drag & drop")).toBeTruthy();
  });

  it("renders the headerSlot above the list", () => {
    const { getByRole, getByText } = render(
      <ViewSwitcher
        options={options}
        activeId="list"
        onSelect={vi.fn()}
        headerSlot={<span>Scegli una vista</span>}
      />,
    );
    fireEvent.click(getByRole("button"));
    expect(getByText("Scegli una vista")).toBeTruthy();
  });

  it("moves focus through items with arrow keys", async () => {
    const { getByRole, getAllByRole } = render(
      <ViewSwitcher options={options} activeId="list" onSelect={vi.fn()} />,
    );
    fireEvent.click(getByRole("button"));
    await flushRaf();
    const menu = getByRole("menu");
    const items = getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("fires onSelect with the option id and closes on Enter", async () => {
    const onSelect = vi.fn();
    const { getByRole, getAllByRole, queryByRole } = render(
      <ViewSwitcher options={options} activeId="list" onSelect={onSelect} />,
    );
    fireEvent.click(getByRole("button", { expanded: false }));
    await flushRaf();
    const menu = getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const second = getAllByRole("menuitem")[1]!;
    fireEvent.keyDown(second, { key: "Enter" });
    fireEvent.keyUp(second, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("board");
    expect(queryByRole("menu")).toBeNull();
  });

  it("fires onSelect on click", () => {
    const onSelect = vi.fn();
    const { getByRole, getByText, queryByRole } = render(
      <ViewSwitcher options={options} activeId="list" onSelect={onSelect} />,
    );
    fireEvent.click(getByRole("button"));
    fireEvent.click(getByText("Calendario"));
    expect(onSelect).toHaveBeenCalledWith("calendar");
    expect(queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { getByRole, queryByRole } = render(
      <ViewSwitcher options={options} activeId="list" onSelect={vi.fn()} />,
    );
    const trigger = getByRole("button");
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    await flushRaf();
    expect(document.activeElement).toBe(trigger);
  });
});

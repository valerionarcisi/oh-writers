// packages/ui/src/icons/Icon.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders an SVG for the named icon", () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // lucide-react adds a per-icon `lucide-<kebab-name>` CSS class to every
    // rendered svg; a stable way to assert the right icon rendered without
    // depending on lucide's internal path markup.
    expect(svg!.getAttribute("class")).toContain("lucide-search");
  });

  it("uses default size 16x16 when not specified", () => {
    const { container } = render(<Icon name="bell" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  it("accepts custom size", () => {
    const { container } = render(<Icon name="bell" size={24} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("is decorative by default (aria-hidden true, role presentation)", () => {
    const { container } = render(<Icon name="close" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBe("presentation");
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("becomes meaningful when aria-label is provided", () => {
    const { container } = render(<Icon name="close" aria-label="Chiudi" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Chiudi");
    expect(svg.getAttribute("aria-hidden")).not.toBe("true");
  });
});

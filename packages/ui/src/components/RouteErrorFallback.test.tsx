import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { RouteErrorFallback } from "./RouteErrorFallback";

const labels = {
  title: "Qualcosa è andato storto",
  body: "Errore imprevisto.",
  retry: "Riprova",
  home: "Torna alla dashboard",
  showDetails: "Mostra dettagli",
  hideDetails: "Nascondi dettagli",
};

afterEach(cleanup);

describe("RouteErrorFallback", () => {
  it("renders the branded title, body and retry", () => {
    const { getByTestId, getByText } = render(
      <RouteErrorFallback
        error={{ message: "boom" }}
        onRetry={() => {}}
        homeLink={<a href="/dashboard">{labels.home}</a>}
        labels={labels}
      />,
    );
    expect(getByTestId("route-error-title").textContent).toBe(labels.title);
    expect(getByText(labels.body)).toBeTruthy();
    expect(getByTestId("route-error-retry").textContent).toBe(labels.retry);
  });

  it("fires onRetry when retry is pressed", () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(
      <RouteErrorFallback
        error={{ message: "boom" }}
        onRetry={onRetry}
        homeLink={<a href="/dashboard">{labels.home}</a>}
        labels={labels}
      />,
    );
    fireEvent.click(getByTestId("route-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reveals the stack only after toggling details", () => {
    const { getByTestId, queryByTestId } = render(
      <RouteErrorFallback
        error={{ message: "boom", stack: "Error: boom\n  at x" }}
        onRetry={() => {}}
        homeLink={<a href="/dashboard">{labels.home}</a>}
        labels={labels}
      />,
    );
    expect(queryByTestId("route-error-stack")).toBeNull();
    fireEvent.click(getByTestId("route-error-details-toggle"));
    const pre = getByTestId("route-error-stack");
    expect(pre.textContent).toContain("at x");
  });

  it("omits the details affordance when there is no message or stack", () => {
    const { queryByTestId } = render(
      <RouteErrorFallback
        error={{}}
        onRetry={() => {}}
        homeLink={<a href="/dashboard">{labels.home}</a>}
        labels={labels}
      />,
    );
    expect(queryByTestId("route-error-details-toggle")).toBeNull();
  });
});

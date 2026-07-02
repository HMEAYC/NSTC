import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorBoundary from "../components/ErrorBoundary";

describe("LoadingSpinner", () => {
  it("renders without text", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders with text", () => {
    render(<LoadingSpinner text="載入中…" />);
    expect(screen.getByText("載入中…")).toBeTruthy();
  });

  it("defaults to md size", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner?.className).toContain("h-8");
  });

  it("accepts sm size", () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner?.className).toContain("h-5");
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <p>hello</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders error UI when child throws", () => {
    const Bomb = () => { throw new Error("boom"); };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("出現錯誤")).toBeTruthy();
    expect(screen.getByText("重試")).toBeTruthy();
  });
});

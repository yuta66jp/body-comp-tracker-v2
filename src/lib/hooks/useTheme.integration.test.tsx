import { render, screen, fireEvent } from "@testing-library/react";
import { isTheme, useTheme } from "./useTheme";

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={() => setTheme("dark")}>dark</button>
    </div>
  );
}

describe("isTheme", () => {
  it("valid theme values return true", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  it("invalid values return false", () => {
    expect(isTheme("foo")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("falls back to system when stored value is invalid", () => {
    localStorage.setItem("theme", "foo");

    render(<ThemeProbe />);

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
  });

  it("does not crash when localStorage.getItem throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<ThemeProbe />);

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
  });

  it("updates state and DOM even when localStorage.setItem throws", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    render(<ThemeProbe />);
    fireEvent.click(screen.getByRole("button", { name: "dark" }));

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

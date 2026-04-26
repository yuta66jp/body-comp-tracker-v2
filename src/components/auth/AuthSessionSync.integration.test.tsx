import { render, waitFor } from "@testing-library/react";
import { AuthSessionSync } from "./AuthSessionSync";
import { refreshAuthCookie } from "@/lib/auth/browserSession";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/lib/auth/browserSession", () => ({
  refreshAuthCookie: jest.fn(),
}));

import { useRouter } from "next/navigation";

const mockUseRouter = useRouter as jest.Mock;
const mockRefreshAuthCookie = refreshAuthCookie as jest.MockedFunction<typeof refreshAuthCookie>;

describe("AuthSessionSync", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseRouter.mockReturnValue({ refresh: jest.fn() });
    mockRefreshAuthCookie.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("refreshes the layout after a successful cookie refresh", async () => {
    const refresh = jest.fn();
    mockUseRouter.mockReturnValue({ refresh });
    mockRefreshAuthCookie.mockResolvedValue(true);

    render(<AuthSessionSync />);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("refreshes the layout after a failed cookie refresh so auth state is re-evaluated", async () => {
    const refresh = jest.fn();
    mockUseRouter.mockReturnValue({ refresh });
    mockRefreshAuthCookie.mockResolvedValue(false);

    render(<AuthSessionSync />);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not refresh after unmount", async () => {
    const refresh = jest.fn();
    mockUseRouter.mockReturnValue({ refresh });
    let resolveRefresh: (value: boolean) => void = () => {};
    mockRefreshAuthCookie.mockReturnValue(new Promise<boolean>((resolve) => {
      resolveRefresh = resolve;
    }));

    const { unmount } = render(<AuthSessionSync />);
    unmount();
    resolveRefresh(false);

    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
  });
});

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../../../src/renderer/routes/HomePage";
import { useDocumentStore } from "../../../src/renderer/stores/documentStore";
import type { RecentFile } from "../../../src/shared/electronApi";

const recentFiles: RecentFile[] = [
  {
    path: "F:\\Boards\\Board One.flb",
    title: "Board One",
    openedAt: "2026-05-15T08:00:00.000Z"
  }
];

describe("HomePage", () => {
  const createNewBoard = vi.fn();
  const loadBoard = vi.fn(async () => {});
  const loadRecentFiles = vi.fn(async () => {});
  const openBoardDialog = vi.fn(async () => {});
  const removeRecentFile = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      createNewBoard,
      currentBoard: null,
      currentPath: null,
      fileError: null,
      loadBoard,
      loadRecentFiles,
      openBoardDialog,
      recentFiles,
      removeRecentFile,
      saveStatus: "unsaved"
    });
  });

  it("shows file errors as an alert", () => {
    useDocumentStore.setState({ fileError: "Unable to open board." });

    render(<HomePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to open board.");
  });

  it("removes a recent file without opening it", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /remove board one/i }));

    expect(removeRecentFile).toHaveBeenCalledWith("F:\\Boards\\Board One.flb");
    expect(loadBoard).not.toHaveBeenCalled();
  });

  it("opens a recent file from the list", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /open board one/i }));

    expect(loadBoard).toHaveBeenCalledWith("F:\\Boards\\Board One.flb");
  });
});

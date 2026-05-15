import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";
import { BoardPage } from "../../../src/renderer/routes/BoardPage";
import { useDocumentStore } from "../../../src/renderer/stores/documentStore";
import { useSearchStore } from "../../../src/renderer/stores/searchStore";
import { useSettingsStore } from "../../../src/renderer/stores/settingsStore";

const mockCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn()
};

function createSearchBoard(): BoardState {
  const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
  return {
    ...board,
    nodes: {
      alpha: {
        id: "alpha",
        type: "text",
        position: { x: 100, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Alpha plan",
        style: defaultBoardSettings.textNodeStyle
      },
      beta: {
        id: "beta",
        type: "text",
        position: { x: 320, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Beta note",
        style: defaultBoardSettings.textNodeStyle
      }
    }
  };
}

describe("BoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => mockCanvasContext as unknown as CanvasRenderingContext2D)
    });
    useSearchStore.getState().resetSearch();
    useSettingsStore.getState().resetSettings();
    useDocumentStore.setState({
      currentBoard: createSearchBoard(),
      currentPath: null,
      fileError: null,
      recentFiles: [],
      saveStatus: "saved"
    });
  });

  it("renders search results and highlights matching nodes", () => {
    useSearchStore.getState().openSearch();
    useSearchStore.getState().setSearchQuery("alpha");

    render(<BoardPage />);

    expect(screen.getByRole("searchbox")).toHaveValue("alpha");
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByTestId("board-node-alpha")).toHaveAttribute("data-search-highlight", "active");
  });

  it("does not render permanent Search or Save action buttons on initial load", () => {
    render(<BoardPage />);

    expect(screen.queryByRole("button", { name: /^Search$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("focuses the floating search input when search is opened from the search store", () => {
    useSearchStore.getState().openSearch();

    render(<BoardPage />);

    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("opens settings from a dedicated entry before exposing M5 controls", () => {
    render(<BoardPage />);

    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Wheel zoom mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default edge width")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    fireEvent.change(screen.getByLabelText("Wheel zoom mode"), { target: { value: "directWheel" } });
    fireEvent.change(screen.getByLabelText("Default edge width"), { target: { value: "5" } });

    expect(useSettingsStore.getState().settings.wheelZoomMode).toBe("directWheel");
    expect(useSettingsStore.getState().settings.defaultEdgeStyle.stroke.width).toBe(5);
  });

  it("shows compact shortcut hints", () => {
    render(<BoardPage />);

    expect(screen.getByText(/Ctrl\+F/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+L/)).toBeInTheDocument();
  });
});

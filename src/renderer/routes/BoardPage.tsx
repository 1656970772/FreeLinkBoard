import { useEffect, useMemo, useRef, useState } from "react";
import { searchTextNodes } from "../../application/search/boardSearch";
import { BoardCanvas } from "../board/BoardCanvas";
import { useDocumentStore } from "../stores/documentStore";
import { useSearchStore } from "../stores/searchStore";
import { useSettingsStore } from "../stores/settingsStore";

export function BoardPage() {
  const board = useDocumentStore((state) => state.currentBoard);
  const currentPath = useDocumentStore((state) => state.currentPath);
  const saveStatus = useDocumentStore((state) => state.saveStatus);
  const activeSearchIndex = useSearchStore((state) => state.activeSearchIndex);
  const closeSearch = useSearchStore((state) => state.closeSearch);
  const goToNextSearchResult = useSearchStore((state) => state.goToNextSearchResult);
  const goToPreviousSearchResult = useSearchStore((state) => state.goToPreviousSearchResult);
  const focusRequestId = useSearchStore((state) => state.focusRequestId);
  const isSearchOpen = useSearchStore((state) => state.isSearchOpen);
  const searchQuery = useSearchStore((state) => state.searchQuery);
  const setSearchQuery = useSearchStore((state) => state.setSearchQuery);
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const searchResults = useMemo(() => (board ? searchTextNodes(board, searchQuery) : []), [board, searchQuery]);
  const activeSearchResult = searchResults[Math.min(activeSearchIndex, Math.max(0, searchResults.length - 1))];
  const searchMatchNodeIds = searchResults.map((result) => result.nodeId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const activeSearchLabel =
    searchResults.length > 0 ? `${Math.min(activeSearchIndex + 1, searchResults.length)} / ${searchResults.length}` : "0 / 0";

  useEffect(() => {
    if (!isSearchOpen) return;

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [focusRequestId, isSearchOpen]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const closeFromOutside = (event: PointerEvent): void => {
      if (settingsPanelRef.current?.contains(event.target as Node)) return;

      setIsSettingsOpen(false);
    };

    const closeFromEscape = (event: KeyboardEvent): void => {
      if (event.code === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromEscape);

    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromEscape);
    };
  }, [isSettingsOpen]);

  if (!board) return null;

  return (
    <main className="board-page">
      <header className="board-topbar" aria-label="Board workspace controls">
        <div className="board-file-meta">
          <div className="board-file-title-row">
            <strong title={board.title}>{board.title}</strong>
            <span className={`save-status save-status-${saveStatus}`}>{saveStatus}</span>
          </div>
          <span title={currentPath ?? "Unsaved board"}>{currentPath ?? "Unsaved board"}</span>
        </div>
        <div className="board-quick-tools" aria-label="Keyboard shortcuts">
          <span>Ctrl+F Search</span>
          <span>Ctrl+S Save</span>
          <span>Ctrl+L Link</span>
          <span>Del Delete</span>
        </div>
        <div className="board-actions" ref={settingsPanelRef}>
          <button
            aria-expanded={isSettingsOpen}
            aria-haspopup="dialog"
            aria-label="Settings"
            className="settings-trigger"
            onClick={() => setIsSettingsOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className="settings-trigger-icon" />
            <span>Settings</span>
          </button>
          {isSettingsOpen ? (
            <section className="settings-popover" aria-label="Board settings">
              <div className="settings-popover-header">
                <strong>Settings</strong>
                <span>Board defaults</span>
              </div>
              <label className="settings-field">
                <span>Wheel zoom mode</span>
                <select
                  aria-label="Wheel zoom mode"
                  onChange={(event) =>
                    updateSettings({ wheelZoomMode: event.target.value as "ctrlWheel" | "directWheel" })
                  }
                  value={settings.wheelZoomMode}
                >
                  <option value="ctrlWheel">Ctrl + wheel</option>
                  <option value="directWheel">Wheel</option>
                </select>
              </label>
              <label className="settings-field settings-field-inline">
                <span>Default edge color</span>
                <input
                  aria-label="Default edge color"
                  onChange={(event) =>
                    updateSettings({ defaultEdgeStyle: { stroke: { color: event.target.value } } })
                  }
                  type="color"
                  value={settings.defaultEdgeStyle.stroke.color}
                />
              </label>
              <label className="settings-field">
                <span>Default edge width</span>
                <input
                  aria-label="Default edge width"
                  max={12}
                  min={1}
                  onChange={(event) =>
                    updateSettings({ defaultEdgeStyle: { stroke: { width: Number(event.target.value) } } })
                  }
                  type="number"
                  value={settings.defaultEdgeStyle.stroke.width}
                />
              </label>
            </section>
          ) : null}
        </div>
      </header>
      {isSearchOpen ? (
        <section className="board-search-panel" aria-label="Board search">
          <div className="search-panel-title">
            <strong>Search board</strong>
            <span>Ctrl+F</span>
          </div>
          <input
            aria-label="Search current board"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search nodes"
            ref={searchInputRef}
            role="searchbox"
            type="search"
            value={searchQuery}
          />
          <div className="search-panel-controls">
            <span>{activeSearchLabel}</span>
            <button type="button" onClick={() => goToPreviousSearchResult(searchResults.length)}>
              Previous
            </button>
            <button type="button" onClick={() => goToNextSearchResult(searchResults.length)}>
              Next
            </button>
            <button type="button" onClick={closeSearch}>
              Close
            </button>
          </div>
        </section>
      ) : null}
      <section className="board-stage">
        <BoardCanvas
          activeSearchNodeId={activeSearchResult?.nodeId ?? null}
          board={board}
          className="board-canvas-surface"
          searchMatchNodeIds={searchMatchNodeIds}
        />
      </section>
    </main>
  );
}

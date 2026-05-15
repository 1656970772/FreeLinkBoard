import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "../../../src/renderer/stores/searchStore";

describe("searchStore", () => {
  beforeEach(() => {
    useSearchStore.getState().resetSearch();
  });

  it("opens and closes the search panel", () => {
    useSearchStore.getState().openSearch();

    expect(useSearchStore.getState().isSearchOpen).toBe(true);
    expect(useSearchStore.getState().focusRequestId).toBe(1);

    useSearchStore.getState().closeSearch();

    expect(useSearchStore.getState().isSearchOpen).toBe(false);
  });

  it("resets the active result when the query changes", () => {
    useSearchStore.getState().setActiveSearchIndex(2);
    useSearchStore.getState().setSearchQuery("alpha");

    expect(useSearchStore.getState().searchQuery).toBe("alpha");
    expect(useSearchStore.getState().activeSearchIndex).toBe(0);
  });

  it("cycles search results in both directions", () => {
    useSearchStore.getState().setActiveSearchIndex(0);

    useSearchStore.getState().goToPreviousSearchResult(3);
    expect(useSearchStore.getState().activeSearchIndex).toBe(2);

    useSearchStore.getState().goToNextSearchResult(3);
    expect(useSearchStore.getState().activeSearchIndex).toBe(0);
  });
});

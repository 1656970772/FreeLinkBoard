import { create } from "zustand";

type SearchStore = {
  activeSearchIndex: number;
  focusRequestId: number;
  isSearchOpen: boolean;
  searchQuery: string;
  closeSearch(): void;
  goToNextSearchResult(resultCount: number): void;
  goToPreviousSearchResult(resultCount: number): void;
  openSearch(): void;
  resetSearch(): void;
  setActiveSearchIndex(index: number): void;
  setSearchQuery(query: string): void;
};

export const useSearchStore = create<SearchStore>((set) => ({
  activeSearchIndex: 0,
  focusRequestId: 0,
  isSearchOpen: false,
  searchQuery: "",

  closeSearch() {
    set({ isSearchOpen: false });
  },

  goToNextSearchResult(resultCount) {
    if (resultCount <= 0) {
      set({ activeSearchIndex: 0 });
      return;
    }

    set((state) => ({ activeSearchIndex: (state.activeSearchIndex + 1) % resultCount }));
  },

  goToPreviousSearchResult(resultCount) {
    if (resultCount <= 0) {
      set({ activeSearchIndex: 0 });
      return;
    }

    set((state) => ({ activeSearchIndex: (state.activeSearchIndex + resultCount - 1) % resultCount }));
  },

  openSearch() {
    set((state) => ({
      focusRequestId: state.focusRequestId + 1,
      isSearchOpen: true
    }));
  },

  resetSearch() {
    set({
      activeSearchIndex: 0,
      focusRequestId: 0,
      isSearchOpen: false,
      searchQuery: ""
    });
  },

  setActiveSearchIndex(index) {
    set({ activeSearchIndex: Math.max(0, index) });
  },

  setSearchQuery(query) {
    set({ activeSearchIndex: 0, searchQuery: query });
  }
}));

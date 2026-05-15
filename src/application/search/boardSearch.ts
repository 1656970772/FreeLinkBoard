import type { BoardState, NodeId } from "../../domain/board/types";

export type TextNodeSearchRange = {
  start: number;
  end: number;
};

export type TextNodeSearchResult = {
  nodeId: NodeId;
  text: string;
  matchCount: number;
  ranges: TextNodeSearchRange[];
};

export function searchTextNodes(board: BoardState, query: string): TextNodeSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const results: TextNodeSearchResult[] = [];

  for (const node of Object.values(board.nodes)) {
    if (node.type !== "text") {
      continue;
    }

    const normalizedText = node.text.toLowerCase();
    const ranges: TextNodeSearchRange[] = [];
    let searchStart = 0;
    let matchStart = normalizedText.indexOf(normalizedQuery, searchStart);

    while (matchStart !== -1) {
      ranges.push({ start: matchStart, end: matchStart + normalizedQuery.length });
      searchStart = matchStart + normalizedQuery.length;
      matchStart = normalizedText.indexOf(normalizedQuery, searchStart);
    }

    if (ranges.length > 0) {
      results.push({
        nodeId: node.id,
        text: node.text,
        matchCount: ranges.length,
        ranges
      });
    }
  }

  return results;
}

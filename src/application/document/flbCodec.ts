import type { BoardEdge, BoardNode, BoardState, EdgeEndpoint } from "../../domain/board/types";
import { flbDocumentV1Schema, type FlbDocumentV1 } from "../../domain/document/flbSchema";

type RawFlbDocument = {
  version?: unknown;
};

type FlbEndpointV1 = FlbDocumentV1["edges"][number]["from"];

function parseEndpoint(endpoint: FlbEndpointV1): EdgeEndpoint {
  if (endpoint.type === "node") {
    return { type: "node", nodeId: endpoint.id };
  }

  return { type: "point", point: { x: endpoint.x, y: endpoint.y } };
}

function serializeEndpoint(endpoint: EdgeEndpoint): FlbEndpointV1 {
  if (endpoint.type === "node") {
    return { type: "node", id: endpoint.nodeId };
  }

  return { type: "point", x: endpoint.point.x, y: endpoint.point.y };
}

export function parseFlbDocument(raw: unknown): BoardState {
  const version = (raw as RawFlbDocument | null)?.version;
  if (version !== 1) {
    throw new Error(`Unsupported .flb version: ${String(version)}`);
  }

  const parsed = flbDocumentV1Schema.parse(raw);
  const nodes: Record<string, BoardNode> = Object.fromEntries(
    parsed.nodes.map((node): [string, BoardNode] => [
      node.id,
      {
        id: node.id,
        type: "text",
        position: { x: node.x, y: node.y },
        size: { width: node.width, height: node.height },
        sizing: node.sizing,
        text: node.text,
        style: node.style
      }
    ])
  );
  const edges: Record<string, BoardEdge> = Object.fromEntries(
    parsed.edges.map((edge): [string, BoardEdge] => [
      edge.id,
      {
        id: edge.id,
        from: parseEndpoint(edge.from),
        to: parseEndpoint(edge.to),
        pathType: edge.pathType,
        arrow: edge.arrow,
        stroke: edge.stroke,
        fixedPoints: edge.fixedPoints
      }
    ])
  );

  return {
    id: parsed.id,
    title: parsed.title,
    viewport: parsed.viewport,
    nodes,
    edges,
    selection: { nodeIds: [], edgeIds: [] },
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt
  };
}

export function serializeFlbDocument(state: BoardState): FlbDocumentV1 {
  return {
    version: 1,
    id: state.id,
    title: state.title,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    viewport: state.viewport,
    nodes: Object.values(state.nodes).map((node) => ({
      id: node.id,
      type: node.type,
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
      sizing: node.sizing,
      text: node.text,
      style: node.style
    })),
    edges: Object.values(state.edges).map((edge) => ({
      id: edge.id,
      from: serializeEndpoint(edge.from),
      to: serializeEndpoint(edge.to),
      pathType: edge.pathType,
      arrow: edge.arrow,
      stroke: edge.stroke,
      fixedPoints: edge.fixedPoints
    }))
  };
}

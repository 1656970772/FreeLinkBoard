export type BoardId = string;
export type NodeId = string;
export type EdgeId = string;

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Viewport = Point & {
  zoom: number;
};

export type EdgeGeometry =
  | { type: "straight"; points: Point[] }
  | { type: "bezier"; points: Point[] }
  | { type: "roundedElbow"; points: Point[]; radius: number };

export type TextNode = {
  id: NodeId;
  type: "text";
  position: Point;
  size: Size;
  sizing: "auto" | "fixed";
  text: string;
  style: {
    borderColor: string;
    backgroundColor: string;
    textColor: string;
  };
};

export type BoardNode = TextNode;

export type EdgeEndpoint =
  | { type: "node"; nodeId: NodeId }
  | { type: "point"; point: Point };

export type BoardEdge = {
  id: EdgeId;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  pathType: "bezier" | "straight" | "roundedElbow";
  arrow: "none" | "end" | "both";
  stroke: {
    color: string;
    width: number;
    dash: "solid" | "dashed";
  };
  fixedPoints: Point[];
};

export type BoardSelection = {
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
};

export type BoardState = {
  id: BoardId;
  title: string;
  viewport: Viewport;
  nodes: Record<NodeId, BoardNode>;
  edges: Record<EdgeId, BoardEdge>;
  selection: BoardSelection;
  createdAt: string;
  updatedAt: string;
};

export type BoardDefaults = {
  textNodeSize: Size;
  textNodeStyle: TextNode["style"];
  edgeStyle: Pick<BoardEdge, "pathType" | "arrow" | "stroke">;
};

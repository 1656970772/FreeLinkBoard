import { z } from "zod";

const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const viewportSchema = pointSchema.extend({
  zoom: z.number().positive()
});

const textNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  sizing: z.enum(["auto", "fixed"]),
  text: z.string(),
  style: z.object({
    borderColor: z.string().min(1),
    backgroundColor: z.string().min(1),
    textColor: z.string().min(1)
  })
});

const endpointSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("node"), id: z.string().min(1) }),
  z.object({ type: z.literal("point"), x: z.number(), y: z.number() })
]);

const edgeSchema = z.object({
  id: z.string().min(1),
  from: endpointSchema,
  to: endpointSchema,
  pathType: z.enum(["bezier", "straight", "roundedElbow"]),
  arrow: z.enum(["none", "end", "both"]),
  stroke: z.object({
    color: z.string().min(1),
    width: z.number().positive(),
    dash: z.enum(["solid", "dashed"])
  }),
  fixedPoints: z.array(pointSchema)
});

export const flbDocumentV1Schema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    viewport: viewportSchema,
    nodes: z.array(textNodeSchema),
    edges: z.array(edgeSchema)
  })
  .superRefine((document, context) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    for (const [index, node] of document.nodes.entries()) {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id: ${node.id}`,
          path: ["nodes", index, "id"]
        });
      }
      nodeIds.add(node.id);
    }

    for (const [index, edge] of document.edges.entries()) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate edge id: ${edge.id}`,
          path: ["edges", index, "id"]
        });
      }
      edgeIds.add(edge.id);

      for (const endpoint of [edge.from, edge.to]) {
        if (endpoint.type === "node" && !nodeIds.has(endpoint.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Edge ${edge.id} references missing node: ${endpoint.id}`,
            path: ["edges", index]
          });
        }
      }
    }
  });

export type FlbDocumentV1 = z.infer<typeof flbDocumentV1Schema>;

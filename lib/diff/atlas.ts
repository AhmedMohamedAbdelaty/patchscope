import type { DiffFile } from "./types.ts";

export type ReviewLens = "general" | "security" | "tests";
export type AtlasLayerId =
  | "contract"
  | "data"
  | "behavior"
  | "interface"
  | "tests"
  | "delivery"
  | "artifacts";

export interface AtlasClassification {
  layer: AtlasLayerId;
  reason: string;
}

export interface AtlasLayer {
  id: AtlasLayerId;
  title: string;
  description: string;
  files: DiffFile[];
  additions: number;
  deletions: number;
}

export function isReviewLens(value: unknown): value is ReviewLens {
  return value === "general" || value === "security" || value === "tests";
}

const LAYERS: Record<
  AtlasLayerId,
  Pick<AtlasLayer, "title" | "description">
> = {
  contract: {
    title: "Contracts",
    description: "Public boundaries and interfaces that shape later behavior.",
  },
  data: {
    title: "Data",
    description: "Schema, migration, storage, and durable-state changes.",
  },
  behavior: {
    title: "Behavior",
    description:
      "Application and domain behavior not captured by another layer.",
  },
  interface: {
    title: "Interface",
    description: "User-facing components, styles, assets, and presentation.",
  },
  tests: {
    title: "Verification",
    description: "Tests, fixtures, and other executable evidence of intent.",
  },
  delivery: {
    title: "Delivery",
    description: "Build, deployment, dependencies, configuration, and docs.",
  },
  artifacts: {
    title: "Artifacts",
    description:
      "Generated output and lock data best checked after source files.",
  },
};

export function atlasLayerDetails(
  id: AtlasLayerId,
): Pick<AtlasLayer, "title" | "description"> {
  return LAYERS[id];
}

const ORDERS: Record<ReviewLens, AtlasLayerId[]> = {
  general: [
    "contract",
    "data",
    "behavior",
    "interface",
    "tests",
    "delivery",
    "artifacts",
  ],
  security: [
    "contract",
    "data",
    "delivery",
    "behavior",
    "interface",
    "tests",
    "artifacts",
  ],
  tests: [
    "tests",
    "behavior",
    "contract",
    "data",
    "interface",
    "delivery",
    "artifacts",
  ],
};

export function classifyFile(
  file: Pick<DiffFile, "path" | "isGenerated" | "isLockfile">,
): AtlasClassification {
  const path = file.path.toLocaleLowerCase();

  if (file.isGenerated || file.isLockfile) {
    return {
      layer: "artifacts",
      reason: file.isLockfile ? "Dependency lock data" : "Generated output",
    };
  }
  if (
    /(^|\/)(__tests__|tests?|spec|fixtures?|mocks?)(\/|$)/.test(path) ||
    /[._](test|spec)\.(?:[cm]?[jt]sx?|go|rs|py|rb|java|kt|swift)$/.test(
      path,
    ) || /(^|\/)(test|spec)[_-][^/]+\.[^/]+$/.test(path)
  ) {
    return { layer: "tests", reason: "Test or fixture path" };
  }
  if (
    /(^|\/)(migrations?|database|storage|persistence|prisma)(\/|$)/.test(
      path,
    ) || /\.(sql|prisma)$/.test(path)
  ) {
    return { layer: "data", reason: "Durable data or schema path" };
  }
  if (
    /(^|\/)(api|routes?|handlers?|controllers?|graphql|contracts?)(\/|$)/
      .test(path) ||
    /(^|\/)(openapi|swagger)(\.|\/|$)/.test(path) ||
    /\.(proto|graphql|gql)$/.test(path)
  ) {
    return { layer: "contract", reason: "External interface path" };
  }
  if (
    /(^|\/)(components?|views?|pages?|styles?|assets?|public)(\/|$)/.test(
      path,
    ) || /\.(css|scss|sass|less|html|svg)$/.test(path)
  ) {
    return { layer: "interface", reason: "User-facing interface path" };
  }
  if (
    /(^|\/)(\.github|deploy|infra|terraform|k8s|docs?)(\/|$)/.test(path) ||
    /(^|\/)(dockerfile|makefile|readme(?:\.[^/]*)?|deno\.jsonc?|package\.json)$/
      .test(path) ||
    /\.(md|ya?ml|toml)$/.test(path)
  ) {
    return {
      layer: "delivery",
      reason: "Delivery, configuration, or docs path",
    };
  }
  return { layer: "behavior", reason: "Application source path" };
}

export function buildAtlas(
  files: DiffFile[],
  lens: ReviewLens,
): AtlasLayer[] {
  return ORDERS[lens].flatMap((id) => {
    const matching = files.filter((file) => classifyFile(file).layer === id);
    if (!matching.length) return [];
    return [{
      id,
      ...LAYERS[id],
      files: matching.toSorted((a, b) =>
        b.priority - a.priority || a.path.localeCompare(b.path)
      ),
      additions: matching.reduce((sum, file) => sum + file.additions, 0),
      deletions: matching.reduce((sum, file) => sum + file.deletions, 0),
    }];
  });
}

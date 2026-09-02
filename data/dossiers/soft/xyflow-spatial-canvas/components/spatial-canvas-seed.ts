export interface SpatialCanvasNodeData {
  title: string;
  description?: string;
  href?: string;
  badge?: string;
  imageUrl?: string;
}

export interface SpatialSeedNode {
  id: string;
  position: { x: number; y: number };
  data: SpatialCanvasNodeData;
}

export interface SpatialSeedEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export const spatialCanvasSeed: { nodes: SpatialSeedNode[]; edges: SpatialSeedEdge[] } = {
  nodes: [
    {
      id: "hub",
      position: { x: 320, y: 0 },
      data: {
        title: "Våra tjänster",
        description: "Ett universum av vad vi gör — panorera och zooma.",
        badge: "Översikt",
      },
    },
    {
      id: "consult",
      position: { x: 0, y: 220 },
      data: {
        title: "Rådgivning",
        description: "Genomgång av behov, material och tidsplan.",
        badge: "Steg 1",
      },
    },
    {
      id: "craft",
      position: { x: 320, y: 240 },
      data: {
        title: "Utförande",
        description: "Vi gör jobbet på plats, med tydlig avstämning.",
        badge: "Steg 2",
      },
    },
    {
      id: "finish",
      position: { x: 640, y: 220 },
      data: {
        title: "Efterarbete",
        description: "Städning, besiktning och ev. justeringar.",
        badge: "Steg 3",
      },
    },
    {
      id: "quote",
      position: { x: 160, y: 470 },
      data: {
        title: "Offert",
        description: "Fast pris innan vi sätter igång.",
        href: "/offert",
      },
    },
    {
      id: "contact",
      position: { x: 480, y: 470 },
      data: {
        title: "Kontakt",
        description: "Ring eller skriv — vi svarar samma dag.",
        href: "/kontakt",
      },
    },
  ],
  edges: [
    { id: "e-hub-consult", source: "hub", target: "consult", label: "börja här" },
    { id: "e-hub-craft", source: "hub", target: "craft" },
    { id: "e-hub-finish", source: "hub", target: "finish" },
    { id: "e-consult-quote", source: "consult", target: "quote", label: "nästa" },
    { id: "e-quote-contact", source: "quote", target: "contact" },
  ],
};

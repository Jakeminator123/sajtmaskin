export type ShadcnRegistryFile = {
  path: string;
  content: string;
  type?: string;
  target?: string;
};

export type ShadcnRegistryItem = {
  name: string;
  description?: string;
  type?: string;
  registryDependencies?: string[];
  files?: ShadcnRegistryFile[];
  categories?: string[];
};

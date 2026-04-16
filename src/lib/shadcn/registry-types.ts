export type ShadcnRegistryFile = {
  path: string;
  content?: string;
  type?: string;
  target?: string;
};

export type ShadcnRegistryItem = {
  name: string;
  title?: string;
  description?: string;
  type?: string;
  registryDependencies?: string[];
  dependencies?: string[];
  devDependencies?: string[];
  cssVars?: Record<string, Record<string, string>>;
  css?: Record<string, unknown>;
  docs?: string;
  files?: ShadcnRegistryFile[];
  categories?: string[];
  author?: string;
  meta?: Record<string, unknown>;
};

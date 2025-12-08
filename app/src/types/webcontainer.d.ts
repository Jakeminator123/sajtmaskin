declare module "@webcontainer/api" {
  export interface WebContainer {
    mount(tree: FileSystemTree): Promise<void>;
    spawn(command: string, args?: string[]): Promise<WebContainerProcess>;
    on(event: "server-ready", callback: (port: number, url?: string) => void): void;
    teardown?(): Promise<void>;
    fs: {
      writeFile(path: string, content: string): Promise<void>;
      readFile(path: string): Promise<string>;
      mkdir(path: string): Promise<void>;
      rm(path: string, options?: { recursive?: boolean }): Promise<void>;
    };
    url: string;
  }

  export interface WebContainerProcess {
    output: ReadableStream<Uint8Array>;
    exit: Promise<number>;
    kill(): void;
  }

  export interface FileSystemTree {
    [path: string]: FileSystemNode;
  }

  export type FileSystemNode = FileNode | DirectoryNode;

  export interface FileNode {
    file: {
      contents: string;
    };
  }

  export interface DirectoryNode {
    directory: FileSystemTree;
  }

  export function boot(): Promise<WebContainer>;
  
  export const WebContainer: {
    boot(): Promise<WebContainer>;
  };
}

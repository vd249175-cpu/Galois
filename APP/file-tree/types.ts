export interface FileInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  tags: string[];
  icon?: string;
}

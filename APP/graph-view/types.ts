export interface Node {
  id: string;
  tags: string[];
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level?: number;
  isVirtual?: boolean;
  degree?: number;
}

export interface Link {
  source: string;
  target: string;
}

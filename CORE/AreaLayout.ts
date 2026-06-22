export type SplitDirection = 'horizontal' | 'vertical';

export interface LayoutArea {
  type: 'area';
  id: string;
  componentType: string;
}

export interface LayoutSplit {
  type: 'split';
  direction: SplitDirection;
  ratio: number;
  first: AreaLayout;
  second: AreaLayout;
}

export type AreaLayout = LayoutArea | LayoutSplit;

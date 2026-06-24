import { AreaLayout } from './AreaLayout';

export const defaultLayout: AreaLayout = {
  type: 'split',
  direction: 'horizontal',
  ratio: 0.22,
  first: {
    type: 'area',
    id: 'file-tree-root',
    componentType: 'fileTree',
  },
  second: {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.55,
    first: {
      type: 'area',
      id: 'editor-root',
      componentType: 'editor',
    },
    second: {
      type: 'area',
      id: 'graph-root',
      componentType: 'graphView',
    },
  },
};

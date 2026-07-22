export interface ReactiveExpressionProps {
  rawExpression: string;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  currentFile: string;
  lineIndex: number;
  onRequestEdit?: () => void;
  handleLinkClick?: (targetNodeText: string) => void;
  slashCommands?: any[];
  getShortcutDisplay?: (id: string) => string;
}

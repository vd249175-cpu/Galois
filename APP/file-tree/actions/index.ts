export { createFileAction } from './CreateFileAction';
export { openFolderAction } from './OpenFolderAction';
export { templateAction } from './TemplateAction';

import { createFileAction } from './CreateFileAction';
import { openFolderAction } from './OpenFolderAction';
import { templateAction } from './TemplateAction';

export const fileTreeActions = [createFileAction, openFolderAction, templateAction];


export { createFileAction } from './CreateFileAction';
export { openFolderAction } from './OpenFolderAction';
export { templateAction, manageTemplatesAction } from './TemplateAction';

import { createFileAction } from './CreateFileAction';
import { openFolderAction } from './OpenFolderAction';
import { templateAction, manageTemplatesAction } from './TemplateAction';

export const fileTreeActions = [createFileAction, openFolderAction, templateAction, manageTemplatesAction];


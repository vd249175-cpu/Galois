export { createFileAction } from './CreateFileAction';
export { openFolderAction } from './OpenFolderAction';

import { createFileAction } from './CreateFileAction';
import { openFolderAction } from './OpenFolderAction';

export const fileTreeActions = [createFileAction, openFolderAction];

import { promoteTemporaryConceptContent } from './virtualConceptNote';

export interface TemporaryConceptFile {
  filePath: string;
  initialContent: string;
}

export interface ConceptFileApi {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<unknown>;
  deleteFile: (filePath: string) => Promise<unknown>;
}

export type ConceptFileOutcome = {
  status: 'unchanged' | 'deleted' | 'promoted' | 'missing';
  wrotePromotedContent: boolean;
};

async function readTemporaryFile(
  api: ConceptFileApi,
  temporary: TemporaryConceptFile,
): Promise<string | null> {
  try {
    return await api.readFile(temporary.filePath);
  } catch {
    return null;
  }
}

export async function promoteConceptFileIfEdited(
  api: ConceptFileApi,
  temporary: TemporaryConceptFile,
): Promise<ConceptFileOutcome> {
  const diskContent = await readTemporaryFile(api, temporary);
  if (diskContent === null) return { status: 'missing', wrotePromotedContent: false };
  if (diskContent === temporary.initialContent) {
    return { status: 'unchanged', wrotePromotedContent: false };
  }

  const promotedContent = promoteTemporaryConceptContent(diskContent);
  const wrotePromotedContent = promotedContent !== diskContent;
  if (wrotePromotedContent) await api.writeFile(temporary.filePath, promotedContent);
  return { status: 'promoted', wrotePromotedContent };
}

export async function settleTemporaryConceptFile(
  api: ConceptFileApi,
  temporary: TemporaryConceptFile,
): Promise<ConceptFileOutcome> {
  const promoted = await promoteConceptFileIfEdited(api, temporary);
  if (promoted.status !== 'unchanged') return promoted;
  await api.deleteFile(temporary.filePath);
  return { status: 'deleted', wrotePromotedContent: false };
}

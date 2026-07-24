import { useCallback, useEffect, useRef } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { Blood } from '../../CORE/Blood';
import type { Node } from './types';
import {
  buildVirtualConceptNote,
  TEMPORARY_CONCEPT_MARKER,
} from './virtualConceptNote';
import {
  promoteConceptFileIfEdited,
  settleTemporaryConceptFile,
} from './temporaryConceptLifecycle';

interface TemporaryConceptNote {
  conceptId: string;
  editorId: string;
  filePath: string;
  initialContent: string;
  openConfirmed: boolean;
}

interface GraphNodeNavigationOptions {
  projectPath: string;
  nodes: Node[];
  openFileMap: Record<string, unknown>;
  fileSavedMap: Record<string, unknown>;
  updateBloodKey: (key: string, value: unknown) => void;
}

function resolveTargetEditorId(): string {
  const lastFocused = Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null);
  const activeEditors = Blood.getValue<string[]>(BC.system.activeEditors, []);
  if (lastFocused || activeEditors[0]) return lastFocused || activeEditors[0];

  const prefix = 'system.areaComponentTypes.';
  for (const [key, value] of Object.entries(Blood.getRawState() || {})) {
    if (key.startsWith(prefix) && value === 'editor') return key.substring(prefix.length);
  }
  return 'editor-root';
}

export function useGraphNodeNavigation({
  projectPath,
  nodes,
  openFileMap,
  fileSavedMap,
  updateBloodKey,
}: GraphNodeNavigationOptions) {
  const projectPathRef = useRef(projectPath);
  const previousProjectPathRef = useRef(projectPath);
  const nodesRef = useRef(nodes);
  const updateBloodKeyRef = useRef(updateBloodKey);
  const temporaryNoteRef = useRef<TemporaryConceptNote | null>(null);
  const activationGenerationRef = useRef(0);
  const settlementChainRef = useRef<Promise<void>>(Promise.resolve());
  projectPathRef.current = projectPath;
  nodesRef.current = nodes;
  updateBloodKeyRef.current = updateBloodKey;

  const publishFileChange = useCallback((filePath: string) => {
    updateBloodKeyRef.current(BC.events.fileSaved(filePath), Date.now());
  }, []);

  const reportError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    updateBloodKeyRef.current(BC.events.scriptError('graphView'), {
      message: `临时概念笔记处理失败: ${message}`,
      ts: Date.now(),
    });
  }, []);

  const promoteIfEdited = useCallback(async (expected: TemporaryConceptNote) => {
    if (temporaryNoteRef.current !== expected) return false;
    try {
      const outcome = await promoteConceptFileIfEdited(window.electronAPI, expected);
      if (temporaryNoteRef.current !== expected) return false;
      if (outcome.status === 'unchanged') return false;
      temporaryNoteRef.current = null;
      if (outcome.wrotePromotedContent) publishFileChange(expected.filePath);
      return outcome.status === 'promoted';
    } catch (error) {
      reportError(error);
      return false;
    }
  }, [publishFileChange, reportError]);

  const settleTemporaryNote = useCallback(async () => {
    const expected = temporaryNoteRef.current;
    if (!expected) return;
    temporaryNoteRef.current = null;

    const settle = async () => {
      try {
        const outcome = await settleTemporaryConceptFile(window.electronAPI, expected);
        if (outcome.status === 'deleted') {
          publishFileChange(expected.filePath);
          if (Blood.getValue(BC.events.openFile(expected.editorId), '') === expected.filePath) {
            updateBloodKeyRef.current(BC.events.openFile(expected.editorId), '');
          }
        } else if (outcome.wrotePromotedContent) {
          publishFileChange(expected.filePath);
        }
      } catch (error) {
        reportError(error);
      }
    };

    const queued = settlementChainRef.current.then(settle, settle);
    settlementChainRef.current = queued.catch(() => {});
    await queued;
  }, [publishFileChange, reportError]);

  const activateNode = useCallback(async (nodeId: string) => {
    const requestGeneration = ++activationGenerationRef.current;
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!node) return;

    const existingTemporary = temporaryNoteRef.current;
    if (
      existingTemporary
      && (existingTemporary.conceptId === node.id || existingTemporary.filePath === node.id)
    ) {
      existingTemporary.editorId = resolveTargetEditorId();
      existingTemporary.openConfirmed = false;
      updateBloodKeyRef.current(
        BC.events.openFile(existingTemporary.editorId),
        existingTemporary.filePath,
      );
      return;
    }

    await settleTemporaryNote();
    if (requestGeneration !== activationGenerationRef.current) return;

    const editorId = resolveTargetEditorId();
    if (!node.isVirtual) {
      updateBloodKeyRef.current(BC.events.openFile(editorId), node.id);
      return;
    }

    const supportingNotes = nodesRef.current.filter((candidate) => (
      !candidate.isVirtual
      && node.tags.every((tag) => candidate.tags.includes(tag))
    ));
    const generated = buildVirtualConceptNote(projectPathRef.current, node, supportingNotes);
    let existingContent: string | null = null;
    try {
      existingContent = await window.electronAPI.readFile(generated.filePath);
    } catch {
      // Expected for a new concept note.
    }
    if (requestGeneration !== activationGenerationRef.current) return;

    if (existingContent !== null && !existingContent.includes(TEMPORARY_CONCEPT_MARKER)) {
      updateBloodKeyRef.current(BC.events.openFile(editorId), generated.filePath);
      return;
    }
    if (existingContent !== null) {
      await window.electronAPI.deleteFile(generated.filePath);
    }

    await window.electronAPI.writeFile(generated.filePath, generated.content);
    if (requestGeneration !== activationGenerationRef.current) {
      const currentContent = await window.electronAPI.readFile(generated.filePath).catch(() => null);
      if (currentContent === generated.content) {
        await window.electronAPI.deleteFile(generated.filePath);
        publishFileChange(generated.filePath);
      }
      return;
    }

    temporaryNoteRef.current = {
      conceptId: node.id,
      editorId,
      filePath: generated.filePath,
      initialContent: generated.content,
      openConfirmed: false,
    };
    publishFileChange(generated.filePath);
    updateBloodKeyRef.current(BC.events.openFile(editorId), generated.filePath);
  }, [publishFileChange, settleTemporaryNote]);

  const discardTemporaryNote = useCallback(async () => {
    activationGenerationRef.current += 1;
    await settleTemporaryNote();
  }, [settleTemporaryNote]);

  useEffect(() => {
    const temporary = temporaryNoteRef.current;
    if (!temporary) return;
    const openedPath = openFileMap[BC.events.openFile(temporary.editorId)];
    if (openedPath === temporary.filePath) {
      temporary.openConfirmed = true;
    } else if (temporary.openConfirmed) {
      void settleTemporaryNote();
    }
  }, [openFileMap, settleTemporaryNote]);

  useEffect(() => {
    const temporary = temporaryNoteRef.current;
    if (!temporary) return;
    if (fileSavedMap[BC.events.fileSaved(temporary.filePath)] !== undefined) {
      void promoteIfEdited(temporary);
    }
  }, [fileSavedMap, promoteIfEdited]);

  useEffect(() => {
    if (previousProjectPathRef.current === projectPath) return;
    activationGenerationRef.current += 1;
    void settleTemporaryNote();
    previousProjectPathRef.current = projectPath;
  }, [projectPath, settleTemporaryNote]);

  useEffect(() => () => {
    activationGenerationRef.current += 1;
    void settleTemporaryNote();
  }, [settleTemporaryNote]);

  return { activateNode, discardTemporaryNote };
}

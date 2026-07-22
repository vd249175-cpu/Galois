import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  expression: string;
  displayMode?: boolean;
}

export function MathRenderer({ expression, displayMode = false }: MathRendererProps) {
  const html = katex.renderToString(expression.trim(), {
    displayMode,
    throwOnError: false,
    strict: 'warn',
    trust: false,
    output: 'htmlAndMathml',
  });

  return (
    <span
      className={displayMode ? 'galois-math galois-math-display' : 'galois-math galois-math-inline'}
      aria-label={displayMode ? '块级数学公式' : '行内数学公式'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import { useEffect, useRef, useState } from 'react';


// Global state to track dynamic loading of Mermaid CDN library
let mermaidLoading = false;
let mermaidLoaded = false;
const mermaidLoadCallbacks = new Set<() => void>();

function loadMermaid(callback: () => void) {
  if (mermaidLoaded) {
    callback();
    return;
  }
  mermaidLoadCallbacks.add(callback);
  if (mermaidLoading) return;
  mermaidLoading = true;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
  script.async = true;
  script.onload = () => {
    mermaidLoaded = true;
    const mermaid = (window as any).mermaid;
    if (mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
    }
    mermaidLoadCallbacks.forEach((cb) => cb());
    mermaidLoadCallbacks.clear();
  };
  document.body.appendChild(script);
}

export function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadMermaid(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const mermaid = (window as any).mermaid;
    if (!mermaid || !containerRef.current) return;

    let isMounted = true;
    const renderId = `mermaid-render-${Math.random().toString(36).substring(2, 9)}`;

    const renderDiagram = async () => {
      try {
        const cleanCode = code.trim();
        const { svg: renderedSvg } = await mermaid.render(renderId, cleanCode);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        console.error('[Mermaid] render error:', err);
        const badEl = document.getElementById(renderId);
        if (badEl) badEl.remove();

        if (isMounted) {
          setError(err.message || String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, loaded]);

  if (error) {
    return (
      <div style={{ margin: '14px 0', border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: '10px 14px', borderRadius: '6px' }}>
        <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>Mermaid 渲染失败</div>
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
          {error}
        </pre>
        <details style={{ marginTop: '6px' }}>
          <summary style={{ fontSize: '11px', cursor: 'pointer', color: '#7f1d1d' }}>查看源代码</summary>
          <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#374151' }}>
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        margin: '14px 0',
        padding: '12px',
        border: '1.2px solid var(--border-color)',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.01))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflowX: 'auto'
      }}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          正在渲染 Mermaid 图表...
        </div>
      )}
    </div>
  );
}

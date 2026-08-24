import * as React from "react";
import * as pdfjs from "pdfjs-dist";

import { cn } from "@/lib/utils";

// O worker vem do proprio pacote: a planta e renderizada no aparelho, sem
// mandar o projeto para servico nenhum.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

export interface Ponto {
  x: number;
  y: number;
}

export interface Marca {
  id: string;
  shape: "ponto" | "area";
  points: Ponto[];
  radius: number;
  color: string;
  label: string | null;
}

/**
 * A planta de indicacao com as marcacoes por cima.
 *
 * Os pontos sao NORMALIZADOS de 0 a 1 em relacao a pagina. E isso que faz a
 * marcacao cair no mesmo lugar no celular, no computador e na impressao —
 * guardar pixels amarraria a marca ao zoom de quem marcou.
 */
export function PlantaMarcada({
  fileUrl,
  marks,
  pageNumber = 1,
  onPick,
  pickingColor,
  className,
}: {
  fileUrl: string;
  marks: Marca[];
  pageNumber?: number;
  /** Recebe o ponto normalizado do toque. Sem isso a planta e so leitura. */
  onPick?: (ponto: Ponto) => void;
  pickingColor?: string;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    let task: pdfjs.PDFDocumentLoadingTask | null = null;

    async function render() {
      setLoading(true);
      setError(null);
      try {
        task = pdfjs.getDocument(fileUrl);
        const doc = await task.promise;
        if (cancelled) return;

        const page = await doc.getPage(pageNumber);
        const largura = wrapRef.current?.clientWidth ?? 900;
        const base = page.getViewport({ scale: 1 });
        // Escala pela largura disponivel; o dobro de pixels mantem o desenho
        // tecnico legivel, que e o ponto de uma planta.
        const escala = (largura / base.width) * 2;
        const viewport = page.getViewport({ scale: escala });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível.");

        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;
        setSize({ width: viewport.width, height: viewport.height });
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível abrir a planta.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileUrl, pageNumber]);

  /** Do toque na tela para o ponto normalizado da pagina. */
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onPick) return;
    const alvo = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - alvo.left) / alvo.width;
    const y = (event.clientY - alvo.top) / alvo.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPick({ x, y });
  }

  return (
    <div ref={wrapRef} className={cn("space-y-2", className)}>
      {error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md border bg-white",
          onPick && "cursor-crosshair",
        )}
        onClick={handleClick}
        role={onPick ? "button" : undefined}
        tabIndex={onPick ? 0 : undefined}
        aria-label={onPick ? "Toque na planta para marcar" : "Planta de indicação"}
      >
        <canvas ref={canvasRef} className="block w-full" />

        {/* As marcas ficam num SVG por cima, em coordenadas de 0 a 1: o
            navegador reposiciona sozinho quando a tela muda de tamanho. */}
        {size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            {marks.map((mark) =>
              mark.shape === "ponto" ? (
                // O viewBox e 0..1 nos dois eixos e a pagina nao e quadrada,
                // entao um <circle> sairia ovalado. A elipse com o raio de y
                // corrigido pela proporcao desenha um circulo de verdade.
                <ellipse
                  key={mark.id}
                  cx={mark.points[0]?.x ?? 0}
                  cy={mark.points[0]?.y ?? 0}
                  rx={mark.radius}
                  ry={(mark.radius * size.width) / size.height}
                  fill={mark.color}
                  fillOpacity={0.85}
                  stroke="#00000055"
                  strokeWidth={0.0008}
                />
              ) : (
                <polygon
                  key={mark.id}
                  points={mark.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={mark.color}
                  fillOpacity={0.45}
                  stroke={mark.color}
                  strokeWidth={0.002}
                />
              ),
            )}
          </svg>
        ) : null}

        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <p className="text-sm text-muted-foreground">Abrindo a planta...</p>
          </div>
        ) : null}
      </div>

      {onPick ? (
        <p className="text-xs text-muted-foreground">
          Toque na estaca para marcá-la
          {pickingColor ? (
            <>
              {" "}
              com a cor{" "}
              <span
                className="inline-block size-3 translate-y-0.5 rounded-full"
                style={{ backgroundColor: pickingColor }}
                aria-hidden
              />
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}

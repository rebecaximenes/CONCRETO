import * as React from "react";
import * as pdfjs from "pdfjs-dist";
import { Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
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

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
/** Acima disto o toque conta como arraste, e nao como marcacao. */
const ARRASTE_MIN_PX = 6;
/** Teto de pixels do canvas: acima disso o navegador desiste de desenhar. */
const PIXELS_MAX = 25_000_000;
const LADO_MAX = 8192;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Nivel de resolucao em que a pagina e rasterizada.
 *
 * Nao basta esticar o canvas: a planta viraria um borrao justo quando a
 * pessoa se aproxima para ler a estaca. A pagina e redesenhada em degraus
 * (1x, 2x, 4x, 8x) conforme o zoom, e nao a cada gesto.
 */
function degrauDeQualidade(zoom: number): number {
  if (zoom >= 6) return 8;
  if (zoom >= 3) return 4;
  if (zoom >= 1.5) return 2;
  return 1;
}

/**
 * A planta de indicacao com as marcacoes por cima.
 *
 * Os pontos sao NORMALIZADOS de 0 a 1 em relacao a pagina. E isso que faz a
 * marcacao cair no mesmo lugar no celular, no computador e na impressao —
 * guardar pixels amarraria a marca ao zoom de quem marcou. E tambem o que
 * deixa o zoom sair de graca: o desenho e as marcas estao no mesmo elemento
 * transformado, entao ampliar move os dois juntos, sem conta nenhuma.
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
  const janelaRef = React.useRef<HTMLDivElement>(null);
  const conteudoRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  /**
   * Zoom e deslocamento vivem num estado SO. Separados, ampliar exigiria
   * chamar um setState de dentro do atualizador do outro — e atualizador do
   * React precisa ser puro: em modo estrito ele roda duas vezes e a planta
   * andaria o dobro a cada gesto.
   */
  const [vista, setVista] = React.useState({ zoom: 1, x: 0, y: 0 });
  const { zoom } = vista;
  // O listener da roda e registrado uma vez so; le o zoom por aqui para nao
  // precisar ser reinstalado a cada gesto.
  const vistaRef = React.useRef(vista);
  vistaRef.current = vista;
  const [qualidade, setQualidade] = React.useState(1);

  // Os gestos vivem em ref, e nao em estado: sao dezenas de eventos por
  // segundo e nenhum deles precisa provocar um render por si.
  const ponteiros = React.useRef(new Map<number, { x: number; y: number }>());
  const gesto = React.useRef<{
    inicio: { x: number; y: number };
    deslocouPx: number;
    distancia: number;
    zoomInicial: number;
  } | null>(null);

  /**
   * Mantem a planta cobrindo a janela: sem isto ela escapa para fora e sobra
   * fundo branco no lugar do desenho. O tamanho de layout da janela nao muda
   * com o transform, entao ele e sempre o tamanho da planta encaixada.
   */
  const ajustar = React.useCallback(
    (proximoZoom: number, x: number, y: number) => {
      const janela = janelaRef.current;
      if (!janela) return { zoom: proximoZoom, x, y };
      const larguraJanela = janela.clientWidth;
      const alturaJanela = janela.clientHeight;
      const larguraConteudo = larguraJanela * proximoZoom;
      const alturaConteudo = alturaJanela * proximoZoom;
      return {
        zoom: proximoZoom,
        x:
          larguraConteudo <= larguraJanela
            ? 0
            : limitar(x, larguraJanela - larguraConteudo, 0),
        y:
          alturaConteudo <= alturaJanela
            ? 0
            : limitar(y, alturaJanela - alturaConteudo, 0),
      };
    },
    [],
  );

  /**
   * Amplia mantendo fixo o ponto da tela em que a pessoa esta olhando —
   * o meio dos dedos na pinca, o cursor na roda, o centro nos botoes.
   */
  const ampliarEm = React.useCallback(
    (novoZoom: number, ancoraX: number, ancoraY: number) => {
      const janela = janelaRef.current;
      if (!janela) return;
      const caixa = janela.getBoundingClientRect();
      const px = ancoraX - caixa.left;
      const py = ancoraY - caixa.top;
      setVista((atual) => {
        const alvo = limitar(novoZoom, ZOOM_MIN, ZOOM_MAX);
        return ajustar(
          alvo,
          px - ((px - atual.x) * alvo) / atual.zoom,
          py - ((py - atual.y) * alvo) / atual.zoom,
        );
      });
    },
    [ajustar],
  );

  const ampliarNoCentro = React.useCallback(
    (fator: number) => {
      const caixa = janelaRef.current?.getBoundingClientRect();
      if (!caixa) return;
      ampliarEm(
        zoom * fator,
        caixa.left + caixa.width / 2,
        caixa.top + caixa.height / 2,
      );
    },
    [ampliarEm, zoom],
  );

  const encaixar = React.useCallback(() => setVista({ zoom: 1, x: 0, y: 0 }), []);

  // Redesenha em resolucao maior so quando o zoom muda de degrau, e depois
  // que o gesto para: rasterizar a cada pinca travaria o aparelho.
  React.useEffect(() => {
    const alvo = degrauDeQualidade(zoom);
    if (alvo === qualidade) return;
    const relogio = window.setTimeout(() => setQualidade(alvo), 250);
    return () => window.clearTimeout(relogio);
  }, [zoom, qualidade]);

  React.useEffect(() => {
    let cancelled = false;
    let task: pdfjs.PDFDocumentLoadingTask | null = null;

    async function render() {
      // So a primeira abertura mostra o aviso; trocar de resolucao mantem o
      // desenho antigo na tela ate o novo ficar pronto.
      if (size.width === 0) setLoading(true);
      setError(null);
      try {
        task = pdfjs.getDocument(fileUrl);
        const doc = await task.promise;
        if (cancelled) return;

        const page = await doc.getPage(pageNumber);
        const largura = wrapRef.current?.clientWidth ?? 900;
        const base = page.getViewport({ scale: 1 });
        // Escala pela largura disponivel; o dobro de pixels mantem o desenho
        // tecnico legivel, que e o ponto de uma planta. O degrau de zoom
        // multiplica isso para quem se aproxima.
        let escala = (largura / base.width) * 2 * qualidade;
        // Teto do navegador: passar disto devolve canvas em branco.
        const proporcao = base.height / base.width;
        const larguraMaxima = Math.min(
          LADO_MAX,
          Math.sqrt(PIXELS_MAX / proporcao),
          LADO_MAX / proporcao,
        );
        escala = Math.min(escala, larguraMaxima / base.width);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, pageNumber, qualidade]);

  /** Do toque na tela para o ponto normalizado da pagina. */
  function marcar(clientX: number, clientY: number) {
    if (!onPick) return;
    // Mede o elemento JA transformado: o retangulo dele traz o zoom e o
    // deslocamento embutidos, entao a conta continua a mesma de antes.
    const alvo = conteudoRef.current?.getBoundingClientRect();
    if (!alvo || alvo.width === 0 || alvo.height === 0) return;
    const x = (clientX - alvo.left) / alvo.width;
    const y = (clientY - alvo.top) / alvo.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPick({ x, y });
  }

  function distanciaEntrePonteiros(): number {
    const [a, b] = [...ponteiros.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function centroDosPonteiros(): { x: number; y: number } {
    const lista = [...ponteiros.current.values()];
    const soma = lista.reduce(
      (total, p) => ({ x: total.x + p.x, y: total.y + p.y }),
      { x: 0, y: 0 },
    );
    return { x: soma.x / lista.length, y: soma.y / lista.length };
  }

  function aoPressionar(evento: React.PointerEvent<HTMLDivElement>) {
    // Os botoes de zoom ficam DENTRO da janela. Sem esta saida, o
    // setPointerCapture abaixo rouba o ponteiro deles e o clique nunca
    // chega ao botao — foi assim que + e - ficaram inertes no primeiro teste.
    if ((evento.target as HTMLElement).closest("[data-controles-zoom]")) return;
    ponteiros.current.set(evento.pointerId, {
      x: evento.clientX,
      y: evento.clientY,
    });
    // Capturar pode falhar se o ponteiro ja foi solto (acontece em toque
    // rapido). Se falhar, o gesto ainda funciona; so nao segue o dedo para
    // fora da janela. Deixar estourar aqui mataria a marcacao inteira.
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId);
    } catch {
      /* segue sem captura */
    }
    gesto.current = {
      inicio: { x: evento.clientX, y: evento.clientY },
      deslocouPx: 0,
      distancia: distanciaEntrePonteiros(),
      zoomInicial: zoom,
    };
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    if (!ponteiros.current.has(evento.pointerId)) return;
    const anterior = ponteiros.current.get(evento.pointerId)!;
    ponteiros.current.set(evento.pointerId, {
      x: evento.clientX,
      y: evento.clientY,
    });
    const atual = gesto.current;
    if (!atual) return;

    atual.deslocouPx = Math.max(
      atual.deslocouPx,
      Math.hypot(
        evento.clientX - atual.inicio.x,
        evento.clientY - atual.inicio.y,
      ),
    );

    // Dois dedos: pinca. A distancia entre eles vira o fator de zoom.
    if (ponteiros.current.size >= 2) {
      const distancia = distanciaEntrePonteiros();
      if (atual.distancia > 0 && distancia > 0) {
        const centro = centroDosPonteiros();
        ampliarEm(
          (atual.zoomInicial * distancia) / atual.distancia,
          centro.x,
          centro.y,
        );
      }
      return;
    }

    // Um dedo, com a planta ampliada: arrasta.
    const dx = evento.clientX - anterior.x;
    const dy = evento.clientY - anterior.y;
    setVista((posicao) =>
      posicao.zoom <= 1
        ? posicao
        : ajustar(posicao.zoom, posicao.x + dx, posicao.y + dy),
    );
  }

  function aoSoltar(evento: React.PointerEvent<HTMLDivElement>) {
    const atual = gesto.current;
    ponteiros.current.delete(evento.pointerId);
    try {
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
    } catch {
      /* ja solto */
    }
    if (ponteiros.current.size > 0) return;
    gesto.current = null;
    // Toque parado marca; toque que arrastou so moveu a planta. Sem esta
    // distincao, arrastar para ver o outro canto deixaria uma marca solta.
    if (atual && atual.deslocouPx < ARRASTE_MIN_PX) {
      marcar(evento.clientX, evento.clientY);
    }
  }

  /**
   * A roda precisa de listener NAO passivo.
   *
   * O React registra onWheel como passivo, e num listener passivo o
   * preventDefault e ignorado: a planta ampliava e o navegador ampliava a
   * pagina junto, os dois ao mesmo tempo. Registrado na mao, o gesto fica
   * so da planta.
   */
  React.useEffect(() => {
    const janela = janelaRef.current;
    if (!janela) return;
    const aoRolar = (evento: WheelEvent) => {
      // Zoom e com Ctrl (o pinca do trackpad chega assim). Rolagem limpa
      // continua rolando a pagina, como em qualquer outro lugar do app.
      if (!evento.ctrlKey) return;
      evento.preventDefault();
      ampliarEm(
        vistaRef.current.zoom * (evento.deltaY < 0 ? 1.12 : 1 / 1.12),
        evento.clientX,
        evento.clientY,
      );
    };
    janela.addEventListener("wheel", aoRolar, { passive: false });
    return () => janela.removeEventListener("wheel", aoRolar);
  }, [ampliarEm]);

  const ampliada = zoom > 1;

  return (
    <div ref={wrapRef} className={cn("space-y-2", className)}>
      {error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div
        ref={janelaRef}
        className={cn(
          "relative w-full overflow-hidden rounded-md border bg-white",
          onPick && !ampliada && "cursor-crosshair",
          ampliada && "cursor-grab",
        )}
        // pan-y deixa a pagina rolar com um dedo enquanto a planta esta
        // encaixada; ampliada, o dedo passa a ser da planta.
        style={{ touchAction: ampliada ? "none" : "pan-y" }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        aria-label={onPick ? "Toque na planta para marcar" : "Planta de indicação"}
      >
        <div
          ref={conteudoRef}
          style={{
            transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`,
            transformOrigin: "0 0",
          }}
          className="relative"
        >
          <canvas ref={canvasRef} className="block w-full" />

          {/* As marcas ficam num SVG por cima, em coordenadas de 0 a 1: o
              navegador reposiciona sozinho quando a tela muda de tamanho, e
              o zoom leva as duas camadas juntas. */}
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
        </div>

        <div
          data-controles-zoom
          className="absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-white/95 p-1 shadow-sm"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Diminuir zoom"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => ampliarNoCentro(1 / 1.6)}
          >
            <Minus className="size-4" />
          </Button>
          <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Aumentar zoom"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => ampliarNoCentro(1.6)}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Encaixar a planta na tela"
            disabled={zoom === 1 && vista.x === 0 && vista.y === 0}
            onClick={encaixar}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <p className="text-sm text-muted-foreground">Abrindo a planta...</p>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {onPick ? (
          <>
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
            .{" "}
          </>
        ) : null}
        Aproxime com dois dedos, ou com Ctrl e a roda do mouse
        {ampliada ? "; arraste para andar pela planta" : ""}.
      </p>
    </div>
  );
}

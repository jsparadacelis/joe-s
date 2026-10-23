import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Exageracion, Relieve } from "@/lib/relieve";
import { alturaEn } from "@/lib/relieve-lecturas";
import { leerRampaAlturas, type ColoresEscena } from "@/lib/relieve-colores";

/** Este módulo es el ÚNICO que importa `three`; se carga con `import()` desde el visor. */
export interface Escena {
  reiniciar(): void;
  acercar(): void;
  alejar(): void;
  actualizarExageracion(exageracion: Exageracion): void;
  liberar(): void;
}

/** Divisiones de la malla del terreno por eje. */
const DIVISIONES_MALLA = 90;
/** Puntos intermedios por lado en el borde de la parcela para que siga el terreno. */
const PUNTOS_POR_LADO = 12;
const ANCHO_POR_DEFECTO = 600;
const ALTO_POR_DEFECTO = 460;
/** Colores de reserva (tonos neutros) si los tokens del tema no están disponibles. */
const GRIS_FONDO = 0x808080;
const GRIS_BORDE = 0x6b6b6b;
const GRIS_ACENTO = 0x5a5a5a;
/** Luces neutras: blanco (cielo), gris medio (suelo) y blanco (sol); no son colores de la interfaz. */
const LUZ_CIELO = 0xffffff;
const LUZ_SUELO = 0x808080;
const LUZ_SOL = 0xffffff;

const color = (valor: string, reserva: number) => new Color(valor || reserva);

type ObjetoConRecursos = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };

/** Libera la geometría y los materiales de un objeto (sirve para `traverse`). */
function liberarObjeto(objeto: Object3D) {
  const { geometry, material } = objeto as ObjetoConRecursos;
  geometry?.dispose();
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material?.dispose();
}

/**
 * Monta la escena 3D del relieve dentro de `contenedor`.
 * Lanza `Error` si el navegador no tiene WebGL. Todo se libera en `liberar()`.
 */
export function montarEscena(
  contenedor: HTMLElement,
  relieve: Relieve,
  exageracion: Exageracion,
  colores: ColoresEscena,
): Escena {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    throw new Error("WebGL no disponible");
  }

  const scene = new Scene();
  let controls: OrbitControls | null = null;
  let observador: ResizeObserver | null = null;
  let cuadro = 0;
  let liberada = false;

  const liberar = () => {
    if (liberada) return;
    liberada = true;
    cancelAnimationFrame(cuadro);
    observador?.disconnect();
    if (controls) {
      controls.stopListenToKeyEvents();
      controls.dispose();
    }
    scene.traverse(liberarObjeto);
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };

  try {
    const [x0, y0, x1, y1] = relieve.ventana;
    const ancho = contenedor.clientWidth || ANCHO_POR_DEFECTO;
    const alto = contenedor.clientHeight || ALTO_POR_DEFECTO;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setSize(ancho, alto);
    contenedor.appendChild(renderer.domElement);

    scene.background = color(colores.fondo, GRIS_FONDO);
    const camara = new PerspectiveCamera(40, ancho / alto, 0.1, 5000);
    controls = new OrbitControls(camara, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    // Flechas del teclado con el visor enfocado (el contenedor es enfocable).
    controls.listenToKeyEvents(contenedor);

    scene.add(new HemisphereLight(LUZ_CIELO, LUZ_SUELO, 2));
    const sol = new DirectionalLight(LUZ_SOL, 2);
    sol.position.set(-240, 360, 180);
    scene.add(sol);

    // Cotas de la rejilla: base del eje vertical y extremos de la rampa de colores.
    let cotaMin = Infinity;
    let cotaMax = -Infinity;
    for (const h of relieve.alturas) {
      cotaMin = Math.min(cotaMin, h);
      cotaMax = Math.max(cotaMax, h);
    }
    const base = (cotaMin + cotaMax) / 2;
    const rampa = leerRampaAlturas().map((c) => color(c, GRIS_FONDO));
    const colorEn = (t: number) => {
      const q = Math.min(Math.max(t, 0), 1) * (rampa.length - 1);
      const k = Math.min(Math.floor(q), rampa.length - 2);
      return rampa[k].clone().lerp(rampa[k + 1], q - k);
    };

    // Geometría que depende de la exageración: se reconstruye al cambiarla.
    const contenido = new Group();
    scene.add(contenido);

    const construir = (ex: number) => {
      const yEn = (x: number, y: number, desfase = 0) => (alturaEn(relieve, x, y) - base) * ex + desfase;

      const posiciones: number[] = [];
      const colorVertices: number[] = [];
      const indices: number[] = [];
      for (let j = 0; j <= DIVISIONES_MALLA; j++) {
        for (let i = 0; i <= DIVISIONES_MALLA; i++) {
          const x = x0 + (i * (x1 - x0)) / DIVISIONES_MALLA;
          const y = y1 - (j * (y1 - y0)) / DIVISIONES_MALLA;
          const h = alturaEn(relieve, x, y);
          posiciones.push(x, (h - base) * ex, -y);
          const c = colorEn((h - cotaMin) / Math.max(cotaMax - cotaMin, 0.01));
          colorVertices.push(c.r, c.g, c.b);
          if (i < DIVISIONES_MALLA && j < DIVISIONES_MALLA) {
            const a = j * (DIVISIONES_MALLA + 1) + i;
            const b = a + 1;
            const c2 = a + DIVISIONES_MALLA + 1;
            indices.push(a, c2, b, b, c2, c2 + 1);
          }
        }
      }
      const terreno = new BufferGeometry();
      terreno.setAttribute("position", new Float32BufferAttribute(posiciones, 3));
      terreno.setAttribute("color", new Float32BufferAttribute(colorVertices, 3));
      terreno.setIndex(indices);
      terreno.computeVertexNormals();
      contenido.add(
        new Mesh(terreno, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide })),
      );

      // Borde del recorte (la ventana).
      const recorte = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ].map(([x, y]) => new Vector3(x, yEn(x, y, -0.1), -y));
      contenido.add(
        new Line(
          new BufferGeometry().setFromPoints(recorte),
          new LineBasicMaterial({ color: color(colores.borde, GRIS_BORDE) }),
        ),
      );

      // Parcela (recortada a la ventana): relleno translúcido y borde que sigue el terreno.
      const perimetro = relieve.perimetro;
      if (perimetro.length < 3) return;
      const contorno = perimetro.map(([x, y]) => new Vector2(x, -y));
      const caras = ShapeUtils.triangulateShape(contorno, []);
      const relleno: number[] = [];
      for (const cara of caras) {
        for (const indice of cara) {
          const [x, y] = perimetro[indice];
          relleno.push(x, yEn(x, y, 0.5), -y);
        }
      }
      const acento = color(colores.acento, GRIS_ACENTO);
      const geometriaParcela = new BufferGeometry();
      geometriaParcela.setAttribute("position", new Float32BufferAttribute(relleno, 3));
      geometriaParcela.computeVertexNormals();
      contenido.add(
        new Mesh(
          geometriaParcela,
          new MeshStandardMaterial({ color: acento, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false }),
        ),
      );
      const borde: Vector3[] = [];
      perimetro.forEach(([ax, ay], i) => {
        const [bx, by] = perimetro[(i + 1) % perimetro.length];
        for (let s = 0; s < PUNTOS_POR_LADO; s++) {
          const t = s / PUNTOS_POR_LADO;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          borde.push(new Vector3(x, yEn(x, y, 1), -y));
        }
      });
      borde.push(borde[0].clone());
      contenido.add(new Line(new BufferGeometry().setFromPoints(borde), new LineBasicMaterial({ color: acento })));
    };

    const vaciar = () => {
      for (const hijo of [...contenido.children]) {
        hijo.traverse(liberarObjeto);
        contenido.remove(hijo);
      }
    };

    construir(exageracion);

    const lado = Math.max(x1 - x0, y1 - y0);
    const centroX = (x0 + x1) / 2;
    const centroY = (y0 + y1) / 2;
    controls.target.set(centroX, 0, -centroY);
    controls.minDistance = lado * 0.25;
    controls.maxDistance = lado * 4;
    const controlesActivos = controls;
    const encuadrar = () => {
      camara.position.set(centroX + lado * 0.45, lado * 0.75, -centroY + lado * 0.9);
      camara.lookAt(controlesActivos.target);
      controlesActivos.update();
    };
    encuadrar();

    if (typeof ResizeObserver !== "undefined") {
      observador = new ResizeObserver(() => {
        const w = contenedor.clientWidth;
        const h = contenedor.clientHeight;
        if (!w || !h) return;
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      observador.observe(contenedor);
    }

    const bucle = () => {
      cuadro = requestAnimationFrame(bucle);
      controlesActivos.update();
      renderer.render(scene, camara);
    };
    bucle();

    return {
      reiniciar: encuadrar,
      acercar() {
        camara.position.lerp(controlesActivos.target, 0.16);
        controlesActivos.update();
      },
      alejar() {
        camara.position.sub(controlesActivos.target).multiplyScalar(1.19).add(controlesActivos.target);
        controlesActivos.update();
      },
      actualizarExageracion(nueva) {
        if (liberada) return;
        vaciar();
        construir(nueva);
      },
      liberar,
    };
  } catch (error) {
    liberar();
    throw error;
  }
}

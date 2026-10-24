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
import type { Exaggeration, Relief } from "@/lib/relief";
import { heightAt } from "@/lib/relief-readings";
import { readHeightRamp, type SceneColors } from "@/lib/relief-colors";

/** Este módulo es el ÚNICO que importa `three`; se carga con `import()` desde el visor. */
export interface ReliefScene {
  reset(): void;
  zoomIn(): void;
  zoomOut(): void;
  updateExaggeration(exaggeration: Exaggeration): void;
  release(): void;
}

/** Divisiones de la malla del terreno por eje. */
const MESH_DIVISIONS = 90;
/** Puntos intermedios por lado en el borde de la parcela para que siga el terreno. */
const POINTS_PER_SIDE = 12;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 460;
/** Colores de reserva (tonos neutros) si los tokens del tema no están disponibles. */
const GREY_BACKGROUND = 0x808080;
const GREY_BORDER = 0x6b6b6b;
const GREY_ACCENT = 0x5a5a5a;
/** Luces neutras: blanco (cielo), gris medio (suelo) y blanco (sol); no son colores de la interfaz. */
const SKY_LIGHT = 0xffffff;
const GROUND_LIGHT = 0x808080;
const SUN_LIGHT = 0xffffff;

const color = (value: string, fallback: number) => new Color(value || fallback);

type ObjectWithResources = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };

/** Libera la geometría y los materiales de un objeto (sirve para `traverse`). */
function releaseObject(object: Object3D) {
  const { geometry, material } = object as ObjectWithResources;
  geometry?.dispose();
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material?.dispose();
}

/**
 * Monta la escena 3D del relieve dentro de `contenedor`.
 * Lanza `Error` si el navegador no tiene WebGL. Todo se libera en `liberar()`.
 */
export function mountScene(
  host: HTMLElement,
  relief: Relief,
  exaggeration: Exaggeration,
  colors: SceneColors,
): ReliefScene {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    throw new Error("WebGL no disponible");
  }

  const scene = new Scene();
  let controls: OrbitControls | null = null;
  let observer: ResizeObserver | null = null;
  let frameId = 0;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    if (controls) {
      controls.stopListenToKeyEvents();
      controls.dispose();
    }
    scene.traverse(releaseObject);
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };

  try {
    const [x0, y0, x1, y1] = relief.viewWindow;
    const width = host.clientWidth || DEFAULT_WIDTH;
    const height = host.clientHeight || DEFAULT_HEIGHT;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    scene.background = color(colors.background, GREY_BACKGROUND);
    const camera = new PerspectiveCamera(40, width / height, 0.1, 5000);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    // Flechas del teclado con el visor enfocado (el contenedor es enfocable).
    controls.listenToKeyEvents(host);

    scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 2));
    const sun = new DirectionalLight(SUN_LIGHT, 2);
    sun.position.set(-240, 360, 180);
    scene.add(sun);

    // Cotas de la rejilla: base del eje vertical y extremos de la rampa de colores.
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    for (const h of relief.heights) {
      minElevation = Math.min(minElevation, h);
      maxElevation = Math.max(maxElevation, h);
    }
    const base = (minElevation + maxElevation) / 2;
    const ramp = readHeightRamp().map((c) => color(c, GREY_BACKGROUND));
    const colorAt = (t: number) => {
      const q = Math.min(Math.max(t, 0), 1) * (ramp.length - 1);
      const k = Math.min(Math.floor(q), ramp.length - 2);
      return ramp[k].clone().lerp(ramp[k + 1], q - k);
    };

    // Geometría que depende de la exageración: se reconstruye al cambiarla.
    const content = new Group();
    scene.add(content);

    const build = (ex: number) => {
      const yAt = (x: number, y: number, offset = 0) => (heightAt(relief, x, y) - base) * ex + offset;

      const positions: number[] = [];
      const vertexColorValues: number[] = [];
      const indices: number[] = [];
      for (let j = 0; j <= MESH_DIVISIONS; j++) {
        for (let i = 0; i <= MESH_DIVISIONS; i++) {
          const x = x0 + (i * (x1 - x0)) / MESH_DIVISIONS;
          const y = y1 - (j * (y1 - y0)) / MESH_DIVISIONS;
          const h = heightAt(relief, x, y);
          positions.push(x, (h - base) * ex, -y);
          const c = colorAt((h - minElevation) / Math.max(maxElevation - minElevation, 0.01));
          vertexColorValues.push(c.r, c.g, c.b);
          if (i < MESH_DIVISIONS && j < MESH_DIVISIONS) {
            const a = j * (MESH_DIVISIONS + 1) + i;
            const b = a + 1;
            const c2 = a + MESH_DIVISIONS + 1;
            indices.push(a, c2, b, b, c2, c2 + 1);
          }
        }
      }
      const terrain = new BufferGeometry();
      terrain.setAttribute("position", new Float32BufferAttribute(positions, 3));
      terrain.setAttribute("color", new Float32BufferAttribute(vertexColorValues, 3));
      terrain.setIndex(indices);
      terrain.computeVertexNormals();
      content.add(
        new Mesh(terrain, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide })),
      );

      // Borde del recorte (la ventana).
      const clip = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ].map(([x, y]) => new Vector3(x, yAt(x, y, -0.1), -y));
      content.add(
        new Line(
          new BufferGeometry().setFromPoints(clip),
          new LineBasicMaterial({ color: color(colors.border, GREY_BORDER) }),
        ),
      );

      // Parcela (recortada a la ventana): relleno translúcido y borde que sigue el terreno.
      const perimeter = relief.perimeter;
      if (perimeter.length < 3) return;
      const outline = perimeter.map(([x, y]) => new Vector2(x, -y));
      const faces = ShapeUtils.triangulateShape(outline, []);
      const fill: number[] = [];
      for (const face of faces) {
        for (const index of face) {
          const [x, y] = perimeter[index];
          fill.push(x, yAt(x, y, 0.5), -y);
        }
      }
      const accent = color(colors.accent, GREY_ACCENT);
      const plotGeometry = new BufferGeometry();
      plotGeometry.setAttribute("position", new Float32BufferAttribute(fill, 3));
      plotGeometry.computeVertexNormals();
      content.add(
        new Mesh(
          plotGeometry,
          new MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false }),
        ),
      );
      const border: Vector3[] = [];
      perimeter.forEach(([ax, ay], i) => {
        const [bx, by] = perimeter[(i + 1) % perimeter.length];
        for (let s = 0; s < POINTS_PER_SIDE; s++) {
          const t = s / POINTS_PER_SIDE;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          border.push(new Vector3(x, yAt(x, y, 1), -y));
        }
      });
      border.push(border[0].clone());
      content.add(new Line(new BufferGeometry().setFromPoints(border), new LineBasicMaterial({ color: accent })));
    };

    const clear = () => {
      for (const child of [...content.children]) {
        child.traverse(releaseObject);
        content.remove(child);
      }
    };

    build(exaggeration);

    const side = Math.max(x1 - x0, y1 - y0);
    const centroX = (x0 + x1) / 2;
    const centroY = (y0 + y1) / 2;
    controls.target.set(centroX, 0, -centroY);
    controls.minDistance = side * 0.25;
    controls.maxDistance = side * 4;
    const activeControls = controls;
    const frameView = () => {
      camera.position.set(centroX + side * 0.45, side * 0.75, -centroY + side * 0.9);
      camera.lookAt(activeControls.target);
      activeControls.update();
    };
    frameView();

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      observer.observe(host);
    }

    const loop = () => {
      frameId = requestAnimationFrame(loop);
      activeControls.update();
      renderer.render(scene, camera);
    };
    loop();

    return {
      reset: frameView,
      zoomIn() {
        camera.position.lerp(activeControls.target, 0.16);
        activeControls.update();
      },
      zoomOut() {
        camera.position.sub(activeControls.target).multiplyScalar(1.19).add(activeControls.target);
        activeControls.update();
      },
      updateExaggeration(next) {
        if (released) return;
        clear();
        build(next);
      },
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}

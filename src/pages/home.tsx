import { createSignal, onMount } from 'solid-js';
import { Engine, Scene, MeshBuilder, HemisphericLight, Mesh, Vector3, Color3, StandardMaterial, Space, PhysicsEngine, Ray } from 'babylonjs';

export default function Home() {

  const [box, setBox] = createSignal<Mesh>();
  const [scale, setScale] = createSignal(1);
  const [scene, setScene] = createSignal<Scene>();
  const [selectedNode, setSelectedNode] = createSignal<Mesh>();
  onMount(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.createDefaultCamera(true, true, true);
    scene.createDefaultLight(true);
    const box = MeshBuilder.CreateBox('box', { size: 2 }, scene);
    box.position.y = 1;
    const redMaterial = new StandardMaterial('box', scene);
    redMaterial.diffuseColor = new Color3(1, 0, 0);
    redMaterial.specularColor = new Color3(1, 1, 1);
    redMaterial.specularPower = 100;
    box.material = redMaterial;
    let lastResult: any = null;
    canvas.addEventListener('click', (e) => {
      const result = scene.pick(e.offsetX, e.offsetY, (node) => node.name === 'box');
      if (result.hit) {
        lastResult = result;
        setSelectedNode(result.pickedMesh as Mesh);
        result.pickedMesh.material = new StandardMaterial('selected', scene);
      } else {
        setSelectedNode(undefined);
        lastResult.pickedMesh.material = redMaterial;
      }
    });
    setBox(box);
    setScene(scene);
    engine.runRenderLoop(() => scene.render());
  });

  return (
    <section class="bg-gray-100 text-gray-700 p-8 h-[calc(100vh-4rem)] w-[80vw]">
      <canvas id="canvas" class="h-full w-full" />
      <button class="bg-blue-500 text-white p-2 rounded-md" onClick={() => box()?.rotate(Vector3.Up(), 1, Space.LOCAL)}>Rotate</button>
      {/* Scale slider */}
      <input type="range" min="0" max="10" step="0.1" value={scale()} onChange={(e) => setScale(Number(e.target.value))} />
      <button class="bg-green-500 text-white p-2 rounded-md" onClick={() => box()?.scaling.set(scale(), scale(), scale())}>Scale</button>
      <p>Active nodes: {scene()?.getNodes().length}</p>
      <p>Selected node: {selectedNode()?.name}</p>
    </section>
  );
}

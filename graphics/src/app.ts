import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight, Mesh } from "@babylonjs/core";

class App {
    constructor() {
        var canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.id = "canvas";
        document.body.appendChild(canvas);

        var engine = new Engine(canvas, true);
        var scene = this.setupAndRenderScene(engine, canvas);
    }


    async setupAndRenderScene (engine: Engine, canvas: HTMLCanvasElement) {
        var scene = new Scene(engine);
        var camera = new FreeCamera("camera1", new Vector3(0, 5, -10), scene);
        camera.setTarget(Vector3.Zero());
        camera.attachControl(canvas, true);
        var light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        var sphere = Mesh.CreateSphere("sphere1", 16, 2, scene);
        sphere.position.y = 1;

        const env = scene.createDefaultEnvironment();

        const xr = await scene.createDefaultXRExperienceAsync({
        floorMeshes: [env.ground],
        });

        window.addEventListener("keydown", (ev) => {
            // Shift+Ctrl+Alt+I
            if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
                if (scene.debugLayer.isVisible()) {
                    scene.debugLayer.hide();
                } else {
                    scene.debugLayer.show();
                }
            }
        });

        engine.runRenderLoop(() => {
            scene.render();
        });
    };
}
new App();

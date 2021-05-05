import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight, Mesh, Color3, CubeTexture, MeshBuilder, StandardMaterial, Texture } from "@babylonjs/core";
import skybox_nx from "./textures/skybox_nx.jpg";
import skybox_ny from "./textures/skybox_ny.jpg";
import skybox_nz from "./textures/skybox_nz.jpg";
import skybox_px from "./textures/skybox_px.jpg";
import skybox_py from "./textures/skybox_py.jpg";
import skybox_pz from "./textures/skybox_pz.jpg";

import * as BABYLON from "@babylonjs/core";
(window as any).BABYLON = BABYLON;
import * as MeshWriter from "meshwriter";

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

        var skybox = MeshBuilder.CreateBox("skyBox", {size:500}, scene);
        var skyboxMaterial = new StandardMaterial("skyBox", scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = CubeTexture.CreateFromImages([
            skybox_px,
            skybox_py,
            skybox_pz,
            skybox_nx,
            skybox_ny,
            skybox_nz
        ], scene)
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.disableLighting = true;
        skybox.material = skyboxMaterial;

        const ground = MeshBuilder.CreateGround("ground", {height: 100, width: 100, subdivisions: 1});
        ground.visibility = 0;

        const xr = await scene.createDefaultXRExperienceAsync({
            floorMeshes: [ground],
        });

        const Writer = MeshWriter(scene, { scale: 1, defaultFont: "Arial" });
        const textMesh = new Writer("Happy Mother's Day", {
            "font-family": "Arial",
            "letter-height": 15,
            "letter-thickness": 2,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#000000",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: 0,
                y: 2,
                z: 30,
            }
        });

        textMesh.getMesh().rotation.x = - Math.PI / 2;

        window.addEventListener("keydown", (ev) => {
            // Shift+Ctrl+I
            if (ev.shiftKey && ev.ctrlKey && ev.keyCode === 73) {
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
    }
}
new App();

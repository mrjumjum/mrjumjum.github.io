import "pepjs";
import flare from "./textures/flare.png";
import firework_crackle from "./sounds/firework-crackle.mp3";
import firework_pop from "./sounds/firework-pop.mp3";
import firework_whistle from "./sounds/firework-whistle.wav";
const happyjson = require("./meshes/happy.babylon");
let happyblob = new Blob([JSON.stringify(happyjson)]);
let happyurl = URL.createObjectURL(happyblob);
const motherjson = require("./meshes/mother.babylon");
let motherblob = new Blob([JSON.stringify(motherjson)]);
let motherurl = URL.createObjectURL(motherblob);
const dayjson = require("./meshes/day.babylon");
let dayblob = new Blob([JSON.stringify(dayjson)]);
let dayurl = URL.createObjectURL(dayblob);
const heartjson = require("./meshes/heart.babylon");
let heartblob = new Blob([JSON.stringify(heartjson)]);
let hearturl = URL.createObjectURL(heartblob);

import * as BABYLON from "babylonjs";
import * as GUI from "babylonjs-gui";
import * as CANNON from "cannon";
(window as any).BABYLON = BABYLON;
(window as any).CANNON = CANNON;
import * as MeshWriter from "meshwriter";
import { Rocket, ROCKET_STATES } from "./rocket";
import { randomInt, randomFloat, randomFloatUnderOne } from "./utility";

const GRAVITY  = -2; // per second

const MESHES_LIST: BABYLON.Mesh[] = [];

enum MESHES{
    HAPPY,
    MOTHER,
    DAY,
    HEART,
}

enum XR_SUPPORT{
    AR,
    VR,
    NONE,
}

class Show {
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private camera: BABYLON.FreeCamera;
    private scene: BABYLON.Scene;
    private shadowCasters: BABYLON.Mesh[] = [];
    private rockets: Rocket[] = [];
    private assetsManager: BABYLON.AssetsManager;
    private explosionMesh: BABYLON.Mesh;
    private ground: BABYLON.Mesh;
    private xrSupport: XR_SUPPORT = XR_SUPPORT.NONE;
    private xrExperience: BABYLON.WebXRDefaultExperience = null;
    private linesMesh: BABYLON.Mesh;
    private pointMesh: BABYLON.Mesh;
    private debugInfo: GUI.TextBlock;
    private textMeshes: BABYLON.Mesh[] = [];

    constructor(){
        this.canvas = document.createElement("canvas");;
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "canvas";
        this.canvas["touch-action"] = "none";
        document.body.appendChild(this.canvas);
        this.engine = new BABYLON.Engine(this.canvas, true); // Generate the BABYLON 3D engine
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.CannonJSPlugin());
        this.scene.clearColor = new BABYLON.Color4(0,0,0,1);

        this.initCamera();
        this.initGround();
        this.initXRExpInput();
        this.initText();

        this.assetsManager = new BABYLON.AssetsManager(this.scene);
        // this.initDebugInfo();
    }

    private initCamera() {
        this.camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 0.5, 0), this.scene);
        this.camera.setTarget(new BABYLON.Vector3(0,3,10));
        this.camera.attachControl(this.canvas, true);
    }

    private initGround() {
        this.ground = BABYLON.MeshBuilder.CreateGround("ground", {height: 100, width: 100, subdivisions: 1});
        this.ground.receiveShadows = true;
        this.ground.physicsImpostor = new BABYLON.PhysicsImpostor(this.ground, BABYLON.PhysicsImpostor.PlaneImpostor, { mass: 0, restitution: 0.9 }, this.scene);
    }

    private initDebugInfo() {
        const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
        this.debugInfo = new GUI.TextBlock();
        this.debugInfo.text = "nothing";
        this.debugInfo.fontSize = 24;
        this.debugInfo.top = -100;
        this.debugInfo.color = "white";
        advancedTexture.addControl(this.debugInfo);
    }

    private async initXRExpInput() {
        const xr = await this.scene.createDefaultXRExperienceAsync({
            // floorMeshes: [ground],
            uiOptions: {
                sessionMode: 'immersive-ar',
            }
        });

        const supportsVR = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
        const supportsAR = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');

        if (supportsAR) {
            console.log("AR Supported");
            this.xrSupport = XR_SUPPORT.AR;
            this.xrExperience = await this.scene.createDefaultXRExperienceAsync({
                uiOptions: {
                    sessionMode: 'immersive-ar',
                }
            });
            this.ground.dispose();
            this.linesMesh = BABYLON.MeshBuilder.CreateLines("lines", {
                points: [BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero()],
                updatable: true,
            }, this.scene);
            this.pointMesh = BABYLON.MeshBuilder.CreateSphere("point", {diameter: 0.5}, this.scene);
            this.scene.onPointerDown = () => {
                const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, BABYLON.Matrix.Identity(), this.xrExperience.baseExperience.camera);
                this.linesMesh = BABYLON.MeshBuilder.CreateLines("lines", {
                    points: [ray.origin, ray.origin.add(ray.direction).scale(5)],
                    instance: this.linesMesh as BABYLON.LinesMesh,
                }, this.scene);
                this.pointMesh.position = this.xrExperience.baseExperience.camera.position;
            };
        } else if (supportsVR){
            console.log("VR Supported");
            this.xrSupport = XR_SUPPORT.VR;
            this.xrExperience = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.ground],
                uiOptions: {
                    sessionMode: 'immersive-vr',
                }
            });

            this.xrExperience.input.onControllerAddedObservable.add((inputSource) => {
                inputSource.onMotionControllerInitObservable.add((motionController) => {
                    const triggerComponent = motionController.getComponent("xr-standard-trigger");
                    if (triggerComponent) {
                        triggerComponent.onButtonStateChangedObservable.add((component) => {
                            let changes = component.changes;
                            if (changes.pressed) {
                                // pressed state changed
                                const isPressedNow = changes.pressed.current;
                                const wasPressedInLastFrame = changes.pressed.previous;
                                if (!isPressedNow && wasPressedInLastFrame) {
                                    const resultRay = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3());
                                    // get the pointer direction
                                    inputSource.getWorldPointerRayToRef(resultRay);
                                    this.fireRocket(resultRay.direction, resultRay.origin, MESHES_LIST[0]);
                                }
                            }
                        });
                    }
                });
            });
        } else {
            console.log("No XR Supported");
            this.xrSupport = XR_SUPPORT.NONE;

            window.addEventListener("keydown", ev => {
                // Shift+Ctrl+I
                if (ev.shiftKey && ev.ctrlKey && ev.keyCode === 73) {
                    if (this.scene.debugLayer.isVisible()) {
                        this.scene.debugLayer.hide();
                    } else {
                        this.scene.debugLayer.show();
                    }
                }
            });

            this.scene.onPointerObservable.add(pointerInfo => {
                switch (pointerInfo.type) {
                    case BABYLON.PointerEventTypes.POINTERDOUBLETAP:
                        this.fireRocket(pointerInfo.pickInfo.ray.direction.add(new BABYLON.Vector3(0,0.3,0)), pointerInfo.pickInfo.ray.origin, MESHES_LIST[MESHES.HEART]);
                        break;
                }
            });
        }
    }

    private initText() {
        const Writer = MeshWriter(this.scene, { scale: 1, defaultFont: "Arial" });
        const LETTER_HEIGHT = 1;
        const LETTER_THICKNESS = 0.5;
        this.textMeshes.push(new Writer("Happy", {
            "font-family": "Arial",
            "letter-height": LETTER_HEIGHT,
            "letter-thickness": LETTER_THICKNESS,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#bfbfbf",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: -4,
                y: 1,
                z: 7,
            }
        }).getMesh());

        this.textMeshes.push(new Writer("Mother's", {
            "font-family": "Arial",
            "letter-height": LETTER_HEIGHT,
            "letter-thickness": LETTER_THICKNESS,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#bfbfbf",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: 0,
                y: 0.2,
                z: 11,
            }
        }).getMesh());

        this.textMeshes.push(new Writer("Day", {
            "font-family": "Arial",
            "letter-height": LETTER_HEIGHT,
            "letter-thickness": LETTER_THICKNESS,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#bfbfbf",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: 3,
                y: 0.5,
                z: 5,
            }
        }).getMesh());

        this.textMeshes.forEach(m => {
            m.rotation.x = - Math.PI / 2;
            m.receiveShadows = true;
            m.physicsImpostor = new BABYLON.PhysicsImpostor(m, BABYLON.PhysicsImpostor.MeshImpostor, { mass: 0, restitution: 0.9 }, this.scene);
        });

        this.shadowCasters = this.textMeshes;
    }

    run() {
        this.assetsManager.onTaskErrorObservable.add((task) => {
            console.log('task failed', task.errorObject.message, task.errorObject.exception);
        });
        this.assetsManager.addTextureTask("flare task", flare);
        this.assetsManager.addBinaryFileTask("firework pop task", firework_pop);
        this.assetsManager.addBinaryFileTask("firework crackle task", firework_crackle);
        this.assetsManager.addBinaryFileTask("firework whistle task", firework_whistle);
        this.assetsManager.addMeshTask("happy mesh task", "", "", happyurl).onSuccess = t => {
            const m = t.loadedMeshes[0];
            m.addRotation(-Math.PI / 2, 0, 0);
            m.visibility = 0;
            m.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);
            MESHES_LIST[MESHES.HAPPY] = m as BABYLON.Mesh;
        }

       this.assetsManager.addMeshTask("mother mesh task", "", "", motherurl).onSuccess = t => {
            const m = t.loadedMeshes[0];
            m.addRotation(-Math.PI / 2, 0, 0);
            m.visibility = 0;
            m.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);
            MESHES_LIST[MESHES.MOTHER] = m as BABYLON.Mesh;
        }

        this.assetsManager.addMeshTask("day mesh task", "", "", dayurl).onSuccess = t => {
            const m = t.loadedMeshes[0];
            m.addRotation(-Math.PI / 2, 0, 0);
            m.visibility = 0;
            m.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);
            MESHES_LIST[MESHES.DAY] = m as BABYLON.Mesh;
        }

        this.assetsManager.addMeshTask("heart mesh task", "", "", hearturl).onSuccess = t => {
            const m = t.loadedMeshes[0];
            m.addRotation(-Math.PI / 2, 0, 0);
            m.visibility = 0;
            m.scaling = new BABYLON.Vector3(0.025, 0.025, 0.025);
            MESHES_LIST[MESHES.HEART] = m as BABYLON.Mesh;
        }

        this.assetsManager.onTaskError = t => console.log("Loading task failed:", t)

        this.assetsManager.load();
        this.assetsManager.onProgress = (remainingCount, totalCount, lastFinishedTask) => {
            this.engine.loadingUIText = 'We are loading the scene. ' + remainingCount + ' out of ' + totalCount + ' items still need to be loaded.';
        };

        this.assetsManager.onFinish = tasks => {
            this.scene.registerBeforeRender( ()  => {
                this.updateRockets();
                // const p = this.xrExperience.baseExperience.camera.position;
                // const p = this.xrExperience.baseExperience.camera.position;
                // const d = this.xrExperience.baseExperience.camera.getForwardRay().direction;
                // let s = "p: " + p.x.toFixed(2)  + " " + p.y.toFixed(2) + " " + p.z.toFixed(2);
                // s = s + "\n" + "d: " + d.x.toFixed(2)  + " " + d.y.toFixed(2) + " " + d.z.toFixed(2);
                // this.debugInfo.text = s;
            });
            this.fireMeshOnTimer(new BABYLON.Vector3(this.textMeshes[0].position.x + 1, 0, this.textMeshes[0].position.z + 1), MESHES_LIST[MESHES.HAPPY], 5000);
            this.fireMeshOnTimer(new BABYLON.Vector3(this.textMeshes[1].position.x + 2, 0, this.textMeshes[1].position.z - 6), MESHES_LIST[MESHES.MOTHER], 4000);
            this.fireMeshOnTimer(new BABYLON.Vector3(this.textMeshes[2].position.x + 1, 0, this.textMeshes[2].position.z + 1), MESHES_LIST[MESHES.DAY], 6000);
            this.engine.runRenderLoop(() => {
                this.scene.render();
            });
        };
    }

    private updateRockets() {
        const currentTime = Date.now();
        this.rockets.forEach((r, i) => {
            if (r.currentState !== ROCKET_STATES.CLEANED_UP) {
                r.update(currentTime);
            }
        });
    }

    private fireRocket(direction: BABYLON.Vector3, startingPosition: BABYLON.Vector3, explosionMesh: BABYLON.Mesh){
        this.rockets.push(new Rocket(this.scene, direction, startingPosition, this.shadowCasters, explosionMesh.clone()));
    }

    private fireMeshOnTimer(groundPosition: BABYLON.Vector3, mesh: BABYLON.Mesh, interval: number){
        this.fireRocket(new BABYLON.Vector3(0,1,0), groundPosition, mesh);
        setTimeout( () => this.fireMeshOnTimer(groundPosition, mesh, interval), interval);
    }
}

function runShow() {
    let show = new Show();
    show.run();
}

runShow();

import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import "pepjs";
import { Engine, Scene, FreeCamera, Vector3, HemisphericLight, Mesh, Color3, CubeTexture, MeshBuilder, StandardMaterial, Texture } from "@babylonjs/core";
import skybox_nx from "./textures/skybox_nx.jpg";
import skybox_ny from "./textures/skybox_ny.jpg";
import skybox_nz from "./textures/skybox_nz.jpg";
import skybox_px from "./textures/skybox_px.jpg";
import skybox_py from "./textures/skybox_py.jpg";
import skybox_pz from "./textures/skybox_pz.jpg";
import flare from "./textures/flare.png";
import firework_crackle from "./sounds/firework-crackle.mp3";
import firework_pop from "./sounds/firework-pop.mp3";
import firework_whistle from "./sounds/firework-whistle.wav";
const json = require("./meshes/happy.babylon");
let blob = new Blob([JSON.stringify(json)]);
let url = URL.createObjectURL(blob);

import * as BABYLON from "@babylonjs/core";
import * as CANNON from "cannon";
(window as any).BABYLON = BABYLON;
(window as any).CANNON = CANNON;
import * as MeshWriter from "meshwriter";

const TEXT_MESHES = [];

const VERTEX_SHADER = "\r\n" +
                "precision highp float;\r\n" +

                "// Attributes\r\n" +
                "attribute vec3 position;\r\n" +
                "attribute vec3 normal;\r\n" +

                "// Uniforms\r\n" +
                "uniform mat4 worldViewProjection;\r\n" +
                "uniform float time;\r\n" +
                "uniform float r;\r\n" +
                "uniform float g;\r\n" +
                "uniform float b;\r\n" +
                "uniform float a;\r\n" +

                "void main(void) {\r\n" +
                "    vec3 p = position;\r\n" +
                "    vec3 j = vec3(0., -1.0, 0.);\r\n" +
                "    p = p + normal * log2(1. + time) * 0.5;\r\n" +
                "    gl_Position = worldViewProjection * vec4(p, 1.0);\r\n" +
                "}\r\n";

const FRAGMENT_SHADER = "\r\n" +
                "precision highp float;\r\n" +

                "uniform float time;\r\n" +
                "uniform float r;\r\n" +
                "uniform float g;\r\n" +
                "uniform float b;\r\n" +
                "uniform float a;\r\n" +

                "void main(void) {\r\n" +
                "    gl_FragColor = vec4(r, g, b, a );\r\n" +
                "}\r\n";

// const ROCKET_VELOCITY = 12; // per second
// const GRAVITY  = -5; // per second
const ROCKET_VELOCITY = 10; // per second
const GRAVITY  = -3; // per second
const ROCKET_FLIGHT_TIME = 2; // seconds
const ROCKET_TRAIL_SLOW_TIME = ROCKET_FLIGHT_TIME * 2/3;
const ROCKET_TRAIL_CUTOFF_TIME = ROCKET_FLIGHT_TIME * 5/6;
const ROCKET_MASS = 1;
const ROCKET_EXPLOSION_PERIOD = 3; // seconds

const SECOND_MS = 1000;

function randomInt(min: number, max: number){
    return Math.floor(Math.random() * (max - min) ) + min;
}

function randomFloatUnderOnePositiveOrNegative(){
    var tmp = randomInt(0,2)
    var sign = 1;
    if(tmp === 1) {
        sign = -1
    }
    return randomFloatUnderOne() * sign;
}

function randomFloatUnderOne(){
    return Math.random();
}

enum ROCKET_STATES{
    CREATED,
    FIRED,
    EXPLODE_START,
    TEMP,
    EXPLODING,
    EXPLODED,
    CLEANED_UP,
}


class Rocket {
    private mesh: BABYLON.Mesh;
    private particleSystem: BABYLON.ParticleSystem;
    private light: BABYLON.PointLight;
    private startingDirection: BABYLON.Vector3;
    private scene: BABYLON.Scene;
    public currentState: ROCKET_STATES;
    private startFlightTime: number;
    private startExplosionTime: number;
    private color: BABYLON.Color3;
    private shaderMaterial: BABYLON.ShaderMaterial;
    private explosionPCS: BABYLON.PointsCloudSystem;

    constructor(scene: BABYLON.Scene, startingDirection: BABYLON.Vector3, startingPosition: BABYLON.Vector3, shadowCasters: BABYLON.Mesh[]) {
        this.startingDirection = startingDirection;
        this.scene = scene;
        this.mesh = BABYLON.MeshBuilder.CreateSphere("rocket", {diameter:.15}, this.scene);
        this.mesh.physicsImpostor = new BABYLON.PhysicsImpostor(this.mesh, BABYLON.PhysicsImpostor.SphereImpostor, { mass: ROCKET_MASS, restitution: 0.9 }, this.scene);
        this.mesh.position = startingPosition;
        this.mesh.convertToUnIndexedMesh();
        this.mesh.material = new BABYLON.StandardMaterial("rocketMaterial", this.scene);
        this.color = new BABYLON.Color3(randomFloatUnderOne(), randomFloatUnderOne(), randomFloatUnderOne());
        (this.mesh.material as BABYLON.StandardMaterial).diffuseColor =  this.color.clone();
        (this.mesh.material as BABYLON.StandardMaterial).specularColor =  this.color.clone();
        (this.mesh.material as BABYLON.StandardMaterial).emissiveColor =  this.color.clone();
        (this.mesh.material as BABYLON.StandardMaterial).ambientColor =  this.color.clone();
        this.shaderMaterial = new BABYLON.ShaderMaterial("shader", this.scene, {
            vertex: "custom",
            fragment: "custom",
        },
        {
            attributes: ["position", "normal", "uv", "color"],
            uniforms: ["world", "worldView", "worldViewProjection", "view", "projection"],
            needAlphaBlending: true
        });
        this.shaderMaterial.backFaceCulling = false;


        this.light = new BABYLON.PointLight("pointlight", new BABYLON.Vector3(this.mesh.position.x, this.mesh.position.y-0.26, this.mesh.position.z), this.scene);
        var shadowGenerator = new BABYLON.ShadowGenerator(1024, this.light);
        shadowCasters.forEach(m => shadowGenerator.addShadowCaster(m));
        this.light.intensity = 0.2;
        this.light.diffuse = this.color.clone();
        this.light.specular = this.color.clone();
        this.light.parent = this.mesh;

        this.particleSystem = this.attachParticleSystem(this.mesh);
        this.currentState = ROCKET_STATES.CREATED;
    }

    public update(currentTime: number) {
        switch (this.currentState) {
            case ROCKET_STATES.CREATED:
                this.mesh.physicsImpostor.setLinearVelocity(this.startingDirection.normalizeToNew().multiplyByFloats(ROCKET_VELOCITY, ROCKET_VELOCITY, ROCKET_VELOCITY));
                this.particleSystem.start()
                let whistleSound = new BABYLON.Sound("firework-whistle", firework_whistle, this.scene, null, {
                    autoplay: true,
                    spatialSound: true,
                    distanceModel: "linear",
                    maxDistance: 1000,
                    rolloffFactor: 40
                });
                whistleSound.attachToMesh(this.mesh);
                this.startFlightTime = currentTime;
                this.currentState = ROCKET_STATES.FIRED;
                break;
            case ROCKET_STATES.FIRED:
                if(currentTime >= this.startFlightTime + ROCKET_FLIGHT_TIME * SECOND_MS){
                    this.particleSystem.dispose();
                    // this.currentState = ROCKET_STATES.EXPLODE_START;
                    this.currentState = ROCKET_STATES.EXPLODED;
                } else if (currentTime >= this.startFlightTime + ROCKET_TRAIL_CUTOFF_TIME * SECOND_MS) {
                    this.particleSystem.stop();
                } else if (currentTime >= this.startFlightTime + ROCKET_TRAIL_SLOW_TIME * SECOND_MS){
                    this.particleSystem.emitRate = 100;
                    this.particleSystem.minLifeTime = 0.2;
                    this.particleSystem.maxLifeTime = 0.5;
                }
                break;
            case ROCKET_STATES.EXPLODE_START:
                this.startExplosionTime = currentTime;
                this.mesh.physicsImpostor.dispose();
                this.createFireworksExplosion();
                let popSound = new BABYLON.Sound("firework-pop", firework_pop, this.scene, null, {
                    autoplay: true,
                    spatialSound: true,
                    distanceModel: "linear",
                    maxDistance: 1000,
                    rolloffFactor: 10
                });
                popSound.attachToMesh(this.mesh);
                new BABYLON.Sound("firework-crackle", firework_crackle, this.scene, null, {
                    autoplay: true
                });
                this.currentState = ROCKET_STATES.TEMP;
                break;
            case ROCKET_STATES.TEMP:
                break;
            case ROCKET_STATES.EXPLODING:
                if (currentTime <= this.startExplosionTime + ROCKET_EXPLOSION_PERIOD * SECOND_MS) {
                    this.explosionPCS.setParticles();
                } else{
                    this.explosionPCS.dispose();
                    this.currentState = ROCKET_STATES.EXPLODED;
                }
                break;
            case ROCKET_STATES.EXPLODED:
                this.cleanUp();
                this.currentState = ROCKET_STATES.CLEANED_UP;
                break;
        }
    }

    private attachParticleSystem(mesh: BABYLON.Mesh){
        var particleSystem = new BABYLON.ParticleSystem("particles", 2000, this.scene);
        //Texture of each particle
        particleSystem.particleTexture = new BABYLON.Texture(flare, this.scene);

        // Where the particles come from
        particleSystem.emitter = mesh; //new BABYLON.Vector3(0, 0, 0); // the starting object, the emitter
        particleSystem.minEmitBox = new BABYLON.Vector3(-0.2, -0.2, -0.2); // Starting all from
        particleSystem.maxEmitBox = new BABYLON.Vector3(0.2, 0.2, 0.2); // To...

        // Size of each particle (random between...
        particleSystem.minSize = 0.01;
        particleSystem.maxSize = 0.1;

        // Life time of each particle (random between...
        particleSystem.minLifeTime = 0.3;
        particleSystem.maxLifeTime = 0.7;

        // Emission rate
        particleSystem.emitRate = 1000;

        // Blend mode : BLENDMODE_ONEONE, or BLENDMODE_STANDARD
        particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;

        // Set the gravity of all particles
        particleSystem.gravity = new BABYLON.Vector3(0, -9.81, 0);

        // Direction of each particle after it has been emitted
        particleSystem.direction1 = new BABYLON.Vector3(-1, -1, 3);
        particleSystem.direction2 = new BABYLON.Vector3(1, -1, -3);

        // Angular speed, in radians
        particleSystem.minAngularSpeed = 0;
        particleSystem.maxAngularSpeed = Math.PI;

        // Speed
        particleSystem.minEmitPower = 1;
        particleSystem.maxEmitPower = 3;
        particleSystem.updateSpeed = 0.005;

        particleSystem.particleTexture = new BABYLON.Texture(flare, this.scene);
        return particleSystem;
    }

    private createFireworksExplosion(){
        this.light.intensity = 1.0;
        this.mesh.visibility = 0;
        this.explosionPCS = new BABYLON.PointsCloudSystem("pcs", 2, this.scene);
        this.explosionPCS.initParticles = () => {
            // for (let p = 0; p < this.explosionPCS.nbParticles; p++) {
            //     (this.explosionPCS.particles[p] as any).velocity = this.explosionPCS.particles[p].position.subtract(this.mesh.position);
            //     // (this.explosionPCS.particles[p] as any).velocity = this.explosionPCS.particles[p].position;
            //     (this.explosionPCS.particles[p] as any).initPosition = this.explosionPCS.particles[p].position.clone();
            // }
        }

        // const tempMesh = new BABYLON.Mesh("temp", this.scene, null, TEXT_MESHES[0]);
        // const tempMesh = BABYLON.MeshBuilder.CreateSphere("rocket", {diameter:1}, this.scene);
        // this.mesh.clone()
        // tempMesh.visibility = 0;
        TEXT_MESHES[0].position = this.mesh.position;
        const fireworksColor = (this.mesh.material as BABYLON.StandardMaterial).diffuseColor.clone().toColor4();
        this.explosionPCS.addSurfacePoints(TEXT_MESHES[0], 5000, BABYLON.PointColor.Stated, fireworksColor, 0.8);
        this.explosionPCS.buildMeshAsync().then((mesh) => {
            // tempMesh.dispose();
            this.explosionPCS.initParticles();
            this.explosionPCS.setParticles();
            this.currentState = ROCKET_STATES.EXPLODING;
        });

        this.explosionPCS.updateParticle = (particle) => {
            // this.explosionPCS.vars.elapsedTime = Date.now() - this.startExplosionTime;
            // particle.position = (particle as any).initPosition.add(particle.velocity.scale(Math.log2(1 + (this.explosionPCS.vars.elapsedTime / SECOND_MS)) * 20));
            // particle.color = fireworksColor.scale(1 - this.explosionPCS.vars.elapsedTime / (ROCKET_EXPLOSION_PERIOD * SECOND_MS));
            return particle;
        }
    }

    private cleanUp() {
        this.mesh.dispose();
    }
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
    private sceneScale: number = 1;

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
        this.initLights();
        // this.initSkybox();
        this.initGround();
        this.initXR();
        this.initText();
        this.initKeyEvents();
        this.fireHappyOnTimer();

        this.assetsManager = new BABYLON.AssetsManager(this.scene);

        this.scene.registerBeforeRender( ()  => {
            this.updateRockets();
        });
        //init background music
        // this.initBackgroundMusic();
    }

    private initCamera() {
        this.camera = new FreeCamera("camera1", new Vector3(0, 5, -10), this.scene);
        this.camera.setTarget(new Vector3(0,0,12));
        this.camera.attachControl(this.canvas, true);

    }

    private initLights() {
        const light = new HemisphericLight("light1", new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.2;
    }

    private initSkybox() {
        const skybox = MeshBuilder.CreateBox("skyBox", {size:500}, this.scene);
        const skyboxMaterial = new StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = CubeTexture.CreateFromImages([
            skybox_px,
            skybox_py,
            skybox_pz,
            skybox_nx,
            skybox_ny,
            skybox_nz
        ], this.scene)
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.disableLighting = true;
        skybox.material = skyboxMaterial;
    }

    private initGround() {
        this.ground = MeshBuilder.CreateGround("ground", {height: 1000, width: 1000, subdivisions: 1});
        this.ground.receiveShadows = true;
        this.ground.physicsImpostor = new BABYLON.PhysicsImpostor(this.ground, BABYLON.PhysicsImpostor.PlaneImpostor, { mass: 0, restitution: 0.9 }, this.scene);
    }

    private async initXR() {
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
            const xr = await this.scene.createDefaultXRExperienceAsync({
                uiOptions: {
                    sessionMode: 'immersive-ar',
                }
            });
            this.ground.dispose();
        } else if (supportsVR){
            console.log("VR Supported");
            this.sceneScale = 0.5;
            const xr = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.ground],
                uiOptions: {
                    sessionMode: 'immersive-vr',
                }
            });

            xr.input.onControllerAddedObservable.add((inputSource) => {
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
                                    const resultRay = new BABYLON.Ray(new Vector3(), new Vector3());
                                    // get the pointer direction
                                    inputSource.getWorldPointerRayToRef(resultRay);
                                    this.fireRocket(resultRay.direction, resultRay.origin);
                                }
                            }
                        });
                    }
                });
            });
        } else {
            console.log("No XR Supported");
        }
    }

    private initText() {
        const Writer = MeshWriter(this.scene, { scale: 0.25 * this.sceneScale, defaultFont: "Arial" });
        let textMeshes = []
        const LETTER_HEIGHT = 10 * this.sceneScale;
        const LETTER_THICKNESS = 5 * this.sceneScale;
        textMeshes.push(new Writer("Happy", {
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
                x: -20 * this.sceneScale,
                y: 10 * this.sceneScale,
                z: 17 * this.sceneScale,
            }
        }).getMesh());

        textMeshes.push(new Writer("Mother's", {
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
                x: 0 * this.sceneScale,
                y: 2 * this.sceneScale,
                z: 7 * this.sceneScale,
            }
        }).getMesh());

        textMeshes.push(new Writer("Day", {
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
                x: 20 * this.sceneScale,
                y: 15 * this.sceneScale,
                z: 2 * this.sceneScale,
            }
        }).getMesh());

        textMeshes.forEach(m => {
            m.rotation.x = - Math.PI / 2;
            m.receiveShadows = true;
            m.physicsImpostor = new BABYLON.PhysicsImpostor(m, BABYLON.PhysicsImpostor.MeshImpostor, { mass: 0, restitution: 0.9 }, this.scene);
        });

        this.shadowCasters = textMeshes;
    }

    private initKeyEvents() {
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
                    this.fireRocket(pointerInfo.pickInfo.ray.direction.add(new BABYLON.Vector3(0,0.3,0)), pointerInfo.pickInfo.ray.origin);
                    break;
            }
        });
    }

    run() {
        this.assetsManager.onTaskErrorObservable.add((task) => {
            console.log('task failed', task.errorObject.message, task.errorObject.exception);
        });
        this.assetsManager.addTextureTask("flare task", flare);
        this.assetsManager.addBinaryFileTask("firework pop task", firework_pop);
        this.assetsManager.addBinaryFileTask("firework crackle task", firework_crackle);
        this.assetsManager.addBinaryFileTask("firework whistle task", firework_whistle);
        // const task = this.assetsManager.addMeshTask("happy mesh task", "", "", url).onSuccess = t => {
        //     console.log("SUCCESS:",t)
        //     TEXT_MESHES.push(t.loadedMeshes[0]);
        // }

        this.assetsManager.onTaskError = t => console.log("Loading task failed:", t)
        BABYLON.Effect.ShadersStore["customVertexShader"] = VERTEX_SHADER;
        BABYLON.Effect.ShadersStore["customFragmentShader"] = FRAGMENT_SHADER;

        this.assetsManager.load();
        this.assetsManager.onProgress = (remainingCount, totalCount, lastFinishedTask) => {
            this.engine.loadingUIText = 'We are loading the scene. ' + remainingCount + ' out of ' + totalCount + ' items still need to be loaded.';
        };

        this.assetsManager.onFinish = tasks => {
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

    private fireRocket(direction: BABYLON.Vector3, startingPosition: BABYLON.Vector3){
        this.rockets.push(new Rocket(this.scene, direction, startingPosition, this.shadowCasters));
    }

    private fireHappyOnTimer(){
        // this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(randomInt(-5, 5),0,3));
        setInterval( () => {
            this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(randomInt(-5, 5),0,3).scale(this.sceneScale));
        }, 3000);
    }

    private randomInt(min: number, max: number){
        return Math.floor(Math.random() * (max - min) ) + min;
    }

    private randomFloatUnderOnePositiveOrNegative(){
        var tmp = this.randomInt(0,2)
        var sign = 1;
        if(tmp === 1) {
            sign = -1
        }
        return this.randomFloatUnderOne() * sign;
    }

    private randomFloatUnderOne(){
        return Math.random();
    }
}

function runShow() {
    let show = new Show();
    show.run();
}

runShow();

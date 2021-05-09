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
import flare from "./textures/flare.png";
import firework_crackle from "./sounds/firework-crackle.mp3";
import firework_pop from "./sounds/firework-pop.mp3";
import firework_whistle from "./sounds/firework-whistle.wav";
import happyMesh from "./meshes/happy.glb";

import * as BABYLON from "@babylonjs/core";
import * as CANNON from "cannon";
(window as any).BABYLON = BABYLON;
(window as any).CANNON = CANNON;
import * as MeshWriter from "meshwriter";

var TEXT_MESHES = [];

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
    private explosionMesh: BABYLON.Mesh;

    constructor(scene: BABYLON.Scene, startingDirection: BABYLON.Vector3, startingPosition: BABYLON.Vector3, shadowCasters: BABYLON.Mesh[], explosionMesh: BABYLON.Mesh) {
        this.startingDirection = startingDirection;
        this.scene = scene;
        this.explosionMesh = explosionMesh;
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
                    this.currentState = ROCKET_STATES.EXPLODE_START;
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
                this.currentState = ROCKET_STATES.EXPLODING;
                break;
            case ROCKET_STATES.EXPLODING:
                if (currentTime <= this.startExplosionTime + ROCKET_EXPLOSION_PERIOD * SECOND_MS) {
                    this.animateExplosion(currentTime);
                } else{
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
        const fireworksColor = (this.mesh.material as BABYLON.StandardMaterial).diffuseColor.clone();
        const light: BABYLON.PointLight = this.mesh.getChildren()[0] as BABYLON.PointLight;
        light.intensity = 1.0;
        const explosionMesh = TEXT_MESHES[0].clone();
        explosionMesh.position = this.mesh.position;
        light.parent = explosionMesh;
        this.mesh.dispose();
        this.mesh = explosionMesh;
        // this.mesh.convertToFlatShadedMesh();
        this.mesh.material = this.shaderMaterial;
    }

    private animateExplosion(currentTime: number){
        var r = this.color.r;
        var g = this.color.g;
        var b = this.color.b;
        var a = 1.0;

        const elapsedTime = (currentTime - this.startExplosionTime) / SECOND_MS;
        if (elapsedTime > (ROCKET_EXPLOSION_PERIOD * 0.4)) {
            r = randomFloatUnderOne();
            g = randomFloatUnderOne();
            b = randomFloatUnderOne();
            a = Math.max(1 - (elapsedTime / (ROCKET_EXPLOSION_PERIOD)), 0);
        }

        let m1: any = this.mesh.material;
        m1.setFloat!("position", this.mesh.position);
        m1.setFloat!("r", r);
        m1.setFloat!("g", g);
        m1.setFloat!("b", b);
        m1.setFloat!("a", a);
        m1.setFloat!("time", elapsedTime);
        const light: BABYLON.PointLight = this.mesh.getChildren()[0] as BABYLON.PointLight;
        this.light.intensity = Math.max(1 - (elapsedTime / ROCKET_EXPLOSION_PERIOD), 0);
    }

    private cleanUp() {
        this.mesh.dispose();
    }
}

class Show {
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private shadowCasters: BABYLON.Mesh[] = [];
    private rockets: Rocket[];
    private assetsManager: BABYLON.AssetsManager;
    private explosionMesh: BABYLON.Mesh;

    constructor(){
        this.canvas = document.createElement("canvas");;
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "canvas";
        document.body.appendChild(this.canvas);
        this.engine = new BABYLON.Engine(this.canvas, true); // Generate the BABYLON 3D engine
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.CannonJSPlugin());
        this.rockets = [];

        this.initCamera();
        // this.initLights();
        // this.initSkybox();
        this.initGroundXR();
        this.initText();
        this.initKeyEvents();
        this.fireRocketOnTimer();

        this.assetsManager = new BABYLON.AssetsManager(this.scene);

        this.scene.registerBeforeRender( ()  => {
            this.updateRockets();
        });
        //init background music
        // this.initBackgroundMusic();
    }

    private initCamera() {
        const camera = new FreeCamera("camera1", new Vector3(0, 5, -10), this.scene);
        camera.setTarget(Vector3.Zero());
        camera.attachControl(this.canvas, true);
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

    private async initGroundXR() {
        const ground = MeshBuilder.CreateGround("ground", {height: 1000, width: 1000, subdivisions: 1});
        ground.receiveShadows = true;
        ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.PlaneImpostor, { mass: 0, restitution: 0.9 }, this.scene);

        const xr = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: [ground],
        });

        if (!xr.baseExperience) {
            // no xr support
        } else {
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
        }
    }

    private initText() {
        const Writer = MeshWriter(this.scene, { scale: 0.25, defaultFont: "Arial" });
        let textMeshes = []
        textMeshes.push(new Writer("Happy", {
            "font-family": "Arial",
            "letter-height": 10,
            "letter-thickness": 3,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#bfbfbf",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: -20,
                y: 10,
                z: 17,
            }
        }).getMesh());

        textMeshes.push(new Writer("Mother's", {
            "font-family": "Arial",
            "letter-height": 10,
            "letter-thickness": 3,
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
                y: 2,
                z: 7,
            }
        }).getMesh());

        textMeshes.push(new Writer("Day", {
            "font-family": "Arial",
            "letter-height": 10,
            "letter-thickness": 3,
            color: "#bfbfbf",
            anchor: "center",
            colors: {
                diffuse: "#bfbfbf",
                specular: "#bfbfbf",
                ambient: "#bfbfbf",
                emissive: "#000000"
            },
            position: {
                x: 20,
                y: 15,
                z: 2,
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
        window.addEventListener("keydown", (ev) => {
            // Shift+Ctrl+I
            if (ev.shiftKey && ev.ctrlKey && ev.keyCode === 73) {
                if (this.scene.debugLayer.isVisible()) {
                    this.scene.debugLayer.hide();
                } else {
                    this.scene.debugLayer.show();
                }
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
        this.assetsManager.addMeshTask("happy mesh task", "", "", happyMesh).onSuccess = t => TEXT_MESHES.push(t.loadedMeshes[0]);

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
        this.rockets.push(new Rocket(this.scene, direction, startingPosition, this.shadowCasters, this.explosionMesh));
    }

    private fireRocketOnTimer(){
        this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(randomInt(-5, 5),0,3));
        setInterval( () => {
            this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(randomInt(-5, 5),0,3));
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

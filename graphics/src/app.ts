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

import * as BABYLON from "@babylonjs/core";
import * as CANNON from "cannon";
(window as any).BABYLON = BABYLON;
(window as any).CANNON = CANNON;
import * as MeshWriter from "meshwriter";

const ROCKET_VELOCITY = 12; // per second
const GRAVITY  = -5; // per second
const ROCKET_FLIGHT_TIME = 2; // seconds
const ROCKET_MASS = 1;

class Show {
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private shadowCasters: BABYLON.Mesh[] = [];

    constructor(){
        this.canvas = document.createElement("canvas");;
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "canvas";
        document.body.appendChild(this.canvas);
        this.engine = new BABYLON.Engine(this.canvas, true); // Generate the BABYLON 3D engine
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.CannonJSPlugin());

        this.initCamera();
        // this.initLights();
        // this.initSkybox();
        this.initGroundXR();
        this.initText();
        this.initKeyEvents();
        // this.fireRocketOnTimer();


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

    runRenderLoop() {
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
    }

    private fireRocket(direction: BABYLON.Vector3, startingPosition: BABYLON.Vector3){
        var sphere = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter:.15}, this.scene);
        sphere.physicsImpostor = new BABYLON.PhysicsImpostor(sphere, BABYLON.PhysicsImpostor.SphereImpostor, { mass: ROCKET_MASS, restitution: 0.9 }, this.scene);

        var light = new BABYLON.PointLight("pointlight", new BABYLON.Vector3(sphere.position.x, sphere.position.y-0.26, sphere.position.z), this.scene)
        var shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
        this.shadowCasters.forEach(m => shadowGenerator.addShadowCaster(m));

        light.intensity = 0.2;
        light.parent = sphere;

        sphere.convertToUnIndexedMesh();
        // sphere.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION_THEN_BSPHERE_ONLY;
        // give sphere a color
        var sphereMaterial = new BABYLON.StandardMaterial("sphereMaterial", this.scene);
        var rgb = [this.randomFloatUnderOne(), this.randomFloatUnderOne(), this.randomFloatUnderOne()];
        var rocketColor = new BABYLON.Color3(...rgb);
        sphereMaterial.diffuseColor =  rocketColor;
        sphereMaterial.specularColor = rocketColor;
        sphereMaterial.emissiveColor = rocketColor;
        sphereMaterial.ambientColor =  rocketColor;
        sphere.material = sphereMaterial;
        light.diffuse = rocketColor;
        light.specular = rocketColor;

        var particleSystem = this.attachParticleSystem(sphere);
        particleSystem.particleTexture = new BABYLON.Texture(flare, this.scene);

        const SECOND_MS = 1000;
        const particleSlowDownTime = ROCKET_FLIGHT_TIME * SECOND_MS * 2/3;
        const particleCutoffTime = ROCKET_FLIGHT_TIME * SECOND_MS * 5/6;

        sphere.position = startingPosition.clone();
        sphere.physicsImpostor.setLinearVelocity(direction.normalizeToNew().multiplyByFloats(ROCKET_VELOCITY, ROCKET_VELOCITY, ROCKET_VELOCITY));
        let whistleSound = new BABYLON.Sound("firework-whistle", firework_whistle, this.scene, null, {
            autoplay: true,
            spatialSound: true,
            distanceModel: "linear",
            maxDistance: 1000,
            rolloffFactor: 20
        });
        whistleSound.attachToMesh(sphere);

        const startTime = Date.now();
        let exploded = false;
        this.scene.registerAfterRender( () => {
            const t = Date.now();
            if(t < startTime + particleSlowDownTime) {

            }else if (t < startTime + particleCutoffTime){
                particleSystem.emitRate = 100;
                particleSystem.minLifeTime = 0.2;
                particleSystem.maxLifeTime = 0.5;
            }else if(t < startTime + ROCKET_FLIGHT_TIME * SECOND_MS){
                particleSystem.stop();
            }else{
                if(!exploded){
                    particleSystem.dispose();
                    exploded = true;
                    sphere.physicsImpostor.dispose();
                    this.createFireworksExplosion(sphere);
                    let popSound = new BABYLON.Sound("firework-pop", firework_pop, this.scene, null, {
                        autoplay: true,
                        spatialSound: true,
                        distanceModel: "linear",
                        maxDistance: 1000,
                        rolloffFactor: 10
                    });
                    popSound.attachToMesh(sphere);
                    new BABYLON.Sound("firework-crackle", firework_crackle, this.scene, null, {
                        autoplay: true
                    });
                }
            }
        });
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
        particleSystem.start();
        return particleSystem;
    }

    private createFireworksExplosion(sphere : BABYLON.Mesh){
        const fireworksColor = (sphere.material as BABYLON.StandardMaterial).diffuseColor.clone();
        if (!BABYLON.Effect.ShadersStore["customVertexShader"]){
            BABYLON.Effect.ShadersStore["customVertexShader"] = "\r\n" +
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
                "    p = p + normal * log(time) * 0.5;\r\n" +
                "    gl_Position = worldViewProjection * vec4(p, 1.0);\r\n" +
                "}\r\n";

            BABYLON.Effect.ShadersStore["customFragmentShader"] = "\r\n" +
                "precision highp float;\r\n" +

                "uniform float time;\r\n" +
                "uniform float r;\r\n" +
                "uniform float g;\r\n" +
                "uniform float b;\r\n" +
                "uniform float a;\r\n" +

                "void main(void) {\r\n" +
                "    gl_FragColor = vec4(r, g, b, a );\r\n" +
                "}\r\n";
        }

        var shaderMaterial = new BABYLON.ShaderMaterial("shader", this.scene, {
            vertex: "custom",
            fragment: "custom",
        },
        {
            attributes: ["position", "normal", "uv", "color"],
            uniforms: ["world", "worldView", "worldViewProjection", "view", "projection"],
            needAlphaBlending: true
        });


        shaderMaterial.backFaceCulling = false;

        sphere.scaling = new BABYLON.Vector3(2,2,2);
        sphere.convertToFlatShadedMesh();
        sphere.material = shaderMaterial;

        var light: BABYLON.PointLight = sphere.getChildren()[0] as BABYLON.PointLight;
        light.intensity = 1.0;
        var shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
        this.shadowCasters.forEach(m => shadowGenerator.addShadowCaster(m));

        var t = 0.0;
        var time = 0.0;
        var PERIOD_OF_EXPLOSION = 20;
        this.scene.registerBeforeRender( ()  => {
            var r = fireworksColor.r;
            var g = fireworksColor.g;
            var b = fireworksColor.b;
            var a = 1.0;

            if (time < PERIOD_OF_EXPLOSION) {
                if (time > (PERIOD_OF_EXPLOSION * 0.65)) {
                    r = this.randomFloatUnderOne();
                    g = this.randomFloatUnderOne();
                    b = this.randomFloatUnderOne();
                    a = 1 - (time/PERIOD_OF_EXPLOSION);
                }
                let m1: any = sphere.material;
                m1.setFloat!("position", sphere.position);
                m1.setFloat!("r", r);
                m1.setFloat!("g", g);
                m1.setFloat!("b", b);
                m1.setFloat!("a", a);
                m1.setFloat!("time", time);
                light.intensity = 1 - (time/PERIOD_OF_EXPLOSION);
                time += 0.1;
            } else {
                shaderMaterial.dispose();
                sphere.material?.dispose();
                sphere.dispose();
            }
        });
    }

    private fireRocketOnTimer(){
        this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(5,5,5));
        setInterval( () => {
            this.fireRocket(new BABYLON.Vector3(0,1,0), new BABYLON.Vector3(5,5,5));
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
    show.runRenderLoop();
}

runShow();

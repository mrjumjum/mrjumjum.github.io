import flare from "./textures/flare.png";
import firework_crackle from "./sounds/firework-crackle.mp3";
import firework_pop from "./sounds/firework-pop.mp3";
import firework_whistle from "./sounds/firework-whistle.wav";
import { randomInt, randomFloat, randomFloatUnderOne } from "./utility";
import * as BABYLON from "babylonjs";

const ROCKET_VELOCITY = 4; // per second
const ROCKET_FLIGHT_TIME = 1; // seconds
const ROCKET_TRAIL_SLOW_TIME = ROCKET_FLIGHT_TIME * 2/3;
const ROCKET_TRAIL_CUTOFF_TIME = ROCKET_FLIGHT_TIME * 5/6;
const ROCKET_MASS = 1;
const ROCKET_EXPLOSION_PERIOD = 4; // seconds

const SECOND_MS = 1000;

export enum ROCKET_STATES{
    CREATED,
    FIRED,
    EXPLODE_START,
    TEMP,
    EXPLODING,
    EXPLODED,
    CLEANED_UP,
}

export class Rocket {
    private mesh: BABYLON.Mesh;
    private particleSystem: BABYLON.ParticleSystem;
    private light: BABYLON.PointLight;
    private startingDirection: BABYLON.Vector3;
    private scene: BABYLON.Scene;
    public currentState: ROCKET_STATES;
    private startFlightTime: number;
    private startExplosionTime: number;
    private color: BABYLON.Color3;
    private explosionPCS: BABYLON.PointsCloudSystem;
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


        this.light = new BABYLON.PointLight("pointlight", new BABYLON.Vector3(this.mesh.position.x, this.mesh.position.y-0.26, this.mesh.position.z), this.scene);
        var shadowGenerator = new BABYLON.ShadowGenerator(1024, this.light);
        shadowCasters.forEach(m => shadowGenerator.addShadowCaster(m));
        this.light.intensity = 0.3;
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
                this.createExplosion();
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
                    this.updateExplosion(currentTime);
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

    private createExplosion() {
        this.light.intensity = 1.0;
        this.mesh.visibility = 0;
        this.explosionPCS = new BABYLON.PointsCloudSystem("pcs", 1, this.scene);
        this.explosionPCS.initParticles = () => {
            for (let p = 0; p < this.explosionPCS.nbParticles; p++) {
                (this.explosionPCS.particles[p] as any).originalVelocity = this.explosionPCS.particles[p].position.subtract(this.mesh.position);
                this.explosionPCS.particles[p].velocity = (this.explosionPCS.particles[p] as any).originalVelocity.clone();
                (this.explosionPCS.particles[p] as any).initPosition = this.explosionPCS.particles[p].position.clone();
            }
        }

        this.explosionMesh.position = this.mesh.position;
        this.explosionMesh.addRotation(randomFloat(-Math.PI / 8, Math.PI / 8), 0, 0);
        this.explosionMesh.addRotation(0, randomFloat(-Math.PI / 6, Math.PI / 6), 0);
        this.explosionMesh.addRotation(0, 0, randomFloat(-Math.PI / 6, Math.PI / 6));

        this.explosionPCS.addSurfacePoints(this.explosionMesh, 2000, BABYLON.PointColor.Stated, this.color.toColor4(), 0.8);
        this.explosionPCS.buildMeshAsync().then((mesh) => {
            this.explosionPCS.initParticles();
            this.explosionPCS.setParticles();
            this.currentState = ROCKET_STATES.EXPLODING;
        });

        this.explosionPCS.updateParticle = p => {
            // p.position = (p as any).initPosition.add((p as any).originalVelocity.scale(Math.log2(1 + (this.explosionPCS.vars.elapsedTime / SECOND_MS)) * 10));
            p.velocity.set((p as any).originalVelocity.x, (p as any).originalVelocity.y, (p as any).originalVelocity.z);
            p.velocity.scaleInPlace(this.explosionPCS.vars.velocityScaling);
            p.position.set((p as any).initPosition.x, (p as any).initPosition.y, (p as any).initPosition.z);
            p.position.addInPlace(p.velocity);
            // p.color = this.color.toColor4().scale(1 - this.explosionPCS.vars.elapsedTime / (ROCKET_EXPLOSION_PERIOD * SECOND_MS));
            p.color.set(
                this.color.r * this.explosionPCS.vars.colorScaling,
                this.color.g * this.explosionPCS.vars.colorScaling,
                this.color.b * this.explosionPCS.vars.colorScaling,
                this.explosionPCS.vars.colorScaling
            );
            return p;
        }
    }

    private updateExplosion(currentTime: number) {
        const elapsedTime = currentTime - this.startExplosionTime;
        this.explosionPCS.vars.velocityScaling = Math.log2(1 + (elapsedTime / SECOND_MS)) * 4;
        this.explosionPCS.vars.colorScaling = (1 - elapsedTime / (ROCKET_EXPLOSION_PERIOD * SECOND_MS));
        this.light.intensity = Math.max(1 - (elapsedTime * 1.1) / (ROCKET_EXPLOSION_PERIOD * SECOND_MS), 0);
        this.explosionPCS.setParticles();
    }

    private cleanUp() {
        this.mesh.dispose();
    }
}

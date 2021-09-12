import {ObjectOfArrays} from "./utils.js"

class PointDynamicsState extends ObjectOfArrays {
    constructor(N, dim) {
        super();
        this.dim = dim;
        this.count = 0;
        this.positions = new Float32Array(dim*N);
        this.velocities = new Float32Array(dim*N);
        this.accelerations = new Float32Array(dim*N);        
        this.ids = new Uint32Array(N);
    }
    
    generateId() {
        return Math.floor(Math.random() * (2**32));
    }
    
    add(position, velocity, acceleration, id) {
        const i = this.count++;
        const s = this.dim;
        this.ids[i] = (id === undefined ? this.generateId() : id);
        for(let j=0; j < this.dim; j++) {
            this.positions[s*i+j] = position[j];
            this.velocities[s*i+j] = velocity[j];
            this.accelerations[s*i+j] = acceleration[j];
        }
        return this.ids[i];
    }
    
    getPosition(id, out, ofs) {
        ofs ||= 0;
        const i = this.ids.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.positions[this.dim*i];
        out[ofs+1] = this.positions[this.dim*i+1];
        return true;
    }
    
    getVelocity(id, out, ofs) {
        ofs ||= 0;
        const i = this.ids.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.velocities[this.dim*i];
        out[ofs+1] = this.velocities[this.dim*i+1];
        return true;
    }    
    
    getAcceleration(id, out, ofs) {
        ofs ||= 0;
        const i = this.ids.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.accelerations[this.dim*i];
        out[ofs+1] = this.accelerations[this.dim*i+1];
        return true;
    }               
}

class RectangleState extends ObjectOfArrays {
    constructor(N, dim) {
        super();
        this.dim = dim;
        this.count = 0;
        this.centers = new Uint32Array(N);
        this.scales = new Float32Array(N*dim);
        this.ids = new Uint32Array(N);
    }
    
    generateId() {
        return Math.floor(Math.random() * (2**32));
    }
    
    add(pointId, scale) {
        const i = this.count++;
        this.ids[i] = this.generateId();
        this.centers[i] = pointId;
        const s = this.dim;
        for(let j=0; j < this.dim; j++) {
            this.scales[i*s+j] = scale[j];
        }
        return this.ids[i];
    }
}

class PhysicsState extends ObjectOfArrays {
    constructor(N) {
        super();        
        const dim = 2;
        this.points = new PointDynamicsState(N, dim);
        this.rectangles = new RectangleState(N, dim);
        this.collisions = new Uint32Array(N);
        this.dim = dim;
        this.time = null;
        this.outgoingNetworkMessages = [];
    }
    
    addRectangle(scale, position, velocity, acceleration, id) {
        const pointId = this.points.add(position, velocity, acceleration, id);
        const rectangleId = this.rectangles.add(pointId, scale);
        return rectangleId;
    }
    
    addPoint(position, velocity, acceleration, id) {
        return this.points.add(position, velocity, acceleration, id);
    }
    
    getPlayerPosition(id, out, ofs) {
        return this.points.getPosition(id, out, ofs);
    }
    
    getPlayerVelocity(id, out, ofs) {
        return this.points.getVelocity(id, out, ofs);
    }    
    
    getPlayerAcceleration(id, out, ofs) {
        return this.points.getAcceleration(id, out, ofs);
    }        
}

// TODO: distinguish "local" and remote players
class Physics {
    async init(game) {
        this.game = game;
        const parameters = this.parameters = game.parameters;
        const N = parameters.physics.maxPoints;
        this.state = new PhysicsState(N);
        this.nextState = new PhysicsState(N);
        this.state.points.count = 0;
        this.systemId = Math.floor(Math.random() * (2**32-1));
    }
    
    async evolve() {
        const game = this.game;
        const players = game.players.state;
        const state = this.nextState;
        state.set(this.state);
        state.time = game.time;
        state.outgoingNetworkMessages = [];
        state.collisions.fill(0);
        for(let i=0; i < players.count; i++) {
            const id = players.ids[i];
            if(state.points.ids.indexOf(id) == -1) {
                const radius = game.parameters.physics.playerRadius;
                const scale = [radius, radius];
                const pos = [2*(Math.random() - 0.5), 2*(Math.random() - 0.5)];
                const vel = [0, 0];
                const accel = [0, 0];
                state.addRectangle(scale, pos, vel, accel, id);
            }
        }
        const a = state.points.accelerations;
        const dt = state.time - this.state.time;
        const pos = state.points.positions;
        const v = state.points.velocities;
        const dim = state.dim;
        for(let i=0; i < state.points.count; i++) {
            const j = players.ids.indexOf(state.points.ids[i]);
            if(j == -1) continue;
            const dr = this.game.input.state.playerId.indexOf(state.points.ids[i]) == -1;
            if(!dr) {                
                let updated = false;
                for(let k=0; k < state.dim; k++) {
                    const n = state.dim*i+k;
                    const a1 = a[n];
                    a[n] = game.parameters.physics.acceleration * players.accelerations[players.dim*j+k];
                    if(a[n] != a1) updated = true;
                }
                if(updated) {
                    const ofs = state.dim*i;
                    state.outgoingNetworkMessages.push({
                        type: "updatePoint",
                        id: state.points.ids[i],
                        systemId: this.systemId,
                        position: Array.from(pos.subarray(ofs, ofs+state.dim)),
                        velocity: Array.from(v.subarray(ofs, ofs+state.dim)),
                        acceleration: Array.from(a.subarray(ofs, ofs+state.dim))
                    });
                }
            }   
        }
        for(const msg of game.network.state.incoming) {
            if(msg.type == "updatePoint") {
                const i = state.points.ids.indexOf(msg.id);
                if(i == -1 || msg.systemId == this.systemId) continue;
                state.points.positions.set(msg.position, state.dim*i);
                state.points.velocities.set(msg.velocity, state.dim*i);
                state.points.accelerations.set(msg.acceleration, state.dim*i);
            }
        }
        
        const gamma = game.parameters.physics.gamma;
        const playerRadius = game.parameters.physics.playerRadius;        
        for(let i=0; i < state.points.count; i++) {
            const j = players.ids.indexOf(state.points.ids[i]);
            if(j == -1) continue;
            for(let k=0; k < state.dim; k++) {
                const n = state.dim*i+k;
                v[n] += a[n] * dt - gamma * v[n] * dt;
                pos[n] += v[n]*dt;
                if(Math.abs(pos[n]) > (1 - playerRadius)) {
                    v[n] = -v[n];
                    // LEFT -> 1, RIGHT -> 2, BOTTOM -> 4, TOP -> 8
                    const collision_flag = 1 << (2*dim + (pos > 0 ? 1 : 0));
                    state.collisions[i] |= collision_flag;
                }
                pos[n] = Math.max(-(1-playerRadius), Math.min(1-playerRadius, pos[n]));
            }
        }
    }
    
    solveConstraints(state) {
        const corners = [
            [-1, -1],
            [-1, 1],
            [1, 1],
            [1, -1]
        ];
        const normals = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];
        
        const points = state.points;
        const scales = state.rectangles.scales;
        const centers = state.rectangles.centers;
        const center_i = [0, 0];
        const center_j = [0, 0];
        const s = state.rectangles.dim;
        for(let i=0; i < state.rectangles.count; i++) {
            for(let j=0; j < state.rectangles.count; j++) {
                points.getPosition(centers[i], center_i);
                points.getPosition(centers[j], center_j);
                const scale_i = scales.subarray(s*i, s*(i+1));
                const scale_j = scales.subarray(s*j, s*(j+1));
                for(const corner of corners) {
                    const corner_i = corner.map((c, k) => c*scale_i[k]);
                    
                    for(const normal of normals) {
                        
                    }
                }
            }
        }
    }
    
    swapBuffers() {
        const tmp = this.state;
        this.state = this.nextState;
        this.nextState = tmp;
    }

    async sync() {
        this.swapBuffers();
    }
}

export {Physics}
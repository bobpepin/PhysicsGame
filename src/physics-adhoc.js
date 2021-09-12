import {ObjectOfArrays} from "./utils.js"

class PhysicsState extends ObjectOfArrays {
    constructor(N) {
        super();        
        const dim = 2;
        this.pointPositions = new Float32Array(dim*N);
        this.pointVelocities = new Float32Array(dim*N);
        this.pointAccelerations = new Float32Array(dim*N);        
        this.pointIds = new Uint32Array(N);
        this.collisions = new Uint32Array(N);
        this.pointCount = 0;
        this.dim = dim;
        this.time = null;
        this.outgoingNetworkMessages = [];
    }
    
    getPlayerPosition(id, out, ofs) {
        ofs ||= 0;
        const i = this.pointIds.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.pointPositions[this.dim*i];
        out[ofs+1] = this.pointPositions[this.dim*i+1];
        return true;
    }
    
    getPlayerVelocity(id, out, ofs) {
        ofs ||= 0;
        const i = this.pointIds.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.pointVelocities[this.dim*i];
        out[ofs+1] = this.pointVelocities[this.dim*i+1];
        return true;
    }    
    
    getPlayerAcceleration(id, out, ofs) {
        ofs ||= 0;
        const i = this.pointIds.indexOf(id);
        if(i < 0) return false;
        out[ofs+0] = this.pointAccelerations[this.dim*i];
        out[ofs+1] = this.pointAccelerations[this.dim*i+1];
        return true;
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
        this.state.pointCount = 0;
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
            if(state.pointIds.indexOf(id) == -1) {
                const j = state.pointCount++;
                state.pointIds[j] = id;
                state.pointPositions[2*j] = 2*(Math.random() - 0.5);
                state.pointPositions[2*j+1] = 2*(Math.random() - 0.5);
                state.pointVelocities[2*j] = 0;
                state.pointVelocities[2*j+1] = 0;
                state.pointAccelerations[2*j] = 0;
                state.pointAccelerations[2*j+1] = 0;                
            }
        }
        const a = state.pointAccelerations;
        const dt = this.nextState.time - this.state.time;
        const pos = this.nextState.pointPositions;
        const v = this.nextState.pointVelocities;
        const dim = state.dim;
        for(let i=0; i < state.pointCount; i++) {
            const j = players.ids.indexOf(state.pointIds[i]);
            if(j == -1) continue;
            const dr = this.game.input.state.playerId.indexOf(state.pointIds[i]) == -1;
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
                        id: state.pointIds[i],
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
                const i = state.pointIds.indexOf(msg.id);
                if(i == -1 || msg.systemId == this.systemId) continue;
                state.pointPositions.set(msg.position, state.dim*i);
                state.pointVelocities.set(msg.velocity, state.dim*i);
                state.pointAccelerations.set(msg.acceleration, state.dim*i);
            }
        }
        
        const gamma = game.parameters.physics.gamma;
        const playerRadius = game.parameters.physics.playerRadius;        
        for(let i=0; i < state.pointCount; i++) {
            const j = players.ids.indexOf(state.pointIds[i]);
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
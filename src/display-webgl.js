import {ObjectOfArrays} from "./utils.js"
import {GLTFAsset} from "./gltf.js"


function loadImage(url) {
    const img = new Image();
    img.src = url;
    return new Promise((resolve, reject) => {
        img.onload = (() => resolve(img));
    });
}

class DisplayState extends ObjectOfArrays {
    constructor(N) {
        super();
        const dim = this.dim = 2;
        this.positions = new Float32Array(dim*N);
        this.accelerations = new Float32Array(dim*N);
        this.skins = new Uint32Array(N);
        this.count = 0;
    }
}

const shaderSources = {
    player: { 
        vertexShaderUrl: "src/gltf.vert.glsl", 
        fragmentShaderUrl: "src/gltf.frag.glsl" 
    },
    lines: {
        vertexShaderUrl: "src/lines.vert.glsl",
        fragmentShaderUrl: "src/lines.frag.glsl"
    }
}


class Display {
    async init(game) {
        this.game = game;
        const parameters = this.parameters = game.parameters;
        this.canvas = document.querySelector("#game-canvas");        
        const gl = this.gl = this.canvas.getContext("webgl", {antialias: false});
        const ext = gl.getExtension("OES_vertex_array_object");
        gl.createVertexArray = (() => ext.createVertexArrayOES());
        gl.bindVertexArray = ((arrayObject) => ext.bindVertexArrayOES(arrayObject));
        this.shaders = await loadShaders(gl, shaderSources);
        
        this.twoTrianglesAsset = new GLTFAsset(gl, null, twoTrianglesGLTF);
        this.squareAsset = new GLTFAsset(gl, null, squareGLTF);
        
        const N = parameters.physics.maxPoints;
        this.state = new DisplayState(N);
        this.nextState = new DisplayState(N);
        /*
        const response = await fetch("assets/skinList.json")
        this.availableSkins = await response.json();
        this.skinTextures = {};
        */
        const image = await loadImage("assets/Pony.png");
        this.spriteColumns = 4;
        this.spriteRows = 2;
        this.spriteTexture = new SpriteSheetTexture(this.gl);
        this.spriteTexture.load({image, rows: this.spriteRows*4, columns: this.spriteColumns*3})
    }
    
    async evolve() {
        const game = this.game;
        const physics = game.physics.state;
        const players = game.players.state;        
        this.nextState.set(this.state);
        this.nextState.count = players.count;
        /*
        for(let i=0; i < players.count; i++) {
            const k = players.skins[i] % this.availableSkins.length;
            if(!this.skinTextures[k]) {
                const image = await loadImage(this.availableSkins[k]);
                const texture = new SpriteSheetTexture(this.gl);
                texture.load({image, rows: 4, columns: 3})
                this.skinTextures[k] = texture;
            }
            this.nextState.skins[i] = k;
        }
        */
        for(let i=0; i < players.count; i++) {
            const k = players.skins[i] % (this.spriteRows*this.spriteColumns);
            this.nextState.skins[i] = k;
        }        
        for(let i=0; i < players.count; i++) {
            const id = players.ids[i];
            physics.getPlayerPosition(id, this.nextState.positions, 2*i);
            physics.getPlayerAcceleration(id, this.nextState.accelerations, 2*i);            
        }
    }
    
    swapBuffers() {
        const tmp = this.state;
        this.state = this.nextState;
        this.nextState = tmp;
    }
    
    async sync() {
        this.swapBuffers();
        const gl = this.gl;
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        const r = this.canvas.width / this.canvas.height;
        const s = 0.9;
        this.cameraAspectRatio = r;
        const cameraMatrix = new Float32Array([
            s/r, 0, 0, 0,
            0, s, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);  
        
        const positions = this.state.positions;
        const accelerations = this.state.accelerations;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const lineProgram = this.shaders.lines;
        gl.useProgram(lineProgram.program);
        gl.uniformMatrix4fv(
            lineProgram.uniforms.cameraMatrix, false, cameraMatrix
        );
        gl.uniformMatrix4fv(
            lineProgram.uniforms.worldMatrix, false, Identity4x4
        );
        this.squareAsset.drawScene(0, lineProgram);
        
        const playerProgram = this.shaders.player;
        gl.useProgram(playerProgram.program);
        gl.uniformMatrix4fv(
            playerProgram.uniforms.viewMatrix, false, cameraMatrix
        );

        const playerFps = 5;
        const scale = 0.2;
        const worldMatrix = new Float32Array(Identity4x4);
        worldMatrix[0] = worldMatrix[5] = worldMatrix[10] = scale;
        
        for(let i=0; i < this.state.count; i++) {
            const k = this.state.skins[i];
//             const texture = this.skinTextures[k];
            const texture = this.spriteTexture;
            const frame = Math.floor(
                (this.game.time*playerFps)
            );
            const ofsCol = (k % this.spriteColumns)*3;
            const ofsRow = (Math.floor(k / this.spriteColumns))*4;
            const spriteCol = ofsCol + (frame % 3);
            const spriteRow = ofsRow + (accelerations[2*i] < 0 ? 1 : 2);
//             const spriteCol = frame % texture.spriteSheet.columns;
//             const spriteRow = accelerations[2*i] < 0 ? 1 : 2;
            texture.setActiveSprite(spriteRow, spriteCol);
            texture.bind(playerProgram);
            
            worldMatrix[12] = positions[2*i];
            worldMatrix[13] = positions[2*i+1];
            gl.uniformMatrix4fv(
                playerProgram.uniforms.worldMatrix, false, worldMatrix
            );
            this.twoTrianglesAsset.drawScene(0, playerProgram);
        }
    }
}


class SpriteSheetTexture {
    constructor(gl) {
        this.gl = gl;
        this.textureIndex = 0;
    }
    
    load({image, rows, columns}) {
        const gl = this.gl;
        this.texture = gl.createTexture();
        this.spriteSheetMatrix = new Float32Array([
            1/columns, 0, 0,
            0, 1/rows, 0,
            0, 0, 1
        ]);
        this.spriteSheet = {rows, columns, width: image.width, height: image.height};         gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);            
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);     
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    
    setActiveSprite(row, column) {
        this.spriteSheetMatrix[6] = column/this.spriteSheet.columns;
        this.spriteSheetMatrix[7] = row/this.spriteSheet.rows;        
    }
    
    bind(locations) {
        const gl = this.gl;
        gl.uniformMatrix3fv(
            locations.uniforms.spriteSheetMatrix, false, this.spriteSheetMatrix
        );
        gl.uniform1i(locations.uniforms.texture, this.textureIndex);        
        gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }
}

const Identity4x4 = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
]);

const almost1 = 1-(2**-24);

/*
const twoTrianglesGLTF = new DefaultGLTF();
twoTrianglesGLTF.meshes[0].primitives[0].attributes.POSITION = 0;
twoTrianglesGLTF.accessors[0].type = "VEC3";
twoTrianglesGLTF.accessors[0].data = new Float32Array([
    -1.0, -1.0,  0.0,
     1.0, -1.0,  0.0,
    -1.0,  1.0,  0.0,
    -1.0,  1.0,  0.0,
     1.0, -1.0,  0.0,
     1.0,  1.0,  0.0
])
twoTrianglesGLTF.meshes[0].primitives[0].attributes.TEXCOORD_0 = 1;
twoTrianglesGLTF.accessors[1].type = "VEC2";
twoTrianglesGLTF.accessors[1].data = new Float32Array([
    0, almost1,
    almost1, almost1,
    0, 0,
    0, 0,
    almost1, almost1,
    almost1, 0
])

*/


const twoTrianglesGLTF = {
    scene: 0,
    scenes: [{nodes: [0]}],
    nodes: [{mesh: 0}],
    meshes: [
        {
            primitives: [
                {
                    attributes: {
                        POSITION: 0,
                        TEXCOORD_0: 1
                    }
                }
            ]
        }
    ],
    accessors: [
        {
            type: "VEC3",
            data: new Float32Array([
                -1.0, -1.0,  0.0,
                 1.0, -1.0,  0.0,
                -1.0,  1.0,  0.0,
                -1.0,  1.0,  0.0,
                 1.0, -1.0,  0.0,
                 1.0,  1.0,  0.0
            ]),
        },
        {
            type: "VEC2",
            data: new Float32Array([
                0, almost1,
                almost1, almost1,
                0, 0,
                0, 0,
                almost1, almost1,
                almost1, 0
            ])
        }
    ]
}



const squareGLTF = {
    scene: 0,
    scenes: [{nodes: [0]}],
    nodes: [{mesh: 0}],
    meshes: [
        {
            primitives: [
                {
                    mode: 2,  // LINE_LOOP
                    attributes: {
                        POSITION: 0,
                    }
                }
            ]
        }
    ],
    accessors: [
        {
            type: "VEC3",
            data: new Float32Array([
                -1.0, -1.0, 0.0,
                -1.0,  1.0, 0.0,
                 1.0,  1.0, 0.0,
                 1.0, -1.0, 0.0
            ]),
        },
    ]
}

async function fetchSource(url) {
    const response = await fetch(url);
    if(!response.ok) {
        throw `Fetch of ${url} failed with status code ${response.statusCode}: ${response.statusText}`;
    }
    return await response.text();
}

async function loadProgram(gl, {vertexShaderUrl, fragmentShaderUrl}) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();    
    const [vertexSource, fragmentSource] = await Promise.all(
        [fetchSource(vertexShaderUrl), fetchSource(fragmentShaderUrl)]
    );
    gl.shaderSource(vertexShader, vertexSource);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    return {vertexShader, fragmentShader, program};
}

export async function loadShaders(gl, sources) {
    const programs = Object.fromEntries(
        await Promise.all(
            Object.entries(sources).map(
                async ([k, v]) => [k, await loadProgram(gl, v)])));
    
    for (const {vertexShader, fragmentShader} of Object.values(programs)) {
        gl.compileShader(vertexShader);
        gl.compileShader(fragmentShader);
    }
    for (const {program} of Object.values(programs)) {
        gl.linkProgram(program);
    }
    let error = false;
    for (const [name, program] of Object.entries(programs)) {
        if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
            const vsUrl = sources[name].vertexShaderUrl;
            const fsUrl = sources[name].fragmentShaderUrl;
            console.error(`Link failed: ${name}: ` + 
                          gl.getProgramInfoLog(program.program));
            console.error(`Vertex shader info-log: ${name}: ${vsUrl}:` + 
                          gl.getShaderInfoLog(program.vertexShader));
            console.error(`Fragment shader info-log: ${name}: ${fsUrl}:` + 
                          gl.getShaderInfoLog(program.fragmentShader));
            error = true;
        }
        const uniforms = {};
        {
            const N = gl.getProgramParameter(program.program, gl.ACTIVE_UNIFORMS);
            for(let i=0; i < N; i++) {
                const info = gl.getActiveUniform(program.program, i);
                uniforms[info.name] = gl.getUniformLocation(
                    program.program, info.name
                );
            }
        }
        program.uniforms = uniforms;
            
        const attributes = {};        
        {
            const N = gl.getProgramParameter(program.program, gl.ACTIVE_ATTRIBUTES);
            for(let i=0; i < N; i++) {
                const info = gl.getActiveAttrib(program.program, i);
                attributes[info.name] = gl.getAttribLocation(
                    program.program, info.name
                );
            }
        }
        program.attributes = attributes;

    }
    if(error) {
        throw "Failed to load shader programs.";
    }
    return programs;
}

export {Display}
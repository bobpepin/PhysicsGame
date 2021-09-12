import {ObjectOfArrays} from "./utils.js"
import {GLTFAsset} from "./gltf.js"

class DisplayState extends ObjectOfArrays {
    constructor(N) {
        super();
        const dim = this.dim = 2;
        this.pointPositions = new Float32Array(dim*N);
        this.pointCount = 0;
    }
}

const shaderSources = {
    lines: {
        vertexShaderUrl: "src/lines.vert.glsl",
        fragmentShaderUrl: "src/lines.frag.glsl"
    },
    points: {
        vertexShaderUrl: "src/points.vert.glsl",
        fragmentShaderUrl: "src/points.frag.glsl"
    }
}


class PhysicsDisplay {
    async init(game) {
        this.game = game;
        const parameters = this.parameters = game.parameters;
        this.canvas = document.querySelector("#physics-canvas");        
        const gl = this.gl = this.canvas.getContext("webgl", {antialias: false});
        const ext = gl.getExtension("OES_vertex_array_object");
        gl.createVertexArray = (() => ext.createVertexArrayOES());
        gl.bindVertexArray = ((arrayObject) => ext.bindVertexArrayOES(arrayObject));
        this.shaders = await loadShaders(gl, shaderSources);
        
        this.twoTrianglesAsset = new GLTFAsset(gl, null, twoTrianglesGLTF);
        this.squareAsset = new GLTFAsset(gl, null, squareGLTF);
        this.pointAsset = new GLTFAsset(gl, null, pointGLTF);
        
        const N = parameters.physics.maxPoints;
        this.state = new DisplayState(N);
        this.nextState = new DisplayState(N);
    }
    
    async evolve() {
        const game = this.game;
        const physics = game.physics.state;
        const state = this.nextState;
        state.set(this.state);
        state.pointCount = physics.points.count;
        state.pointPositions.set(physics.points.positions);
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


        const pointProgram = this.shaders.points;
        gl.useProgram(pointProgram.program);
        gl.uniformMatrix4fv(
            pointProgram.uniforms.cameraMatrix, false, cameraMatrix
        );

        const scale = 0.1;
        const worldMatrix = new Float32Array(Identity4x4);
//         worldMatrix[0] = worldMatrix[5] = worldMatrix[10] = scale;

        const positions = this.state.pointPositions;        
        for(let i=0; i < this.state.pointCount; i++) {
            worldMatrix[12] = positions[2*i];
            worldMatrix[13] = positions[2*i+1];
            gl.uniformMatrix4fv(
                pointProgram.uniforms.worldMatrix, false, worldMatrix
            );
            this.pointAsset.drawScene(0, pointProgram);
        }
        
        gl.useProgram(lineProgram.program);
        const rectangles = this.game.physics.state.rectangles;
        const points = this.game.physics.state.points;
        const rectangleMatrix = new Float32Array(Identity4x4);
        {
        const s = rectangles.dim;
        for(let i=0; i < rectangles.count; i++) {
            rectangleMatrix[0] = rectangles.scales[i*s];
            rectangleMatrix[5] = rectangles.scales[i*s+1];
            points.getPosition(rectangles.centers[i], rectangleMatrix, 12);
            gl.uniformMatrix4fv(
                lineProgram.uniforms.worldMatrix, false, rectangleMatrix
            );
            this.squareAsset.drawScene(0, lineProgram);
        }
        }
    }
}

const Identity4x4 = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
]);

const almost1 = 1-(2**-24);

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


const pointGLTF = {
    scene: 0,
    scenes: [{nodes: [0]}],
    nodes: [{mesh: 0}],
    meshes: [{primitives: [{mode: 0, attributes: {POSITION: 0}}]}],
    accessors: [{type: "VEC3", data: new Float32Array([0.0, 0.0, 0.0])}]
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

export {PhysicsDisplay}
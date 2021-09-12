const accessorTypeToNumComponentsMap = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16
};

const TypedArrayToComponentTypeMap = {
    "Int8Array": 5120,
    "Uint8Array": 5121,
    "Int16Array": 5122,
    "Uint16Array": 5123,
    "Uint32Array": 5125,
    "Float32Array": 5126
}

const Identity4x4 = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);

class GLTFAsset {
    constructor(gl, url, jsonData) {
        this.gl = gl;
        this.url = url;
        this.parentURL = url ? url.replace(/[^/]+$/, "") : ".";
        this.glBuffers = {
            bufferViews: [],
            accessors: []
        };
        this.sceneMatrices = [];
        if(jsonData) {
            this.jsonData = jsonData;
            this.loadJsonData();
        }
    }
    
    loadJsonData() {
        const data = this.jsonData;
        const attributes = [
            "scene",
            "scenes",
            "meshes",
            "nodes",
            "buffers",
            "accessors",
            "bufferViews"
        ]
        for(const attribute of attributes) {
            this[attribute] = data[attribute];
            if(this[attribute] === undefined && attribute != "scene") {
                this[attribute] = [];
            }
        }
        this.setBufferViewTargets();
        this.updateAccessors();
        this.updateSceneMatrices();
    }
    
    setBufferViewTargets() {
        const {gl} = this;
        for(const mesh of this.meshes) {
            for(const primitive of mesh.primitives) {
                if(primitive.indices !== undefined) {
                    const accessor = this.accessors[primitive.indices];
                    const bufferView = this.bufferViews[accessor.bufferView];
                    bufferView.target = gl.ELEMENT_ARRAY_BUFFER;
                }
            }
        }
    }

    async fetchData() {
        if(!this.jsonData) {
            this.jsonData = await (await fetch(this.url)).json();
            this.loadJsonData();
        }
        const promises = [];
        for(let i=0; i < this.buffers.length; i++) {
            promises.push(this.fetchBufferData(i));
        }
        const results = await Promise.allSettled(promises);
        const bufferData = [];
        for(const [i, r] of results.entries()) {
            if(r.status == "rejected") {
                console.error(`Fetch of buffer ${i} failed: ${r.reason}`);
            } else {
                bufferData[i] = r.value;
            }
        }
        for(let i=0; i < this.bufferViews.length; i++) {
            this.loadBufferView(i, bufferData);
        }
        this.updateAccessors();
    }
    
    async fetchBufferData(bufferIndex) {
        const gl = this.gl;
        const buffer = this.buffers[bufferIndex];
        const url = this.parentURL + buffer.uri;
        const arrayBuffer = await (await fetch(url)).arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        return data.subarray(0, buffer.byteLength);
    }
    
    loadBufferView(bufferViewIndex, bufferData) {
        const {gl} = this;
        const bufferView = this.bufferViews[bufferViewIndex];
        const bufferIndex = bufferView.buffer;
//         console.log(bufferView, bufferData);
        const data = bufferData[bufferIndex];
        const target = 
            bufferView.target === undefined ? gl.ARRAY_BUFFER : bufferView.target;
        const byteOffset = bufferView.byteOffset;
        const byteLength = bufferView.byteLength;
        const glBuffer = gl.createBuffer();
        gl.bindBuffer(target, glBuffer);
        gl.bufferData(
            target, data.subarray(byteOffset, byteOffset+byteLength), 
            gl.STATIC_DRAW
        );
        gl.bindBuffer(target, null);
        this.glBuffers.bufferViews[bufferViewIndex] = glBuffer;
    }
    
    updateAccessors() {
        for(const [accessorIndex, accessor] of this.accessors.entries()) {
            if(this.glBuffers.accessors[accessorIndex] === undefined) {
                const bufferViewIndex = accessor.bufferView;
                if(bufferViewIndex !== undefined) {
                    this.glBuffers.accessors[accessorIndex] = 
                        this.glBuffers.bufferViews[bufferViewIndex];
                } else if(accessor.data !== undefined) {
                    this.loadAccessorData(accessorIndex);
                }
            }
        }
//         console.log(this);
    }
    
    loadAccessorData(accessorIndex) {
        const {gl} = this;
        const accessor = this.accessors[accessorIndex];
        if(accessor.data === undefined) {
            return;
        }
        const data = accessor.data;
        const componentType = TypedArrayToComponentTypeMap[data.constructor.name];
        const count = data.length / accessorTypeToNumComponentsMap[accessor.type];
        accessor.componentType = componentType;
        accessor.count = count;
        const target = gl.ARRAY_BUFFER;
        const glBuffer = gl.createBuffer();
        gl.bindBuffer(target, glBuffer);
        gl.bufferData(
            target, data, gl.STATIC_DRAW
        );
        gl.bindBuffer(target, null);
        this.glBuffers.accessors[accessorIndex] = glBuffer;
    }
    
    bindPrimitiveAttributes(meshIndex, primitiveIndex, attributeLocations) {
        const {gl} = this;
        const primitive = this.meshes[meshIndex].primitives[primitiveIndex];
        const attributes = primitive.attributes;
        for(const [attribute, accessorIndex] of Object.entries(attributes)) {
            const location = attributeLocations[attribute];
            const accessor = this.accessors[accessorIndex];
            // TODO: accessor.bufferView can be undefined, defaults to all zeros
            const bufferView = this.bufferViews[accessor.bufferView];
            // TODO: catch case where accessor.type is a matrix
            const size = accessorTypeToNumComponentsMap[accessor.type];
            const byteStride = bufferView ? (bufferView.byteStride || 0) : 0;
            const glBuffer = this.glBuffers.accessors[accessorIndex];
            gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(
                location, size, accessor.componentType, 
                accessor.normalized == true, byteStride,
                accessor.byteOffset
            );
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
    }
    
    bindPrimitiveIndices(meshIndex, primitiveIndex) {
        const {gl} = this;
        const primitive = this.meshes[meshIndex].primitives[primitiveIndex];
        if(primitive.indices === undefined) {
            return;
        }
        const glBuffer = this.glBuffers.accessors[primitive.indices];
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer);
        
    }
    
    loadMaterial(materialIndex, program) {
        
    }
    
    loadTexture(textureIndex) {
        
    }
    
    storeSceneMatrix(nodeIndex, uniformLocation) {
        const {gl} = this;
        gl.uniformMatrix4fv(
            uniformLocation, false, this.sceneMatrices[nodeIndex]
        );
    }

    updateSceneMatrices() {
        const sceneMatrices = this.sceneMatrices;
        const nodes = this.nodes;
        while(sceneMatrices.length < nodes.length) {
            sceneMatrices.push(new Float32Array(Identity4x4));
        }
        for(const scene of this.scenes) {
            for(const nodeIndex in scene.nodes) {
                this.updateNodeTree(nodeIndex);
            }
        }
    }
    
    updateNodeTree(nodeIndex, parentIndex) {
        const nodes = this.nodes;
        const sceneMatrices = this.sceneMatrices;
        const node = nodes[nodeIndex];
        let nodeMatrix = node.matrix;
        if(nodeMatrix === undefined) {
            let matrix;
            if(node.rotation) {
                matrix = quaternionRotationMatrix(node.rotation);
            } else {
                matrix = new Float32Array(Identity4x4);
            }
            if(node.translation) {
                matrix.set(node.translation, 12);
            }
            const scale = node.scale || [1, 1, 1];
            const scaleMatrix = new Float32Array([
                scale[0], 0, 0, 0,
                0, scale[1], 0, 0,
                0, 0, scale[2], 0,
                0, 0, 0, 1
            ]);
            nodeMatrix = matmul(matrix, scaleMatrix, 4, 4);
        }
//         console.log("nodeTree", nodeIndex, nodeMatrix);
        if(parentIndex === undefined) {
            sceneMatrices[nodeIndex].set(nodeMatrix);
        } else {
            matmul(
                sceneMatrices[parentIndex], nodeMatrix, 4, 4,
                sceneMatrices[nodeIndex]
            );
        }
        if(node.children) {
            for(const childIndex of node.children) {
                this.updateNodeTree(childIndex, nodeIndex);
            }
        }
    }
    
    drawMesh(meshIndex, program) {
        const gl = this.gl;
        const mesh = this.meshes[meshIndex];
        for(const [primitiveIndex, primitive] of mesh.primitives.entries()) {
            this.bindPrimitiveAttributes(
                meshIndex, primitiveIndex, program.attributes
            );
            if(primitive.indices) {
                this.bindPrimitiveIndices(meshIndex, primitiveIndex);
                const accessor = this.accessors[primitive.indices];
                gl.drawElements(
                    primitive.mode === undefined ? 4 : primitive.mode, accessor.count, accessor.componentType,
                    0
                );
            } else {
                const accessor = this.accessors[primitive.attributes.POSITION];
                gl.drawArrays(primitive.mode === undefined ? 4 : primitive.mode, 0, accessor.count);
            }            
        }
    }
    
    drawNode(nodeIndex, program) {
        const gl = this.gl;
        this.storeSceneMatrix(nodeIndex, program.uniforms.sceneMatrix);
        this.drawMesh(this.nodes[nodeIndex].mesh, program);
    }
    
    drawScene(sceneIndex, program) {
//         console.log("drawScene", nodeIndex);        
        const scene = this.scenes[sceneIndex];
        for(const nodeIndex of scene.nodes) {
            this.drawNode(nodeIndex, program);
        }
    }
    
}

class GLTFDrawing {
    constructor(gl, program, asset) {
        this.asset = asset;
        this.gl = gl;
        this.program = program;
        this.worldMatrices = [Identity4x4];
        this.initPrimitives();
    }   
    
    initPrimitives() {
        const {gl, asset} = this;
        this.primitiveVertexArrays = {};
        for(const [meshIndex, mesh] of asset.meshes.entries()) {
            for(const [primitiveIndex, primitive] of mesh.primitives.entries()) {
                const key = `${meshIndex}.${primitiveIndex}`;
                const vertexArray = gl.createVertexArray();
                gl.bindVertexArray(vertexArray);
                asset.bindPrimitiveAttributes(
                    meshIndex, primitiveIndex, this.program.attributes
                );
                asset.bindPrimitiveIndices(meshIndex, primitiveIndex);
                gl.bindVertexArray(null);
                this.primitiveVertexArrays[key] = vertexArray;
            }
        }        
    }
    
    bindPrimitiveVertexArray(meshIndex, primitiveIndex) {
        const {gl} = this;
        const key = `${meshIndex}.${primitiveIndex}`;
        const vertexArray = this.primitiveVertexArrays[key];
//         console.log("vertexArray", vertexArray);
        gl.bindVertexArray(vertexArray);
    }
    
    drawMesh(meshIndex) {
        const {gl, asset} = this;
        const mesh = asset.meshes[meshIndex];
        for(const [primitiveIndex, primitive] of mesh.primitives.entries()) {
            this.bindPrimitiveVertexArray(meshIndex, primitiveIndex);
            if(primitive.indices) {
                asset.bindPrimitiveIndices(meshIndex, primitiveIndex);
                const accessor = asset.accessors[primitive.indices];
                gl.drawElements(
                    primitive.mode || 4, accessor.count, accessor.componentType,
                    0
                );
            } else {
                const accessor = asset.accessors[primitive.attributes.POSITION];
                gl.drawArrays(primitive.mode || 4, 0, accessor.count);
            }            
        }
    }
    
    drawNode(nodeIndex) {
        const {gl, asset, program} = this;
        asset.storeSceneMatrix(nodeIndex, program.uniforms.sceneMatrix);
        this.drawMesh(asset.nodes[nodeIndex].mesh);
    }
    
    drawScene(sceneIndex) {
//         console.log("drawScene", nodeIndex);        
        const scene = this.asset.scenes[sceneIndex];
        for(const nodeIndex of scene.nodes) {
            this.drawNode(nodeIndex);
        }
    }
    
    useProgram() {
        this.gl.useProgram(this.program.program);
    }    
}

function matmul(A, B, nA, mB, C) {
    const mA = A.length / nA;
    const nB = B.length / mB;
    if(C == undefined) {
        C = new Float32Array(nA*mB);
    }
    for(let i=0; i < nA; i++) {
        for(let j=0; j < mB; j++) {
            C[i+j*nA] = 0;
            for(let k=0; k < mA; k++) {
                C[i+j*nA] += A[i+k*nA]*B[k+j*nB];
            }
        }
    }
    return C;
}

function quaternionRotationMatrix(q) {
    const [qi, qj, qk, qr] = q;
    const [qr2, qi2, qj2, qk2] = [qr**2, qi**2, qj**2, qk**2];
    const s = 1.0/(qr2 + qi2 + qj2 + qk2);
    const R = new Float32Array([
        1-2*s*(qj2+qk2), 2*s*(qi*qj+qk*qr), 2*s*(qi*qk-qj*qr), 0,
        2*s*(qi*qj-qk*qr), 1-2*s*(qi2+qk2), 2*(qj*qk+qi*qr), 0,
        2*s*(qi*qk+qj*qr), 2*s*(qj*qk-qi*qr), 1-2*s*(qi2+qj2), 0,
        0, 0, 0, 1]);
    return R;
}

export {GLTFAsset};
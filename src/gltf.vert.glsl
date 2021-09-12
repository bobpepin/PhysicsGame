#version 100

precision highp float;

uniform mat4 viewMatrix;
uniform mat4 worldMatrix;
uniform mat4 sceneMatrix;

uniform vec4 color;

uniform float time;

attribute vec3 POSITION;
attribute vec3 NORMAL;
attribute vec2 TEXCOORD_0;

varying vec2 st;
varying vec3 norm;
varying vec3 pos;

void main() {
    gl_Position = viewMatrix * worldMatrix * sceneMatrix * vec4(POSITION, 1.0);
//     gl_Position = vec4(POSITION, 1.0);
    st = TEXCOORD_0;
    pos = (worldMatrix * sceneMatrix * vec4(POSITION, 1.0)).xyz;
    norm = (worldMatrix * sceneMatrix * vec4(NORMAL, 0.0)).xyz;
}

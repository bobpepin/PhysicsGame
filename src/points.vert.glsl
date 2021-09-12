#version 100

precision highp float;

uniform mat4 cameraMatrix;
uniform mat4 sceneMatrix;
uniform mat4 worldMatrix;

attribute vec4 POSITION;

void main() {
    gl_Position = cameraMatrix * worldMatrix * sceneMatrix * POSITION;
    gl_PointSize = 4.0;
}


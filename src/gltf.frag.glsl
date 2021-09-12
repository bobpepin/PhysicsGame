#version 100

precision highp float;

varying vec2 st;
varying vec3 pos;
varying vec3 norm;

uniform highp sampler2D texture;

uniform mat3 spriteSheetMatrix;

uniform float time;
uniform vec4 color;

void main() {
    vec3 st1 = spriteSheetMatrix * vec3(st.x, st.y, 1.0);
    vec4 texcolor = texture2D(texture, st1.xy);
    if(texcolor.a == 0.0)
        discard;
    gl_FragColor = texcolor;
}
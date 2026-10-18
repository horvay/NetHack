shader_type canvas_item;
// Screen-edge vignette: always a soft darkening for mood, a red flash when
// the hero is hit, and a slow red heartbeat when health is low.

uniform float hit = 0.0;
uniform float danger = 0.0;

void fragment() {
	vec2 uv = UV - 0.5;
	float edge = smoothstep(0.30, 0.78, length(uv * vec2(1.0, 1.25)));
	float beat = danger * (0.55 + 0.45 * sin(TIME * 4.2));
	vec3 red = vec3(0.75, 0.04, 0.02);
	float red_amount = edge * clamp(hit * 0.9 + beat * 0.55, 0.0, 1.0);
	float dark = edge * 0.42;
	COLOR = vec4(mix(vec3(0.0), red, red_amount / max(red_amount + dark, 0.001)), clamp(dark + red_amount, 0.0, 0.92));
}

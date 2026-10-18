shader_type canvas_item;
// Behind the dungeon: the unknown rock the hero hasn't seen. Deep blue-black
// with slow drifting mist and a soft vignette, so the screen never ends in a
// flat black box, yet nothing here could be mistaken for walkable ground.

uniform vec3 deep : source_color = vec3(0.020, 0.024, 0.036);
uniform vec3 mist : source_color = vec3(0.075, 0.085, 0.120);
uniform vec2 drift = vec2(0.006, 0.0025);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 uv = UV * vec2(1.78, 1.0) * 3.0;
	float clouds = fbm(uv + TIME * drift * 10.0);
	clouds = smoothstep(0.35, 0.85, clouds);
	vec3 color = mix(deep, mist, clouds * 0.75);
	// Fine grain so the dark never bands.
	color += (hash(FRAGCOORD.xy + floor(TIME * 12.0)) - 0.5) * 0.006;
	float vignette = smoothstep(1.15, 0.35, length(UV - vec2(0.5)) * 1.4);
	COLOR = vec4(color * mix(0.55, 1.0, vignette), 1.0);
}

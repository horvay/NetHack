shader_type canvas_item;
// Animated water and lava. Each cell is drawn with this material; the shader
// works in world space so neighboring cells flow together seamlessly.
// COLOR.r from the draw call selects the liquid: < 0.5 water, >= 0.5 lava.

varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	bool lava = COLOR.r >= 0.5;
	// Quantize to the 32px-per-tile pixel grid so liquids read as pixel art.
	vec2 p = floor(world) / 32.0;
	float t = TIME * (lava ? 0.25 : 0.45);
	float n = noise(p * 2.3 + vec2(t, t * 0.6)) * 0.6 + noise(p * 5.1 - vec2(t * 1.3, t)) * 0.4;
	float caustic = smoothstep(0.62, 0.78, n);
	vec3 color;
	if (lava) {
		vec3 deep = vec3(0.45, 0.05, 0.02);
		vec3 hot = vec3(1.0, 0.55, 0.12);
		color = mix(deep, hot, smoothstep(0.35, 0.85, n));
		color += vec3(1.0, 0.85, 0.4) * caustic * 0.6;
	} else {
		vec3 deep = vec3(0.04, 0.12, 0.24);
		vec3 shallow = vec3(0.10, 0.30, 0.48);
		color = mix(deep, shallow, n);
		color += vec3(0.55, 0.80, 1.0) * caustic * 0.35;
	}
	color = floor(color * 24.0) / 24.0;
	COLOR = vec4(color, 1.0);
}

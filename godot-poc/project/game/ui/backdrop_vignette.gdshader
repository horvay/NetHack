shader_type canvas_item;
// Heavy cinematic vignette for menu backdrops.

void fragment() {
	vec2 uv = UV - 0.5;
	float d = length(uv * vec2(1.0, 1.35));
	float dark = smoothstep(0.2, 0.85, d);
	COLOR = vec4(0.012, 0.012, 0.02, clamp(0.35 + dark * 0.65, 0.0, 0.97));
}

shader_type canvas_item;
// Fog of war and lighting over the whole map, from NetHack's own vision.
// vision_tex is one texel per map cell: R = in sight now, G = lit, B = explored.
// Linear filtering between texels gives soft edges to sight and light.

uniform sampler2D vision_tex : filter_linear, repeat_disable;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform vec2 map_cells = vec2(80.0, 21.0);
uniform vec2 hero_cell = vec2(0.0, 0.0);
uniform float torch_radius = 3.6;
uniform vec3 torch_color : source_color = vec3(1.0, 0.72, 0.42);
uniform vec3 memory_tint : source_color = vec3(0.50, 0.58, 0.82);
uniform float memory_brightness = 0.34;
uniform float blind = 0.0;
// Matches the renderer's clear color so the map's edge never shows.
uniform vec3 void_color : source_color = vec3(0.0235, 0.0275, 0.0392);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec2 cell = UV * map_cells;
	vec4 v = texture(vision_tex, UV);
	vec3 base = texture(screen_tex, SCREEN_UV).rgb;

	float flicker = 0.94 + 0.06 * sin(TIME * 7.3) * sin(TIME * 3.1 + 1.7);
	float dist = distance(cell, hero_cell + vec2(0.5));
	float torch = (1.0 - smoothstep(0.6, torch_radius * flicker, dist));
	float light = max(v.g, torch * 0.95);

	// In sight: lit rooms at full strength, dark areas lit by the hero's torch.
	vec3 seen = base * (0.30 + 0.78 * light);
	seen += base * torch_color * torch * (1.0 - v.g) * 0.35;
	seen = mix(seen, seen * torch_color * 1.15, torch * 0.18);

	// Remembered: cold, desaturated, dim.
	float lum = dot(base, vec3(0.299, 0.587, 0.114));
	vec3 remembered = mix(vec3(lum), base, 0.22) * memory_tint * memory_brightness;
	remembered += (hash(floor(cell * 4.0) + floor(TIME * 2.0)) - 0.5) * 0.008;

	float visible = smoothstep(0.15, 0.85, v.r) * (1.0 - blind);
	vec3 color = mix(remembered, seen, visible);
	// Unexplored cells stay see-through: the world backdrop shows there.
	float explored = smoothstep(0.05, 0.6, v.b);
	COLOR = vec4(color, explored);
}

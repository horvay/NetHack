shader_type canvas_item;
// Desaturated, slightly cold portrait for the fallen.

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	COLOR = vec4(mix(vec3(l), c.rgb, 0.12) * vec3(0.86, 0.9, 1.0), c.a);
}

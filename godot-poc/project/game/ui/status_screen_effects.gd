class_name StatusScreenEffects
extends CanvasLayer
## How some statuses feel on the map itself (drawn over the world, under the
## HUD and panels): blind darkens everything but a small circle around the
## middle; confused or stunned make the view sway gently; hallucinating
## slowly shifts its colours. Reduced motion keeps the darkening and drops
## the movement and colour cycling.

const SHADER := """
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float blind = 0.0;
uniform float sway = 0.0;
uniform float hue = 0.0;
uniform float t = 0.0;

vec3 hue_shift(vec3 c, float a) {
	const vec3 k = vec3(0.57735);
	float ca = cos(a);
	return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	uv += sway * vec2(sin(t * 1.7 + uv.y * 9.0), cos(t * 1.3 + uv.x * 7.0)) * 0.004;
	vec3 c = texture(screen_tex, uv).rgb;
	c = mix(c, hue_shift(c, t * 0.6), hue);
	vec2 d = (UV - 0.5) * vec2(1.6, 1.0);
	float dark = smoothstep(0.12, 0.55, length(d)) * blind;
	float grey = dot(c, vec3(0.3, 0.59, 0.11));
	c = mix(c, vec3(grey) * 0.6, blind * 0.5);
	COLOR = vec4(c * (1.0 - dark * 0.85), 1.0);
}
"""

var screen: GameScreen
var _rect: ColorRect
var _material: ShaderMaterial
var _target := {"blind": 0.0, "sway": 0.0, "hue": 0.0}
var _now := {"blind": 0.0, "sway": 0.0, "hue": 0.0}
var _time := 0.0


func setup(game_screen: GameScreen) -> void:
	screen = game_screen
	name = "StatusScreenEffects"
	layer = 5
	_rect = ColorRect.new()
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := Shader.new()
	shader.code = SHADER
	_material = ShaderMaterial.new()
	_material.shader = shader
	_rect.material = _material
	_rect.visible = false
	add_child(_rect)
	screen.state.status_changed.connect(_on_status)


func _on_status() -> void:
	var ids := StatusEffects.current(screen.state.status).map(func(e: Dictionary) -> Variant: return e.id)
	_target.blind = 1.0 if ids.has("blind") else 0.0
	_target.sway = 1.0 if (ids.has("conf") or ids.has("stun")) and Motion.enabled() else 0.0
	_target.hue = 1.0 if ids.has("hallu") and Motion.enabled() else 0.0


## How strong each effect is now (0..1), for tests.
func strength(effect: String) -> float:
	return float(_now.get(effect, 0.0))


func _process(delta: float) -> void:
	var any := false
	for key in _now:
		_now[key] = move_toward(float(_now[key]), float(_target[key]), delta * 1.5)
		any = any or float(_now[key]) > 0.001
	_rect.visible = any
	if not any:
		return
	_time += delta
	_material.set_shader_parameter("blind", _now.blind)
	_material.set_shader_parameter("sway", _now.sway)
	_material.set_shader_parameter("hue", _now.hue)
	_material.set_shader_parameter("t", _time)

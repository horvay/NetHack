class_name SoundBank
extends RefCounted
## Retro-synthesized sound effects, generated once at startup: footsteps,
## blows, whiffs, wounds, kills, pickups, coins, doors, stairs, magic, UI
## ticks and a low dungeon ambience. NetHack's own CC-licensed clips
## (assets/sound/nethack) cover level changes and instruments.

const RATE := 22050

static var _shared: SoundBank

var streams: Dictionary = {}
var _rng := RandomNumberGenerator.new()


static func shared() -> SoundBank:
	if _shared == null:
		_shared = SoundBank.new()
		_shared._build()
	return _shared


func _build() -> void:
	_rng.seed = 7
	streams["step"] = _stream(_mix([_noise(0.07, 700.0, 300.0, 0.004, 0.06, 0.35), _tone(95.0, 70.0, 0.06, "sine", 0.002, 0.05, 0.25)]))
	streams["hit"] = _stream(_mix([_noise(0.10, 3200.0, 700.0, 0.001, 0.09, 0.55), _tone(190.0, 70.0, 0.09, "square", 0.001, 0.08, 0.30)]))
	streams["miss"] = _stream(_noise(0.20, 4200.0, 900.0, 0.03, 0.16, 0.22))
	streams["hurt"] = _stream(_mix([_tone(140.0, 55.0, 0.22, "sine", 0.002, 0.2, 0.6), _noise(0.16, 600.0, 200.0, 0.001, 0.15, 0.4)]))
	streams["kill"] = _stream(_mix([_tone(320.0, 50.0, 0.30, "square", 0.002, 0.28, 0.28), _noise(0.22, 2400.0, 300.0, 0.001, 0.2, 0.45)]))
	streams["pickup"] = _stream(_concat([_tone(660.0, 660.0, 0.06, "triangle", 0.002, 0.05, 0.35), _tone(990.0, 990.0, 0.10, "triangle", 0.002, 0.09, 0.35)]))
	streams["gold"] = _stream(_coins())
	streams["door"] = _stream(_mix([_noise(0.20, 380.0, 160.0, 0.002, 0.18, 0.55), _tone(80.0, 55.0, 0.18, "sine", 0.002, 0.16, 0.5)]))
	streams["stairs"] = _stream(_mix([_noise(0.7, 2200.0, 200.0, 0.05, 0.6, 0.35), _tone(220.0, 90.0, 0.7, "sine", 0.05, 0.6, 0.25)]))
	streams["zap"] = _stream(_mix([_vibrato(1300.0, 280.0, 0.40, 0.3), _noise(0.35, 6000.0, 3000.0, 0.01, 0.3, 0.12)]))
	streams["ui_click"] = _stream(_tone(1500.0, 1300.0, 0.025, "sine", 0.001, 0.022, 0.18))
	streams["ui_open"] = _stream(_noise(0.14, 5000.0, 2500.0, 0.02, 0.11, 0.10))
	streams["ui_close"] = _stream(_noise(0.10, 2500.0, 1200.0, 0.01, 0.09, 0.08))
	# Two falling square-wave tones: something is about to kill the hero.
	streams["alarm"] = _stream(_concat([_tone(880.0, 860.0, 0.13, "square", 0.004, 0.11, 0.30), _tone(620.0, 600.0, 0.22, "square", 0.004, 0.2, 0.30)]))
	# A status begins: two soft falling notes (the alarm is for deadly ones).
	streams["warn"] = _stream(_concat([_tone(740.0, 730.0, 0.11, "triangle", 0.004, 0.10, 0.32), _tone(520.0, 500.0, 0.20, "triangle", 0.004, 0.18, 0.30)]))
	streams["drip"] = _stream(_tone(1900.0, 900.0, 0.07, "sine", 0.001, 0.065, 0.20))
	var ambience := _stream(_ambience(6.0))
	ambience.loop_mode = AudioStreamWAV.LOOP_FORWARD
	ambience.loop_end = int(6.0 * RATE)
	streams["ambience"] = ambience
	for clip in ["sa2_xplevelup", "sa2_xpleveldown", "se_squeak_C", "sound_Bell"]:
		var path := "res://assets/sound/nethack/%s.wav" % clip
		if ResourceLoader.exists(path):
			streams[clip] = load(path)


func _stream(samples: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		var v := int(clampf(samples[i], -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, v)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	return stream


func _envelope(t: float, duration: float, attack: float, decay: float) -> float:
	if t < attack:
		return t / maxf(attack, 0.0001)
	var release := clampf((t - attack) / maxf(decay, 0.0001), 0.0, 1.0)
	return pow(1.0 - release, 2.0) if t < duration else 0.0


func _tone(f0: float, f1: float, duration: float, wave: String, attack: float, decay: float, volume: float) -> PackedFloat32Array:
	var n := int(duration * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var f := lerpf(f0, f1, t / duration)
		phase += f / RATE
		var p := fposmod(phase, 1.0)
		var s := 0.0
		match wave:
			"sine":
				s = sin(p * TAU)
			"square":
				s = 1.0 if p < 0.5 else -1.0
			"triangle":
				s = 4.0 * absf(p - 0.5) - 1.0
		out[i] = s * volume * _envelope(t, duration, attack, decay)
	return out


func _vibrato(f0: float, f1: float, duration: float, volume: float) -> PackedFloat32Array:
	var n := int(duration * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var f := lerpf(f0, f1, t / duration) * (1.0 + 0.04 * sin(t * TAU * 22.0))
		phase += f / RATE
		out[i] = sin(phase * TAU) * volume * _envelope(t, duration, 0.01, duration * 0.9)
	return out


## Noise through a one-pole low-pass whose cutoff sweeps c0 -> c1.
func _noise(duration: float, c0: float, c1: float, attack: float, decay: float, volume: float) -> PackedFloat32Array:
	var n := int(duration * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var y := 0.0
	for i in n:
		var t := float(i) / RATE
		var cutoff := lerpf(c0, c1, t / duration)
		var a := 1.0 - exp(-TAU * cutoff / RATE)
		y += a * (_rng.randf_range(-1.0, 1.0) - y)
		out[i] = y * volume * 2.2 * _envelope(t, duration, attack, decay)
	return out


func _coins() -> PackedFloat32Array:
	var layers: Array = []
	for i in 4:
		var offset := PackedFloat32Array()
		offset.resize(int(i * 0.045 * RATE))
		var ping := _tone(_rng.randf_range(2600.0, 3400.0), _rng.randf_range(2400.0, 3000.0), 0.12, "sine", 0.001, 0.11, 0.18)
		offset.append_array(ping)
		layers.append(offset)
	return _mix(layers)


func _ambience(duration: float) -> PackedFloat32Array:
	var n := int(duration * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var brown := 0.0
	var low := 0.0
	for i in n:
		var t := float(i) / RATE
		brown = clampf(brown + _rng.randf_range(-0.02, 0.02), -1.0, 1.0)
		low += 0.01 * (brown - low)
		# Fade the loop's ends together so it repeats seamlessly.
		var edge := minf(t, duration - t)
		var blend := clampf(edge / 0.5, 0.0, 1.0)
		out[i] = (low * 0.9 + sin(t * TAU * 55.0) * 0.015) * blend
	return out


func _mix(layers: Array) -> PackedFloat32Array:
	var length := 0
	for layer in layers:
		length = maxi(length, (layer as PackedFloat32Array).size())
	var out := PackedFloat32Array()
	out.resize(length)
	for layer in layers:
		var samples: PackedFloat32Array = layer
		for i in samples.size():
			out[i] += samples[i]
	return out


func _concat(layers: Array) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	for layer in layers:
		out.append_array(layer)
	return out

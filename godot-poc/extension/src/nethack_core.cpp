#include "nethack_core.h"

#include <godot_cpp/classes/json.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>

#include <dlfcn.h>
#include <fcntl.h>
#include <stdlib.h>
#include <unistd.h>

#include <cerrno>
#include <climits>
#include <chrono>
#include <cstring>

namespace godot {


namespace {

constexpr int STOP_TIMEOUT_SECONDS = 5;
const char *CORE_LIBRARY_NAME = "libnethack_core.so";

// Per-game settings (seeds, options, fixture and developer switches) that
// must never leak from one game, or from the developer's shell, into a game.
const char *PER_GAME_ENV_PREFIXES[] = { "NETHACK", "NH_ELECTRON_", "NH_TEST_", "NH_SHIM_", "NH_BRIDGE_" };

void clear_per_game_env() {
	std::vector<std::string> names;
	for (char **entry = environ; entry && *entry; ++entry) {
		std::string pair(*entry);
		std::string name = pair.substr(0, pair.find('='));
		for (const char *prefix : PER_GAME_ENV_PREFIXES) {
			if (name.rfind(prefix, 0) == 0) {
				names.push_back(name);
				break;
			}
		}
	}
	for (const std::string &name : names) {
		::unsetenv(name.c_str());
	}
}

// NetHack keeps process-wide state (cwd, environment): one game per process.
std::atomic<bool> core_in_use{ false };

// Writes the whole buffer, retrying on EINTR and short writes.
bool write_all(int p_fd, const char *p_data, size_t p_size) {
	while (p_size > 0) {
		ssize_t wrote = ::write(p_fd, p_data, p_size);
		if (wrote < 0) {
			if (errno == EINTR) {
				continue;
			}
			return false;
		}
		p_data += wrote;
		p_size -= static_cast<size_t>(wrote);
	}
	return true;
}

String end_reason_name(int p_reason) {
	switch (p_reason) {
		case NHCORE_END_EXIT:
			return "exit";
		case NHCORE_END_ABORT:
			return "abort";
		case NHCORE_END_STOPPED:
			return "stopped";
		default:
			return "returned";
	}
}

} // namespace

NetHackCore::NetHackCore() {
	set_process(true);
}

NetHackCore::~NetHackCore() {
	stop();
}

void NetHackCore::_bind_methods() {
	ClassDB::bind_method(D_METHOD("start", "args", "env"), &NetHackCore::start);
	ClassDB::bind_method(D_METHOD("send_line", "line"), &NetHackCore::send_line);
	ClassDB::bind_method(D_METHOD("stop"), &NetHackCore::stop);
	ClassDB::bind_method(D_METHOD("is_running"), &NetHackCore::is_running);
	ClassDB::bind_method(D_METHOD("set_library_path", "path"), &NetHackCore::set_library_path);
	ClassDB::bind_method(D_METHOD("get_library_path"), &NetHackCore::get_library_path);
	ADD_PROPERTY(PropertyInfo(Variant::STRING, "library_path"), "set_library_path", "get_library_path");

	ADD_SIGNAL(MethodInfo("event_received", PropertyInfo(Variant::DICTIONARY, "event")));
	ADD_SIGNAL(MethodInfo("game_ended", PropertyInfo(Variant::DICTIONARY, "result")));
	// After each frame's batch of events: the game state is consistent here.
	ADD_SIGNAL(MethodInfo("events_drained"));
}

void NetHackCore::_notification(int p_what) {
	if (p_what == NOTIFICATION_PREDELETE) {
		stop();
		// A game that never stopped (stuck outside any input wait) is left
		// behind rather than freezing Godot on exit.
		if (game_thread.joinable()) {
			game_thread.detach();
		}
	}
}

void NetHackCore::set_library_path(const String &p_path) {
	library_path = p_path;
}

String NetHackCore::get_library_path() const {
	return library_path;
}

String NetHackCore::default_library_path() const {
	// The core library ships next to this extension library.
	Dl_info info;
	if (dladdr(reinterpret_cast<void *>(&end_reason_name), &info) && info.dli_fname) {
		String self = String::utf8(info.dli_fname);
		return self.get_base_dir().path_join(CORE_LIBRARY_NAME);
	}
	return CORE_LIBRARY_NAME;
}

bool NetHackCore::is_running() const {
	return running.load();
}

Error NetHackCore::start(const PackedStringArray &p_args, const Dictionary &p_env) {
	if (running.load()) {
		return ERR_ALREADY_IN_USE;
	}
	join_game_thread();
	// Deliver a finished game's game_ended before starting the next one.
	drain();
	bool expected = false;
	if (!core_in_use.compare_exchange_strong(expected, true)) {
		return ERR_ALREADY_IN_USE;
	}

	clear_per_game_env();
	restore_cwd.clear();
	Array keys = p_env.keys();
	for (int i = 0; i < keys.size(); ++i) {
		String key = keys[i];
		String value = p_env[keys[i]];
		if (key == "NH_GODOT_WORKDIR") {
			// Not an environment variable: the directory the game starts in
			// (NetHack chdirs into its playground, so it is never inherited).
			// Restored when the game ends.
			char here[PATH_MAX];
			if (::getcwd(here, sizeof here)) {
				restore_cwd = here;
			}
			if (!value.is_empty() && ::chdir(value.utf8().get_data()) != 0) {
				core_in_use.store(false);
				return ERR_FILE_BAD_PATH;
			}
			continue;
		}
		if (value.is_empty()) {
			::unsetenv(key.utf8().get_data());
		} else {
			::setenv(key.utf8().get_data(), value.utf8().get_data(), 1);
		}
	}

	std::vector<std::string> args;
	args.emplace_back("nethack-godot");
	for (int i = 0; i < p_args.size(); ++i) {
		args.emplace_back(p_args[i].utf8().get_data());
	}

	{
		std::lock_guard<std::mutex> lock(queue_mutex);
		pending_lines.clear();
		end_pending = false;
		end_info = GameEnd();
	}
	stop_requested.store(false);
	running.store(true);
	game_thread = std::thread(&NetHackCore::game_thread_main, this, std::move(args));
	return OK;
}

bool NetHackCore::send_line(const String &p_line) {
	CharString utf8 = p_line.utf8();
	std::lock_guard<std::mutex> lock(input_mutex);
	if (input_fd < 0) {
		return false;
	}
	bool ok = write_all(input_fd, utf8.get_data(), static_cast<size_t>(utf8.length()));
	if (ok && (utf8.length() == 0 || utf8.get_data()[utf8.length() - 1] != '\n')) {
		ok = write_all(input_fd, "\n", 1);
	}
	return ok;
}

void NetHackCore::stop() {
	// Paired with the check after stop_fn is published in game_thread_main, so
	// a stop racing a starting game is never lost.
	stop_requested.store(true);
	{
		// Held across the call so the game thread cannot unload the library
		// between loading the pointer and calling it.
		std::lock_guard<std::mutex> lock(stop_mutex);
		if (stop_fn) {
			stop_fn();
		}
	}
	// NetHack notices the stop at its next input wait. One that never gets
	// there (an engine loop) must not freeze Godot: give up after a while.
	const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(STOP_TIMEOUT_SECONDS);
	while (running.load() && std::chrono::steady_clock::now() < deadline) {
		std::this_thread::sleep_for(std::chrono::milliseconds(10));
	}
	if (running.load()) {
		UtilityFunctions::push_error("NetHack did not stop within ", STOP_TIMEOUT_SECONDS, " s; leaving its thread running");
		return;
	}
	join_game_thread();
}

void NetHackCore::join_game_thread() {
	if (game_thread.joinable()) {
		game_thread.join();
	}
}

void NetHackCore::push_line(std::string p_line) {
	std::lock_guard<std::mutex> lock(queue_mutex);
	pending_lines.push_back(std::move(p_line));
}

void NetHackCore::reader_thread_main(int p_fd) {
	std::string partial;
	char buffer[65536];
	for (;;) {
		ssize_t got = ::read(p_fd, buffer, sizeof buffer);
		if (got < 0 && errno == EINTR) {
			continue;
		}
		if (got <= 0) {
			break;
		}
		partial.append(buffer, static_cast<size_t>(got));
		size_t start = 0;
		for (size_t newline = partial.find('\n'); newline != std::string::npos; newline = partial.find('\n', start)) {
			if (newline > start) {
				push_line(partial.substr(start, newline - start));
			}
			start = newline + 1;
		}
		partial.erase(0, start);
	}
	if (!partial.empty()) {
		push_line(partial);
	}
	::close(p_fd);
}

void NetHackCore::game_thread_main(std::vector<std::string> p_args) {
	GameEnd result;
	std::string path = (library_path.is_empty() ? default_library_path() : library_path).utf8().get_data();

	// NetHack globals only reset when the library is genuinely reloaded.
	if (void *stale = dlopen(path.c_str(), RTLD_NOW | RTLD_NOLOAD)) {
		dlclose(stale);
		result.error = "previous NetHack core is still loaded";
	}

	void *handle = result.error.empty() ? dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL) : nullptr;
	nhcore_run_fn run = nullptr;
	nhcore_finish_fn finish = nullptr;
	if (handle) {
		run = reinterpret_cast<nhcore_run_fn>(dlsym(handle, "nhcore_run"));
		finish = reinterpret_cast<nhcore_finish_fn>(dlsym(handle, "nhcore_finish"));
		std::lock_guard<std::mutex> lock(stop_mutex);
		stop_fn = reinterpret_cast<nhcore_request_stop_fn>(dlsym(handle, "nhcore_request_stop"));
		if (!run || !finish || !stop_fn) {
			result.error = "NetHack core is missing nhcore_* entry points";
		} else if (stop_requested.load()) {
			stop_fn();
		}
	} else if (result.error.empty()) {
		const char *why = dlerror();
		result.error = std::string("cannot load NetHack core: ") + (why ? why : path);
	}

	int input_pipe[2] = { -1, -1 };
	int output_pipe[2] = { -1, -1 };
	if (result.error.empty() && (pipe2(input_pipe, O_CLOEXEC) != 0 || pipe2(output_pipe, O_CLOEXEC) != 0)) {
		result.error = std::string("cannot create pipes: ") + std::strerror(errno);
	}

	if (result.error.empty()) {
		{
			std::lock_guard<std::mutex> lock(input_mutex);
			input_fd = input_pipe[1];
		}
		std::thread reader(&NetHackCore::reader_thread_main, this, output_pipe[0]);

		std::vector<char *> argv;
		for (std::string &arg : p_args) {
			argv.push_back(arg.data());
		}
		argv.push_back(nullptr);
		result.code = run(static_cast<int>(p_args.size()), argv.data(), input_pipe[0], output_pipe[1], &result.reason);

		{
			std::lock_guard<std::mutex> lock(input_mutex);
			::close(input_pipe[1]);
			input_fd = -1;
		}
		finish(); // joins the bridge input thread and closes the core's pipe ends
		reader.join();
	} else {
		for (int fd : { input_pipe[0], input_pipe[1], output_pipe[0], output_pipe[1] }) {
			if (fd >= 0) {
				::close(fd);
			}
		}
	}

	if (handle) {
		std::lock_guard<std::mutex> lock(stop_mutex);
		stop_fn = nullptr;
		dlclose(handle);
		void *still_loaded = dlopen(path.c_str(), RTLD_NOW | RTLD_NOLOAD);
		result.unloaded = still_loaded == nullptr;
		if (still_loaded) {
			dlclose(still_loaded);
		}
	}

	{
		std::lock_guard<std::mutex> lock(queue_mutex);
		end_info = result;
		end_pending = true;
	}
	if (!restore_cwd.empty() && ::chdir(restore_cwd.c_str()) != 0) {
		result.error = "cannot restore the working directory";
	}
	core_in_use.store(false);
	running.store(false);
}

void NetHackCore::drain() {
	std::deque<std::string> lines;
	bool ended = false;
	GameEnd ended_info;
	{
		std::lock_guard<std::mutex> lock(queue_mutex);
		lines.swap(pending_lines);
		if (end_pending) {
			ended = true;
			ended_info = end_info;
			end_pending = false;
		}
	}

	for (const std::string &line : lines) {
		Variant parsed = JSON::parse_string(String::utf8(line.c_str(), static_cast<int64_t>(line.size())));
		if (parsed.get_type() == Variant::DICTIONARY) {
			emit_signal("event_received", parsed);
		} else {
			Dictionary raw;
			raw["type"] = "unparsed";
			raw["line"] = String::utf8(line.c_str(), static_cast<int64_t>(line.size()));
			emit_signal("event_received", raw);
		}
	}

	if (!lines.empty()) {
		emit_signal("events_drained");
	}

	if (ended) {
		join_game_thread();
		Dictionary result;
		result["code"] = ended_info.code;
		result["reason"] = end_reason_name(ended_info.reason);
		result["unloaded"] = ended_info.unloaded;
		result["error"] = String::utf8(ended_info.error.c_str());
		emit_signal("game_ended", result);
	}
}

void NetHackCore::_process(double p_delta) {
	(void)p_delta;
	drain();
}

} // namespace godot

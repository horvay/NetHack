#pragma once

#include <godot_cpp/classes/node.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_string_array.hpp>
#include <godot_cpp/variant/string.hpp>

#include <atomic>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "nhcore.h"

namespace godot {

// Runs one NetHack game at a time in process.  Each game loads a fresh copy of
// libnethack_core.so on its own thread; bridge events arrive as the
// event_received signal (drained every frame) and the game_ended signal fires
// once the library has been unloaded.
class NetHackCore : public Node {
	GDCLASS(NetHackCore, Node)

public:
	NetHackCore();
	~NetHackCore() override;

	Error start(const PackedStringArray &p_args, const Dictionary &p_env);
	bool send_line(const String &p_line);
	void stop();
	bool is_running() const;

	void set_library_path(const String &p_path);
	String get_library_path() const;

	void _process(double p_delta) override;

protected:
	static void _bind_methods();
	void _notification(int p_what);

private:
	struct GameEnd {
		int code = 0;
		int reason = 0;
		bool unloaded = false;
		std::string error;
	};

	void game_thread_main(std::vector<std::string> p_args);
	void reader_thread_main(int p_fd);
	void push_line(std::string p_line);
	void drain();
	void join_game_thread();
	String default_library_path() const;

	String library_path;
	// The directory to return to after a game started elsewhere (fixtures).
	std::string restore_cwd;
	std::thread game_thread;

	std::mutex queue_mutex;
	std::deque<std::string> pending_lines;
	bool end_pending = false;
	GameEnd end_info;

	std::mutex input_mutex;
	int input_fd = -1;

	std::atomic<bool> running{ false };
	std::atomic<bool> stop_requested{ false };
	std::mutex stop_mutex;
	nhcore_request_stop_fn stop_fn = nullptr;
};

} // namespace godot

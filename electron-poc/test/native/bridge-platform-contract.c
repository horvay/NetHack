#include "bridge-platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition, message) do { \
    if (!(condition)) { \
        fprintf(stderr, "platform contract failed: %s\n", message); \
        return 1; \
    } \
} while (0)

typedef struct handshake {
    bridge_mutex mutex;
    bridge_condition condition;
    int ready;
    int value;
} handshake;

static void publish_value(void *opaque) {
    handshake *state = opaque;
    bridge_mutex_lock(&state->mutex);
    state->value = 42;
    state->ready = 1;
    bridge_condition_signal(&state->condition);
    bridge_mutex_unlock(&state->mutex);
}

static int all_zero(const unsigned char *bytes, size_t length) {
    for (size_t index = 0; index < length; ++index)
        if (bytes[index] != 0) return 0;
    return 1;
}

int main(void) {
    handshake state = {0};
    bridge_thread worker = {0};
    unsigned char random_a[32] = {0};
    unsigned char random_b[32] = {0};
    char cwd[4096] = {0};
    char environment_value[32] = {0};
    size_t environment_size = sizeof environment_value;
    size_t cwd_size = sizeof cwd;

    CHECK(bridge_mutex_init(&state.mutex) == 0, "mutex initialization");
    CHECK(bridge_condition_init(&state.condition) == 0, "condition initialization");
    CHECK(bridge_thread_start(&worker, publish_value, &state) == 0, "thread start");

    bridge_mutex_lock(&state.mutex);
    while (!state.ready) {
        int wait_result = bridge_condition_timedwait(&state.condition, &state.mutex, 5000000000ULL);
        CHECK(wait_result == 0, "condition handshake before timeout");
    }
    CHECK(state.value == 42, "mutex-protected value publication");
    bridge_mutex_unlock(&state.mutex);
    CHECK(bridge_thread_join(&worker) == 0, "thread join");

    CHECK(bridge_random(random_a, sizeof random_a) == 0, "first secure random read");
    CHECK(bridge_random(random_b, sizeof random_b) == 0, "second secure random read");
    CHECK(!all_zero(random_a, sizeof random_a), "first random buffer is nonzero");
    CHECK(!all_zero(random_b, sizeof random_b), "second random buffer is nonzero");
    CHECK(memcmp(random_a, random_b, sizeof random_a) != 0, "independent random reads differ");

    CHECK(bridge_process_id() > 0, "positive process id");
    CHECK(bridge_environment_set("NH_BRIDGE_PLATFORM_CONTRACT", "libuv") == 0, "environment update");
    CHECK(bridge_environment_get("NH_BRIDGE_PLATFORM_CONTRACT", environment_value, &environment_size) == 0,
          "environment value is observable");
    CHECK(strcmp(environment_value, "libuv") == 0, "environment value is exact");
    CHECK(getenv("NH_BRIDGE_PLATFORM_CONTRACT") != NULL, "environment value reaches C runtime");
    CHECK(strcmp(getenv("NH_BRIDGE_PLATFORM_CONTRACT"), "libuv") == 0,
          "C runtime environment value is exact");
    CHECK(bridge_working_directory(cwd, &cwd_size) == 0, "working directory read");
    CHECK(cwd[0] != '\0', "working directory is nonempty");
    CHECK(bridge_change_directory(cwd) == 0, "working directory change");

    bridge_condition_destroy(&state.condition);
    bridge_mutex_destroy(&state.mutex);
    puts("bridge platform contract: PASS");
    return 0;
}

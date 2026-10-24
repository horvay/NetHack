#ifndef NH_BRIDGE_PLATFORM_H
#define NH_BRIDGE_PLATFORM_H

#include <stddef.h>
#include <stdint.h>
#include <uv.h>

typedef struct bridge_mutex {
    uv_mutex_t native;
} bridge_mutex;

typedef struct bridge_condition {
    uv_cond_t native;
} bridge_condition;

typedef struct bridge_thread {
    uv_thread_t native;
} bridge_thread;

typedef void (*bridge_thread_fn)(void *context);

int bridge_mutex_init(bridge_mutex *mutex);
void bridge_mutex_destroy(bridge_mutex *mutex);
void bridge_mutex_lock(bridge_mutex *mutex);
void bridge_mutex_unlock(bridge_mutex *mutex);

int bridge_condition_init(bridge_condition *condition);
void bridge_condition_destroy(bridge_condition *condition);
void bridge_condition_signal(bridge_condition *condition);
void bridge_condition_wait(bridge_condition *condition, bridge_mutex *mutex);
int bridge_condition_timedwait(bridge_condition *condition, bridge_mutex *mutex, uint64_t timeout_ns);

int bridge_thread_start(bridge_thread *thread, bridge_thread_fn fn, void *context);
int bridge_thread_join(bridge_thread *thread);
int bridge_thread_detach(bridge_thread *thread);

int bridge_random(void *destination, size_t length);
int bridge_environment_get(const char *name, char *buffer, size_t *size);
long bridge_process_id(void);
int bridge_environment_set(const char *name, const char *value);
int bridge_working_directory(char *buffer, size_t *size);
int bridge_change_directory(const char *path);
const char *bridge_platform_error(int error_code);

#endif

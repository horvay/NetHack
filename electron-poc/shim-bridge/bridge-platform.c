#include "bridge-platform.h"

int bridge_mutex_init(bridge_mutex *mutex) {
    return uv_mutex_init(&mutex->native);
}

void bridge_mutex_destroy(bridge_mutex *mutex) {
    uv_mutex_destroy(&mutex->native);
}

void bridge_mutex_lock(bridge_mutex *mutex) {
    uv_mutex_lock(&mutex->native);
}

void bridge_mutex_unlock(bridge_mutex *mutex) {
    uv_mutex_unlock(&mutex->native);
}

int bridge_condition_init(bridge_condition *condition) {
    return uv_cond_init(&condition->native);
}

void bridge_condition_destroy(bridge_condition *condition) {
    uv_cond_destroy(&condition->native);
}

void bridge_condition_signal(bridge_condition *condition) {
    uv_cond_signal(&condition->native);
}

void bridge_condition_wait(bridge_condition *condition, bridge_mutex *mutex) {
    uv_cond_wait(&condition->native, &mutex->native);
}

int bridge_condition_timedwait(bridge_condition *condition, bridge_mutex *mutex, uint64_t timeout_ns) {
    return uv_cond_timedwait(&condition->native, &mutex->native, timeout_ns);
}

int bridge_thread_start(bridge_thread *thread, bridge_thread_fn fn, void *context) {
    return uv_thread_create(&thread->native, fn, context);
}

int bridge_thread_join(bridge_thread *thread) {
    return uv_thread_join(&thread->native);
}

int bridge_thread_detach(bridge_thread *thread) {
    return uv_thread_detach(&thread->native);
}

int bridge_random(void *destination, size_t length) {
    return uv_random(NULL, NULL, destination, length, 0, NULL);
}

long bridge_process_id(void) {
    return (long) uv_os_getpid();
}

int bridge_environment_set(const char *name, const char *value) {
    return uv_os_setenv(name, value);
}

int bridge_working_directory(char *buffer, size_t *size) {
    return uv_cwd(buffer, size);
}

int bridge_change_directory(const char *path) {
    return uv_chdir(path);
}

const char *bridge_platform_error(int error_code) {
    return uv_strerror(error_code);
}

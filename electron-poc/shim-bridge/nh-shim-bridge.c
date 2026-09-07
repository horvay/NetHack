/* Minimal NetHack libnh/winshim bridge POC for Electron.
 * Talks newline-delimited JSON over stdin/stdout.  This is intentionally
 * narrow: enough to prove shim callbacks can surface NetHack UI/state events
 * and accept commands without a terminal/PTY wrapper.
 */
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <ctype.h>
#include "bridge-platform.h"
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <stdint.h>
#include <errno.h>
#include <time.h>

/* Pull in NetHack's real glyph/status/extended-command ABI definitions for
 * safe semantic decoding.  This bridge still only emits compact JSON; it no
 * longer relies on local struct guesses for glyph_info or condition masks. */
#include "hack.h"
#include "func_tab.h"
#include "objclass.h"

#define BL_CONDITION 22

void chdirx(const char *dir, boolean wr) {
    (void)dir;
    (void)wr;
}

int extcmd_via_menu(void) {
    return -1;
}

extern int nhmain(int argc, char **argv);
extern int doshimgroundtransfer(void);
extern int doshimcontainertransfer(void);
extern int doshimcontainersnapshot(void);
extern int doshimterrainaction(void);
extern int doshimequipmentchange(void);
extern void ground_transfer_set_request(unsigned int, const char *, int, int, const char *);
extern boolean ground_transfer_result_available(void);
extern void ground_transfer_take_result(boolean *, unsigned int *, int *, int *, char *, size_t, char *, size_t, char *, size_t);
extern void container_transfer_set_request(unsigned int, unsigned int, const char *, const char *);
extern boolean container_transfer_result_available(void);
extern void container_transfer_take_result(boolean *, unsigned int *, unsigned int *, char *, size_t, char *, size_t, char *, size_t);
extern void container_snapshot_set_request(unsigned int, const char *);
extern boolean container_snapshot_result_available(void);
extern void container_snapshot_take_result(boolean *, unsigned int *, char *, size_t, char *, size_t);
extern void terrain_action_set_request(const char *, coordxy, coordxy, const char *, unsigned int, const char *);
extern boolean terrain_action_result_available(void);
extern void terrain_action_take_result(boolean *, char *, size_t, coordxy *, coordxy *, char *, size_t, unsigned int *, char *, size_t, char *, size_t);
extern void equipment_change_set_request(unsigned int, const char *, const char *, const char *, const char *);
extern boolean equipment_change_result_available(void);
extern void equipment_change_take_result(boolean *, unsigned int *, char *, size_t, char *, size_t, char *, size_t, char *, size_t, char *, size_t);
typedef void (*shim_callback_t)(const char *name, void *ret_ptr, const char *fmt, ...);
extern void shim_graphics_set_callback(shim_callback_t cb);

static bridge_mutex out_mu;
static bridge_mutex in_mu;
static bridge_condition in_cv;

static int init_bridge_runtime(void) {
    int rc = bridge_mutex_init(&out_mu);
    if (rc) return rc;
    rc = bridge_mutex_init(&in_mu);
    if (rc) {
        bridge_mutex_destroy(&out_mu);
        return rc;
    }
    rc = bridge_condition_init(&in_cv);
    if (rc) {
        bridge_mutex_destroy(&in_mu);
        bridge_mutex_destroy(&out_mu);
    }
    return rc;
}
static int pending_keys[1024];
static int pending_head = 0, pending_tail = 0;
static int next_winid = 1;
static unsigned long inventory_revision = 0;
static unsigned long equipment_revision = 0;
static unsigned long ground_pile_revision = 0;
static unsigned long container_contents_revision = 0;
static unsigned long interaction_revision = 0;
static unsigned long command_transaction_revision = 0;
static unsigned long ui_protocol_sequence = 0;
static unsigned long spell_rows_revision = 0;
static unsigned long skill_rows_revision = 0;
static char active_transaction_id[96] = "";
static char active_prompt_request_id[96] = "";
static char active_prompt_transaction_id[96] = "";
static char active_prompt_purpose[64] = "";
static unsigned long active_prompt_revision = 0;

static void clear_active_transaction(void) {
    active_transaction_id[0] = '\0';
}

typedef struct bridge_native_menu_context {
    char purpose[64];
    char owner_kind[32];
    char callsite[96];
    char reason[32];
    int how;
    int final_flow;
    int disclosure_flow;
    int pending;
} bridge_native_menu_context;

static bridge_native_menu_context pending_native_menu_context;

typedef struct bridge_public_spell_row {
    char name[128];
    char status[64];
    int selector;
    int level;
    int pw_cost;
    int failure;
} bridge_public_spell_row;

typedef struct bridge_public_skill_row {
    char name[128];
    char current_rank[32];
    char next_rank[32];
    int identifier;
    int next_cost;
    int can_advance;
} bridge_public_skill_row;

#define MAX_BRIDGE_MAGIC_ROWS 64
static bridge_public_spell_row pending_spell_rows[MAX_BRIDGE_MAGIC_ROWS];
static bridge_public_skill_row pending_skill_rows[MAX_BRIDGE_MAGIC_ROWS];
static int pending_spell_row_count = 0;
static int pending_skill_row_count = 0;
static int pending_spell_rows_window = -1;
static int pending_skill_rows_window = -1;

/* Small ABI-compatible copies of NetHack's anything/menu_item structs.  We do
 * not include hack.h here because this bridge intentionally stays narrow, but
 * select_menu must be able to return the opaque identifiers received via
 * add_menu so item-letter selections (inventory/drop/apply/etc.) can proceed. */
typedef union bridge_anything {
    void *a_void;
    int a_int;
    char a_char;
    unsigned int a_uint;
    long a_long;
    unsigned long a_ulong;
    const char *a_string;
    long long a_int64;
    unsigned long long a_uint64;
} bridge_anything;

typedef struct bridge_menu_item {
    bridge_anything item;
    long count;
    unsigned itemflags;
} bridge_menu_item;

typedef struct bridge_menu_entry {
    int window;
    int selector;
    unsigned itemflags;
    bridge_anything identifier;
    char text[256];
} bridge_menu_entry;

#define MAX_BRIDGE_MENU_ITEMS 512
static bridge_menu_entry menu_entries[MAX_BRIDGE_MENU_ITEMS];
static int menu_entry_count = 0;

typedef struct bridge_menu_lifecycle {
    int window;
    unsigned long revision;
    char request_id[96];
    char transaction_id[96];
    char menu_id[96];
    char purpose[64];
    char owner_kind[32];
    char native_callsite[96];
    char native_reason[32];
    int native_how;
    int final_flow;
    int disclosure_flow;
    int awaiting_selection;
} bridge_menu_lifecycle;

typedef struct bridge_gui_action_metadata {
    char action_id[96];
    char action_label[160];
    char target_selector[8];
    char target_text[256];
    char followup_plan[160];
    char transaction_id[96];
    char expected_request_id[96];
    int command_position;
    int command_length;
} bridge_gui_action_metadata;

typedef enum bridge_direct_command_family {
    BRIDGE_DIRECT_COMMAND_NONE = 0,
    BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER,
    BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER,
    BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT,
    BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE,
    BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION
} bridge_direct_command_family;

typedef struct bridge_direct_command_arbitration {
    bridge_direct_command_family active_family;
    int queued;
    char command_id[128];
    char transaction_id[128];
} bridge_direct_command_arbitration;

typedef struct bridge_ground_transfer_request {
    unsigned int item_id;
    int x;
    int y;
    char direction[64];
    char transfer_id[128];
} bridge_ground_transfer_request;

typedef struct bridge_container_transfer_request {
    unsigned int container_id;
    unsigned int item_id;
    char direction[64];
    char transfer_id[128];
    char session_id[128];
} bridge_container_transfer_request;

typedef struct bridge_container_snapshot_request {
    unsigned int container_id;
    char session_id[128];
} bridge_container_snapshot_request;

typedef struct bridge_equipment_change_request {
    unsigned int item_id;
    char action[32];
    char slot_id[32];
    char hand[16];
} bridge_equipment_change_request;

typedef struct bridge_terrain_action_request {
    char action[32];
    unsigned int x;
    unsigned int y;
    char terrain[32];
    unsigned int item_id;
} bridge_terrain_action_request;

static bridge_direct_command_arbitration direct_command_arbitration;
static bridge_mutex direct_command_mu;
static bridge_ground_transfer_request active_ground_transfer;
static bridge_container_transfer_request active_container_transfer;
static bridge_container_snapshot_request active_container_snapshot;
static bridge_equipment_change_request active_equipment_change;
static bridge_terrain_action_request active_terrain_action;

#define MAX_BRIDGE_MENU_LIFECYCLES 64
static bridge_menu_lifecycle menu_lifecycles[MAX_BRIDGE_MENU_LIFECYCLES];
static int menu_lifecycle_count = 0;

static void json_escape(FILE *f, const char *s);
static void emit_lifecycle_metadata(const char *request_id, const char *transaction_id, unsigned long revision, const char *lifecycle, const char *source_command, int window, const char *owner_kind);
static const char *purpose_owner_kind(const char *purpose);
static int extract_json_string_field(const char *line, const char *field, char *out, size_t outsz);
static int extract_json_int_field(const char *line, const char *field, int fallback);
static unsigned int extract_json_uint_field(const char *line, const char *field, unsigned int fallback);
static void clear_prompt_lifecycle(void);
static void handle_ground_transfer_line(const char *line);
static void handle_container_transfer_line(const char *line);
static void handle_container_snapshot_line(const char *line);
static void handle_equipment_change_line(const char *line);
static void handle_terrain_action_line(const char *line);
static void queue_active_direct_command(void);
static void maybe_emit_ground_transfer_result(void);
static void maybe_emit_container_transfer_result(void);
static void maybe_emit_container_snapshot_result(void);
static void maybe_emit_equipment_change_result(void);
static void maybe_emit_terrain_action_result(void);
static void emit_live_inventory_event(int reason);
static void emit_ground_pile_snapshot_event(int window, int x, int y);
static void emit_container_contents_snapshot_for(struct obj *container, const char *session_id, const char *transaction_id);
static struct obj *floor_container_by_public_id(unsigned int container_id);
static void push_key_with_metadata(int ch, const bridge_gui_action_metadata *meta);
static int request_id_is_active_prompt_or_menu(const char *request_id);
static bridge_menu_lifecycle *first_active_menu_lifecycle(void);
static int pending_queue_length(void);
static unsigned char ground_pile_snapshot_known[COLNO][ROWNO];

static void clear_menu_window(int window) {
    int out = 0;
    for (int i = 0; i < menu_entry_count; ++i) {
        if (menu_entries[i].window != window) menu_entries[out++] = menu_entries[i];
    }
    menu_entry_count = out;
}

static bridge_menu_lifecycle *find_menu_lifecycle(int window) {
    for (int i = 0; i < menu_lifecycle_count; ++i) {
        if (menu_lifecycles[i].window == window) return &menu_lifecycles[i];
    }
    return NULL;
}

static bridge_menu_lifecycle *begin_menu_lifecycle(int window) {
    bridge_menu_lifecycle *ctx = find_menu_lifecycle(window);
    if (!ctx) {
        if (menu_lifecycle_count >= MAX_BRIDGE_MENU_LIFECYCLES) menu_lifecycle_count = 0;
        ctx = &menu_lifecycles[menu_lifecycle_count++];
    }
    memset(ctx, 0, sizeof *ctx);
    ctx->native_how = -1;
    ctx->window = window;
    ctx->revision = ++interaction_revision;
    snprintf(ctx->request_id, sizeof ctx->request_id, "shim-menu-%d-r%lu", window, ctx->revision);
    snprintf(ctx->menu_id, sizeof ctx->menu_id, "%s", ctx->request_id);
    snprintf(ctx->transaction_id, sizeof ctx->transaction_id, "%s", active_transaction_id[0] ? active_transaction_id : ctx->request_id);
    if (pending_native_menu_context.pending && pending_native_menu_context.purpose[0]) {
        snprintf(ctx->purpose, sizeof ctx->purpose, "%s", pending_native_menu_context.purpose);
        snprintf(ctx->owner_kind, sizeof ctx->owner_kind, "%s", pending_native_menu_context.owner_kind[0] ? pending_native_menu_context.owner_kind : purpose_owner_kind(ctx->purpose));
        snprintf(ctx->native_callsite, sizeof ctx->native_callsite, "%s", pending_native_menu_context.callsite);
        snprintf(ctx->native_reason, sizeof ctx->native_reason, "%s", pending_native_menu_context.reason);
        ctx->native_how = pending_native_menu_context.how;
        ctx->final_flow = pending_native_menu_context.final_flow;
        ctx->disclosure_flow = pending_native_menu_context.disclosure_flow;
        memset(&pending_native_menu_context, 0, sizeof pending_native_menu_context);
        pending_native_menu_context.how = -1;
    } else {
        snprintf(ctx->purpose, sizeof ctx->purpose, "%s", "menu.generic");
        snprintf(ctx->owner_kind, sizeof ctx->owner_kind, "%s", "unknown");
    }
    return ctx;
}

static void end_menu_lifecycle(int window) {
    int out = 0;
    for (int i = 0; i < menu_lifecycle_count; ++i) {
        if (menu_lifecycles[i].window != window) menu_lifecycles[out++] = menu_lifecycles[i];
    }
    menu_lifecycle_count = out;
}

static void emit_menu_lifecycle_metadata(const bridge_menu_lifecycle *ctx, const char *lifecycle) {
    if (!ctx) return;
    fputs(",\"menuId\":\"", stdout); json_escape(stdout, ctx->menu_id); fputs("\"", stdout);
    fputs(",\"menuRequestId\":\"", stdout); json_escape(stdout, ctx->request_id); fputs("\"", stdout);
    emit_lifecycle_metadata(ctx->request_id, ctx->transaction_id, ctx->revision, lifecycle, NULL, ctx->window, ctx->owner_kind);
    fputs(",\"menuPurpose\":\"", stdout); json_escape(stdout, ctx->purpose); fputs("\"", stdout);
    if (ctx->native_callsite[0]) { fputs(",\"nativeMenuCallsite\":\"", stdout); json_escape(stdout, ctx->native_callsite); fputs("\"", stdout); }
    if (ctx->native_reason[0]) { fputs(",\"nativeEndReason\":\"", stdout); json_escape(stdout, ctx->native_reason); fputs("\"", stdout); }
    if (ctx->native_how >= 0) fprintf(stdout, ",\"nativeEndHow\":%d", ctx->native_how);
    if (ctx->final_flow) fputs(",\"finalFlow\":true", stdout);
    if (ctx->disclosure_flow) fputs(",\"disclosureFlow\":true", stdout);
}

static void begin_prompt_lifecycle(const char *purpose) {
    active_prompt_revision = ++interaction_revision;
    snprintf(active_prompt_request_id, sizeof active_prompt_request_id, "shim-prompt-r%lu", active_prompt_revision);
    snprintf(active_prompt_transaction_id, sizeof active_prompt_transaction_id, "%s", active_transaction_id[0] ? active_transaction_id : active_prompt_request_id);
    snprintf(active_prompt_purpose, sizeof active_prompt_purpose, "%s", purpose && *purpose ? purpose : "prompt.generic");
}

static void emit_prompt_lifecycle_metadata(const char *purpose, const char *lifecycle) {
    const char *owner = purpose_owner_kind(purpose);
    emit_lifecycle_metadata(active_prompt_request_id, active_prompt_transaction_id, active_prompt_revision, lifecycle, NULL, -1, owner);
    fputs(",\"promptId\":\"", stdout); json_escape(stdout, active_prompt_request_id); fputs("\"", stdout);
    fputs(",\"promptPurpose\":\"", stdout); json_escape(stdout, purpose && *purpose ? purpose : "prompt.generic"); fputs("\"", stdout);
}

static int bridge_identifier_is_zero(const bridge_anything *identifier) {
    static const bridge_anything zero;
    return !identifier || memcmp(identifier, &zero, sizeof zero) == 0;
}

static int generated_selector_for_window(int window) {
    int count = 0;
    for (int i = 0; i < menu_entry_count; ++i) {
        if (menu_entries[i].window == window && menu_entries[i].selector) count++;
    }
    if (count < 26) return 'a' + count;
    if (count < 52) return 'A' + (count - 26);
    return 0;
}

static bridge_menu_entry *find_menu_selector(int window, int selector) {
    for (int i = 0; i < menu_entry_count; ++i) {
        if (menu_entries[i].window == window && menu_entries[i].selector == selector) return &menu_entries[i];
    }
    return NULL;
}

static int selector_for_menu_identifier(int window, int identifier) {
    if (!identifier) return 0;
    for (int i = 0; i < menu_entry_count; ++i) {
        if (menu_entries[i].window == window
            && menu_entries[i].identifier.a_int == identifier)
            return menu_entries[i].selector;
    }
    return 0;
}

static void clear_prompt_lifecycle(void) {
    active_prompt_request_id[0] = '\0';
    active_prompt_transaction_id[0] = '\0';
    active_prompt_purpose[0] = '\0';
    active_prompt_revision = 0;
}

static int request_id_is_active_prompt_or_menu(const char *request_id) {
    if (!request_id || !*request_id) return 0;
    if (active_prompt_request_id[0] && !strcmp(request_id, active_prompt_request_id)) return 1;
    for (int i = 0; i < menu_lifecycle_count; ++i) {
        if (menu_lifecycles[i].awaiting_selection && menu_lifecycles[i].request_id[0] && !strcmp(request_id, menu_lifecycles[i].request_id)) return 1;
    }
    return 0;
}

static bridge_menu_lifecycle *first_active_menu_lifecycle(void) {
    for (int i = menu_lifecycle_count - 1; i >= 0; --i) {
        if (menu_lifecycles[i].awaiting_selection) return &menu_lifecycles[i];
    }
    return NULL;
}

static int active_prompt_or_menu_owns_input(void) {
    /* NetHack's normal top-level command loop uses nh_poskey too.  That idle
     * input waiter is not a follow-up prompt and must not block a new native
     * semantic command.  Real follow-up prompts (direction, menu, line, etc.)
     * still own input until answered. */
    if (active_prompt_request_id[0] && strcmp(active_prompt_purpose, "prompt.command")) return 1;
    return first_active_menu_lifecycle() != NULL;
}

static void active_prompt_or_menu_reason(char *out, size_t outsz) {
    if (!out || !outsz) return;
    if (active_prompt_request_id[0] && strcmp(active_prompt_purpose, "prompt.command")) {
        snprintf(out, outsz, "active prompt/menu owner blocks ui-command (%s)", active_prompt_request_id);
        return;
    }
    bridge_menu_lifecycle *menu = first_active_menu_lifecycle();
    if (menu && menu->request_id[0]) {
        snprintf(out, outsz, "active prompt/menu owner blocks ui-command (%s)", menu->request_id);
        return;
    }
    snprintf(out, outsz, "%s", "active prompt/menu owner blocks ui-command");
}

static int pending_queue_length(void) {
    int queued;
    bridge_mutex_lock(&in_mu);
    queued = (pending_tail - pending_head + 1024) % 1024;
    bridge_mutex_unlock(&in_mu);
    return queued;
}

static const char *direct_command_family_label(bridge_direct_command_family family) {
    switch (family) {
    case BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER: return "ground transfer";
    case BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER: return "container transfer";
    case BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT: return "container snapshot";
    case BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE: return "equipment change";
    case BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION: return "terrain action";
    case BRIDGE_DIRECT_COMMAND_NONE: break;
    }
    return "direct command";
}

static int direct_command_is_active(bridge_direct_command_family family) {
    return family != BRIDGE_DIRECT_COMMAND_NONE
        && direct_command_arbitration.active_family == family;
}

static int direct_command_is_idle(void) {
    int idle;
    bridge_mutex_lock(&direct_command_mu);
    idle = direct_command_arbitration.active_family == BRIDGE_DIRECT_COMMAND_NONE;
    bridge_mutex_unlock(&direct_command_mu);
    return idle;
}

static int begin_direct_command(bridge_direct_command_family family,
                                const char *command_id,
                                const char *transaction_id,
                                char *reason,
                                size_t reasonsz) {
    bridge_mutex_lock(&direct_command_mu);
    if (direct_command_arbitration.active_family != BRIDGE_DIRECT_COMMAND_NONE) {
        snprintf(reason, reasonsz, "%s", "another direct command is active");
        bridge_mutex_unlock(&direct_command_mu);
        return 0;
    }
    if (active_prompt_or_menu_owns_input()) {
        active_prompt_or_menu_reason(reason, reasonsz);
        bridge_mutex_unlock(&direct_command_mu);
        return 0;
    }
    if (pending_queue_length() > 0) {
        snprintf(reason, reasonsz, "pending native command blocks %s",
                 direct_command_family_label(family));
        bridge_mutex_unlock(&direct_command_mu);
        return 0;
    }
    memset(&direct_command_arbitration, 0, sizeof direct_command_arbitration);
    direct_command_arbitration.active_family = family;
    snprintf(direct_command_arbitration.command_id,
             sizeof direct_command_arbitration.command_id, "%s", command_id);
    snprintf(direct_command_arbitration.transaction_id,
             sizeof direct_command_arbitration.transaction_id, "%s",
             transaction_id && *transaction_id ? transaction_id : command_id);
    bridge_mutex_unlock(&direct_command_mu);
    return 1;
}

static int mark_direct_command_queued(bridge_direct_command_family family) {
    bridge_mutex_lock(&direct_command_mu);
    if (!direct_command_is_active(family) || direct_command_arbitration.queued) {
        bridge_mutex_unlock(&direct_command_mu);
        return 0;
    }
    direct_command_arbitration.queued = 1;
    bridge_mutex_unlock(&direct_command_mu);
    return 1;
}

static void finish_direct_command(bridge_direct_command_family family) {
    switch (family) {
    case BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER:
        memset(&active_ground_transfer, 0, sizeof active_ground_transfer);
        break;
    case BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER:
        memset(&active_container_transfer, 0, sizeof active_container_transfer);
        break;
    case BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT:
        memset(&active_container_snapshot, 0, sizeof active_container_snapshot);
        break;
    case BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE:
        memset(&active_equipment_change, 0, sizeof active_equipment_change);
        break;
    case BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION:
        memset(&active_terrain_action, 0, sizeof active_terrain_action);
        break;
    case BRIDGE_DIRECT_COMMAND_NONE:
        return;
    }
    if (direct_command_is_active(family))
        memset(&direct_command_arbitration, 0, sizeof direct_command_arbitration);
}

static int is_safe_playable_key(int ch) {
    /* Accept only explicit user-supplied keys.  Printable NetHack commands,
     * ESC, TAB, CR/LF, backspace, and NetHack's Ctrl-D kick command are safe
     * because the bridge never synthesizes follow-up answers; prompts block
     * until the UI sends another key.  Keep this as a narrow allow-list so a
     * terminal EOT/stdin close cannot become a buffered game command. */
    return ch == 4 || ch == 27 || ch == '\t' || ch == '\r' || ch == '\n' || ch == 8 || ch == 127
        || (ch >= 32 && ch <= 126);
}

static void json_escape(FILE *f, const char *s) {
    if (!s) return;
    for (; *s; ++s) {
        unsigned char c = (unsigned char)*s;
        switch (c) {
        case '\\': fputs("\\\\", f); break;
        case '"': fputs("\\\"", f); break;
        case '\n': fputs("\\n", f); break;
        case '\r': fputs("\\r", f); break;
        case '\t': fputs("\\t", f); break;
        default:
            if (c < 32) fprintf(f, "\\u%04x", c); else fputc(c, f);
        }
    }
}

static int extract_json_string_field(const char *line, const char *field, char *out, size_t outsz) {
    if (!line || !field || !out || outsz == 0) return 0;
    out[0] = '\0';
    char needle[96];
    snprintf(needle, sizeof needle, "\"%s\"", field);
    const char *p = strstr(line, needle);
    if (!p || !(p = strchr(p, ':'))) return 0;
    p++;
    while (*p && isspace((unsigned char)*p)) p++;
    if (*p != '"') return 0;
    p++;
    size_t n = 0;
    while (*p && *p != '"' && n + 1 < outsz) {
        if (*p == '\\' && p[1]) {
            p++;
            if (*p == 'n') out[n++] = '\n';
            else if (*p == 'r') out[n++] = '\r';
            else if (*p == 't') out[n++] = '\t';
            else out[n++] = *p;
        } else {
            out[n++] = *p;
        }
        p++;
    }
    out[n] = '\0';
    return n > 0;
}

static int extract_json_int_field(const char *line, const char *field, int fallback) {
    if (!line || !field) return fallback;
    char needle[96];
    snprintf(needle, sizeof needle, "\"%s\"", field);
    const char *p = strstr(line, needle);
    if (!p || !(p = strchr(p, ':'))) return fallback;
    return (int) strtol(p + 1, NULL, 10);
}

static unsigned int extract_json_uint_field(const char *line, const char *field, unsigned int fallback) {
    if (!line || !field) return fallback;
    char needle[96];
    snprintf(needle, sizeof needle, "\"%s\"", field);
    const char *p = strstr(line, needle);
    if (!p || !(p = strchr(p, ':'))) return fallback;
    p++;
    while (*p && isspace((unsigned char) *p)) p++;
    if (*p == '"') p++;
    errno = 0;
    char *end = NULL;
    unsigned long value = strtoul(p, &end, 10);
    if (errno || end == p || value > UINT_MAX) return fallback;
    return (unsigned int) value;
}

static const char *skip_json_string(const char *p) {
    if (!p || *p != '"') return p;
    for (++p; *p; ++p) {
        if (*p == '\\' && p[1]) { ++p; continue; }
        if (*p == '"') return p + 1;
    }
    return p;
}

static const char *skip_json_value(const char *p) {
    while (p && *p && isspace((unsigned char)*p)) ++p;
    if (!p || !*p) return p;
    if (*p == '"') return skip_json_string(p);
    if (*p == '{' || *p == '[') {
        char open = *p;
        char close = open == '{' ? '}' : ']';
        int depth = 0;
        for (; *p; ++p) {
            if (*p == '"') { p = skip_json_string(p) - 1; continue; }
            if (*p == open) depth++;
            else if (*p == close) {
                depth--;
                if (depth == 0) return p + 1;
            }
        }
        return p;
    }
    while (*p && *p != ',' && *p != '}' && *p != ']') ++p;
    return p;
}

static const char *json_parse_value_strict(const char *p);

static const char *json_skip_ws_strict(const char *p) {
    while (p && *p && isspace((unsigned char)*p)) ++p;
    return p;
}

static int json_hex_digit(int ch) {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')
        || (ch >= 'A' && ch <= 'F');
}

static const char *json_parse_string_strict(const char *p) {
    if (!p || *p != '"') return NULL;
    for (++p; *p; ++p) {
        unsigned char ch = (unsigned char)*p;
        if (ch < 0x20) return NULL;
        if (ch == '"') return p + 1;
        if (ch == '\\') {
            ++p;
            if (!*p) return NULL;
            if (strchr("\"\\/bfnrt", *p)) continue;
            if (*p == 'u') {
                for (int i = 0; i < 4; ++i)
                    if (!json_hex_digit((unsigned char)*++p)) return NULL;
                continue;
            }
            return NULL;
        }
    }
    return NULL;
}

static const char *json_parse_number_strict(const char *p) {
    if (!p) return NULL;
    if (*p == '-') ++p;
    if (*p == '0') ++p;
    else if (isdigit((unsigned char)*p)) {
        while (isdigit((unsigned char)*p)) ++p;
    } else return NULL;
    if (*p == '.') {
        ++p;
        if (!isdigit((unsigned char)*p)) return NULL;
        while (isdigit((unsigned char)*p)) ++p;
    }
    if (*p == 'e' || *p == 'E') {
        ++p;
        if (*p == '+' || *p == '-') ++p;
        if (!isdigit((unsigned char)*p)) return NULL;
        while (isdigit((unsigned char)*p)) ++p;
    }
    return p;
}

static const char *json_parse_array_strict(const char *p) {
    if (!p || *p != '[') return NULL;
    p = json_skip_ws_strict(p + 1);
    if (*p == ']') return p + 1;
    for (;;) {
        p = json_parse_value_strict(p);
        if (!p) return NULL;
        p = json_skip_ws_strict(p);
        if (*p == ']') return p + 1;
        if (*p != ',') return NULL;
        p = json_skip_ws_strict(p + 1);
        if (*p == ']') return NULL;
    }
}

static const char *json_parse_object_strict(const char *p) {
    if (!p || *p != '{') return NULL;
    p = json_skip_ws_strict(p + 1);
    if (*p == '}') return p + 1;
    for (;;) {
        p = json_parse_string_strict(p);
        if (!p) return NULL;
        p = json_skip_ws_strict(p);
        if (*p != ':') return NULL;
        p = json_skip_ws_strict(p + 1);
        p = json_parse_value_strict(p);
        if (!p) return NULL;
        p = json_skip_ws_strict(p);
        if (*p == '}') return p + 1;
        if (*p != ',') return NULL;
        p = json_skip_ws_strict(p + 1);
        if (*p == '}') return NULL;
    }
}

static const char *json_parse_value_strict(const char *p) {
    p = json_skip_ws_strict(p);
    if (!p || !*p) return NULL;
    if (*p == '"') return json_parse_string_strict(p);
    if (*p == '{') return json_parse_object_strict(p);
    if (*p == '[') return json_parse_array_strict(p);
    if (*p == '-' || isdigit((unsigned char)*p)) return json_parse_number_strict(p);
    if (!strncmp(p, "true", 4)) return p + 4;
    if (!strncmp(p, "false", 5)) return p + 5;
    if (!strncmp(p, "null", 4)) return p + 4;
    return NULL;
}

static int json_line_is_single_object(const char *line) {
    const char *p = json_skip_ws_strict(line);
    const char *end;

    if (!p || *p != '{') return 0;
    end = json_parse_object_strict(p);
    if (!end) return 0;
    end = json_skip_ws_strict(end);
    return end && *end == '\0';
}

static int json_direct_field(const char *object, const char *field, const char **value_start, const char **value_end, int *count) {
    if (value_start) *value_start = NULL;
    if (value_end) *value_end = NULL;
    if (count) *count = 0;
    if (!object || *object != '{' || !field) return 0;
    const char *p = object + 1;
    int found = 0;
    while (*p) {
        while (*p && (isspace((unsigned char)*p) || *p == ',')) ++p;
        if (*p == '}') break;
        if (*p != '"') { p = skip_json_value(p); continue; }
        const char *key_start = p + 1;
        const char *key_end = skip_json_string(p) - 1;
        p = key_end + 1;
        while (*p && isspace((unsigned char)*p)) ++p;
        if (*p != ':') break;
        ++p;
        while (*p && isspace((unsigned char)*p)) ++p;
        const char *vs = p;
        const char *ve = skip_json_value(p);
        size_t key_len = (size_t)(key_end - key_start);
        if (strlen(field) == key_len && !strncmp(key_start, field, key_len)) {
            if (count) (*count)++;
            if (!found && value_start && value_end) { *value_start = vs; *value_end = ve; }
            found = 1;
        }
        p = ve;
    }
    return found;
}

static int json_direct_string_field(const char *object, const char *field, char *out, size_t outsz, char *reason, size_t reasonsz) {
    if (out && outsz) out[0] = '\0';
    const char *vs = NULL, *ve = NULL;
    int count = 0;
    if (!json_direct_field(object, field, &vs, &ve, &count)) return 0;
    if (count > 1) {
        if (reason && reasonsz) snprintf(reason, reasonsz, "duplicate %s field", field);
        return -1;
    }
    if (!vs || *vs != '"') return 0;
    size_t n = 0;
    for (const char *p = vs + 1; *p && p < ve && *p != '"' && n + 1 < outsz; ++p) {
        if (*p == '\\' && p[1] && p + 1 < ve) {
            ++p;
            if (*p == 'n') out[n++] = '\n';
            else if (*p == 'r') out[n++] = '\r';
            else if (*p == 't') out[n++] = '\t';
            else out[n++] = *p;
        } else {
            out[n++] = *p;
        }
    }
    if (out && outsz) out[n] = '\0';
    return n > 0 ? 1 : 0;
}

static int json_direct_object_field(const char *object, const char *field, const char **out, char *reason, size_t reasonsz) {
    if (out) *out = NULL;
    const char *vs = NULL, *ve = NULL;
    int count = 0;
    if (!json_direct_field(object, field, &vs, &ve, &count)) return 0;
    if (count > 1) {
        if (reason && reasonsz) snprintf(reason, reasonsz, "duplicate %s field", field);
        return -1;
    }
    if (!vs || *vs != '{') return 0;
    if (out) *out = vs;
    (void)ve;
    return 1;
}

static int json_direct_uint_field(const char *object, const char *field, unsigned int *out, char *reason, size_t reasonsz) {
    if (out) *out = 0U;
    const char *vs = NULL, *ve = NULL;
    int count = 0;
    if (!json_direct_field(object, field, &vs, &ve, &count)) return 0;
    if (count > 1) {
        if (reason && reasonsz) snprintf(reason, reasonsz, "duplicate %s field", field);
        return -1;
    }
    if (!vs || !ve) return 0;
    while (vs < ve && isspace((unsigned char)*vs)) ++vs;
    if (vs >= ve || *vs == '"' || *vs == '-' || *vs == '+' || !isdigit((unsigned char)*vs)) {
        if (reason && reasonsz) snprintf(reason, reasonsz, "%s must be an unsigned integer field", field);
        return -1;
    }
    errno = 0;
    char *end = NULL;
    unsigned long value = strtoul(vs, &end, 10);
    while (end && end < ve && isspace((unsigned char)*end)) ++end;
    if (errno || !end || end == vs || end != ve || value > UINT_MAX) {
        if (reason && reasonsz) snprintf(reason, reasonsz, "%s must be an unsigned integer field", field);
        return -1;
    }
    if (out) *out = (unsigned int)value;
    return 1;
}

static int json_direct_field_count(const char *object, const char *field) {
    int count = 0;
    json_direct_field(object, field, NULL, NULL, &count);
    return count;
}

static int emit_current_event_can_defer_flush = 0;
static unsigned int emit_deferred_flush_count = 0;

static void emit_event_start(const char *name) {
    bridge_mutex_lock(&out_mu);
    emit_current_event_can_defer_flush = !strcmp(name, "shim_print_glyph");
    fputs("{\"type\":\"shim-event\",\"name\":\"", stdout);
    json_escape(stdout, name);
    fputs("\"", stdout);
}

static void emit_event_end(void) {
    fputs("}\n", stdout);
    if (emit_current_event_can_defer_flush) {
        emit_deferred_flush_count++;
        if (emit_deferred_flush_count >= 128) {
            fflush(stdout);
            emit_deferred_flush_count = 0;
        }
    } else {
        fflush(stdout);
        emit_deferred_flush_count = 0;
    }
    emit_current_event_can_defer_flush = 0;
    bridge_mutex_unlock(&out_mu);
}

static const char *direct_command_family_event_stem(
    bridge_direct_command_family family) {
    switch (family) {
    case BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER: return "ground_transfer";
    case BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER: return "container_transfer";
    case BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT: return "container_snapshot";
    case BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE: return "equipment_change";
    case BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION: return "terrain_action";
    case BRIDGE_DIRECT_COMMAND_NONE: break;
    }
    return "direct_command";
}

static void emit_direct_command_lifecycle_start(
    bridge_direct_command_family family,
    const char *lifecycle,
    const char *command_id,
    const char *transaction_id) {
    char event_name[96];
    snprintf(event_name, sizeof event_name, "shim_%s_%s",
             direct_command_family_event_stem(family), lifecycle);
    emit_event_start(event_name);
    if (command_id && *command_id) {
        fputs(",\"commandId\":\"", stdout);
        json_escape(stdout, command_id);
        fputs("\"", stdout);
    }
    if (transaction_id && *transaction_id) {
        fputs(",\"transactionId\":\"", stdout);
        json_escape(stdout, transaction_id);
        fputs("\"", stdout);
    }
}

static void emit_active_direct_command_lifecycle_start(
    bridge_direct_command_family family,
    const char *lifecycle,
    const char *native_transaction_id) {
    emit_direct_command_lifecycle_start(
        family, lifecycle,
        direct_command_is_active(family)
            ? direct_command_arbitration.command_id : "",
        direct_command_is_active(family)
            ? direct_command_arbitration.transaction_id
            : (native_transaction_id && *native_transaction_id
                   ? native_transaction_id : ""));
}

static void emit_spell_availability_event(void) {
    emit_event_start("shim_spell_availability");
    fprintf(stdout,
            ",\"knownSpellCount\":%d,\"authoritative\":true,\"source\":\"num_spells\"",
            num_spells());
    emit_event_end();
}

static void emit_authoritative_magic_rows(const char *kind, int window) {
    bridge_menu_lifecycle *ctx = find_menu_lifecycle(window);
    int is_spell = !strcmp(kind, "spell");
    int count = is_spell ? pending_spell_row_count : pending_skill_row_count;
    if (!ctx || !ctx->request_id[0] || count < 0) {
        if (is_spell) pending_spell_row_count = 0;
        else pending_skill_row_count = 0;
        return;
    }
    unsigned long sequence = ++ui_protocol_sequence;
    unsigned long revision = is_spell ? ++spell_rows_revision
                                      : ++skill_rows_revision;
    bridge_mutex_lock(&out_mu);
    fputs("{\"protocol\":\"nethack-electron-ui/v2\",\"sequence\":", stdout);
    fprintf(stdout, "%lu,\"eventId\":\"evt-%s-rows-%lu\",\"eventType\":\"%s.rows\",\"turn\":%ld",
            sequence, kind, revision, kind,
            svm.moves < 0L ? 0L : svm.moves);
    fputs(",\"requestId\":\"", stdout); json_escape(stdout, ctx->request_id); fputs("\"", stdout);
    if (ctx->transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, ctx->transaction_id); fputs("\"", stdout); }
    fputs(",\"source\":{\"layer\":\"core\",\"window\":", stdout); fprintf(stdout, "%d", window);
    fputs(",\"event\":\"native.", stdout); json_escape(stdout, kind); fputs(".rows\",\"authoritative\":true}", stdout);
    fputs(",\"revision\":{\"", stdout); json_escape(stdout, kind); fprintf(stdout, "\":%lu}", revision);
    fputs(",\"payload\":{\"menuId\":\"", stdout); json_escape(stdout, ctx->menu_id); fprintf(stdout, "\",\"revision\":%lu,\"classificationConfidence\":\"typed\",\"rows\":[", revision);
    for (int i = 0; i < count; ++i) {
        if (i) fputc(',', stdout);
        if (is_spell) {
            bridge_public_spell_row *row = &pending_spell_rows[i];
            fputs("{\"name\":\"", stdout); json_escape(stdout, row->name); fputs("\"", stdout);
            if (row->selector >= 32 && row->selector <= 126) { char selector[2] = { (char) row->selector, '\0' }; fputs(",\"selector\":\"", stdout); json_escape(stdout, selector); fputs("\"", stdout); }
            fprintf(stdout, ",\"level\":%d,\"pwCost\":%d,\"failure\":%d", row->level, row->pw_cost, row->failure);
            if (row->status[0]) { fputs(",\"status\":\"", stdout); json_escape(stdout, row->status); fputs("\"", stdout); }
            fputc('}', stdout);
        } else {
            bridge_public_skill_row *row = &pending_skill_rows[i];
            int selector = row->can_advance ? selector_for_menu_identifier(window, row->identifier) : 0;
            fputs("{\"name\":\"", stdout); json_escape(stdout, row->name); fputs("\"", stdout);
            if (selector >= 32 && selector <= 126) { char selector_text[2] = { (char) selector, '\0' }; fputs(",\"selector\":\"", stdout); json_escape(stdout, selector_text); fputs("\"", stdout); }
            fputs(",\"currentRank\":\"", stdout); json_escape(stdout, row->current_rank); fputs("\"", stdout);
            if (row->can_advance && row->next_rank[0]) { fputs(",\"nextRank\":\"", stdout); json_escape(stdout, row->next_rank); fputs("\"", stdout); }
            if (row->can_advance && row->next_cost > 0) fprintf(stdout, ",\"nextCost\":%d", row->next_cost);
            fprintf(stdout, ",\"canAdvance\":%s}", row->can_advance ? "true" : "false");
        }
    }
    fputs("]}}\n", stdout);
    fflush(stdout);
    bridge_mutex_unlock(&out_mu);
    if (is_spell) { pending_spell_row_count = 0; pending_spell_rows_window = -1; }
    else { pending_skill_row_count = 0; pending_skill_rows_window = -1; }
}

static int contains_icase(const char *haystack, const char *needle) {
    if (!haystack || !needle || !*needle) return 0;
    size_t nlen = strlen(needle);
    for (const char *p = haystack; *p; ++p) {
        size_t i = 0;
        while (i < nlen && p[i] && tolower((unsigned char) p[i]) == tolower((unsigned char) needle[i])) i++;
        if (i == nlen) return 1;
    }
    return 0;
}

static const char *container_failure_kind(const char *reason) {
    if (contains_icase(reason, "locked")) return "locked";
    if (contains_icase(reason, "trapped")) return "trapped";
    if (contains_icase(reason, "no longer") || contains_icase(reason, "stale")) return "stale-target";
    if (contains_icase(reason, "carrying too much") || contains_icase(reason, "capacity")) return "capacity";
    if (contains_icase(reason, "not supported") || contains_icase(reason, "normal NetHack")) return "netHack-owned-flow-required";
    return "rejected";
}

static void emit_container_failure_fields(const char *reason) {
    fputs(",\"status\":\"rejected\",\"failureKind\":\"", stdout);
    json_escape(stdout, container_failure_kind(reason));
    fputs("\"", stdout);
}

static void emit_request_source(const char *command_label, int window) {
    fputs(",\"requestSource\":{\"layer\":\"shim-bridge\"", stdout);
    if (window >= 0) fprintf(stdout, ",\"window\":%d", window);
    if (command_label && *command_label) { fputs(",\"command\":\"", stdout); json_escape(stdout, command_label); fputs("\"", stdout); }
    fputs("}", stdout);
}

static void emit_owner(const char *kind, int window) {
    fputs(",\"owner\":{\"kind\":\"", stdout);
    json_escape(stdout, kind && *kind ? kind : "unknown");
    fputs("\"", stdout);
    if (window >= 0) fprintf(stdout, ",\"window\":%d", window);
    fputs("}", stdout);
}

static void emit_lifecycle_metadata(const char *request_id, const char *transaction_id, unsigned long revision, const char *lifecycle, const char *source_command, int window, const char *owner_kind) {
    if (request_id && *request_id) { fputs(",\"requestId\":\"", stdout); json_escape(stdout, request_id); fputs("\"", stdout); }
    if (transaction_id && *transaction_id) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, transaction_id); fputs("\"", stdout); }
    if (revision) fprintf(stdout, ",\"lifecycleRevision\":%lu", revision);
    if (lifecycle && *lifecycle) { fputs(",\"lifecycle\":\"", stdout); json_escape(stdout, lifecycle); fputs("\"", stdout); }
    emit_request_source(source_command, window);
    if (owner_kind && *owner_kind) emit_owner(owner_kind, window);
}

static const char *purpose_owner_kind(const char *purpose) {
    if (!purpose) return "unknown";
    if (!strncmp(purpose, "container.", 10)) return "container";
    if (!strncmp(purpose, "ground.", 7)) return "ground";
    if (!strncmp(purpose, "inventory.", 10)) return "inventory";
    if (!strncmp(purpose, "action.", 7)) return "action";
    if (!strncmp(purpose, "system.", 7) || !strncmp(purpose, "menu.", 5) || !strncmp(purpose, "options.", 8) || !strncmp(purpose, "spell.", 6)) return "system";
    if (!strncmp(purpose, "prompt.equipment", 16)) return "equipment";
    return "action";
}

static const char *classify_menu_purpose_text(const char *prompt) {
    if (contains_icase(prompt, "Pick up") && contains_icase(prompt, "what")) return "ground.pickup";
    if (contains_icase(prompt, "Things that are here") || contains_icase(prompt, "You see here")) return "ground.look";
    if (contains_icase(prompt, "Do what with")) return "container.action";
    if (contains_icase(prompt, "Take out what type") || contains_icase(prompt, "Put in what type")) return "container.category";
    if (contains_icase(prompt, "Take out what")) return "container.takeOut";
    if (contains_icase(prompt, "Put in what")) return "container.putIn";
    if (contains_icase(prompt, "Inventory") || contains_icase(prompt, "Possessions")) return "inventory.overview";
    if (contains_icase(prompt, "Welcome to NetHack") || contains_icase(prompt, "Pick a role") || contains_icase(prompt, "Shall I pick")) return "system.startup";
    if (contains_icase(prompt, "Help") || contains_icase(prompt, "command")) return "system.help";
    if (contains_icase(prompt, "attribute") || contains_icase(prompt, "conduct") || contains_icase(prompt, "score")) return "system.status";
    if (contains_icase(prompt, "What do you want to")) return "action.choice";
    return "menu.generic";
}

void nh_test_bridge_event(const char *name, const char *id, const char *message, const char *facts_json) {
    emit_event_start(name);
    if (id && *id) { fputs(",\"id\":\"", stdout); json_escape(stdout, id); fputs("\"", stdout); }
    if (message && *message) { fputs(",\"message\":\"", stdout); json_escape(stdout, message); fputs("\"", stdout); }
    if (facts_json && *facts_json) fprintf(stdout, ",\"expectedPublicFacts\":%s", facts_json);
    emit_event_end();
}

static int has_fixture_env(void) {
    return (getenv("NH_TEST_SCENARIO") && *getenv("NH_TEST_SCENARIO"))
        || (getenv("NH_TEST_SCENARIO_ID") && *getenv("NH_TEST_SCENARIO_ID"))
        || (getenv("NH_SHIM_TEST_PICKUP_PILE") && *getenv("NH_SHIM_TEST_PICKUP_PILE"))
        || (getenv("NH_SHIM_TEST_CONTAINER_TRANSFER_SCENE") && *getenv("NH_SHIM_TEST_CONTAINER_TRANSFER_SCENE"))
        || (getenv("NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE") && *getenv("NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE"))
        || (getenv("NH_SHIM_TEST_LOCKED_DOOR_SCENE") && *getenv("NH_SHIM_TEST_LOCKED_DOOR_SCENE"))
        || (getenv("NH_SHIM_TEST_CORPSE_OVERLAY_SCENE") && *getenv("NH_SHIM_TEST_CORPSE_OVERLAY_SCENE"))
        || (getenv("NH_SHIM_TEST_SHOP_PAYMENT_SCENE") && *getenv("NH_SHIM_TEST_SHOP_PAYMENT_SCENE"));
}

static void emit_gui_action_metadata(const bridge_gui_action_metadata *meta) {
    if (!meta || (!meta->action_id[0] && !meta->action_label[0] && !meta->target_selector[0] && !meta->target_text[0])) return;
    fputs(",\"guiAction\":{", stdout);
    int wrote = 0;
    if (meta->action_id[0]) { fputs("\"actionId\":\"", stdout); json_escape(stdout, meta->action_id); fputs("\"", stdout); wrote = 1; }
    if (meta->action_label[0]) { if (wrote) fputc(',', stdout); fputs("\"label\":\"", stdout); json_escape(stdout, meta->action_label); fputs("\"", stdout); wrote = 1; }
    if (meta->target_selector[0]) { if (wrote) fputc(',', stdout); fputs("\"targetSelector\":\"", stdout); json_escape(stdout, meta->target_selector); fputs("\"", stdout); wrote = 1; }
    if (meta->target_text[0]) { if (wrote) fputc(',', stdout); fputs("\"targetText\":\"", stdout); json_escape(stdout, meta->target_text); fputs("\"", stdout); wrote = 1; }
    if (meta->followup_plan[0]) { if (wrote) fputc(',', stdout); fputs("\"followupPlan\":\"", stdout); json_escape(stdout, meta->followup_plan); fputs("\"", stdout); wrote = 1; }
    if (meta->expected_request_id[0]) { if (wrote) fputc(',', stdout); fputs("\"expectedRequestId\":\"", stdout); json_escape(stdout, meta->expected_request_id); fputs("\"", stdout); wrote = 1; }
    if (meta->command_position > 0) { if (wrote) fputc(',', stdout); fprintf(stdout, "\"commandPosition\":%d", meta->command_position); wrote = 1; }
    if (meta->command_length > 0) { if (wrote) fputc(',', stdout); fprintf(stdout, "\"commandLength\":%d", meta->command_length); }
    fputs("}", stdout);
}

static void push_key_with_metadata(int ch, const bridge_gui_action_metadata *meta) {
    if (meta && meta->expected_request_id[0] && !request_id_is_active_prompt_or_menu(meta->expected_request_id)) {
        emit_event_start("bridge_semantic_followup_rejected");
        fprintf(stdout, ",\"keycode\":%d", ch);
        if (meta->transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, meta->transaction_id); fputs("\"", stdout); }
        fputs(",\"reason\":\"expected prompt request id does not match active prompt\"", stdout);
        emit_gui_action_metadata(meta);
        emit_event_end();
        return;
    }
    if (ch != 0 && !is_safe_playable_key(ch)) {
        emit_event_start("bridge_unsupported_command");
        fprintf(stdout, ",\"keycode\":%d", ch);
        emit_gui_action_metadata(meta);
        emit_event_end();
        return;
    }
    unsigned long transaction_revision = ++command_transaction_revision;
    if (meta && meta->transaction_id[0]) snprintf(active_transaction_id, sizeof active_transaction_id, "%s", meta->transaction_id);
    else snprintf(active_transaction_id, sizeof active_transaction_id, "shim-command-%lu-%d", transaction_revision, ch);
    bridge_mutex_lock(&in_mu);
    int queued_before = (pending_tail - pending_head + 1024) % 1024;
    int next = (pending_tail + 1) % 1024;
    int accepted = 0;
    if (next != pending_head) {
        pending_keys[pending_tail] = ch;
        pending_tail = next;
        accepted = 1;
        bridge_condition_signal(&in_cv);
    }
    int queued_after = (pending_tail - pending_head + 1024) % 1024;
    bridge_mutex_unlock(&in_mu);
    bridge_menu_lifecycle *active_menu = first_active_menu_lifecycle();
    char active_request_id[96] = "";
    const char *active_request_kind = "none";
    if (active_prompt_request_id[0]) {
        snprintf(active_request_id, sizeof active_request_id, "%s", active_prompt_request_id);
        active_request_kind = "prompt";
    } else if (active_menu && active_menu->request_id[0]) {
        snprintf(active_request_id, sizeof active_request_id, "%s", active_menu->request_id);
        active_request_kind = "menu";
    }
    emit_event_start(accepted ? "bridge_command" : "bridge_input_queue_full");
    fprintf(stdout, ",\"keycode\":%d,\"queuedBefore\":%d,\"queuedAfter\":%d", ch, queued_before, queued_after);
    if (active_request_id[0]) {
        fputs(",\"activeRequestId\":\"", stdout); json_escape(stdout, active_request_id); fputs("\"", stdout);
        fputs(",\"activeRequestKind\":\"", stdout); json_escape(stdout, active_request_kind); fputs("\"", stdout);
        if (active_menu) {
            fputs(",\"activeMenuTransactionId\":\"", stdout); json_escape(stdout, active_menu->transaction_id); fputs("\"", stdout);
        }
    }
    if (accepted) {
        fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout);
        emit_request_source(NULL, -1);
        emit_gui_action_metadata(meta);
    }
    emit_event_end();
}

static void push_key(int ch) {
    push_key_with_metadata(ch, NULL);
}

static int extract_json_string_field_after(const char *line, const char *anchor, const char *field, char *out, size_t outsz) {
    const char *start = anchor && *anchor ? strstr(line, anchor) : line;
    if (!start) return 0;
    return extract_json_string_field(start, field, out, outsz);
}

typedef struct bridge_ui_command_rule {
    const char *action_id;
    const char *literal_command;
    const char *command_prefix;
    int selector_index;
    int allow_ring_hand;
    const char *target_location;
    const char *prompt_policy;
} bridge_ui_command_rule;

static const bridge_ui_command_rule ui_command_rules[] = {
    { "item.quaff", NULL, "q", 1, 0, NULL, NULL },
    { "item.read.scroll", NULL, "r", 1, 0, NULL, NULL },
    { "item.study", NULL, "r", 1, 0, NULL, NULL },
    { "item.read.inscription", NULL, "r", 1, 0, NULL, NULL },
    { "item.eat", NULL, "e", 1, 0, NULL, NULL },
    { "item.drop", NULL, "d", 1, 0, NULL, NULL },
    { "item.apply", NULL, "a", 1, 0, NULL, NULL },
    { "item.lootOrApply", NULL, "a", 1, 0, NULL, NULL },
    { "item.zap", NULL, "z", 1, 0, NULL, NULL },
    { "item.throw", NULL, "t", 1, 0, NULL, NULL },
    { "item.engraveWith", NULL, "E", 1, 0, NULL, NULL },
    { "item.offer", NULL, "O", 1, 0, NULL, NULL },
    { "item.pay", NULL, "p", 1, 0, NULL, NULL },
    { "item.invoke", NULL, "V", 1, 0, NULL, NULL },
    { "item.wear", NULL, "W", 1, 0, NULL, NULL },
    { "item.takeOff", NULL, "T", 1, 0, NULL, NULL },
    { "item.remove.accessory", NULL, "R", 1, 0, NULL, NULL },
    { "item.wield.mainHand", NULL, "w", 1, 0, NULL, NULL },
    { "item.wield.hold", NULL, "w", 1, 0, NULL, NULL },
    { "item.quiver", NULL, "Q", 1, 0, NULL, NULL },
    { "slot.clear.quiver", NULL, "Q", 1, 0, NULL, NULL },
    { "slot.clear.mainHand", NULL, "w", 1, 0, NULL, NULL },
    { "item.putOn.ring", NULL, "P", 1, 1, NULL, NULL },
    { "item.putOn.accessory", NULL, "P", 1, 0, NULL, NULL },
    { "item.putOn.eyes", NULL, "P", 1, 0, NULL, NULL },
    { "slot.swapMainAlternate", "x", NULL, -1, 0, NULL, NULL },
    { "ground.openContainer", "#loot\n", NULL, -1, 0, "ground", "netHack-owned-followup" },
    { "ground.tipContainer", "#tip\n", NULL, -1, 0, "ground", "netHack-owned-followup" },
    { "ground.forceContainer", "#force\n", NULL, -1, 0, "ground", "netHack-owned-followup" },
    { "ground.untrapContainer", "#untrap\n", NULL, -1, 0, "ground", "netHack-owned-followup" },
    { "item.rub", NULL, "#rub\n", 5, 0, "inventory", "netHack-owned-followup" },
};

static const bridge_ui_command_rule *find_ui_command_rule(const char *action_id) {
    if (!action_id || !*action_id) return NULL;
    size_t count = sizeof(ui_command_rules) / sizeof(ui_command_rules[0]);
    for (size_t i = 0; i < count; ++i) if (!strcmp(ui_command_rules[i].action_id, action_id)) return &ui_command_rules[i];
    return NULL;
}

static int ui_command_line_has_forbidden_public_fields(const char *line) {
    static const char *forbidden[] = { "trueName", "baseType", "objectType", "otyp", "beatitude", "buc", "cursed", "blessed", "enchantment", "charges", "trapState", "contents", "locked", "trapped", "broken" };
    for (size_t i = 0; i < sizeof(forbidden) / sizeof(forbidden[0]); ++i) {
        char needle[64];
        snprintf(needle, sizeof needle, "\"%s\"", forbidden[i]);
        if (strstr(line, needle)) return 1;
    }
    return 0;
}

static int ui_command_matches_rule(const bridge_ui_command_rule *rule, const char *command, const char *selector, char *reason, size_t reasonsz) {
    size_t len = command ? strlen(command) : 0;
    if (!rule || !command || !*command) {
        snprintf(reason, reasonsz, "%s", "missing route command bytes");
        return 0;
    }
    if (rule->literal_command) {
        if (strcmp(command, rule->literal_command)) {
            snprintf(reason, reasonsz, "%s", "route command bytes do not match allowlist");
            return 0;
        }
        return 1;
    }
    if (rule->command_prefix) {
        size_t prefix_len = strlen(rule->command_prefix);
        if (len < prefix_len || strncmp(command, rule->command_prefix, prefix_len)) {
            snprintf(reason, reasonsz, "%s", "route command prefix does not match allowlist");
            return 0;
        }
        if (rule->allow_ring_hand) {
            if (!(len == prefix_len + 1
                  || (len == prefix_len + 2
                      && (command[prefix_len + 1] == 'l'
                          || command[prefix_len + 1] == 'r')))) {
                snprintf(reason, reasonsz, "%s", "ring route command must be selector plus optional public hand");
                return 0;
            }
        } else if (len != prefix_len + 1) {
            snprintf(reason, reasonsz, "%s", "selector route command must be exactly command prefix plus selector");
            return 0;
        }
        if (rule->selector_index >= 0) {
            if (!selector || !*selector) {
                snprintf(reason, reasonsz, "%s", "selector route requires public selector target");
                return 0;
            }
            if (command[rule->selector_index] != selector[0]) {
                snprintf(reason, reasonsz, "%s", "route command selector does not match public selector target");
                return 0;
            }
        }
        return 1;
    }
    snprintf(reason, reasonsz, "%s", "route rule is incomplete");
    return 0;
}

static void emit_ui_command_rejected(const char *command_id, const char *transaction_id, const char *action_id, const char *reason) {
    emit_event_start("bridge_ui_command_rejected");
    if (command_id && *command_id) { fputs(",\"commandId\":\"", stdout); json_escape(stdout, command_id); fputs("\"", stdout); }
    if (transaction_id && *transaction_id) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, transaction_id); fputs("\"", stdout); }
    if (action_id && *action_id) { fputs(",\"actionId\":\"", stdout); json_escape(stdout, action_id); fputs("\"", stdout); }
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason && *reason ? reason : "ui command rejected"); fputs("\"", stdout);
    emit_event_end();
}

static void emit_ui_command_accepted(const char *command_id, const char *transaction_id, const char *action_id, const char *command) {
    emit_event_start("bridge_ui_command_accepted");
    if (command_id && *command_id) { fputs(",\"commandId\":\"", stdout); json_escape(stdout, command_id); fputs("\"", stdout); }
    if (transaction_id && *transaction_id) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, transaction_id); fputs("\"", stdout); }
    if (action_id && *action_id) { fputs(",\"actionId\":\"", stdout); json_escape(stdout, action_id); fputs("\"", stdout); }
    fputs(",\"command\":\"", stdout); json_escape(stdout, command); fputs("\"", stdout);
    emit_event_end();
}

static void emit_ground_transfer_rejected_dir(const char *command_id, const char *transaction_id, const char *transfer_id, const char *direction, const char *reason) {
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER, "rejected",
        command_id, transaction_id);
    if (transfer_id && *transfer_id) { fputs(",\"transferId\":\"", stdout); json_escape(stdout, transfer_id); fputs("\"", stdout); }
    fputs(",\"direction\":\"", stdout); json_escape(stdout, direction && *direction ? direction : "ground-to-inventory");
    fputs("\",\"reason\":\"", stdout);
    json_escape(stdout, reason && *reason ? reason : "ground transfer rejected");
    fputs("\"", stdout);
    emit_event_end();
}

static void emit_ground_transfer_rejected(const char *command_id, const char *transaction_id, const char *transfer_id, const char *reason) {
    emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, "ground-to-inventory", reason);
}

static void handle_ground_transfer_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], direction[64], transfer_id[128], count[32];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = direction[0] = transfer_id[0] = count[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    const char *coord_obj = NULL;
    char reason[192] = "";
    if (!json_line_is_single_object(line)) { emit_ground_transfer_rejected("", "", "", "ground-transfer wrapper must be one well-formed JSON object"); return; }
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_ground_transfer_rejected("", "", "", reason[0] ? reason : "ground-transfer wrapper requires nested command object"); return; }
    static const char *critical[] = { "protocol", "commandType", "commandId", "itemId", "coord", "count" };
    for (size_t i = 0; i < sizeof(critical) / sizeof(critical[0]); ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) { snprintf(reason, sizeof reason, "wrapper-level %s cannot satisfy nested command validation", critical[i]); emit_ground_transfer_rejected("", "", "", reason); return; }
        if (json_direct_field_count(command_obj, critical[i]) > 1) { snprintf(reason, sizeof reason, "duplicate %s field", critical[i]); emit_ground_transfer_rejected("", "", "", reason); return; }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0) { emit_ground_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0) { emit_ground_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (!payload_obj) { emit_ground_transfer_rejected(command_id, transaction_id, transfer_id, "ground.transfer requires nested payload object"); return; }
    if (json_direct_string_field(payload_obj, "direction", direction, sizeof direction, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "transferId", transfer_id, sizeof transfer_id, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "count", count, sizeof count, reason, sizeof reason) < 0) { emit_ground_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (json_direct_object_field(payload_obj, "coord", &coord_obj, reason, sizeof reason) < 0 || !coord_obj) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, reason[0] ? reason : "ground.transfer requires payload.coord"); return; }
    if (json_direct_field_count(payload_obj, "protocol") || json_direct_field_count(payload_obj, "commandType") || json_direct_field_count(payload_obj, "commandId")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    unsigned int item_id = 0U, x = 0U, y = 0U;
    if (json_direct_uint_field(payload_obj, "itemId", &item_id, reason, sizeof reason) < 0
        || json_direct_uint_field(coord_obj, "x", &x, reason, sizeof reason) < 0
        || json_direct_uint_field(coord_obj, "y", &y, reason, sizeof reason) < 0) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, reason); return; }
    if (json_direct_field_count(command_obj, "itemId") || json_direct_field_count(command_obj, "coord")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "itemId and coord must be payload fields only"); return; }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "protocol must be nethack-electron-ui/v2"); return; }
    if (!command_id[0]) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "ground.transfer requires commandId"); return; }
    if (strcmp(command_type, "ground.transfer")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "commandType must be ground.transfer"); return; }
    if (strcmp(direction, "ground-to-inventory") && strcmp(direction, "inventory-to-ground")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "unsupported ground.transfer direction"); return; }
    if (!transfer_id[0]) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "ground.transfer requires payload.transferId"); return; }
    if (strcmp(count, "all")) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "ground.transfer first slice requires count all"); return; }
    if (!item_id || !isok((int)x, (int)y)) { emit_ground_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "ground.transfer requires public itemId and valid coord"); return; }
    if (!begin_direct_command(BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER,
                              command_id, transaction_id,
                              reason, sizeof reason)) {
        emit_ground_transfer_rejected_dir(command_id, transaction_id,
                                          transfer_id, direction, reason);
        return;
    }
    memset(&active_ground_transfer, 0, sizeof active_ground_transfer);
    active_ground_transfer.item_id = item_id;
    active_ground_transfer.x = (int)x;
    active_ground_transfer.y = (int)y;
    snprintf(active_ground_transfer.direction, sizeof active_ground_transfer.direction, "%s", direction);
    snprintf(active_ground_transfer.transfer_id, sizeof active_ground_transfer.transfer_id, "%s", transfer_id[0] ? transfer_id : (transaction_id[0] ? transaction_id : command_id));
    snprintf(active_transaction_id, sizeof active_transaction_id, "%s", active_ground_transfer.transfer_id);
    ground_transfer_set_request(active_ground_transfer.item_id, active_ground_transfer.direction, active_ground_transfer.x, active_ground_transfer.y, active_transaction_id);
    emit_active_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER, "accepted", NULL);
    fputs(",\"transferId\":\"", stdout); json_escape(stdout, active_ground_transfer.transfer_id); fputs("\"", stdout);
    fprintf(stdout, ",\"itemId\":%u,\"direction\":\"", item_id); json_escape(stdout, direction); fputs("\"", stdout);
    fprintf(stdout, ",\"coord\":{\"x\":%u,\"y\":%u}", x, y);
    emit_event_end();
    bridge_gui_action_metadata key_meta;
    memset(&key_meta, 0, sizeof key_meta);
    snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", "ground.transfer");
    snprintf(key_meta.action_label, sizeof key_meta.action_label, "%s", "Ground transfer");
    snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", active_transaction_id);
    key_meta.command_length = 1;
    key_meta.command_position = 1;
    push_key_with_metadata(0, &key_meta);
}

static void emit_container_transfer_rejected_dir(const char *command_id, const char *transaction_id, const char *transfer_id, const char *direction, const char *reason) {
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER, "rejected",
        command_id, transaction_id);
    if (transfer_id && *transfer_id) { fputs(",\"transferId\":\"", stdout); json_escape(stdout, transfer_id); fputs("\"", stdout); }
    fputs(",\"direction\":\"", stdout); json_escape(stdout, direction && *direction ? direction : "container-to-inventory");
    fputs("\",\"reason\":\"", stdout);
    json_escape(stdout, reason && *reason ? reason : "container transfer rejected");
    fputs("\"", stdout);
    emit_event_end();
}

static void emit_container_transfer_rejected(const char *command_id, const char *transaction_id, const char *transfer_id, const char *reason) {
    emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, "container-to-inventory", reason);
}

static void emit_container_snapshot_rejected(const char *command_id, const char *transaction_id, const char *session_id, const char *reason) {
    const char *safe_reason = reason && *reason ? reason : "container snapshot rejected";
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT, "rejected",
        command_id, transaction_id);
    if (session_id && *session_id) { fputs(",\"sessionId\":\"", stdout); json_escape(stdout, session_id); fputs("\"", stdout); }
    emit_container_failure_fields(safe_reason);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, safe_reason); fputs("\"", stdout);
    emit_event_end();
}

static void handle_container_transfer_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], direction[64], transfer_id[128], session_id[128];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = direction[0] = transfer_id[0] = session_id[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    char reason[192] = "";
    if (!json_line_is_single_object(line)) { emit_container_transfer_rejected("", "", "", "container-transfer wrapper must be one well-formed JSON object"); return; }
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_container_transfer_rejected("", "", "", reason[0] ? reason : "container-transfer wrapper requires nested command object"); return; }
    static const char *critical[] = { "protocol", "commandType", "commandId", "containerId", "itemId" };
    for (size_t i = 0; i < sizeof(critical) / sizeof(critical[0]); ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) { snprintf(reason, sizeof reason, "wrapper-level %s cannot satisfy nested command validation", critical[i]); emit_container_transfer_rejected("", "", "", reason); return; }
        if (json_direct_field_count(command_obj, critical[i]) > 1) { snprintf(reason, sizeof reason, "duplicate %s field", critical[i]); emit_container_transfer_rejected("", "", "", reason); return; }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0) { emit_container_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0) { emit_container_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (!payload_obj) { emit_container_transfer_rejected(command_id, transaction_id, transfer_id, "container.transfer requires nested payload object"); return; }
    if (json_direct_string_field(payload_obj, "direction", direction, sizeof direction, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "transferId", transfer_id, sizeof transfer_id, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "sessionId", session_id, sizeof session_id, reason, sizeof reason) < 0) { emit_container_transfer_rejected(command_id, transaction_id, transfer_id, reason); return; }
    if (json_direct_field_count(payload_obj, "protocol") || json_direct_field_count(payload_obj, "commandType") || json_direct_field_count(payload_obj, "commandId")) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    unsigned int container_id = 0U, item_id = 0U;
    if (json_direct_uint_field(payload_obj, "containerId", &container_id, reason, sizeof reason) < 0
        || json_direct_uint_field(payload_obj, "itemId", &item_id, reason, sizeof reason) < 0) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, reason); return; }
    if (json_direct_field_count(command_obj, "containerId") || json_direct_field_count(command_obj, "itemId")) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "containerId and itemId must be payload fields only"); return; }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "protocol must be nethack-electron-ui/v2"); return; }
    if (!command_id[0]) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "container.transfer requires commandId"); return; }
    if (strcmp(command_type, "container.transfer")) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "commandType must be container.transfer"); return; }
    if (strcmp(direction, "container-to-inventory") && strcmp(direction, "inventory-to-container")) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "unsupported container.transfer direction"); return; }
    if (!transfer_id[0]) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "container.transfer requires payload.transferId"); return; }
    if (!session_id[0]) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "container.transfer requires payload.sessionId"); return; }
    if (!container_id || !item_id) { emit_container_transfer_rejected_dir(command_id, transaction_id, transfer_id, direction, "container.transfer requires public containerId and itemId"); return; }
    if (!begin_direct_command(BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER,
                              command_id, transaction_id,
                              reason, sizeof reason)) {
        emit_container_transfer_rejected_dir(command_id, transaction_id,
                                             transfer_id, direction, reason);
        return;
    }
    memset(&active_container_transfer, 0, sizeof active_container_transfer);
    active_container_transfer.container_id = container_id;
    active_container_transfer.item_id = item_id;
    snprintf(active_container_transfer.direction, sizeof active_container_transfer.direction, "%s", direction);
    snprintf(active_container_transfer.transfer_id, sizeof active_container_transfer.transfer_id, "%s", transfer_id[0] ? transfer_id : (transaction_id[0] ? transaction_id : command_id));
    snprintf(active_container_transfer.session_id, sizeof active_container_transfer.session_id, "%s", session_id);
    snprintf(active_transaction_id, sizeof active_transaction_id, "%s", active_container_transfer.transfer_id);
    container_transfer_set_request(active_container_transfer.container_id, active_container_transfer.item_id, active_container_transfer.direction, active_transaction_id);
    emit_active_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER, "accepted", NULL);
    fputs(",\"transferId\":\"", stdout); json_escape(stdout, active_container_transfer.transfer_id); fputs("\"", stdout);
    fprintf(stdout, ",\"containerId\":%u,\"itemId\":%u,\"direction\":\"", container_id, item_id); json_escape(stdout, direction); fputs("\"", stdout);
    emit_event_end();
    bridge_gui_action_metadata key_meta;
    memset(&key_meta, 0, sizeof key_meta);
    snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", "container.transfer");
    snprintf(key_meta.action_label, sizeof key_meta.action_label, "%s", "Container transfer");
    snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", active_transaction_id);
    key_meta.command_length = 1;
    key_meta.command_position = 1;
    push_key_with_metadata(0, &key_meta);
}

static void handle_container_snapshot_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], session_id[128];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = session_id[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    char reason[192] = "";
    if (!json_line_is_single_object(line)) { emit_container_snapshot_rejected("", "", "", "container-snapshot wrapper must be one well-formed JSON object"); return; }
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_container_snapshot_rejected("", "", "", reason[0] ? reason : "container-snapshot wrapper requires nested command object"); return; }
    static const char *critical[] = {
        "protocol", "commandType", "commandId", "containerId", "sessionId"
    };
    for (size_t i = 0; i < sizeof(critical) / sizeof(critical[0]); ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) {
            snprintf(reason, sizeof reason,
                     "wrapper-level %s cannot satisfy nested command validation",
                     critical[i]);
            emit_container_snapshot_rejected("", "", "", reason);
            return;
        }
        if (json_direct_field_count(command_obj, critical[i]) > 1) {
            snprintf(reason, sizeof reason, "duplicate %s field", critical[i]);
            emit_container_snapshot_rejected("", "", "", reason);
            return;
        }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0 || !payload_obj) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, reason[0] ? reason : "container.snapshot requires nested payload object"); return; }
    if (json_direct_string_field(payload_obj, "sessionId", session_id, sizeof session_id, reason, sizeof reason) < 0) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, reason); return; }
    unsigned int container_id = 0U;
    if (json_direct_uint_field(payload_obj, "containerId", &container_id, reason, sizeof reason) < 0) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, reason); return; }
    if (json_direct_field_count(payload_obj, "protocol")
        || json_direct_field_count(payload_obj, "commandType")
        || json_direct_field_count(payload_obj, "commandId")) {
        emit_container_snapshot_rejected(
            command_id, transaction_id, session_id,
            "protocol, commandType, and commandId must be command envelope fields only");
        return;
    }
    if (json_direct_field_count(command_obj, "containerId")
        || json_direct_field_count(command_obj, "sessionId")) {
        emit_container_snapshot_rejected(
            command_id, transaction_id, session_id,
            "containerId and sessionId must be payload fields only");
        return;
    }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, "protocol must be nethack-electron-ui/v2"); return; }
    if (strcmp(command_type, "container.snapshot")) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, "commandType must be container.snapshot"); return; }
    if (!command_id[0] || !session_id[0] || !container_id) { emit_container_snapshot_rejected(command_id, transaction_id, session_id, "container.snapshot requires commandId, sessionId, and public containerId"); return; }
    if (!begin_direct_command(BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT,
                              command_id, transaction_id,
                              reason, sizeof reason)) {
        emit_container_snapshot_rejected(command_id, transaction_id,
                                         session_id, reason);
        return;
    }
    memset(&active_container_snapshot, 0, sizeof active_container_snapshot);
    active_container_snapshot.container_id = container_id;
    snprintf(active_container_snapshot.session_id, sizeof active_container_snapshot.session_id, "%s", session_id);
    snprintf(active_transaction_id, sizeof active_transaction_id, "%s",
             direct_command_arbitration.transaction_id);
    container_snapshot_set_request(active_container_snapshot.container_id, active_transaction_id);
    emit_active_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT, "accepted", NULL);
    fputs(",\"sessionId\":\"", stdout); json_escape(stdout, active_container_snapshot.session_id); fputs("\"", stdout);
    fprintf(stdout, ",\"containerId\":%u", container_id);
    emit_event_end();
    bridge_gui_action_metadata key_meta;
    memset(&key_meta, 0, sizeof key_meta);
    snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", "container.snapshot");
    snprintf(key_meta.action_label, sizeof key_meta.action_label, "%s", "Container snapshot");
    snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", active_transaction_id);
    key_meta.command_length = 1;
    key_meta.command_position = 1;
    push_key_with_metadata(0, &key_meta);
}

static void emit_terrain_action_rejected(const char *command_id, const char *transaction_id, const char *action, const char *terrain, unsigned int item_id, unsigned int x, unsigned int y, const char *reason) {
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION, "rejected",
        command_id, transaction_id);
    fputs(",\"action\":\"", stdout); json_escape(stdout, action ? action : ""); fputs("\"", stdout);
    fputs(",\"terrain\":\"", stdout); json_escape(stdout, terrain ? terrain : ""); fputs("\"", stdout);
    fprintf(stdout, ",\"coord\":{\"x\":%u,\"y\":%u},\"itemId\":%u", x, y, item_id);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason && *reason ? reason : "terrain action rejected"); fputs("\"", stdout);
    emit_event_end();
}

static int terrain_action_is_compatible(const char *action, const char *terrain) {
    if (!strcmp(action, "stairsDown")) return !strcmp(terrain, "stairs.down");
    if (!strcmp(action, "stairsUp")) return !strcmp(terrain, "stairs.up");
    if (!strcmp(action, "ladderUp")) return !strcmp(terrain, "ladder.up");
    if (!strcmp(action, "drink")) return !strcmp(terrain, "fountain");
    if (!strcmp(action, "dip")) return !strcmp(terrain, "fountain");
    return 0;
}

static void handle_terrain_action_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], action[32], terrain[32];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = action[0] = terrain[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    const char *coord_obj = NULL;
    const char *revision_obj = NULL;
    char reason[192] = "";
    unsigned int item_id = 0U, x = 0U, y = 0U;
    unsigned int expected_inventory = 0U;
    if (!json_line_is_single_object(line)) { emit_terrain_action_rejected("", "", "", "", 0, 0, 0, "terrain-action wrapper must be one well-formed JSON object"); return; }
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_terrain_action_rejected("", "", "", "", 0, 0, 0, reason[0] ? reason : "terrain-action wrapper requires nested command object"); return; }
    static const char *critical[] = { "protocol", "commandType", "commandId", "action", "terrain", "coord", "itemId" };
    for (size_t i = 0; i < sizeof(critical) / sizeof(critical[0]); ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) { snprintf(reason, sizeof reason, "wrapper-level %s cannot satisfy nested command validation", critical[i]); emit_terrain_action_rejected("", "", "", "", 0, 0, 0, reason); return; }
        if (json_direct_field_count(command_obj, critical[i]) > 1) { snprintf(reason, sizeof reason, "duplicate %s field", critical[i]); emit_terrain_action_rejected("", "", "", "", 0, 0, 0, reason); return; }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0 || !payload_obj) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason[0] ? reason : "terrain.action requires nested payload object"); return; }
    if (json_direct_object_field(command_obj, "expectedRevision", &revision_obj, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    if (revision_obj) {
        if (json_direct_uint_field(revision_obj, "inventory", &expected_inventory, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    }
    if (json_direct_string_field(payload_obj, "action", action, sizeof action, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "terrain", terrain, sizeof terrain, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    if (json_direct_object_field(payload_obj, "coord", &coord_obj, reason, sizeof reason) < 0 || !coord_obj) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason[0] ? reason : "terrain.action requires payload.coord"); return; }
    if (json_direct_uint_field(coord_obj, "x", &x, reason, sizeof reason) < 0
        || json_direct_uint_field(coord_obj, "y", &y, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    if (json_direct_field_count(payload_obj, "itemId") && json_direct_uint_field(payload_obj, "itemId", &item_id, reason, sizeof reason) < 0) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, reason); return; }
    if (json_direct_field_count(payload_obj, "protocol") || json_direct_field_count(payload_obj, "commandType") || json_direct_field_count(payload_obj, "commandId")) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    if (json_direct_field_count(command_obj, "action") || json_direct_field_count(command_obj, "terrain") || json_direct_field_count(command_obj, "coord") || json_direct_field_count(command_obj, "itemId")) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "terrain target fields must be payload fields only"); return; }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "protocol must be nethack-electron-ui/v2"); return; }
    if (strcmp(command_type, "terrain.action")) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "commandType must be terrain.action"); return; }
    if (!command_id[0]) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "terrain.action requires commandId"); return; }
    if (!isok((int)x, (int)y)) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "terrain.action requires a valid public coord"); return; }
    if (!terrain_action_is_compatible(action, terrain)) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "terrain.action action and terrain are not compatible"); return; }
    if (!strcmp(action, "dip") && !item_id) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "terrain.action dip requires public itemId"); return; }
    if (expected_inventory && inventory_revision && expected_inventory != inventory_revision) { emit_terrain_action_rejected(command_id, transaction_id, action, terrain, item_id, x, y, "inventory revision changed before direct terrain action"); return; }
    if (!begin_direct_command(BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION,
                              command_id, transaction_id,
                              reason, sizeof reason)) {
        emit_terrain_action_rejected(command_id, transaction_id, action,
                                     terrain, item_id, x, y, reason);
        return;
    }
    memset(&active_terrain_action, 0, sizeof active_terrain_action);
    snprintf(active_terrain_action.action, sizeof active_terrain_action.action, "%s", action);
    snprintf(active_terrain_action.terrain, sizeof active_terrain_action.terrain, "%s", terrain);
    active_terrain_action.x = x;
    active_terrain_action.y = y;
    active_terrain_action.item_id = item_id;
    snprintf(active_transaction_id, sizeof active_transaction_id, "%s",
             direct_command_arbitration.transaction_id);
    terrain_action_set_request(action, (coordxy) x, (coordxy) y, terrain, item_id, active_transaction_id);
    emit_active_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION, "accepted", NULL);
    fputs(",\"action\":\"", stdout); json_escape(stdout, action); fputs("\"", stdout);
    fputs(",\"terrain\":\"", stdout); json_escape(stdout, terrain); fputs("\"", stdout);
    fprintf(stdout, ",\"coord\":{\"x\":%u,\"y\":%u},\"itemId\":%u", x, y, item_id);
    emit_event_end();
    bridge_gui_action_metadata key_meta;
    memset(&key_meta, 0, sizeof key_meta);
    snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", "terrain.action");
    snprintf(key_meta.action_label, sizeof key_meta.action_label, "%s", "Terrain action");
    snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", active_transaction_id);
    key_meta.command_length = 1;
    key_meta.command_position = 1;
    push_key_with_metadata(0, &key_meta);
}

static void maybe_emit_terrain_action_result(void) {
    if (!terrain_action_result_available()) return;
    boolean success = FALSE;
    char action[32] = "";
    char terrain[32] = "";
    coordxy x = 0, y = 0;
    unsigned int item_id = 0U;
    char transaction_id[128] = "";
    char reason[192] = "";
    terrain_action_take_result(&success, action, sizeof action, &x, &y, terrain, sizeof terrain, &item_id, transaction_id, sizeof transaction_id, reason, sizeof reason);
    bridge_mutex_lock(&direct_command_mu);
    bridge_terrain_action_request completed = active_terrain_action;
    bridge_direct_command_arbitration completed_command =
        direct_command_arbitration;
    finish_direct_command(BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION);
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION,
        success ? "confirmed" : "rejected",
        completed_command.command_id, completed_command.transaction_id);
    fputs(",\"action\":\"", stdout); json_escape(stdout, action[0] ? action : completed.action); fputs("\"", stdout);
    fputs(",\"terrain\":\"", stdout); json_escape(stdout, terrain[0] ? terrain : completed.terrain); fputs("\"", stdout);
    fprintf(stdout, ",\"coord\":{\"x\":%d,\"y\":%d},\"itemId\":%u", (int)x, (int)y, item_id);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
    emit_event_end();
    bridge_mutex_unlock(&direct_command_mu);
}

static void emit_equipment_change_rejected(const char *command_id, const char *transaction_id, const char *action, unsigned int item_id, const char *slot_id, const char *hand, const char *reason) {
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE, "rejected",
        command_id, transaction_id);
    fputs(",\"action\":\"", stdout); json_escape(stdout, action ? action : ""); fputs("\"", stdout);
    fprintf(stdout, ",\"itemId\":%u", item_id);
    fputs(",\"slotId\":\"", stdout); json_escape(stdout, slot_id ? slot_id : ""); fputs("\"", stdout);
    fputs(",\"hand\":\"", stdout); json_escape(stdout, hand ? hand : ""); fputs("\"", stdout);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason ? reason : "equipment change rejected"); fputs("\"", stdout);
    emit_event_end();
}

static void handle_equipment_change_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], action[32], slot_id[32], hand[16];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = action[0] = slot_id[0] = hand[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    const char *revision_obj = NULL;
    char reason[192] = "";
    unsigned int item_id = 0U, expected_inventory = 0U, expected_equipment = 0U;
    if (!json_line_is_single_object(line)) { emit_equipment_change_rejected("", "", "", 0, "", "", "equipment-change wrapper must be one well-formed JSON object"); return; }
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_equipment_change_rejected("", "", "", 0, "", "", reason[0] ? reason : "equipment-change wrapper requires nested command object"); return; }
    const char *critical[] = { "protocol", "commandType", "commandId", "itemId", "slotId", "hand", NULL };
    for (int i = 0; critical[i]; ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) { snprintf(reason, sizeof reason, "wrapper-level %s cannot satisfy nested command validation", critical[i]); emit_equipment_change_rejected("", "", "", 0, "", "", reason); return; }
        if (json_direct_field_count(command_obj, critical[i]) > 1) { snprintf(reason, sizeof reason, "duplicate %s field", critical[i]); emit_equipment_change_rejected("", "", "", 0, "", "", reason); return; }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0 || !payload_obj) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason[0] ? reason : "equipment.change requires nested payload object"); return; }
    if (json_direct_string_field(payload_obj, "action", action, sizeof action, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "slotId", slot_id, sizeof slot_id, reason, sizeof reason) < 0
        || json_direct_string_field(payload_obj, "hand", hand, sizeof hand, reason, sizeof reason) < 0) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason); return; }
    if (json_direct_uint_field(payload_obj, "itemId", &item_id, reason, sizeof reason) < 0) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason); return; }
    if (json_direct_object_field(command_obj, "expectedRevision", &revision_obj, reason, sizeof reason) < 0) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason); return; }
    if (revision_obj) {
        if (json_direct_uint_field(revision_obj, "inventory", &expected_inventory, reason, sizeof reason) < 0
            || json_direct_uint_field(revision_obj, "equipment", &expected_equipment, reason, sizeof reason) < 0) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, reason); return; }
    }
    if (json_direct_field_count(payload_obj, "protocol") || json_direct_field_count(payload_obj, "commandType") || json_direct_field_count(payload_obj, "commandId")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    if (json_direct_field_count(command_obj, "itemId") || json_direct_field_count(command_obj, "slotId") || json_direct_field_count(command_obj, "hand")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "equipment target fields must be payload fields only"); return; }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "protocol must be nethack-electron-ui/v2"); return; }
    if (strcmp(command_type, "equipment.change")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "commandType must be equipment.change"); return; }
    if (!command_id[0]) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "equipment.change requires commandId"); return; }
    if (strcmp(action, "takeOff") && strcmp(action, "removeAccessory") && strcmp(action, "wieldMain") && strcmp(action, "quiver") && strcmp(action, "clearQuiver") && strcmp(action, "putOnRing") && strcmp(action, "wearArmor")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "unsupported equipment.change action"); return; }
    if (strcmp(action, "clearQuiver") && !item_id) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "equipment.change requires public itemId for this action"); return; }
    if (strcmp(action, "putOnRing") && hand[0]) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "equipment.change hand is only valid for putOnRing"); return; }
    if (!strcmp(action, "wieldMain") && slot_id[0] && strcmp(slot_id, "mainHand")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "wieldMain requires mainHand slot when slotId is supplied"); return; }
    if ((!strcmp(action, "quiver") || !strcmp(action, "clearQuiver")) && slot_id[0] && strcmp(slot_id, "quiver")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "quiver actions require quiver slot when slotId is supplied"); return; }
    if (!strcmp(action, "wearArmor") && strcmp(slot_id, "armor.body") && strcmp(slot_id, "armor.cloak") && strcmp(slot_id, "armor.shirt") && strcmp(slot_id, "armor.helm") && strcmp(slot_id, "armor.gloves") && strcmp(slot_id, "armor.boots") && strcmp(slot_id, "armor.shield")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "wearArmor requires a canonical armor slot"); return; }
    if (!strcmp(action, "putOnRing") && strcmp(hand, "left") && strcmp(hand, "right")) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "putOnRing requires explicit public hand"); return; }
    if (!strcmp(action, "putOnRing") && !slot_id[0]) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "putOnRing requires explicit public ring slot"); return; }
    if (!strcmp(action, "putOnRing") && ((!strcmp(hand, "left") && strcmp(slot_id, "ring.left")) || (!strcmp(hand, "right") && strcmp(slot_id, "ring.right")))) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "ring slot and hand disagree"); return; }
    if (expected_inventory && inventory_revision && expected_inventory != inventory_revision) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "inventory revision changed before direct equipment change"); return; }
    if (expected_equipment && equipment_revision && expected_equipment != equipment_revision) { emit_equipment_change_rejected(command_id, transaction_id, action, item_id, slot_id, hand, "equipment revision changed before direct equipment change"); return; }
    if (!begin_direct_command(BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE,
                              command_id, transaction_id,
                              reason, sizeof reason)) {
        emit_equipment_change_rejected(command_id, transaction_id, action,
                                       item_id, slot_id, hand, reason);
        return;
    }
    memset(&active_equipment_change, 0, sizeof active_equipment_change);
    active_equipment_change.item_id = item_id;
    snprintf(active_equipment_change.action, sizeof active_equipment_change.action, "%s", action);
    snprintf(active_equipment_change.slot_id, sizeof active_equipment_change.slot_id, "%s", slot_id);
    snprintf(active_equipment_change.hand, sizeof active_equipment_change.hand, "%s", hand);
    snprintf(active_transaction_id, sizeof active_transaction_id, "%s",
             direct_command_arbitration.transaction_id);
    equipment_change_set_request(active_equipment_change.item_id, active_equipment_change.action, active_equipment_change.slot_id, active_equipment_change.hand, active_transaction_id);
    emit_active_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE, "accepted", NULL);
    fputs(",\"action\":\"", stdout); json_escape(stdout, active_equipment_change.action); fputs("\"", stdout);
    fprintf(stdout, ",\"itemId\":%u", item_id);
    fputs(",\"slotId\":\"", stdout); json_escape(stdout, active_equipment_change.slot_id); fputs("\"", stdout);
    fputs(",\"hand\":\"", stdout); json_escape(stdout, active_equipment_change.hand); fputs("\"", stdout);
    emit_event_end();
    bridge_gui_action_metadata key_meta;
    memset(&key_meta, 0, sizeof key_meta);
    snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", "equipment.change");
    snprintf(key_meta.action_label, sizeof key_meta.action_label, "%s", "Equipment change");
    snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", active_transaction_id);
    key_meta.command_length = 1;
    key_meta.command_position = 1;
    push_key_with_metadata(0, &key_meta);
}


static void maybe_emit_ground_transfer_result(void) {
    if (!ground_transfer_result_available()) return;
    boolean success = FALSE;
    unsigned int item_id = 0;
    int x = 0, y = 0;
    char direction[64] = "";
    char transaction_id[128] = "";
    char reason[192] = "";
    ground_transfer_take_result(&success, &item_id, &x, &y, direction, sizeof direction, transaction_id, sizeof transaction_id, reason, sizeof reason);
    emit_live_inventory_event(-31);
    if (isok(x, y)) emit_ground_pile_snapshot_event(WIN_MAP, x, y);
    bridge_mutex_lock(&direct_command_mu);
    bridge_ground_transfer_request completed = active_ground_transfer;
    bridge_direct_command_arbitration completed_command =
        direct_command_arbitration;
    finish_direct_command(BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER);
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER,
        success ? "confirmed" : "rejected",
        completed_command.command_id, completed_command.transaction_id);
    fputs(",\"transferId\":\"", stdout); json_escape(stdout, completed.transfer_id[0] ? completed.transfer_id : transaction_id); fputs("\"", stdout);
    fprintf(stdout, ",\"itemId\":%u,\"direction\":\"", item_id); json_escape(stdout, direction[0] ? direction : completed.direction); fputs("\"", stdout);
    fprintf(stdout, ",\"coord\":{\"x\":%d,\"y\":%d}", x, y);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
    emit_event_end();
    bridge_mutex_unlock(&direct_command_mu);
}

static void maybe_emit_container_transfer_result(void) {
    if (!container_transfer_result_available()) return;
    boolean success = FALSE;
    unsigned int container_id = 0, item_id = 0;
    char direction[64] = "";
    char transaction_id[128] = "";
    char reason[192] = "";
    container_transfer_take_result(&success, &container_id, &item_id, direction, sizeof direction, transaction_id, sizeof transaction_id, reason, sizeof reason);
    struct obj *container = floor_container_by_public_id(container_id);
    if (container) emit_container_contents_snapshot_for(container, active_container_transfer.session_id, transaction_id);
    bridge_mutex_lock(&direct_command_mu);
    bridge_container_transfer_request completed = active_container_transfer;
    bridge_direct_command_arbitration completed_command =
        direct_command_arbitration;
    finish_direct_command(BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER);
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER,
        success ? "confirmed" : "rejected",
        completed_command.command_id, completed_command.transaction_id);
    fputs(",\"transferId\":\"", stdout); json_escape(stdout, completed.transfer_id[0] ? completed.transfer_id : transaction_id); fputs("\"", stdout);
    fprintf(stdout, ",\"containerId\":%u,\"itemId\":%u,\"direction\":\"", container_id, item_id); json_escape(stdout, direction[0] ? direction : completed.direction); fputs("\"", stdout);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
    emit_event_end();
    bridge_mutex_unlock(&direct_command_mu);
}

static void maybe_emit_container_snapshot_result(void) {
    if (!container_snapshot_result_available()) return;
    boolean success = FALSE;
    unsigned int container_id = 0;
    char transaction_id[128] = "";
    char reason[192] = "";
    container_snapshot_take_result(&success, &container_id, transaction_id, sizeof transaction_id, reason, sizeof reason);
    struct obj *container = floor_container_by_public_id(container_id);
    if (success && container) emit_container_contents_snapshot_for(container, active_container_snapshot.session_id, transaction_id);
    bridge_mutex_lock(&direct_command_mu);
    bridge_container_snapshot_request completed = active_container_snapshot;
    bridge_direct_command_arbitration completed_command =
        direct_command_arbitration;
    finish_direct_command(BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT);
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT,
        success ? "confirmed" : "rejected",
        completed_command.command_id, completed_command.transaction_id);
    if (completed.session_id[0]) { fputs(",\"sessionId\":\"", stdout); json_escape(stdout, completed.session_id); fputs("\"", stdout); }
    fprintf(stdout, ",\"containerId\":%u", container_id);
    if (!success) emit_container_failure_fields(reason);
    else fputs(",\"status\":\"ok\"", stdout);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
    emit_event_end();
    bridge_mutex_unlock(&direct_command_mu);
}

static void maybe_emit_equipment_change_result(void) {
    if (!equipment_change_result_available()) return;
    boolean success = FALSE;
    unsigned int item_id = 0;
    char action[32] = "";
    char slot_id[32] = "";
    char hand[16] = "";
    char transaction_id[128] = "";
    char reason[192] = "";
    equipment_change_take_result(&success, &item_id, action, sizeof action, slot_id, sizeof slot_id, hand, sizeof hand, transaction_id, sizeof transaction_id, reason, sizeof reason);
    bridge_mutex_lock(&direct_command_mu);
    bridge_equipment_change_request completed = active_equipment_change;
    bridge_direct_command_arbitration completed_command =
        direct_command_arbitration;
    finish_direct_command(BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE);
    emit_direct_command_lifecycle_start(
        BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE,
        success ? "confirmed" : "rejected",
        completed_command.command_id, completed_command.transaction_id);
    fputs(",\"action\":\"", stdout); json_escape(stdout, action[0] ? action : completed.action); fputs("\"", stdout);
    fprintf(stdout, ",\"itemId\":%u", item_id ? item_id : completed.item_id);
    fputs(",\"slotId\":\"", stdout); json_escape(stdout, slot_id[0] ? slot_id : completed.slot_id); fputs("\"", stdout);
    fputs(",\"hand\":\"", stdout); json_escape(stdout, hand[0] ? hand : completed.hand); fputs("\"", stdout);
    fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
    emit_event_end();
    bridge_mutex_unlock(&direct_command_mu);
}

static void handle_ui_command_line(const char *line) {
    char protocol[96], command_type[64], command_id[128], transaction_id[128], action_id[96], payload_action_id[96], route_action_id[96], command[256], prompt_policy[96], target_kind[32], selector[8], inventory_letter[8], reason[192];
    protocol[0] = command_type[0] = command_id[0] = transaction_id[0] = action_id[0] = payload_action_id[0] = route_action_id[0] = command[0] = prompt_policy[0] = target_kind[0] = selector[0] = inventory_letter[0] = reason[0] = '\0';
    const char *wrapper = strchr(line, '{');
    const char *command_obj = NULL;
    const char *payload_obj = NULL;
    const char *route_obj = NULL;
    const char *targets_obj = NULL;
    const char *target_obj = NULL;
    const char *location_obj = NULL;
    if (!wrapper || json_direct_object_field(wrapper, "command", &command_obj, reason, sizeof reason) != 1) { emit_ui_command_rejected("", "", "", reason[0] ? reason : "ui-command wrapper requires nested command object"); return; }
    static const char *critical[] = { "protocol", "commandType", "commandId", "actionId" };
    for (size_t i = 0; i < sizeof(critical) / sizeof(critical[0]); ++i) {
        if (json_direct_field_count(wrapper, critical[i]) > 0) { snprintf(reason, sizeof reason, "wrapper-level %s cannot satisfy nested command validation", critical[i]); emit_ui_command_rejected("", "", "", reason); return; }
        if (json_direct_field_count(command_obj, critical[i]) > 1) { snprintf(reason, sizeof reason, "duplicate %s field", critical[i]); emit_ui_command_rejected("", "", "", reason); return; }
    }
    if (json_direct_string_field(command_obj, "protocol", protocol, sizeof protocol, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandType", command_type, sizeof command_type, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "commandId", command_id, sizeof command_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "transactionId", transaction_id, sizeof transaction_id, reason, sizeof reason) < 0
        || json_direct_string_field(command_obj, "actionId", action_id, sizeof action_id, reason, sizeof reason) < 0) { emit_ui_command_rejected("", "", "", reason); return; }
    if (json_direct_object_field(command_obj, "payload", &payload_obj, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    if (json_direct_object_field(command_obj, "targets", &targets_obj, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    if (payload_obj) {
        if (json_direct_string_field(payload_obj, "actionId", payload_action_id, sizeof payload_action_id, reason, sizeof reason) < 0
            || json_direct_string_field(payload_obj, "promptPolicy", prompt_policy, sizeof prompt_policy, reason, sizeof reason) < 0
            || json_direct_string_field(payload_obj, "selector", selector, sizeof selector, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
        if (json_direct_object_field(payload_obj, "route", &route_obj, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
        if (json_direct_object_field(payload_obj, "target", &target_obj, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    }
    if (route_obj) {
        if (json_direct_field_count(route_obj, "command") > 1 || json_direct_field_count(route_obj, "keys") > 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, "duplicate or conflicting route command fields"); return; }
        if (json_direct_string_field(route_obj, "actionId", route_action_id, sizeof route_action_id, reason, sizeof reason) < 0
            || json_direct_string_field(route_obj, "command", command, sizeof command, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
        if (!selector[0] && json_direct_string_field(route_obj, "selector", selector, sizeof selector, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    }
    const char *selector_target = target_obj ? target_obj : targets_obj;
    if (selector_target) {
        if (!selector[0] && json_direct_string_field(selector_target, "selector", selector, sizeof selector, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
        if (!inventory_letter[0] && json_direct_string_field(selector_target, "inventoryLetter", inventory_letter, sizeof inventory_letter, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
        if (json_direct_object_field(selector_target, "location", &location_obj, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    }
    if (location_obj && json_direct_string_field(location_obj, "kind", target_kind, sizeof target_kind, reason, sizeof reason) < 0) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    if (!selector[0] && inventory_letter[0]) snprintf(selector, sizeof selector, "%s", inventory_letter);
    if (payload_obj && (json_direct_field_count(payload_obj, "protocol") || json_direct_field_count(payload_obj, "commandType") || json_direct_field_count(payload_obj, "commandId"))) { emit_ui_command_rejected(command_id, transaction_id, action_id, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    if (route_obj && (json_direct_field_count(route_obj, "protocol") || json_direct_field_count(route_obj, "commandType") || json_direct_field_count(route_obj, "commandId"))) { emit_ui_command_rejected(command_id, transaction_id, action_id, "protocol, commandType, and commandId must be command envelope fields only"); return; }
    if (strcmp(protocol, "nethack-electron-ui/v2")) { emit_ui_command_rejected(command_id, transaction_id, action_id, "protocol must be nethack-electron-ui/v2"); return; }
    if (!command_id[0]) { emit_ui_command_rejected(command_id, transaction_id, action_id, "ui command requires commandId"); return; }
    if (strcmp(command_type, "action.execute")) { emit_ui_command_rejected(command_id, transaction_id, action_id, "commandType must be action.execute"); return; }
    if (!action_id[0]) { emit_ui_command_rejected(command_id, transaction_id, action_id, "action.execute requires actionId"); return; }
    if (ui_command_line_has_forbidden_public_fields(command_obj)) { emit_ui_command_rejected(command_id, transaction_id, action_id, "ui command public target contains forbidden hidden fields"); return; }
    if (payload_action_id[0] && strcmp(payload_action_id, action_id)) { emit_ui_command_rejected(command_id, transaction_id, action_id, "payload.actionId must match command actionId"); return; }
    if (route_action_id[0] && strcmp(route_action_id, action_id)) { emit_ui_command_rejected(command_id, transaction_id, action_id, "payload.route.actionId must match command actionId"); return; }
    const bridge_ui_command_rule *rule = find_ui_command_rule(action_id);
    if (!rule) { emit_ui_command_rejected(command_id, transaction_id, action_id, "actionId is not in bridge ui-command allowlist"); return; }
    if (rule->target_location && strcmp(target_kind, rule->target_location)) { emit_ui_command_rejected(command_id, transaction_id, action_id, "ui command requires explicit public target location"); return; }
    if (!strcmp(action_id, "item.rub") && !selector[0]) { emit_ui_command_rejected(command_id, transaction_id, action_id, "item.rub requires public inventory selector target"); return; }
    if (rule->prompt_policy && strcmp(prompt_policy, rule->prompt_policy)) { emit_ui_command_rejected(command_id, transaction_id, action_id, "ui command promptPolicy does not match allowlist"); return; }
    if (active_prompt_or_menu_owns_input()) { active_prompt_or_menu_reason(reason, sizeof reason); emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    if (pending_queue_length() > 0) { snprintf(reason, sizeof reason, "%s", "pending native command blocks ui-command"); emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    if (!ui_command_matches_rule(rule, command, selector, reason, sizeof reason)) { emit_ui_command_rejected(command_id, transaction_id, action_id, reason); return; }
    emit_ui_command_accepted(command_id, transaction_id, action_id, command);
    size_t len = strlen(command);
    for (size_t i = 0; i < len; ++i) {
        bridge_gui_action_metadata key_meta;
        memset(&key_meta, 0, sizeof key_meta);
        snprintf(key_meta.action_id, sizeof key_meta.action_id, "%s", action_id);
        extract_json_string_field(line, "label", key_meta.action_label, sizeof key_meta.action_label);
        if (selector[0]) snprintf(key_meta.target_selector, sizeof key_meta.target_selector, "%s", selector);
        extract_json_string_field(line, "displayName", key_meta.target_text, sizeof key_meta.target_text);
        if (!key_meta.target_text[0]) extract_json_string_field(line, "targetText", key_meta.target_text, sizeof key_meta.target_text);
        snprintf(key_meta.transaction_id, sizeof key_meta.transaction_id, "%s", transaction_id[0] ? transaction_id : command_id);
        key_meta.command_position = (int) i + 1;
        key_meta.command_length = (int) len;
        push_key_with_metadata((unsigned char) command[i], &key_meta);
    }
}

static int pop_key_blocking_with_status(int *queued_before, int *queued_after) {
    bridge_mutex_lock(&in_mu);
    while (pending_head == pending_tail) {
        /* Do not synthesize ESC on EOF.  A detached/stdin-closed shim used to
         * feed ESC forever, making NetHack spin and look like it was
         * repeatedly restarting.  Electron keeps stdin open and sends explicit
         * JSON key events; if stdin closes, wait quietly for SIGTERM/cleanup.
         */
        bridge_condition_wait(&in_cv, &in_mu);
    }
    if (queued_before) *queued_before = (pending_tail - pending_head + 1024) % 1024;
    int ch = pending_keys[pending_head];
    pending_head = (pending_head + 1) % 1024;
    if (queued_after) *queued_after = (pending_tail - pending_head + 1024) % 1024;
    bridge_mutex_unlock(&in_mu);
    return ch;
}

static int pop_key_blocking(void) {
    return pop_key_blocking_with_status(NULL, NULL);
}

static int try_pop_matching_key(const char *choices) {
    int ch = 0;
    int accepted = 0;
    bridge_mutex_lock(&in_mu);
    if (pending_head != pending_tail) {
        ch = pending_keys[pending_head];
        if (ch == '\r') ch = '\n';
        accepted = (ch == 27) || !choices || !*choices || strchr(choices, ch) != NULL;
        if (accepted) pending_head = (pending_head + 1) % 1024;
    }
    bridge_mutex_unlock(&in_mu);
    return accepted ? ch : 0;
}

static int is_ring_finger_prompt(const char *query, const char *choices) {
    if (!query || !choices || !strchr(choices, 'l') || !strchr(choices, 'r')) return 0;
    return (strstr(query, "ring-finger") != NULL)
        || (strstr(query, "Right or Left") != NULL && strstr(query, "finger") != NULL)
        || (strstr(query, "Right or Left") != NULL && strstr(query, "ring") != NULL);
}

static void stdin_thread(void *unused) {
    (void) unused;
    char line[4096];
    while (fgets(line, sizeof line, stdin)) {
        char input_type[64];
        input_type[0] = '\0';
        extract_json_string_field(line, "type", input_type, sizeof input_type);
        if (!strchr(line, '\n') && !feof(stdin)) {
            if (!strcmp(input_type, "ui-command")) emit_ui_command_rejected("", "", "", "ui-command line exceeds bridge parser limit");
            int discard;
            while ((discard = fgetc(stdin)) != EOF && discard != '\n') {}
            continue;
        }
        if (!strcmp(input_type, "ui-command")) {
            handle_ui_command_line(line);
            continue;
        }
        if (!strcmp(input_type, "ground-transfer")) {
            handle_ground_transfer_line(line);
            continue;
        }
        if (!strcmp(input_type, "container-transfer")) {
            handle_container_transfer_line(line);
            continue;
        }
        if (!strcmp(input_type, "container-snapshot")) {
            handle_container_snapshot_line(line);
            continue;
        }
        if (!strcmp(input_type, "equipment-change")) {
            handle_equipment_change_line(line);
            continue;
        }
        if (!strcmp(input_type, "terrain-action")) {
            handle_terrain_action_line(line);
            continue;
        }
        bridge_gui_action_metadata meta;
        memset(&meta, 0, sizeof meta);
        extract_json_string_field(line, "actionId", meta.action_id, sizeof meta.action_id);
        if (!meta.action_id[0]) extract_json_string_field(line, "guiActionId", meta.action_id, sizeof meta.action_id);
        extract_json_string_field(line, "actionLabel", meta.action_label, sizeof meta.action_label);
        extract_json_string_field(line, "targetSelector", meta.target_selector, sizeof meta.target_selector);
        extract_json_string_field(line, "targetText", meta.target_text, sizeof meta.target_text);
        extract_json_string_field(line, "followupPlan", meta.followup_plan, sizeof meta.followup_plan);
        extract_json_string_field(line, "transactionId", meta.transaction_id, sizeof meta.transaction_id);
        if (!meta.transaction_id[0]) extract_json_string_field(line, "actionTransactionId", meta.transaction_id, sizeof meta.transaction_id);
        extract_json_string_field(line, "expectedRequestId", meta.expected_request_id, sizeof meta.expected_request_id);
        meta.command_position = extract_json_int_field(line, "commandPosition", 0);
        meta.command_length = extract_json_int_field(line, "commandLength", 0);
        char *kc = strstr(line, "\"keycode\"");
        if (kc && (kc = strchr(kc, ':'))) {
            push_key_with_metadata((int) strtol(kc + 1, NULL, 10), &meta);
            continue;
        }
        char *p = strstr(line, "\"key\"");
        if (!p) p = strstr(line, "\"keys\"");
        if (p && (p = strchr(p, ':')) && (p = strchr(p, '"'))) {
            ++p;
            int index = 0;
            int len = meta.command_length;
            if (len <= 0) for (const char *q = p; *q && *q != '"'; ++q) if (*q != '\\') len++;
            while (*p && *p != '"') {
                bridge_gui_action_metadata key_meta = meta;
                if (key_meta.command_length <= 0) key_meta.command_length = len;
                key_meta.command_position = ++index;
                if (*p == '\\') {
                    ++p;
                    if (*p == 'n') push_key_with_metadata('\n', &key_meta);
                    else if (*p == 'r') push_key_with_metadata('\r', &key_meta);
                    else if (*p == 't') push_key_with_metadata('\t', &key_meta);
                    else if (*p == 'b') push_key_with_metadata('\b', &key_meta);
                    else if (*p) push_key_with_metadata((unsigned char)*p, &key_meta);
                } else {
                    push_key_with_metadata((unsigned char)*p, &key_meta);
                }
                if (*p) ++p;
            }
        }
    }
    emit_event_start("bridge_stdin_closed"); emit_event_end();
    return;
}

unsigned long
sys_random_seed(void)
{
    const char *electron_chosen = getenv("NH_ELECTRON_CHOSEN_SEED");
    const char *forced = getenv("NETHACK_SEED");
    int fixture_seed_enabled = 0;
#ifdef NH_ELECTRON_TEST_FIXTURES
    fixture_seed_enabled = getenv("NH_ELECTRON_TEST_FIXTURES") && strcmp(getenv("NH_ELECTRON_TEST_FIXTURES"), "1") == 0;
#endif
    if (electron_chosen && *electron_chosen) {
        char *end = NULL;
        errno = 0;
        unsigned long seed = strtoul(electron_chosen, &end, 0);
        if (!errno && end && *end == '\0') {
            has_strong_rngseed = FALSE;
            emit_event_start("bridge_seed");
            fprintf(stdout, ",\"seed\":\"%lu\",\"source\":\"NH_ELECTRON_CHOSEN_SEED\"", seed);
            emit_event_end();
            return seed;
        }
        emit_event_start("bridge_seed_invalid");
        fputs(",\"source\":\"NH_ELECTRON_CHOSEN_SEED\",\"value\":\"", stdout); json_escape(stdout, electron_chosen); fputs("\"", stdout);
        emit_event_end();
    }
    if (forced && *forced && fixture_seed_enabled) {
        char *end = NULL;
        errno = 0;
        unsigned long seed = strtoul(forced, &end, 0);
        if (!errno && end && *end == '\0') {
            has_strong_rngseed = FALSE;
            emit_event_start("bridge_seed");
            fprintf(stdout, ",\"seed\":\"%lu\",\"source\":\"NETHACK_SEED\"", seed);
            emit_event_end();
            return seed;
        }
        emit_event_start("bridge_seed_invalid");
        fputs(",\"value\":\"", stdout); json_escape(stdout, forced); fputs("\"", stdout);
        emit_event_end();
    } else if (forced && *forced) {
        emit_event_start("bridge_seed_ignored");
        fputs(",\"reason\":\"NETHACK_SEED requires NH_ELECTRON_TEST_FIXTURES build and runtime gate\"", stdout);
        emit_event_end();
    }

    unsigned long seed = 0UL;
    int random_rc = bridge_random(&seed, sizeof seed);
    if (random_rc || !seed) {
        fprintf(stderr, "Cannot obtain a secure random seed: %s\n",
                random_rc ? bridge_platform_error(random_rc) : "zero seed");
        exit(EXIT_FAILURE);
    }
    has_strong_rngseed = TRUE;
    emit_event_start("bridge_seed");
    fprintf(stdout, ",\"seed\":\"%lu\",\"source\":\"system\"", seed);
    emit_event_end();
    return seed;
}

static const char *va_string_arg(va_list *ap) { return va_arg(*ap, const char *); }
static int va_int_arg(va_list *ap) { return va_arg(*ap, int); }
static void *va_ptr_arg(va_list *ap) { return va_arg(*ap, void *); }

static int engulfment_monster_id(int glyph) {
    int offset;
    if (!glyph_is_swallow(glyph))
        return NON_PM;
    offset = glyph - GLYPH_SWALLOW_OFF;
    return offset / ((S_sw_br - S_sw_tl) + 1);
}


static const char *glyph_semantic_kind(int glyph) {
    if (glyph_is_monster(glyph)) return glyph_is_pet(glyph) ? "pet" : "monster";
    if (glyph_is_body(glyph)) return "corpse";
    if (glyph_is_statue(glyph)) return "statue";
    if (glyph_is_object(glyph)) return "object";
    if (glyph_is_swallow(glyph)) return "engulfment";
    if (glyph_is_trap(glyph)) return "trap";
    if (glyph_is_cmap(glyph)) {
        int cmap = glyph_to_cmap(glyph);
        if (is_cmap_engraving(cmap)) return "engraving";
        if (is_cmap_trap(cmap)) return "trap";
        if (is_cmap_drawbridge(cmap)) return "drawbridge";
        if (is_cmap_door(cmap)) return "door";
        if (is_cmap_wall(cmap)) return "wall";
        if (is_cmap_room(cmap)) return "floor";
        if (is_cmap_corr(cmap)) return "corridor";
        if (is_cmap_water(cmap)) return "water";
        if (is_cmap_lava(cmap)) return "lava";
        if (is_cmap_stairs(cmap)) return "stairs";
        if (is_cmap_furniture(cmap)) return "fixture";
        return "terrain";
    }
    if (glyph_is_warning(glyph)) return "warning";
    if (glyph_is_invisible(glyph)) return "invisible";
    if (glyph_is_unexplored(glyph)) return "unexplored";
    if (glyph_is_nothing(glyph)) return "nothing";
    return "unknown";
}

static const char *cmap_semantic_name(int cmap) {
    switch (cmap) {
    case S_stone: return "stone";
    case S_vwall: return "vertical wall";
    case S_hwall: return "horizontal wall";
    case S_tlcorn: return "top left corner wall";
    case S_trcorn: return "top right corner wall";
    case S_blcorn: return "bottom left corner wall";
    case S_brcorn: return "bottom right corner wall";
    case S_crwall: return "cross wall";
    case S_tuwall: return "tee up wall";
    case S_tdwall: return "tee down wall";
    case S_tlwall: return "tee left wall";
    case S_trwall: return "tee right wall";
    case S_ndoor: return "no door";
    case S_vodoor: return "vertical open door";
    case S_hodoor: return "horizontal open door";
    case S_vcdoor: return "vertical closed door";
    case S_hcdoor: return "horizontal closed door";
    case S_bars: return "iron bars";
    case S_tree: return "tree";
    case S_room: return "floor of a room";
    case S_darkroom: return "dark part of a room";
    case S_engroom: return "engraving in a room";
    case S_corr: return "dark corridor";
    case S_litcorr: return "lit corridor";
    case S_engrcorr: return "engraving in a corridor";
    case S_upstair: return "up stairs";
    case S_dnstair: return "down stairs";
    case S_upladder: return "up ladder";
    case S_dnladder: return "down ladder";
    case S_brupstair: return "branch staircase up";
    case S_brdnstair: return "branch staircase down";
    case S_brupladder: return "branch ladder up";
    case S_brdnladder: return "branch ladder down";
    case S_altar: return "altar";
    case S_grave: return "grave";
    case S_throne: return "throne";
    case S_sink: return "sink";
    case S_fountain: return "fountain";
    case S_pool: return "pool";
    case S_ice: return "ice";
    case S_lava: return "molten lava";
    case S_lavawall: return "wall of lava";
    case S_vodbridge: return "vertical open drawbridge";
    case S_hodbridge: return "horizontal open drawbridge";
    case S_vcdbridge: return "vertical closed drawbridge";
    case S_hcdbridge: return "horizontal closed drawbridge";
    case S_air: return "air";
    case S_cloud: return "cloud";
    case S_water: return "water";
    case S_arrow_trap: return "arrow trap";
    case S_dart_trap: return "dart trap";
    case S_falling_rock_trap: return "falling rock trap";
    case S_squeaky_board: return "squeaky board";
    case S_bear_trap: return "bear trap";
    case S_land_mine: return "land mine";
    case S_rolling_boulder_trap: return "rolling boulder trap";
    case S_sleeping_gas_trap: return "sleeping gas trap";
    case S_rust_trap: return "rust trap";
    case S_fire_trap: return "fire trap";
    case S_pit: return "pit";
    case S_spiked_pit: return "spiked pit";
    case S_hole: return "hole";
    case S_trap_door: return "trap door";
    case S_teleportation_trap: return "teleportation trap";
    case S_level_teleporter: return "level teleporter";
    case S_magic_portal: return "magic portal";
    case S_web: return "web";
    case S_statue_trap: return "statue trap";
    case S_magic_trap: return "magic trap";
    case S_anti_magic_trap: return "anti magic trap";
    case S_polymorph_trap: return "polymorph trap";
    case S_vibrating_square: return "vibrating square";
    case S_trapped_door: return "trapped door";
    case S_trapped_chest: return "trapped chest";
    case S_vbeam: return "vertical beam";
    case S_hbeam: return "horizontal beam";
    case S_lslant: return "left slant beam";
    case S_rslant: return "right slant beam";
    case S_digbeam: return "dig beam";
    case S_flashbeam: return "flash beam";
    case S_boomleft: return "boom left";
    case S_boomright: return "boom right";
    case S_ss1: return "shield1";
    case S_ss2: return "shield2";
    case S_ss3: return "shield3";
    case S_ss4: return "shield4";
    case S_poisoncloud: return "poison cloud";
    case S_goodpos: return "valid position";
    default: break;
    }
    return (cmap >= 0 && cmap < MAXPCHARS && defsyms[cmap].explanation) ? defsyms[cmap].explanation : NULL;
}

static const char *glyph_semantic_name(int glyph);

static void emit_action_affordances_array_at(int glyph, int x, int y) {
    const char *kind = glyph_semantic_kind(glyph);
    const char *name = glyph_semantic_name(glyph);
    int emitted = 0;
    fputc('[', stdout);
#define AFFORD(token) do { if (emitted++) fputc(',', stdout); fputc('"', stdout); fputs(token, stdout); fputc('"', stdout); } while (0)
    if (glyph_is_cmap(glyph)) {
        int cmap = glyph_to_cmap(glyph);
        if (is_cmap_door(cmap)) {
            AFFORD("door");
            if (cmap == S_vodoor || cmap == S_hodoor) AFFORD("door.open");
            if (cmap == S_vcdoor || cmap == S_hcdoor) AFFORD("door.closed");
            if (cmap == S_trapped_door) { AFFORD("door.closed"); AFFORD("door.trapped"); }
        }
        if (is_cmap_trap(cmap)) AFFORD("trap.known");
        if (cmap == S_fountain) AFFORD("fixture.fountain");
        if (cmap == S_sink) AFFORD("fixture.sink");
        if (cmap == S_altar) AFFORD("fixture.altar");
    }
    if (isok(x, y) && levl[x][y].typ == DOOR) {
        AFFORD("door");
        if (levl[x][y].doormask & D_ISOPEN) AFFORD("door.open");
        if (levl[x][y].doormask & (D_CLOSED | D_LOCKED | D_TRAPPED)) AFFORD("door.closed");
        if (levl[x][y].doormask & D_LOCKED) AFFORD("door.locked");
        if (levl[x][y].doormask & D_TRAPPED) AFFORD("door.trapped");
    }
    if (glyph_is_trap(glyph)) AFFORD("trap.known");
    if (glyph_is_object(glyph) && name && (strstr(name, "chest") || strstr(name, "box") || strstr(name, "bag") || strstr(name, "sack"))) AFFORD("container");
    if (isok(x, y)) {
        struct obj *otmp;
        boolean any_box = FALSE, any_locked_box = FALSE, any_trapped_box = FALSE, any_broken_box = FALSE;
        for (otmp = svl.level.objects[x][y]; otmp; otmp = otmp->nexthere) {
            if (Is_box(otmp)) {
                any_box = TRUE;
                if (otmp->olocked) any_locked_box = TRUE;
                if (otmp->otrapped) any_trapped_box = TRUE;
                if (otmp->obroken) any_broken_box = TRUE;
            }
        }
        if (any_box) AFFORD("container");
        (void) any_locked_box;
        (void) any_trapped_box;
        (void) any_broken_box;
    }
    if (!strcmp(kind, "monster") || !strcmp(kind, "pet")) {
        struct monst *mtmp = isok(x, y) ? m_at(x, y) : (struct monst *) 0;
        if (!Hallucination && mtmp) {
            if (mtmp->mtame || !strcmp(kind, "pet")) AFFORD("monster.attitude.tame");
            else if (mtmp->mpeaceful) AFFORD("monster.attitude.peaceful");
            else AFFORD("monster.attitude.hostile");
        } else {
            AFFORD("monster.hostile-unknown");
        }
        if (!strcmp(kind, "pet") || (mtmp && mtmp->mtame && !Hallucination))
            AFFORD("monster.pet");
        if (mtmp && mtmp->isshk && !Hallucination) {
            char recipient_token[64];
            AFFORD("monster.shopkeeper");
            snprintf(recipient_token, sizeof recipient_token,
                     "monster.shopkeeper.id.%u", mtmp->m_id);
            AFFORD(recipient_token);
        }
    }
#undef AFFORD
    fputc(']', stdout);
}

static void emit_action_affordances_array(int glyph) {
    emit_action_affordances_array_at(glyph, -1, -1);
}

static void emit_action_affordances_for_glyph_at(int glyph, int x, int y) {
    fputs(",\"actionAffordances\":", stdout);
    emit_action_affordances_array_at(glyph, x, y);
}

static void emit_action_affordances_for_glyph(int glyph) {
    emit_action_affordances_for_glyph_at(glyph, -1, -1);
}

static int glyph_exposes_public_location(int glyph, int background_glyph) {
    if (background_glyph != NO_GLYPH
        && !glyph_is_unexplored(background_glyph)
        && !glyph_is_nothing(background_glyph))
        return 1;
    return glyph_is_cmap(glyph)
        && !glyph_is_unexplored(glyph)
        && !glyph_is_nothing(glyph);
}

static const char *public_monster_size_label(const struct permonst *ptr);
static void emit_public_creature_look_fields_at(int glyph, int x, int y);

static struct trap *public_seen_trap_at(int x, int y) {
    struct trap *trap;

    if (!isok(x, y))
        return (struct trap *) 0;
    trap = t_at((coordxy) x, (coordxy) y);
    if (!trap || !trap->tseen)
        return (struct trap *) 0;
    return trap;
}

static int public_seen_trap_glyph_at(int x, int y) {
    struct trap *trap = public_seen_trap_at(x, y);

    return trap ? trap_to_glyph(trap) : NO_GLYPH;
}

static void emit_public_look_fields_at(int glyph, int background_glyph,
                                       int x, int y) {
    char feature_buf[BUFSZ];
    const char *feature = (const char *) 0;
    struct engr *ep;
    struct trap *trap;

    if (isok(x, y))
        emit_public_creature_look_fields_at(glyph, x, y);

    if (!isok(x, y))
        return;

    /* print_glyph only runs for visible/remembered map cells. Always surface the
       dungeon feature (stairs, altar, fountain, …) even when an object/monster
       glyph covers it — matching farlook “also here” information. */
    (void) background_glyph;
    feature = dfeature_at((coordxy) x, (coordxy) y, feature_buf);
    /* Discovered traps are not dfeature_at terrain. Prefer an explicit trap name
       when the foreground glyph is not already the trap itself. If a stairs or
       other feature is also present, keep that feature text and rely on the
       recovered trap background glyph for layering. */
    if (!glyph_is_trap(glyph)) {
        trap = public_seen_trap_at(x, y);
        if (trap && (!feature || !*feature)) {
            Strcpy(feature_buf, trapname(trap->ttyp, FALSE));
            feature = feature_buf;
        }
    }
    if (feature && *feature) {
        fputs(",\"featureDescription\":\"", stdout);
        json_escape(stdout, feature);
        fputc('\"', stdout);
    }
    ep = engr_at((coordxy) x, (coordxy) y);
    if (ep && ep->eread && ep->engr_txt[remembered_text][0]) {
        fputs(",\"engravingText\":\"", stdout);
        json_escape(stdout, ep->engr_txt[remembered_text]);
        fputc('\"', stdout);
    }
}

static const char *public_monster_size_label(const struct permonst *ptr) {
    if (!ptr) return NULL;
    switch (ptr->msize) {
    case MZ_TINY: return "tiny";
    case MZ_SMALL: return "small";
    case MZ_MEDIUM: return "medium";
    case MZ_LARGE: return "large";
    case MZ_HUGE: return "huge";
    case MZ_GIGANTIC: return "gigantic";
    default: return NULL;
    }
}

/* Farlook-parity creature facts only: attitude, visible status, and known-species size.
   Never emit HP/AC/level or other probing-only combat numbers. */
static void emit_public_creature_look_fields_at(int glyph, int x, int y) {
    struct monst *mtmp;
    const char *kind;
    const char *size_label = NULL;
    int emitted = 0;
    int accurate;
    char trapbuf[BUFSZ];

    if (!isok(x, y) || !glyph_is_monster(glyph))
        return;
    mtmp = m_at((coordxy) x, (coordxy) y);
    if (!mtmp)
        return;
    kind = glyph_semantic_kind(glyph);
    if (strcmp(kind, "monster") && strcmp(kind, "pet"))
        return;

    accurate = !Hallucination;
    fputs(",\"creaturePublic\":{", stdout);

    if (accurate) {
        const char *attitude = NULL;
        if (mtmp->mtame || glyph_is_pet(glyph))
            attitude = "tame";
        else if (mtmp->mpeaceful)
            attitude = "peaceful";
        else
            attitude = "hostile";
        fputs("\"attitude\":\"", stdout);
        json_escape(stdout, attitude);
        fputc('"', stdout);
        emitted = 1;
    }

    if (accurate && mtmp->data) {
        size_label = public_monster_size_label(mtmp->data);
        if (size_label) {
            if (emitted++) fputc(',', stdout);
            fputs("\"size\":\"", stdout);
            json_escape(stdout, size_label);
            fputc('"', stdout);
        }
    }

    fputs(emitted++ ? ",\"status\":[" : "\"status\":[", stdout);
    {
        int status_count = 0;
#define CREATURE_STATUS(token) do { \
            if (status_count++) fputc(',', stdout); \
            fputc('"', stdout); \
            fputs(token, stdout); \
            fputc('"', stdout); \
        } while (0)
        if (u.ustuck == mtmp) {
            if (u.uswallow || iflags.save_uswallow)
                CREATURE_STATUS(digests(mtmp->data) ? "swallowing you" : "engulfing you");
            else if (Upolyd && sticks(gy.youmonst.data))
                CREATURE_STATUS("being held");
            else
                CREATURE_STATUS("holding you");
        }
        if (mtmp->mfrozen)
            CREATURE_STATUS("can't move");
        else if (mtmp->msleeping)
            CREATURE_STATUS("asleep");
        else if ((mtmp->mstrategy & STRAT_WAITMASK) != 0)
            CREATURE_STATUS("meditating");
        if (mtmp->mleashed)
            CREATURE_STATUS("leashed to you");
        if (mtmp->mtrapped && cansee(mtmp->mx, mtmp->my)) {
            struct trap *t = t_at(mtmp->mx, mtmp->my);
            int tt = t ? t->ttyp : NO_TRAP;
            if (tt == BEAR_TRAP || is_pit(tt) || tt == WEB) {
                Snprintf(trapbuf, sizeof trapbuf, "trapped in %s",
                         an(trapname(tt, FALSE)));
                if (status_count++) fputc(',', stdout);
                fputc('"', stdout);
                json_escape(stdout, trapbuf);
                fputc('"', stdout);
            }
        }
#undef CREATURE_STATUS
    }
    fputc(']', stdout);
    fputc('}', stdout);
}

static const char *glyph_semantic_appearance(int glyph) {
    static char buf[BUFSZ];
    struct obj bareobj;
    int otyp;

    if (!glyph_is_object(glyph))
        return NULL;
    otyp = glyph_to_obj(glyph);
    if (otyp < 0 || otyp >= NUM_OBJECTS || objects[otyp].oc_name_known
        || !OBJ_DESCR(objects[otyp]))
        return NULL;
    bareobj = cg.zeroobj;
    bareobj.otyp = otyp;
    bareobj.oclass = objects[otyp].oc_class;
    bareobj.dknown = 1;
    bareobj.quan = 1L;
    bareobj.corpsenm = NON_PM;
    Snprintf(buf, sizeof buf, "%s", simpleonames(&bareobj));
    return buf;
}

static const char *object_semantic_appearance(const struct obj *otmp, int glyph) {
    static char buf[BUFSZ];

    if (!otmp)
        return glyph_semantic_appearance(glyph);
    if (otmp->otyp < 0 || otmp->otyp >= NUM_OBJECTS
        || objects[otmp->otyp].oc_name_known || !OBJ_DESCR(objects[otmp->otyp]))
        return NULL;
    Snprintf(buf, sizeof buf, "%s", simpleonames((struct obj *) otmp));
    return buf;
}

static void public_object_display_name(char *buf, size_t bufsz,
                                       struct obj *otmp, int glyph) {
    const char *display;

    if (!buf || !bufsz)
        return;
    display = otmp ? distant_name(otmp, otmp->dknown ? doname_with_price
                                                     : doname_vague_quan)
                   : glyph_semantic_appearance(glyph);
    Snprintf(buf, bufsz, "%s", display ? display : "item");
}

static struct obj *public_ground_object_for_glyph_at(int glyph, int x, int y) {
    struct obj *otmp;
    int otyp;
    if (!isok(x, y) || !glyph_is_object(glyph))
        return NULL;
    otyp = glyph_to_obj(glyph);
    for (otmp = svl.level.objects[x][y]; otmp; otmp = otmp->nexthere)
        if (otmp->dknown && otmp->otyp == otyp)
            return otmp;
    return NULL;
}

static void emit_public_ground_object_reference_at(int glyph, int x, int y) {
    struct obj *otmp = public_ground_object_for_glyph_at(glyph, x, y);
    char display[BUFSZ];
    if (!otmp)
        return;
    public_object_display_name(display, sizeof display, otmp, glyph);
    fprintf(stdout, ",\"objectId\":%u,\"displayName\":\"", otmp->o_id);
    json_escape(stdout, display);
    fputc('\"', stdout);
}

static int glyph_semantic_known(int glyph) {
    if (glyph_is_object(glyph)) {
        int obj = glyph_to_obj(glyph);
        return (obj >= 0 && obj < NUM_OBJECTS) ? (objects[obj].oc_name_known ? 1 : 0) : 1;
    }
    return 1;
}

static int object_type_is_graystone_public_group(int otyp) {
    return otyp == FLINT || otyp == TOUCHSTONE || otyp == LUCKSTONE || otyp == LOADSTONE;
}

static int should_redact_object_glyph_for_public_boundary(int glyph) {
    if (glyph_is_object(glyph)) {
        int obj = glyph_to_obj(glyph);
        return obj >= 0 && obj < NUM_OBJECTS
            && object_type_is_graystone_public_group(obj)
            && !objects[obj].oc_name_known;
    }
    return 0;
}

static void emit_public_glyph_field(const char *field, int glyph) {
    if (should_redact_object_glyph_for_public_boundary(glyph))
        return;
    fprintf(stdout, ",\"%s\":%d", field, glyph);
}

static void emit_public_tileidx_field(const glyph_info *gi) {
    if (!gi || should_redact_object_glyph_for_public_boundary(gi->glyph))
        return;
    fprintf(stdout, ",\"tileidx\":%d", gi->gm.tileidx);
}

static int should_redact_public_object_identity_surface(const struct obj *otmp) {
    return otmp && object_type_is_graystone_public_group(otmp->otyp)
        && !objects[otmp->otyp].oc_name_known;
}

static void emit_unknown_graystone_public_actions(void) {
    fputs("[\"hold\",\"quiver\",\"engrave\",\"rub\",\"throw\",\"drop\",\"name\",\"inspect\"]", stdout);
}

static const char *glyph_semantic_name(int glyph) {
    if (glyph_is_monster(glyph)) {
        int mon = glyph_to_mon(glyph);
        return (mon >= 0 && mon < NUMMONS) ? pmname(&mons[mon], NEUTRAL) : NULL;
    }
    if (glyph_is_body(glyph)) {
        int mon = glyph_to_body_corpsenm(glyph);
        return (mon >= 0 && mon < NUMMONS) ? pmname(&mons[mon], NEUTRAL) : "corpse";
    }
    if (glyph_is_statue(glyph)) {
        int mon = glyph_to_statue_corpsenm(glyph);
        return (mon >= 0 && mon < NUMMONS) ? pmname(&mons[mon], NEUTRAL) : "statue";
    }
    if (glyph_is_object(glyph)) {
        int obj = glyph_to_obj(glyph);
        return (obj >= 0 && obj < NUM_OBJECTS) ? OBJ_NAME(objects[obj]) : NULL;
    }
    if (glyph_is_swallow(glyph)) {
        int mon = engulfment_monster_id(glyph);
        return (mon >= LOW_PM && mon < NUMMONS) ? pmname(&mons[mon], NEUTRAL)
                                                : "engulfing monster";
    }
    if (glyph_is_trap(glyph)) {
        const char *name = cmap_semantic_name(trap_to_defsym(glyph_to_trap(glyph)));
        return name ? name : "trap";
    }
    if (glyph_is_cmap(glyph)) {
        const char *name = cmap_semantic_name(glyph_to_cmap(glyph));
        return name ? name : "terrain";
    }
    if (glyph_is_warning(glyph)) return "warning";
    if (glyph_is_invisible(glyph)) return "invisible monster";
    if (glyph_is_unexplored(glyph)) return "unexplored";
    if (glyph_is_nothing(glyph)) return "nothing";
    return NULL;
}

static void emit_object_layer_fields_at(int top_glyph, int x, int y) {
    struct obj *otmp;
    int glyph, glyph_char;
    const char *appearance;
    char buf[8] = {0};
    if (!isok(x, y) || glyph_is_object(top_glyph))
        return;
    otmp = svl.level.objects[x][y];
    if (!otmp || !otmp->dknown)
        return;
    glyph = obj_to_glyph(otmp, rn2_on_display_rng);
    glyph_char = ((int) otmp->oclass >= 0 && (int) otmp->oclass < MAXOCLASSES) ? def_oc_syms[(int) otmp->oclass].sym : 0;
    emit_public_glyph_field("objectLayerGlyph", glyph);
    fputs(",\"objectLayerChar\":\"", stdout);
    if (glyph_char > 0 && glyph_char < 128 && isprint((unsigned char) glyph_char))
        buf[0] = (char) glyph_char;
    else
        buf[0] = ')';
    json_escape(stdout, buf);
    fputs("\",\"objectLayerSemanticKind\":\"object\",\"objectLayerSemanticKnown\":", stdout);
    int object_layer_known = glyph_semantic_known(glyph);
    fputs(object_layer_known ? "true" : "false", stdout);
    if (object_layer_known) { fputs(",\"objectLayerSemanticName\":\"", stdout); json_escape(stdout, glyph_semantic_name(glyph)); fputs("\"", stdout); }
    appearance = object_semantic_appearance(otmp, glyph);
    if (appearance) { fputs(",\"objectLayerSemanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
    {
        char display[BUFSZ];
        public_object_display_name(display, sizeof display, otmp, glyph);
        fprintf(stdout, ",\"objectLayerObjectId\":%u,\"objectLayerDisplayName\":\"", otmp->o_id);
        json_escape(stdout, display);
        fputc('\"', stdout);
    }
    fputs(",\"objectLayerActionAffordances\":", stdout);
    emit_action_affordances_array_at(glyph, x, y);
}

static int public_ground_object_count_at(int x, int y) {
    int count = 0;
    struct obj *otmp;
    if (!isok(x, y)) return 0;
    for (otmp = svl.level.objects[x][y]; otmp; otmp = otmp->nexthere) {
        if (otmp->dknown) count++;
    }
    return count;
}

static int should_emit_ground_pile_snapshot_at(int x, int y) {
    if (!isok(x, y)) return 0;
    return public_ground_object_count_at(x, y) > 0 || ground_pile_snapshot_known[x][y];
}

static void emit_object_public_action_affordances_array(const struct obj *otmp) {
    const char *tokens[80];
    char unpaid_owner_token[64] = {0};
    int count = 0;
#define OBJ_AFFORD(token) do { \
        int seen = 0; \
        for (int ti = 0; ti < count; ++ti) if (!strcmp(tokens[ti], token)) { seen = 1; break; } \
        if (!seen && count < (int) (sizeof tokens / sizeof tokens[0])) tokens[count++] = token; \
    } while (0)
    if (!otmp) {
        fputs("[]", stdout);
        return;
    }
    if (should_redact_public_object_identity_surface(otmp)) {
        emit_unknown_graystone_public_actions();
        return;
    }
    struct obj *obj = (struct obj *) otmp;

    if (otmp->owornmask & W_QUIVER) {
        OBJ_AFFORD("quiver");
        OBJ_AFFORD("fire");
        OBJ_AFFORD("throw");
    }
    if (otmp->owornmask & W_SWAPWEP) {
        OBJ_AFFORD("swap");
        OBJ_AFFORD("wield");
    }
    if (otmp->owornmask & W_WEP) {
        OBJ_AFFORD("wield");
        OBJ_AFFORD("wielded");
    }
    if (otmp->owornmask & W_ARMOR) OBJ_AFFORD("takeOff");
    if (otmp->owornmask & W_ACCESSORY) OBJ_AFFORD("remove");

    if (!(otmp->owornmask & (W_ARMOR | W_ACCESSORY | W_WEP | W_SWAPWEP | W_QUIVER))) {
        if (otmp->oclass == ARMOR_CLASS) {
            OBJ_AFFORD("wear");
            if (is_helmet(obj)) OBJ_AFFORD("wear.helmet");
            else if (is_gloves(obj)) OBJ_AFFORD("wear.gloves");
            else if (is_shirt(obj)) OBJ_AFFORD("wear.shirt");
            else if (is_cloak(obj)) OBJ_AFFORD("wear.cloak");
            else if (is_boots(obj)) OBJ_AFFORD("wear.boots");
            else if (is_shield(obj)) OBJ_AFFORD("wear.shield");
            else if (is_suit(obj)) OBJ_AFFORD("wear.body");
        }
        if (otmp->oclass == RING_CLASS) { OBJ_AFFORD("putOn"); OBJ_AFFORD("putOn.ring"); }
        if (otmp->oclass == AMULET_CLASS) { OBJ_AFFORD("putOn"); OBJ_AFFORD("putOn.amulet"); }
        if (otmp->otyp == BLINDFOLD || otmp->otyp == LENSES || otmp->otyp == TOWEL) { OBJ_AFFORD("putOn"); OBJ_AFFORD("putOn.eyes"); }
        if (otmp->oclass == WEAPON_CLASS || is_weptool(obj)) OBJ_AFFORD("wield");
        else if (otmp->oclass != VENOM_CLASS) OBJ_AFFORD("hold");
        if (is_ammo(obj)) OBJ_AFFORD("quiver");
    }

    if (otmp->oclass == FOOD_CLASS) OBJ_AFFORD("eat");
    if (otmp->oclass == POTION_CLASS) OBJ_AFFORD("quaff");
    if (otmp->oclass == SCROLL_CLASS) OBJ_AFFORD("read");
    if (otmp->oclass == SPBOOK_CLASS) { OBJ_AFFORD("study"); OBJ_AFFORD("read"); }
    if (otmp->oclass == WAND_CLASS) { OBJ_AFFORD("zap"); OBJ_AFFORD("apply"); }
    if (otmp->oclass == TOOL_CLASS || otmp->oclass == WAND_CLASS || otmp->oclass == COIN_CLASS) OBJ_AFFORD("apply");
    if (otmp->oclass == WEAPON_CLASS || is_weptool(obj) || otmp->oclass == WAND_CLASS || otmp->oclass == TOOL_CLASS || otmp->oclass == GEM_CLASS || otmp->oclass == RING_CLASS) OBJ_AFFORD("engrave");
    if (otmp->otyp == OIL_LAMP || otmp->otyp == MAGIC_LAMP || otmp->otyp == BRASS_LANTERN || is_graystone(obj) || otmp->otyp == LUMP_OF_ROYAL_JELLY) OBJ_AFFORD("rub");
    if (!(otmp->owornmask & (W_ARMOR | W_ACCESSORY | W_WEP | W_SWAPWEP)) && (otmp->oclass == WEAPON_CLASS || is_weptool(obj) || otmp->oclass == GEM_CLASS || otmp->oclass == RING_CLASS || otmp->oclass == AMULET_CLASS || otmp->oclass == ARMOR_CLASS || otmp->oclass == FOOD_CLASS || otmp->oclass == POTION_CLASS || otmp->oclass == SCROLL_CLASS || otmp->oclass == SPBOOK_CLASS || otmp->oclass == TOOL_CLASS)) OBJ_AFFORD("throw");
    if (Is_container(obj)) { OBJ_AFFORD("container"); OBJ_AFFORD("loot"); }
    if (otmp->unpaid) {
        struct monst *shkp;
        OBJ_AFFORD("pay");
        OBJ_AFFORD("shop.unpaid");
        for (shkp = fmon; shkp; shkp = shkp->nmon) {
            if (shkp->isshk && has_eshk(shkp)
                && onshopbill(obj, shkp, TRUE)) {
                snprintf(unpaid_owner_token, sizeof unpaid_owner_token,
                         "shop.unpaid.owner.%u", shkp->m_id);
                OBJ_AFFORD(unpaid_owner_token);
                break;
            }
        }
    }
    if (!(otmp->owornmask & (W_ARMOR | W_ACCESSORY | W_WEP | W_SWAPWEP)) && otmp->oclass != VENOM_CLASS) OBJ_AFFORD("drop");
    OBJ_AFFORD("name");
    OBJ_AFFORD("inspect");
#undef OBJ_AFFORD

    fputc('[', stdout);
    for (int i = 0; i < count; ++i) {
        if (i) fputc(',', stdout);
        fputc('"', stdout);
        json_escape(stdout, tokens[i]);
        fputc('"', stdout);
    }
    fputc(']', stdout);
}

static void emit_action_affordances_for_object(const struct obj *otmp) {
    fputs(",\"actionAffordances\":", stdout);
    emit_object_public_action_affordances_array(otmp);
}

/* UXM-05 protocol slot 1.  These fields are derived only from public object
 * class, worn state, and NetHack's own knowledge flags.  Hidden object type
 * identity is never serialized. */
static const char *public_item_class(const struct obj *otmp) {
    if (!otmp) return "other";
    switch (otmp->oclass) {
    case WEAPON_CLASS: return "weapon";
    case ARMOR_CLASS: return "armor";
    case FOOD_CLASS: return "food";
    case POTION_CLASS: return "potion";
    case SCROLL_CLASS: return "scroll";
    case SPBOOK_CLASS: return "spellbook";
    case WAND_CLASS: return "wand";
    case RING_CLASS: return "ring";
    case AMULET_CLASS: return "amulet";
    case TOOL_CLASS: return "tool";
    case GEM_CLASS: return "gem";
    case COIN_CLASS: return "coin";
    default: return "other";
    }
}

static void emit_public_item_filter_groups(const struct obj *otmp) {
    int emitted = 0;
#define ITEM_FILTER(token) do { if (emitted++) fputc(',', stdout); fputs("\"" token "\"", stdout); } while (0)
    fputc('[', stdout);
    if (otmp && !should_redact_public_object_identity_surface(otmp) && otmp->owornmask) ITEM_FILTER("equipped");
    if (otmp) {
        if (otmp->oclass == WEAPON_CLASS) ITEM_FILTER("weapons");
        if (otmp->oclass == ARMOR_CLASS) ITEM_FILTER("armor");
        if (otmp->oclass == FOOD_CLASS || otmp->oclass == POTION_CLASS || otmp->oclass == SCROLL_CLASS) ITEM_FILTER("consumables");
        if (otmp->oclass == POTION_CLASS || otmp->oclass == SCROLL_CLASS || otmp->oclass == SPBOOK_CLASS || otmp->oclass == WAND_CLASS || otmp->oclass == RING_CLASS || otmp->oclass == AMULET_CLASS) ITEM_FILTER("magic");
    }
    fputc(']', stdout);
#undef ITEM_FILTER
}

static void emit_public_item_equipment_slots(const struct obj *otmp) {
    int emitted = 0;
#define ITEM_SLOT(token) do { if (emitted++) fputc(',', stdout); fputs("\"" token "\"", stdout); } while (0)
    fputc('[', stdout);
    if (otmp) {
        if (otmp->oclass == WEAPON_CLASS || is_weptool(otmp)) { ITEM_SLOT("mainHand"); ITEM_SLOT("offHand"); }
        if (is_ammo(otmp)) ITEM_SLOT("quiver");
        if (otmp->oclass == ARMOR_CLASS) {
            if (is_helmet(otmp)) ITEM_SLOT("armor.helm");
            else if (is_gloves(otmp)) ITEM_SLOT("armor.gloves");
            else if (is_shirt(otmp)) ITEM_SLOT("armor.shirt");
            else if (is_cloak(otmp)) ITEM_SLOT("armor.cloak");
            else if (is_boots(otmp)) ITEM_SLOT("armor.boots");
            else if (is_shield(otmp)) { ITEM_SLOT("armor.shield"); ITEM_SLOT("offHand"); }
            else if (is_suit(otmp)) ITEM_SLOT("armor.body");
        }
        if (otmp->oclass == RING_CLASS) { ITEM_SLOT("ring.left"); ITEM_SLOT("ring.right"); }
        if (otmp->oclass == AMULET_CLASS) ITEM_SLOT("amulet");
        if (otmp->otyp == BLINDFOLD || otmp->otyp == LENSES || otmp->otyp == TOWEL) ITEM_SLOT("eyes");
    }
    fputc(']', stdout);
#undef ITEM_SLOT
}

static void emit_public_item_known_fields(const struct obj *otmp) {
    int emitted = 0;
#define KNOWN_FIELD_PREFIX() do { if (emitted++) fputc(',', stdout); } while (0)
    fputc('{', stdout);
    if (otmp && !should_redact_public_object_identity_surface(otmp)) {
        if (otmp->bknown) {
            KNOWN_FIELD_PREFIX();
            fputs("\"beatitude\":\"", stdout);
            fputs(otmp->blessed ? "blessed" : (otmp->cursed ? "cursed" : "uncursed"), stdout);
            fputc('\"', stdout);
        }
        if (otmp->known && otmp->spe >= 0 && objects[otmp->otyp].oc_charged && (otmp->oclass == WAND_CLASS || otmp->oclass == TOOL_CLASS)) {
            KNOWN_FIELD_PREFIX(); fprintf(stdout, "\"charges\":%d", (int) otmp->spe);
        } else if (otmp->known && (otmp->oclass == WEAPON_CLASS || otmp->oclass == ARMOR_CLASS || otmp->oclass == RING_CLASS || is_weptool(otmp))) {
            KNOWN_FIELD_PREFIX(); fprintf(stdout, "\"enchantment\":%d", (int) otmp->spe);
        }
        if (otmp->oeroded) { KNOWN_FIELD_PREFIX(); fprintf(stdout, "\"erosion\":%u", (unsigned) otmp->oeroded); }
        if (otmp->oeroded2) { KNOWN_FIELD_PREFIX(); fprintf(stdout, "\"corrosion\":%u", (unsigned) otmp->oeroded2); }
        if (otmp->opoisoned) { KNOWN_FIELD_PREFIX(); fputs("\"poisoned\":true", stdout); }
    }
    fputc('}', stdout);
#undef KNOWN_FIELD_PREFIX
}

static void emit_public_item_presentation_fields(const struct obj *otmp) {
    fputs(",\"publicClass\":\"", stdout);
    json_escape(stdout, public_item_class(otmp));
    fputs("\",\"filterGroups\":", stdout);
    emit_public_item_filter_groups(otmp);
    fputs(",\"equipmentSlots\":", stdout);
    emit_public_item_equipment_slots(otmp);
    fputs(",\"knownFields\":", stdout);
    emit_public_item_known_fields(otmp);
    fputs(",\"ownership\":{\"state\":\"", stdout);
    fputs(otmp && otmp->unpaid ? "unpaid" : "owned", stdout);
    fputs("\"}", stdout);
    if (otmp && ((objects[otmp->otyp].oc_uname && *objects[otmp->otyp].oc_uname) || (has_oname(otmp) && *ONAME(otmp)))) {
        fputs(",\"known\":{\"naming\":true}", stdout);
    }
    if (otmp && objects[otmp->otyp].oc_uname && *objects[otmp->otyp].oc_uname) {
        fputs(",\"calledName\":\"", stdout); json_escape(stdout, objects[otmp->otyp].oc_uname); fputc('\"', stdout);
    }
    if (otmp && has_oname(otmp) && *ONAME(otmp)) {
        fputs(",\"individualName\":\"", stdout); json_escape(stdout, ONAME(otmp)); fputc('\"', stdout);
    }
}

static void emit_public_ground_display_name(char *buf, size_t bufsz, struct obj *otmp, int glyph) {
    if (!buf || !bufsz) return;
    buf[0] = '\0';
    if (otmp && Is_container(otmp)) {
        const char *base = OBJ_NAME(objects[otmp->otyp]);
        Snprintf(buf, bufsz, "%s%s", (otmp->quan == 1L) ? "a " : "", base ? base : "container");
        return;
    }
    public_object_display_name(buf, bufsz, otmp, glyph);
}

static void emit_ground_object_json(struct obj *otmp, int x, int y) {
    char namebuf[BUFSZ];
    char glyph_char_buf[8] = {0};
    const char *appearance;
    int glyph, glyph_char, semantic_known;

    glyph = obj_to_glyph(otmp, rn2_on_display_rng);
    emit_public_ground_display_name(namebuf, sizeof namebuf, otmp, glyph);
    glyph_char = ((int) otmp->oclass >= 0 && (int) otmp->oclass < MAXOCLASSES) ? def_oc_syms[(int) otmp->oclass].sym : 0;
    glyph_char_buf[0] = (glyph_char > 0 && glyph_char < 128 && isprint((unsigned char) glyph_char)) ? (char) glyph_char : '?';

    fprintf(stdout, "{\"objectId\":%u,\"displayName\":\"", otmp->o_id);
    json_escape(stdout, namebuf);
    fprintf(stdout, "\",\"quantity\":%ld", otmp->quan);
    emit_public_glyph_field("glyph", glyph);
    fprintf(stdout, ",\"glyphChar\":%d,\"objectClass\":\"", glyph_char);
    json_escape(stdout, glyph_char_buf);
    fputs("\",\"semanticKind\":\"object\",\"semanticKnown\":", stdout);
    semantic_known = glyph_semantic_known(glyph);
    fputs(semantic_known ? "true" : "false", stdout);
    if (semantic_known) {
        fputs(",\"semanticName\":\"", stdout);
        json_escape(stdout, glyph_semantic_name(glyph));
        fputs("\"", stdout);
    }
    appearance = object_semantic_appearance(otmp, glyph);
    if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
    emit_action_affordances_for_object(otmp);
    emit_public_item_presentation_fields(otmp);
    fputc('}', stdout);
}

static void emit_ground_pile_snapshot_event(int window, int x, int y) {
    int emitted = 0;
    struct obj *otmp;
    unsigned long revision;
    if (!should_emit_ground_pile_snapshot_at(x, y)) return;
    revision = ++ground_pile_revision;
    emit_event_start("shim_ground_pile_snapshot");
    fprintf(stdout, ",\"window\":%d,\"x\":%d,\"y\":%d,\"revision\":%lu,\"coord\":{\"x\":%d,\"y\":%d},\"source\":\"level.objects\",\"authoritative\":true,\"items\":[", window, x, y, revision, x, y);
    for (otmp = svl.level.objects[x][y]; otmp; otmp = otmp->nexthere) {
        if (!otmp->dknown) continue;
        if (emitted++) fputc(',', stdout);
        emit_ground_object_json(otmp, x, y);
    }
    fputs("]", stdout);
    emit_event_end();
    ground_pile_snapshot_known[x][y] = emitted > 0;
}

static struct obj *find_known_object_ptr_in_chain(struct obj *chain, const struct obj *wanted, int contained_ok) {
    for (struct obj *otmp = chain; otmp; otmp = otmp->nobj) {
        if (otmp == wanted) return otmp;
        if (contained_ok && otmp->cobj) {
            struct obj *nested = find_known_object_ptr_in_chain(otmp->cobj, wanted, contained_ok);
            if (nested) return nested;
        }
    }
    return NULL;
}

static struct obj *find_known_object_ptr(const struct obj *wanted) {
    if (!wanted) return NULL;
    struct obj *found = find_known_object_ptr_in_chain(gi.invent, wanted, 1);
    if (found) return found;
    for (int x = 0; x < COLNO; ++x)
        for (int y = 0; y < ROWNO; ++y) {
            found = find_known_object_ptr_in_chain(svl.level.objects[x][y], wanted, 1);
            if (found) return found;
        }
    return NULL;
}

static struct obj *find_inventory_object_for_classic_menu(int selector, int glyph) {
    int glyph_type = glyph_is_object(glyph) ? glyph_to_obj(glyph) : STRANGE_OBJECT;
    if (selector <= 0 || glyph_type == STRANGE_OBJECT) return NULL;
    for (struct obj *otmp = gi.invent; otmp; otmp = otmp->nobj)
        if ((int) otmp->invlet == selector && otmp->otyp == glyph_type)
            return otmp;
    return NULL;
}

static struct obj *floor_container_by_public_id(unsigned int container_id) {
    if (!isok(u.ux, u.uy)) return NULL;
    for (struct obj *otmp = svl.level.objects[u.ux][u.uy]; otmp; otmp = otmp->nexthere)
        if (Is_container(otmp) && otmp->o_id == container_id) return otmp;
    return NULL;
}

static void emit_container_item_json(struct obj *otmp) {
    char namebuf[BUFSZ];
    char glyph_char_buf[8] = {0};
    int glyph = obj_to_glyph(otmp, rn2_on_display_rng);
    int glyph_char = ((int) otmp->oclass >= 0 && (int) otmp->oclass < MAXOCLASSES) ? def_oc_syms[(int) otmp->oclass].sym : 0;
    int semantic_known = glyph_semantic_known(glyph);
    glyph_char_buf[0] = (glyph_char > 0 && glyph_char < 128 && isprint((unsigned char) glyph_char)) ? (char) glyph_char : '?';
    public_object_display_name(namebuf, sizeof namebuf, otmp, glyph);
    fprintf(stdout, "{\"objectId\":%u,\"displayName\":\"", otmp->o_id);
    json_escape(stdout, namebuf);
    fprintf(stdout, "\",\"quantity\":%ld", otmp->quan);
    emit_public_glyph_field("glyph", glyph);
    fprintf(stdout, ",\"glyphChar\":%d,\"objectClass\":\"", glyph_char);
    json_escape(stdout, glyph_char_buf);
    fputs("\",\"semanticKind\":\"object\",\"semanticKnown\":", stdout);
    fputs(semantic_known ? "true" : "false", stdout);
    if (semantic_known) { fputs(",\"semanticName\":\"", stdout); json_escape(stdout, glyph_semantic_name(glyph)); fputs("\"", stdout); }
    const char *appearance = object_semantic_appearance(otmp, glyph);
    if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
    emit_action_affordances_for_object(otmp);
    emit_public_item_presentation_fields(otmp);
    fputc('}', stdout);
}

static void emit_container_contents_snapshot_for(struct obj *container, const char *session_id, const char *transaction_id) {
    if (!container || !Is_container(container) || !container->cknown) return;
    unsigned long revision = ++container_contents_revision;
    const char *base = OBJ_NAME(objects[container->otyp]);
    char fallback_session[96];
    snprintf(fallback_session, sizeof fallback_session, "container-%u", container->o_id);
    emit_event_start("shim_container_contents_snapshot");
    fprintf(stdout, ",\"revision\":%lu,\"sessionId\":\"", revision);
    json_escape(stdout, session_id && *session_id ? session_id : fallback_session);
    fputs("\",\"container\":{\"publicId\":\"", stdout);
    json_escape(stdout, fallback_session);
    fputs("\",\"displayName\":\"", stdout);
    json_escape(stdout, base ? base : "container");
    fprintf(stdout, "\",\"objectId\":%u},\"items\":[", container->o_id);
    int emitted = 0;
    for (struct obj *otmp = container->cobj; otmp; otmp = otmp->nobj) {
        if (emitted++) fputc(',', stdout);
        emit_container_item_json(otmp);
    }
    fputs("]", stdout);
    if (transaction_id && *transaction_id) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, transaction_id); fputs("\"", stdout); }
    emit_event_end();
}

static int is_generic_floor_background_glyph(int glyph) {
    int cmap;

    if (glyph == NO_GLYPH || glyph_is_unexplored(glyph) || glyph_is_nothing(glyph))
        return 1;
    if (!glyph_is_cmap(glyph))
        return 0;
    cmap = glyph_to_cmap(glyph);
    return is_cmap_room(cmap) || is_cmap_corr(cmap) || cmap == S_stone;
}

static int is_special_location_background_glyph(int glyph) {
    int cmap;

    if (!glyph_is_cmap(glyph))
        return 0;
    cmap = glyph_to_cmap(glyph);
    return is_cmap_stairs(cmap)
        || is_cmap_furniture(cmap)
        || is_cmap_trap(cmap)
        || is_cmap_door(cmap)
        || is_cmap_drawbridge(cmap)
        || is_cmap_water(cmap)
        || is_cmap_lava(cmap)
        || is_cmap_engraving(cmap)
        || cmap == S_tree
        || cmap == S_grave
        || cmap == S_sink
        || cmap == S_bars
        || cmap == S_cloud
        || cmap == S_air
        || cmap == S_water;
}

static int effective_background_glyph_at(int x, int y, const glyph_info *bgi) {
    int background_glyph = bgi ? bgi->glyph : NO_GLYPH;
    int terrain_glyph;
    int trap_glyph;

    if (!isok(x, y))
        return background_glyph;

    terrain_glyph = back_to_glyph(x, y);
    if (terrain_glyph != NO_GLYPH
        && (background_glyph == NO_GLYPH
            || glyph_is_unexplored(background_glyph)
            || glyph_is_nothing(background_glyph)
            || (is_special_location_background_glyph(terrain_glyph)
                && is_generic_floor_background_glyph(background_glyph))))
        background_glyph = terrain_glyph;

    /* back_to_glyph never returns traps. If a trap is already discovered (tseen)
       and the displayed background is only generic floor, expose the trap glyph
       so tooltips/layers can list it under objects and monsters. */
    trap_glyph = public_seen_trap_glyph_at(x, y);
    if (trap_glyph != NO_GLYPH
        && (background_glyph == NO_GLYPH
            || glyph_is_unexplored(background_glyph)
            || glyph_is_nothing(background_glyph)
            || is_generic_floor_background_glyph(background_glyph)))
        background_glyph = trap_glyph;

    return background_glyph;
}

static void emit_print_glyph_fields(int win, int x, int y, const glyph_info *gi, const glyph_info *bgi) {
    int ttychar = gi ? gi->ttychar : ' ';
    int glyph = gi ? gi->glyph : NO_GLYPH;
    int background_glyph = effective_background_glyph_at(x, y, bgi);
    int has_background_glyph = background_glyph != NO_GLYPH;
    glyph_info derived_background_info;
    const glyph_info *background_info = bgi;
    if (has_background_glyph && (!background_info || background_info->glyph != background_glyph)) {
        memset(&derived_background_info, 0, sizeof derived_background_info);
        map_glyphinfo((coordxy) x, (coordxy) y, background_glyph, 0U, &derived_background_info);
        background_info = &derived_background_info;
    }
    int hero_cell = isok(x, y) && x == u.ux && y == u.uy;
    char buf[8] = {0};
    fprintf(stdout, ",\"window\":%d,\"x\":%d,\"y\":%d", win, x, y);
    emit_public_glyph_field("glyph", glyph);
    fprintf(stdout, ",\"ttychar\":%d,\"color\":%d", ttychar, gi ? gi->gm.sym.color : -1);
    emit_public_tileidx_field(gi);
    fprintf(stdout, ",\"glyphFlags\":%u", gi ? gi->gm.glyphflags : 0U);
    if (has_background_glyph) emit_public_glyph_field("backgroundGlyph", background_glyph);
    else fputs(",\"backgroundGlyph\":-1", stdout);
    if (has_background_glyph && background_info && background_info->ttychar > 0 && background_info->ttychar < 128 && isprint((unsigned char) background_info->ttychar)) {
        char background_char[2] = { (char) background_info->ttychar, '\0' };
        fputs(",\"backgroundChar\":\"", stdout);
        json_escape(stdout, background_char);
        fputs("\"", stdout);
    }
    if (glyph_is_cmap(glyph)) fprintf(stdout, ",\"cmapIndex\":%d", glyph_to_cmap(glyph));
    fputs(",\"semanticKind\":\"", stdout);
    json_escape(stdout, hero_cell ? "hero" : glyph_semantic_kind(glyph));
    int semantic_known = hero_cell ? 1 : glyph_semantic_known(glyph);
    fprintf(stdout, "\",\"semanticKnown\":%s", semantic_known ? "true" : "false");
    if (semantic_known) { fputs(",\"semanticName\":\"", stdout); json_escape(stdout, hero_cell ? "hero" : glyph_semantic_name(glyph)); fputs("\"", stdout); }
    const char *appearance = hero_cell ? NULL : glyph_semantic_appearance(glyph);
    if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
    emit_public_ground_object_reference_at(glyph, x, y);
    if (hero_cell) fputs(",\"actionAffordances\":[]", stdout);
    else emit_action_affordances_for_glyph_at(glyph, x, y);
    if (hero_cell) {
        fputs(",\"actorId\":\"hero\"", stdout);
    } else if (isok(x, y) && glyph_is_monster(glyph)) {
        struct monst *actor = m_at((coordxy) x, (coordxy) y);
        if (actor) fprintf(stdout, ",\"actorId\":\"monster-%u\"", actor->m_id);
    }
    emit_object_layer_fields_at(glyph, x, y);
    if (should_emit_ground_pile_snapshot_at(x, y)) fputs(",\"groundPileSnapshotAuthoritative\":true", stdout);
    if (has_background_glyph) {
        int background_known = glyph_semantic_known(background_glyph);
        fputs(",\"backgroundSemanticKind\":\"", stdout);
        json_escape(stdout, glyph_semantic_kind(background_glyph));
        fprintf(stdout, "\",\"backgroundSemanticKnown\":%s", background_known ? "true" : "false");
        if (background_known) { fputs(",\"backgroundSemanticName\":\"", stdout); json_escape(stdout, glyph_semantic_name(background_glyph)); fputs("\"", stdout); }
        fputs(",\"backgroundActionAffordances\":", stdout);
        emit_action_affordances_array_at(background_glyph, x, y);
    }
    emit_public_look_fields_at(glyph, background_glyph, x, y);
    fputs(",\"char\":\"", stdout);
    if (ttychar > 0 && ttychar < 128 && isprint((unsigned char) ttychar)) { buf[0] = (char) ttychar; }
    else { buf[0] = ' '; }
    json_escape(stdout, buf); fputs("\"", stdout);
}

static int extcmd_select_by_name(const char *needle) {
    if (!needle || !*needle) return -1;
    int match = -1;
    size_t len = strlen(needle);
    for (int i = 0; extcmdlist[i].ef_txt; ++i) {
        int internal = (extcmdlist[i].flags & INTERNALCMD) != 0;
        if (extcmdlist[i].flags & CMD_NOT_AVAILABLE) continue;
        if (internal) {
            if (direct_command_is_active(BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER)
                && !strcmp(needle, "shimgroundtransfer")
                && !strcmp(extcmdlist[i].ef_txt, "shimgroundtransfer"))
                return i;
            if (direct_command_is_active(BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER)
                && !strcmp(needle, "shimcontainertransfer")
                && !strcmp(extcmdlist[i].ef_txt, "shimcontainertransfer"))
                return i;
            if (direct_command_is_active(BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT)
                && !strcmp(needle, "shimcontainersnapshot")
                && !strcmp(extcmdlist[i].ef_txt, "shimcontainersnapshot"))
                return i;
            if (direct_command_is_active(BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE)
                && !strcmp(needle, "shimequipmentchange")
                && !strcmp(extcmdlist[i].ef_txt, "shimequipmentchange"))
                return i;
            if (direct_command_is_active(BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION)
                && !strcmp(needle, "shimterrainaction")
                && !strcmp(extcmdlist[i].ef_txt, "shimterrainaction"))
                return i;
            continue;
        }
        if (!strcmpi(needle, extcmdlist[i].ef_txt)) return i;
        if (!strncmpi(needle, extcmdlist[i].ef_txt, len)) {
            if (match != -1) return -1; /* ambiguous prefix */
            match = i;
        }
    }
    return match;
}

static void emit_extcmd_catalog(void) {
    emit_event_start("bridge_extcmd_catalog");
    fputs(",\"commands\":[", stdout);
    int emitted = 0;
    for (int i = 0; extcmdlist[i].ef_txt; ++i) {
        if (extcmdlist[i].flags & (CMD_NOT_AVAILABLE | INTERNALCMD)) continue;
        if (!strcmp(extcmdlist[i].ef_txt, "shimgroundtransfer")) continue;
        if (!strcmp(extcmdlist[i].ef_txt, "shimcontainertransfer")) continue;
        if (!strcmp(extcmdlist[i].ef_txt, "shimcontainersnapshot")) continue;
        if (!strcmp(extcmdlist[i].ef_txt, "shimequipmentchange")) continue;
        if (emitted++) fputc(',', stdout);
        fprintf(stdout, "{\"index\":%d,\"name\":\"", i);
        json_escape(stdout, extcmdlist[i].ef_txt);
        fputs("\",\"description\":\"", stdout);
        json_escape(stdout, extcmdlist[i].ef_desc ? extcmdlist[i].ef_desc : "");
        fprintf(stdout, "\",\"key\":%u,\"flags\":%u}", (unsigned) extcmdlist[i].key, extcmdlist[i].flags);
    }
    fputs("]", stdout);
    if (active_prompt_request_id[0]) emit_prompt_lifecycle_metadata("prompt.extendedCommand", "opened");
    emit_event_end();
}

static void emit_live_inventory_array(void) {
    int emitted = 0;
    fputc('[', stdout);
    for (struct obj *otmp = gi.invent; otmp; otmp = otmp->nobj) {
        char selector = otmp->invlet;
        if (!selector) continue;
        char namebuf[BUFSZ];
        int glyph = obj_to_glyph(otmp, rn2_on_display_rng);
        int redact_identity_surface = should_redact_public_object_identity_surface(otmp);
        struct obj public_copy;
        struct obj *name_obj = otmp;
        char public_name[BUFSZ];
        if (redact_identity_surface) {
            public_copy = *otmp;
            public_copy.owornmask = 0L;
            public_copy.where = OBJ_FREE;
            name_obj = &public_copy;
        }
        public_object_display_name(public_name, sizeof public_name, name_obj, glyph);
        snprintf(namebuf, sizeof namebuf, "%c - %s", selector, public_name);
        int glyph_char = ((int) otmp->oclass >= 0 && (int) otmp->oclass < MAXOCLASSES) ? def_oc_syms[(int) otmp->oclass].sym : 0;
        if (emitted++) fputc(',', stdout);
        fprintf(stdout, "{\"selector\":%d,\"objectId\":%u,\"text\":\"", (int) selector, otmp->o_id);
        json_escape(stdout, namebuf);
        fprintf(stdout, "\",\"quantity\":%ld", otmp->quan);
        emit_public_glyph_field("glyph", glyph);
        fprintf(stdout, ",\"glyphChar\":%d,\"wornMask\":%ld,\"itemflags\":0", glyph_char, redact_identity_surface ? 0L : otmp->owornmask);
        int semantic_known = glyph_semantic_known(glyph);
        fputs(",\"semanticKind\":\"object\",\"semanticKnown\":", stdout);
        fputs(semantic_known ? "true" : "false", stdout);
        if (semantic_known) {
            fputs(",\"semanticName\":\"", stdout);
            json_escape(stdout, glyph_semantic_name(glyph));
            fputs("\"", stdout);
        }
        const char *appearance = object_semantic_appearance(otmp, glyph);
        if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
        emit_action_affordances_for_object(otmp);
        emit_public_item_presentation_fields(otmp);
        fputc('}', stdout);
    }
    fputc(']', stdout);
}

static void emit_live_inventory_event(int reason) {
    unsigned long revision = ++inventory_revision;
    unsigned long equip_revision = ++equipment_revision;
    emit_event_start("shim_update_inventory");
    fprintf(stdout, ",\"reason\":%d,\"revision\":%lu,\"inventoryRevision\":%lu,\"equipmentRevision\":%lu", reason, revision, revision, equip_revision);
    if (active_transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
    fputs(",\"items\":", stdout);
    emit_live_inventory_array();
    emit_event_end();
}

static void queue_active_direct_command(void) {
    bridge_direct_command_family family =
        direct_command_arbitration.active_family;
    if (!mark_direct_command_queued(family)) return;

    switch (family) {
    case BRIDGE_DIRECT_COMMAND_GROUND_TRANSFER:
        cmdq_add_ec(CQ_CANNED, doshimgroundtransfer);
        emit_active_direct_command_lifecycle_start(
            family, "queued", NULL);
        fputs(",\"transferId\":\"", stdout);
        json_escape(stdout, active_ground_transfer.transfer_id);
        fputs("\"", stdout);
        fprintf(stdout, ",\"itemId\":%u,\"direction\":\"",
                active_ground_transfer.item_id);
        json_escape(stdout, active_ground_transfer.direction);
        fputs("\"", stdout);
        fprintf(stdout, ",\"coord\":{\"x\":%d,\"y\":%d}",
                active_ground_transfer.x, active_ground_transfer.y);
        emit_event_end();
        return;
    case BRIDGE_DIRECT_COMMAND_CONTAINER_TRANSFER:
        cmdq_add_ec(CQ_CANNED, doshimcontainertransfer);
        emit_active_direct_command_lifecycle_start(
            family, "queued", NULL);
        fputs(",\"transferId\":\"", stdout);
        json_escape(stdout, active_container_transfer.transfer_id);
        fputs("\"", stdout);
        fprintf(stdout, ",\"containerId\":%u,\"itemId\":%u,\"direction\":\"",
                active_container_transfer.container_id,
                active_container_transfer.item_id);
        json_escape(stdout, active_container_transfer.direction);
        fputs("\"", stdout);
        emit_event_end();
        return;
    case BRIDGE_DIRECT_COMMAND_CONTAINER_SNAPSHOT:
        cmdq_add_ec(CQ_CANNED, doshimcontainersnapshot);
        emit_active_direct_command_lifecycle_start(
            family, "queued", NULL);
        fputs(",\"sessionId\":\"", stdout);
        json_escape(stdout, active_container_snapshot.session_id);
        fputs("\"", stdout);
        fprintf(stdout, ",\"containerId\":%u",
                active_container_snapshot.container_id);
        emit_event_end();
        return;
    case BRIDGE_DIRECT_COMMAND_EQUIPMENT_CHANGE:
        cmdq_add_ec(CQ_CANNED, doshimequipmentchange);
        emit_active_direct_command_lifecycle_start(
            family, "queued", NULL);
        fputs(",\"action\":\"", stdout);
        json_escape(stdout, active_equipment_change.action);
        fputs("\"", stdout);
        fprintf(stdout, ",\"itemId\":%u", active_equipment_change.item_id);
        fputs(",\"slotId\":\"", stdout);
        json_escape(stdout, active_equipment_change.slot_id);
        fputs("\",\"hand\":\"", stdout);
        json_escape(stdout, active_equipment_change.hand);
        fputs("\"", stdout);
        emit_event_end();
        return;
    case BRIDGE_DIRECT_COMMAND_TERRAIN_ACTION:
        cmdq_add_ec(CQ_CANNED, doshimterrainaction);
        emit_active_direct_command_lifecycle_start(
            family, "queued", NULL);
        fputs(",\"action\":\"", stdout);
        json_escape(stdout, active_terrain_action.action);
        fputs("\",\"terrain\":\"", stdout);
        json_escape(stdout, active_terrain_action.terrain);
        fputs("\"", stdout);
        fprintf(stdout, ",\"coord\":{\"x\":%u,\"y\":%u},\"itemId\":%u",
                active_terrain_action.x, active_terrain_action.y,
                active_terrain_action.item_id);
        emit_event_end();
        return;
    case BRIDGE_DIRECT_COMMAND_NONE:
        return;
    }
}

static void shim_cb(const char *name, void *ret_ptr, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);

    if (!strcmp(name, "shim_nhgetch") && ret_ptr) {
        emit_live_inventory_event(-1);
        emit_spell_availability_event();
        int queue_before = 0, queue_after = 0;
        int ch = pop_key_blocking_with_status(&queue_before, &queue_after);
        if (ch == 0) queue_active_direct_command();
        *(int *)ret_ptr = ch;
        emit_event_start(name);
        fputs(",\"fmt\":\"", stdout); json_escape(stdout, fmt ? fmt : ""); fputs("\"", stdout);
        fprintf(stdout, ",\"return\":%d,\"queuedBeforePop\":%d,\"queuedAfterPop\":%d", ch, queue_before, queue_after);
        emit_event_end();
        va_end(ap);
        return;
    }
    if (!strcmp(name, "shim_nh_poskey") && ret_ptr) {
        emit_live_inventory_event(-2);
        emit_spell_availability_event();
        (void) va_ptr_arg(&ap); (void) va_ptr_arg(&ap); (void) va_ptr_arg(&ap);
        const int input_state = program_state.input_state;
        const char *prompt_purpose = input_state == commandInp ? "prompt.command"
            : (input_state == getposInp ? "prompt.mapTarget"
            : (input_state == getdirInp ? "prompt.direction" : "prompt.input"));
        begin_prompt_lifecycle(prompt_purpose);
        emit_event_start(input_state == commandInp ? "bridge_command_prompt" : "bridge_direction_prompt");
        fputs(input_state == commandInp ? ",\"query\":\"Choose a command.\",\"choices\":\"\"" : ",\"query\":\"Choose a direction or map target.\",\"choices\":\"ykulnjbh.<>\"", stdout);
        emit_prompt_lifecycle_metadata(prompt_purpose, "opened");
        emit_event_end();
        int queue_before = 0, queue_after = 0;
        int ch = pop_key_blocking_with_status(&queue_before, &queue_after);
        if (ch == 0 && input_state == commandInp) queue_active_direct_command();
        *(int *)ret_ptr = ch;
        emit_event_start(name);
        fputs(",\"fmt\":\"", stdout); json_escape(stdout, fmt ? fmt : ""); fputs("\"", stdout);
        fprintf(stdout, ",\"return\":%d,\"queuedBeforePop\":%d,\"queuedAfterPop\":%d", ch, queue_before, queue_after);
        emit_event_end();
        emit_event_start("bridge_direction_answer");
        fprintf(stdout, ",\"keycode\":%d,\"queuedBeforePop\":%d,\"queuedAfterPop\":%d", ch, queue_before, queue_after);
        emit_prompt_lifecycle_metadata(prompt_purpose, "answered");
        emit_event_end();
        clear_prompt_lifecycle();
        va_end(ap);
        return;
    }

    if (!strcmp(name, "shim_print_glyph")) {
        int win = va_int_arg(&ap);
        int x = va_int_arg(&ap);
        int y = va_int_arg(&ap);
        const glyph_info *gi = va_arg(ap, const glyph_info *);
        const glyph_info *bgi = va_arg(ap, const glyph_info *);
        emit_event_start(name);
        fputs(",\"fmt\":\"", stdout); json_escape(stdout, fmt ? fmt : ""); fputs("\"", stdout);
        emit_print_glyph_fields(win, x, y, gi, bgi);
        emit_event_end();
        emit_ground_pile_snapshot_event(win, x, y);
        va_end(ap);
        return;
    }

    if (!strcmp(name, "shim_native_spell_row")) {
        int window = va_int_arg(&ap);
        const char *row_name = va_string_arg(&ap);
        int selector = va_int_arg(&ap);
        int level = va_int_arg(&ap);
        int pw_cost = va_int_arg(&ap);
        int failure = va_int_arg(&ap);
        const char *status = va_string_arg(&ap);
        if (pending_spell_rows_window != window) {
            pending_spell_rows_window = window;
            pending_spell_row_count = 0;
        }
        if (pending_spell_row_count < MAX_BRIDGE_MAGIC_ROWS && row_name && *row_name) {
            bridge_public_spell_row *row = &pending_spell_rows[pending_spell_row_count++];
            memset(row, 0, sizeof *row);
            snprintf(row->name, sizeof row->name, "%s", row_name);
            snprintf(row->status, sizeof row->status, "%s", status ? status : "");
            row->selector = selector;
            row->level = level;
            row->pw_cost = pw_cost;
            row->failure = failure;
        }
        va_end(ap);
        return;
    }
    if (!strcmp(name, "shim_native_spell_rows_ready")) {
        int window = va_int_arg(&ap);
        emit_authoritative_magic_rows("spell", window);
        va_end(ap);
        return;
    }
    if (!strcmp(name, "shim_native_skill_row")) {
        int window = va_int_arg(&ap);
        const char *row_name = va_string_arg(&ap);
        int identifier = va_int_arg(&ap);
        const char *current_rank = va_string_arg(&ap);
        const char *next_rank = va_string_arg(&ap);
        int next_cost = va_int_arg(&ap);
        int can_advance_row = va_int_arg(&ap);
        if (pending_skill_rows_window != window) {
            pending_skill_rows_window = window;
            pending_skill_row_count = 0;
        }
        if (pending_skill_row_count < MAX_BRIDGE_MAGIC_ROWS && row_name && *row_name
            && current_rank && *current_rank) {
            bridge_public_skill_row *row = &pending_skill_rows[pending_skill_row_count++];
            memset(row, 0, sizeof *row);
            snprintf(row->name, sizeof row->name, "%s", row_name);
            snprintf(row->current_rank, sizeof row->current_rank, "%s", current_rank);
            snprintf(row->next_rank, sizeof row->next_rank, "%s", next_rank ? next_rank : "");
            row->identifier = identifier;
            row->next_cost = next_cost;
            row->can_advance = can_advance_row != 0;
        }
        va_end(ap);
        return;
    }
    if (!strcmp(name, "shim_native_skill_rows_ready")) {
        int window = va_int_arg(&ap);
        emit_authoritative_magic_rows("skill", window);
        va_end(ap);
        return;
    }

    if (!strcmp(name, "shim_get_nh_event")) {
        if (isok(u.ux, u.uy) && public_ground_object_count_at(u.ux, u.uy) > 0 && !ground_pile_snapshot_known[u.ux][u.uy])
            emit_ground_pile_snapshot_event(WIN_MAP, u.ux, u.uy);
        maybe_emit_ground_transfer_result();
        maybe_emit_container_transfer_result();
        maybe_emit_container_snapshot_result();
        maybe_emit_equipment_change_result();
        maybe_emit_terrain_action_result();
    }
    if (!strcmp(name, "shim_get_nh_event") && !active_prompt_request_id[0] && !first_active_menu_lifecycle() && pending_queue_length() == 0 && direct_command_is_idle()) {
        /* NetHack calls get_nh_event while the command loop is idle between
         * turns.  At that boundary any plain key transaction has finished;
         * keeping it would make the next normal command-loop nh_poskey look
         * like a command-owned follow-up prompt and incorrectly reject safe
         * top-level ui-command routes such as ground.dipIntoTerrain. */
        clear_active_transaction();
    }

    emit_event_start(name);
    fputs(",\"fmt\":\"", stdout); json_escape(stdout, fmt ? fmt : ""); fputs("\"", stdout);

    if (!strcmp(name, "shim_create_nhwindow") && ret_ptr) {
        int wtype = va_int_arg(&ap);
        *(int *)ret_ptr = next_winid++;
        fprintf(stdout, ",\"return\":%d,\"windowType\":%d", *(int *)ret_ptr, wtype);
    } else if (!strcmp(name, "shim_native_end_diagnostic")) {
        const char *phase = va_string_arg(&ap);
        int how = va_int_arg(&ap);
        const char *reason = va_string_arg(&ap);
        const char *killer_name = va_string_arg(&ap);
        int killer_format = va_int_arg(&ap);
        const char *killer = va_string_arg(&ap);
        const char *callsite = va_string_arg(&ap);
        int final_flow = va_int_arg(&ap);
        int disclosure_flow = va_int_arg(&ap);
        int taken = va_int_arg(&ap);
        int cmd_key = va_int_arg(&ap);
        int moves = va_int_arg(&ap);
        int depth_value = va_int_arg(&ap);
        int dnum = va_int_arg(&ap);
        int dlevel = va_int_arg(&ap);
        int gameover = va_int_arg(&ap);
        fputs(",\"phase\":\"", stdout); json_escape(stdout, phase); fputs("\"", stdout);
        fprintf(stdout, ",\"how\":%d,\"finalFlow\":%s,\"disclosureFlow\":%s,\"taken\":%s,\"cmdKey\":%d,\"moves\":%d,\"depth\":%d,\"dnum\":%d,\"dlevel\":%d,\"gameover\":%s,\"pendingInputQueue\":%d,\"killerFormat\":%d",
                how, final_flow ? "true" : "false", disclosure_flow ? "true" : "false", taken ? "true" : "false", cmd_key, moves, depth_value, dnum, dlevel, gameover ? "true" : "false", pending_queue_length(), killer_format);
        fputs(",\"reason\":\"", stdout); json_escape(stdout, reason); fputs("\"", stdout);
        fputs(",\"killerName\":\"", stdout); json_escape(stdout, killer_name); fputs("\"", stdout);
        fputs(",\"killer\":\"", stdout); json_escape(stdout, killer); fputs("\"", stdout);
        fputs(",\"callsite\":\"", stdout); json_escape(stdout, callsite); fputs("\"", stdout);
        if (active_transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
        if (active_prompt_request_id[0]) { fputs(",\"activePromptRequestId\":\"", stdout); json_escape(stdout, active_prompt_request_id); fputs("\"", stdout); }
        bridge_menu_lifecycle *active_menu = first_active_menu_lifecycle();
        if (active_menu && active_menu->request_id[0]) { fputs(",\"activeMenuRequestId\":\"", stdout); json_escape(stdout, active_menu->request_id); fputs("\"", stdout); }
    } else if (!strcmp(name, "shim_native_command_diagnostic")) {
        const char *phase = va_string_arg(&ap);
        const char *callsite = va_string_arg(&ap);
        int cmd_key = va_int_arg(&ap);
        int moves = va_int_arg(&ap);
        int depth_value = va_int_arg(&ap);
        int dnum = va_int_arg(&ap);
        int dlevel = va_int_arg(&ap);
        int native_pending = va_int_arg(&ap);
        fputs(",\"phase\":\"", stdout); json_escape(stdout, phase); fputs("\"", stdout);
        fputs(",\"callsite\":\"", stdout); json_escape(stdout, callsite); fputs("\"", stdout);
        fprintf(stdout, ",\"cmdKey\":%d,\"moves\":%d,\"depth\":%d,\"dnum\":%d,\"dlevel\":%d,\"nativePending\":%d,\"pendingInputQueue\":%d",
                cmd_key, moves, depth_value, dnum, dlevel, native_pending, pending_queue_length());
        if (active_transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
        if (active_prompt_request_id[0]) { fputs(",\"activePromptRequestId\":\"", stdout); json_escape(stdout, active_prompt_request_id); fputs("\"", stdout); }
        bridge_menu_lifecycle *active_menu = first_active_menu_lifecycle();
        if (active_menu && active_menu->request_id[0]) { fputs(",\"activeMenuRequestId\":\"", stdout); json_escape(stdout, active_menu->request_id); fputs("\"", stdout); }
    } else if (!strcmp(name, "shim_native_menu_context")) {
        const char *purpose = va_string_arg(&ap);
        const char *owner_kind = va_string_arg(&ap);
        const char *callsite = va_string_arg(&ap);
        int final_flow = va_int_arg(&ap);
        int disclosure_flow = va_int_arg(&ap);
        int how = va_int_arg(&ap);
        const char *reason = va_string_arg(&ap);
        memset(&pending_native_menu_context, 0, sizeof pending_native_menu_context);
        snprintf(pending_native_menu_context.purpose, sizeof pending_native_menu_context.purpose, "%s", purpose ? purpose : "menu.generic");
        snprintf(pending_native_menu_context.owner_kind, sizeof pending_native_menu_context.owner_kind, "%s", owner_kind ? owner_kind : "unknown");
        snprintf(pending_native_menu_context.callsite, sizeof pending_native_menu_context.callsite, "%s", callsite ? callsite : "");
        snprintf(pending_native_menu_context.reason, sizeof pending_native_menu_context.reason, "%s", reason ? reason : "");
        pending_native_menu_context.how = how;
        pending_native_menu_context.final_flow = final_flow;
        pending_native_menu_context.disclosure_flow = disclosure_flow;
        pending_native_menu_context.pending = 1;
        fputs(",\"menuPurpose\":\"", stdout); json_escape(stdout, pending_native_menu_context.purpose); fputs("\"", stdout);
        fputs(",\"ownerKind\":\"", stdout); json_escape(stdout, pending_native_menu_context.owner_kind); fputs("\"", stdout);
        fputs(",\"callsite\":\"", stdout); json_escape(stdout, pending_native_menu_context.callsite); fputs("\"", stdout);
        fprintf(stdout, ",\"finalFlow\":%s,\"disclosureFlow\":%s,\"how\":%d,\"pendingForNextMenu\":true", final_flow ? "true" : "false", disclosure_flow ? "true" : "false", how);
        fputs(",\"reason\":\"", stdout); json_escape(stdout, pending_native_menu_context.reason); fputs("\"", stdout);
        if (active_transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
    } else if (!strcmp(name, "shim_yn_function") && ret_ptr) {
        const char *query = va_string_arg(&ap);
        const char *resp = va_string_arg(&ap);
        int def = va_int_arg(&ap);
        const char *prompt_purpose = is_ring_finger_prompt(query, resp) ? "prompt.equipmentRingFinger" : (contains_icase(query, "direction") ? "prompt.direction" : "prompt.question");
        begin_prompt_lifecycle(prompt_purpose);
        int ch = is_ring_finger_prompt(query, resp) ? try_pop_matching_key(resp) : 0;
        if (ch) {
            *(char *)ret_ptr = (char) ch;
            fputs(",\"query\":\"", stdout); json_escape(stdout, query); fputs("\",\"choices\":\"", stdout); json_escape(stdout, resp); fputs("\",\"autoAnswered\":true,\"autoAnswerReason\":\"queued-ring-finger\"", stdout);
            emit_prompt_lifecycle_metadata(prompt_purpose, "autoAnswered");
            emit_event_end();
            emit_event_start("bridge_prompt_answer");
            fprintf(stdout, ",\"keycode\":%d,\"autoAnswered\":true,\"autoAnswerReason\":\"queued-ring-finger\"", ch);
            emit_prompt_lifecycle_metadata(prompt_purpose, "answered");
            emit_event_end();
            clear_prompt_lifecycle();
            va_end(ap);
            return;
        }
        fputs(",\"query\":\"", stdout); json_escape(stdout, query); fputs("\",\"choices\":\"", stdout); json_escape(stdout, resp); fputs("\"", stdout);
        emit_prompt_lifecycle_metadata(prompt_purpose, "opened");
        emit_event_end();
        do {
            ch = pop_key_blocking();
            if (ch == '\r') ch = '\n';
            if (ch == 27) break;
            if ((ch == '\n' || ch == ' ') && def) { ch = def; break; }
        } while (resp && *resp && !strchr(resp, ch));
        *(char *)ret_ptr = (char) ch;
        emit_event_start("bridge_prompt_answer");
        fprintf(stdout, ",\"keycode\":%d", ch);
        emit_prompt_lifecycle_metadata(prompt_purpose, "answered");
        emit_event_end();
        clear_prompt_lifecycle();
        va_end(ap);
        return;
    } else if (!strcmp(name, "shim_getlin")) {
        const char *query = va_string_arg(&ap);
        char *buf = va_arg(ap, char *);
        const char *prompt_purpose = contains_icase(query, "command") ? "prompt.extendedCommand" : "prompt.lineInput";
        begin_prompt_lifecycle(prompt_purpose);
        fputs(",\"query\":\"", stdout); json_escape(stdout, query); fputs("\"", stdout);
        emit_prompt_lifecycle_metadata(prompt_purpose, "opened");
        emit_event_end();
        char linebuf[256];
        size_t len = 0;
        for (;;) {
            int ch = pop_key_blocking();
            if (ch == 27) { len = 0; break; }
            if (ch == '\r' || ch == '\n') break;
            if ((ch == 8 || ch == 127) && len > 0) { len--; continue; }
            if (isprint((unsigned char) ch) && len + 1 < sizeof linebuf) linebuf[len++] = (char) ch;
        }
        linebuf[len] = '\0';
        if (buf) snprintf(buf, 80, "%s", linebuf);
        emit_event_start("bridge_line_answer");
        fputs(",\"value\":\"", stdout); json_escape(stdout, linebuf); fputs("\"", stdout);
        emit_prompt_lifecycle_metadata(prompt_purpose, "answered");
        emit_event_end();
        clear_prompt_lifecycle();
        va_end(ap);
        return;
    } else if (!strcmp(name, "shim_select_menu") && ret_ptr) {
        int win = va_int_arg(&ap);
        int how = va_int_arg(&ap);
        bridge_menu_item **menu_list = (bridge_menu_item **) va_ptr_arg(&ap);
        bridge_menu_lifecycle *menu_ctx = find_menu_lifecycle(win);
        if (menu_ctx) {
            menu_ctx->awaiting_selection = 1;
            if (how == 0 && (!menu_ctx->purpose[0] || !strcmp(menu_ctx->purpose, "menu.generic"))) {
                snprintf(menu_ctx->purpose, sizeof menu_ctx->purpose, "%s", "menu.readOnlyInfo");
                snprintf(menu_ctx->owner_kind, sizeof menu_ctx->owner_kind, "%s", "system");
            }
        }
        fprintf(stdout, ",\"window\":%d,\"how\":%d,\"awaitingSelection\":true", win, how);
        emit_menu_lifecycle_metadata(menu_ctx, how ? "selecting" : "ready");
        emit_event_end();
        if (menu_ctx && !strcmp(menu_ctx->purpose, "container.takeOut") && gc.current_container && gc.current_container->cknown) {
            emit_container_contents_snapshot_for(gc.current_container,
                active_container_transfer.session_id,
                active_transaction_id[0] ? active_transaction_id : menu_ctx->transaction_id);
        }

        int result = 0;
        int chosen = 0;
        char selected_keys[256];
        int selected_len = 0;
        long pending_count = -1L;
        int answer_queue_before = 0, answer_queue_after = 0;
        if (how != 0) { /* PICK_ONE/PICK_ANY: selectors, ranges and counts. */
            bridge_menu_item *selected = (bridge_menu_item *) calloc(MAX_BRIDGE_MENU_ITEMS, sizeof *selected);
            if (menu_list) *menu_list = selected;
            for (;;) {
                int ch = pop_key_blocking_with_status(&answer_queue_before, &answer_queue_after);
                if (ch == 27) { result = 0; break; }
                if (ch == '\r' || ch == '\n' || ch == ' ') break;
                if (isdigit((unsigned char) ch)) {
                    if (pending_count < 0) pending_count = 0;
                    pending_count = (pending_count * 10) + (ch - '0');
                    if (pending_count > 999999L) pending_count = 999999L;
                    continue;
                }
                if (ch == '-' && selected_len > 0) {
                    int end = pop_key_blocking_with_status(&answer_queue_before, &answer_queue_after);
                    int start = (unsigned char) selected_keys[selected_len - 1];
                    if (end < start) { int tmp = start; start = end; end = tmp; }
                    for (int rc = start + 1; rc <= end && result < MAX_BRIDGE_MENU_ITEMS; ++rc) {
                        bridge_menu_entry *range_entry = find_menu_selector(win, rc);
                        if (range_entry && selected) {
                            selected[result].item = range_entry->identifier;
                            selected[result].count = -1L;
                            selected[result].itemflags = range_entry->itemflags;
                            if (selected_len + 1 < (int) sizeof selected_keys) selected_keys[selected_len++] = (char) rc;
                            result++;
                        }
                    }
                    pending_count = -1L;
                    continue;
                }
                bridge_menu_entry *entry = find_menu_selector(win, ch);
                if (entry && selected && result < MAX_BRIDGE_MENU_ITEMS) {
                    selected[result].item = entry->identifier;
                    selected[result].count = pending_count > 0 ? pending_count : -1L;
                    selected[result].itemflags = entry->itemflags;
                    if (selected_len + 1 < (int) sizeof selected_keys) selected_keys[selected_len++] = (char) ch;
                    result++;
                    chosen = ch;
                    pending_count = -1L;
                    if (how == 1) break;
                }
            }
            if (result == 0 && selected) { free(selected); if (menu_list) *menu_list = NULL; }
        } else {
            /* PICK_NONE/read-only menu: keep it visible until an explicit key. */
            (void) pop_key_blocking_with_status(&answer_queue_before, &answer_queue_after);
        }
        *(int *)ret_ptr = result;
        int active_request_match = menu_ctx && request_id_is_active_prompt_or_menu(menu_ctx->request_id);
        int input_matches_menu_transaction = menu_ctx && active_transaction_id[0] && !strcmp(active_transaction_id, menu_ctx->transaction_id);
        emit_event_start("bridge_menu_answer");
        fprintf(stdout, ",\"window\":%d,\"return\":%d,\"selector\":%d,\"queuedBeforePop\":%d,\"queuedAfterPop\":%d,\"activeRequestMatch\":%s,\"inputMatchesMenuTransaction\":%s", win, result, chosen, answer_queue_before, answer_queue_after, active_request_match ? "true" : "false", input_matches_menu_transaction ? "true" : "false");
        if (active_transaction_id[0]) { fputs(",\"inputTransactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
        fputs(",\"selectors\":\"", stdout);
        for (int i = 0; i < selected_len; ++i) { char tmp[2] = { selected_keys[i], 0 }; json_escape(stdout, tmp); }
        fputs("\"", stdout);
        emit_menu_lifecycle_metadata(menu_ctx, "answered");
        emit_event_end();
        end_menu_lifecycle(win);
        va_end(ap);
        return;
    } else if (!strcmp(name, "shim_message_menu") && ret_ptr) {
        *(char *)ret_ptr = 0;
        fprintf(stdout, ",\"return\":0");
    } else if (!strcmp(name, "shim_get_ext_cmd") && ret_ptr) {
        const char *prompt_purpose = "prompt.extendedCommand";
        begin_prompt_lifecycle(prompt_purpose);
        fprintf(stdout, ",\"awaitingSelection\":true");
        emit_prompt_lifecycle_metadata(prompt_purpose, "opened");
        emit_event_end();
        emit_extcmd_catalog();
        char linebuf[80];
        size_t len = 0;
        for (;;) {
            int ch = pop_key_blocking();
            if (ch == 27) { len = 0; break; }
            if (ch == '\r' || ch == '\n') break;
            if ((ch == 8 || ch == 127) && len > 0) { len--; continue; }
            if (isprint((unsigned char) ch) && len + 1 < sizeof linebuf) linebuf[len++] = (char) ch;
        }
        linebuf[len] = '\0';
        int idx = extcmd_select_by_name(linebuf);
        *(int *)ret_ptr = idx;
        emit_event_start("bridge_extcmd_answer");
        fprintf(stdout, ",\"return\":%d,\"value\":\"", idx); json_escape(stdout, linebuf); fputs("\"", stdout);
        if (idx >= 0 && extcmdlist[idx].ef_txt) { fputs(",\"command\":\"", stdout); json_escape(stdout, extcmdlist[idx].ef_txt); fputs("\"", stdout); }
        emit_prompt_lifecycle_metadata(prompt_purpose, "answered");
        emit_event_end();
        clear_prompt_lifecycle();
        va_end(ap);
        return;
    } else if (!strcmp(name, "shim_get_color_string") && ret_ptr) {
        static char colors[] = "";
        *(char **)ret_ptr = colors;
        fputs(",\"return\":\"\"", stdout);
    }

    /* Pull out high-value event fields for Electron without exposing structs. */
    if (!strcmp(name, "shim_clear_nhwindow") || !strcmp(name, "shim_destroy_nhwindow")) {
        int win = va_int_arg(&ap);
        if (!strcmp(name, "shim_clear_nhwindow")) memset(ground_pile_snapshot_known, 0, sizeof ground_pile_snapshot_known);
        fprintf(stdout, ",\"window\":%d", win);
    } else if (!strcmp(name, "shim_number_pad")) {
        int enabled = va_int_arg(&ap);
        const char *direction_keys = gc.Cmd.dirchars ? gc.Cmd.dirchars : "hykulnjb><";
        fprintf(stdout, ",\"enabled\":%d,\"directionKeys\":\"", enabled);
        json_escape(stdout, direction_keys);
        fputs("\"", stdout);
    } else if (!strcmp(name, "shim_start_menu")) {
        int win = va_int_arg(&ap); int behavior = va_int_arg(&ap);
        clear_menu_window(win);
        bridge_menu_lifecycle *ctx = begin_menu_lifecycle(win);
        fprintf(stdout, ",\"window\":%d,\"behavior\":%d", win, behavior);
        emit_menu_lifecycle_metadata(ctx, "opened");
    } else if (!strcmp(name, "shim_display_nhwindow")) {
        int win = va_int_arg(&ap); int blocking = va_int_arg(&ap);
        fprintf(stdout, ",\"window\":%d,\"blocking\":%d", win, blocking);
    } else if (!strcmp(name, "shim_putstr")) {
        int win = va_int_arg(&ap); int attr = va_int_arg(&ap); const char *str = va_string_arg(&ap);
        fprintf(stdout, ",\"window\":%d,\"attr\":%d,\"text\":\"", win, attr); json_escape(stdout, str); fputs("\"", stdout);
    } else if (!strcmp(name, "shim_raw_print") || !strcmp(name, "shim_raw_print_bold") || !strcmp(name, "shim_exit_nhwindows")) {
        const char *str = va_string_arg(&ap);
        fputs(",\"text\":\"", stdout); json_escape(stdout, str); fputs("\"", stdout);
    } else if (!strcmp(name, "shim_status_enablefield")) {
        int field = va_int_arg(&ap); const char *nm = va_string_arg(&ap); const char *sfmt = va_string_arg(&ap); int en = va_int_arg(&ap);
        fprintf(stdout, ",\"field\":%d,\"label\":\"", field); json_escape(stdout, nm); fputs("\",\"statusFmt\":\"", stdout); json_escape(stdout, sfmt); fprintf(stdout, "\",\"enabled\":%d", en);
    } else if (!strcmp(name, "shim_status_update")) {
        int field = va_int_arg(&ap); void *ptr = va_ptr_arg(&ap); int chg = va_int_arg(&ap); int pct = va_int_arg(&ap); int color = va_int_arg(&ap);
        fprintf(stdout, ",\"field\":%d,\"changed\":%d,\"percent\":%d,\"color\":%d", field, chg, pct, color);
        if (ptr && field >= 0 && field != BL_CONDITION) {
            fputs(",\"value\":\"", stdout); json_escape(stdout, (const char *) ptr); fputs("\"", stdout);
        } else if (field == BL_CONDITION) {
            unsigned long mask = ptr ? *(unsigned long *) ptr : 0UL;
            fprintf(stdout, ",\"conditionMask\":%lu", mask);
        }
    } else if (!strcmp(name, "shim_update_inventory")) {
        int reason = va_int_arg(&ap);
        unsigned long revision = ++inventory_revision;
        unsigned long equip_revision = ++equipment_revision;
        fprintf(stdout, ",\"reason\":%d,\"revision\":%lu,\"inventoryRevision\":%lu,\"equipmentRevision\":%lu", reason, revision, revision, equip_revision);
        if (active_transaction_id[0]) { fputs(",\"transactionId\":\"", stdout); json_escape(stdout, active_transaction_id); fputs("\"", stdout); }
        fputs(",\"items\":", stdout);
        emit_live_inventory_array();
    } else if (!strcmp(name, "shim_print_glyph")) {
        int win = va_int_arg(&ap); int x = va_int_arg(&ap); int y = va_int_arg(&ap); const glyph_info *gi = va_arg(ap, const glyph_info *); const glyph_info *bgi = va_arg(ap, const glyph_info *);
        int ttychar = gi ? gi->ttychar : ' ';
        int glyph = gi ? gi->glyph : NO_GLYPH;
        int background_glyph = effective_background_glyph_at(x, y, bgi);
        int has_background_glyph = background_glyph != NO_GLYPH;
        fprintf(stdout, ",\"window\":%d,\"x\":%d,\"y\":%d", win, x, y);
        emit_public_glyph_field("glyph", glyph);
        fprintf(stdout, ",\"ttychar\":%d,\"color\":%d", ttychar, gi ? gi->gm.sym.color : -1);
        emit_public_tileidx_field(gi);
        fprintf(stdout, ",\"glyphFlags\":%u", gi ? gi->gm.glyphflags : 0U);
        if (has_background_glyph) emit_public_glyph_field("backgroundGlyph", background_glyph);
        else fputs(",\"backgroundGlyph\":-1", stdout);
        if (glyph_is_cmap(glyph)) fprintf(stdout, ",\"cmapIndex\":%d", glyph_to_cmap(glyph));
        fputs(",\"semanticKind\":\"", stdout);
        json_escape(stdout, glyph_semantic_kind(glyph));
        int semantic_known = glyph_semantic_known(glyph);
        fprintf(stdout, "\",\"semanticKnown\":%s", semantic_known ? "true" : "false");
        if (semantic_known) { fputs(",\"semanticName\":\"", stdout); json_escape(stdout, glyph_semantic_name(glyph)); fputs("\"", stdout); }
        const char *appearance = glyph_semantic_appearance(glyph);
        if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
        emit_public_ground_object_reference_at(glyph, x, y);
        emit_action_affordances_for_glyph_at(glyph, x, y);
        emit_object_layer_fields_at(glyph, x, y);
        if (has_background_glyph) {
            int background_known = glyph_semantic_known(background_glyph);
            fputs(",\"backgroundSemanticKind\":\"", stdout);
            json_escape(stdout, glyph_semantic_kind(background_glyph));
            fprintf(stdout, "\",\"backgroundSemanticKnown\":%s", background_known ? "true" : "false");
            if (background_known) { fputs(",\"backgroundSemanticName\":\"", stdout); json_escape(stdout, glyph_semantic_name(background_glyph)); fputs("\"", stdout); }
            fputs(",\"backgroundActionAffordances\":", stdout);
            emit_action_affordances_array_at(background_glyph, x, y);
        }
        emit_public_look_fields_at(glyph, background_glyph, x, y);
        fputs(",\"char\":\"", stdout);
        char buf[8] = {0};
        if (ttychar > 0 && ttychar < 128 && isprint((unsigned char) ttychar)) { buf[0] = (char) ttychar; }
        else { buf[0] = ' '; }
        json_escape(stdout, buf); fputs("\"", stdout);
    } else if (!strcmp(name, "shim_add_menu")) {
        int win = va_int_arg(&ap); const glyph_info *mgi = va_arg(ap, const glyph_info *); void *identifier = va_ptr_arg(&ap); int ch = va_int_arg(&ap); (void)va_int_arg(&ap); int attr = va_int_arg(&ap); int clr = va_int_arg(&ap); const char *str = va_string_arg(&ap); unsigned itemflags = (unsigned) va_int_arg(&ap);
        bridge_anything copied_identifier;
        memset(&copied_identifier, 0, sizeof copied_identifier);
        if (identifier) memcpy(&copied_identifier, identifier, sizeof copied_identifier);
        if (!ch && !bridge_identifier_is_zero(&copied_identifier)) ch = generated_selector_for_window(win);
        if (menu_entry_count < MAX_BRIDGE_MENU_ITEMS) {
            bridge_menu_entry *entry = &menu_entries[menu_entry_count++];
            memset(entry, 0, sizeof *entry);
            entry->window = win;
            entry->selector = ch;
            entry->itemflags = itemflags;
            entry->identifier = copied_identifier;
            if (str) snprintf(entry->text, sizeof entry->text, "%s", str);
        }
        int glyph = mgi ? mgi->glyph : NO_GLYPH;
        fprintf(stdout, ",\"window\":%d,\"selector\":%d,\"attr\":%d,\"color\":%d,\"itemflags\":%u",
                win, ch, attr, clr, itemflags);
        bridge_menu_lifecycle *ctx = find_menu_lifecycle(win);
        struct obj *public_obj = find_known_object_ptr((const struct obj *) copied_identifier.a_void);
        if (!public_obj && ctx && !strncmp(ctx->purpose, "inventory.", 10))
            public_obj = find_inventory_object_for_classic_menu(ch, glyph);
        if (public_obj) fprintf(stdout, ",\"objectId\":%u", public_obj->o_id);
        emit_public_glyph_field("glyph", glyph);
        fprintf(stdout, ",\"glyphChar\":%d,\"glyphColor\":%d", mgi ? mgi->ttychar : -1, mgi ? mgi->gm.sym.color : -1);
        emit_public_tileidx_field(mgi);
        if (glyph_is_cmap(glyph)) fprintf(stdout, ",\"cmapIndex\":%d", glyph_to_cmap(glyph));
        fputs(",\"semanticKind\":\"", stdout);
        json_escape(stdout, glyph_semantic_kind(glyph));
        int semantic_known = glyph_semantic_known(glyph);
        fprintf(stdout, "\",\"semanticKnown\":%s", semantic_known ? "true" : "false");
        if (semantic_known) {
            fputs(",\"semanticName\":\"", stdout);
            json_escape(stdout, glyph_semantic_name(glyph));
            fputs("\"", stdout);
        }
        const char *appearance = public_obj ? object_semantic_appearance(public_obj, glyph) : glyph_semantic_appearance(glyph);
        if (appearance) { fputs(",\"semanticAppearance\":\"", stdout); json_escape(stdout, appearance); fputs("\"", stdout); }
        emit_action_affordances_for_glyph(glyph);
        if (public_obj) emit_public_item_presentation_fields(public_obj);
        emit_menu_lifecycle_metadata(ctx, "opened");
        fputs(",\"text\":\"", stdout);
        if (public_obj) {
            char public_name[BUFSZ];
            public_object_display_name(public_name, sizeof public_name, public_obj, glyph);
            json_escape(stdout, public_name);
        } else json_escape(stdout, str);
        fputs("\"", stdout);
    } else if (!strcmp(name, "shim_end_menu")) {
        int win = va_int_arg(&ap); const char *prompt = va_string_arg(&ap);
        bridge_menu_lifecycle *ctx = find_menu_lifecycle(win);
        if (ctx) {
            if (!ctx->purpose[0] || !strcmp(ctx->purpose, "menu.generic"))
                snprintf(ctx->purpose, sizeof ctx->purpose, "%s", classify_menu_purpose_text(prompt));
            if (!ctx->owner_kind[0] || !strcmp(ctx->owner_kind, "unknown"))
                snprintf(ctx->owner_kind, sizeof ctx->owner_kind, "%s", purpose_owner_kind(ctx->purpose));
        }
        fprintf(stdout, ",\"window\":%d,\"prompt\":\"", win); json_escape(stdout, prompt); fputs("\"", stdout);
        emit_menu_lifecycle_metadata(ctx, "ready");
    } else if (!strcmp(name, "shim_curs")) {
        int win = va_int_arg(&ap); int x = va_int_arg(&ap); int y = va_int_arg(&ap);
        fprintf(stdout, ",\"window\":%d,\"x\":%d,\"y\":%d", win, x, y);
        if (isok(x, y) && x == u.ux && y == u.uy) fputs(",\"actorId\":\"hero\"", stdout);
    } else if (!strcmp(name, "shim_cliparound")) {
        int x = va_int_arg(&ap); int y = va_int_arg(&ap);
        fprintf(stdout, ",\"x\":%d,\"y\":%d", x, y);
    } else if (!strcmp(name, "shim_update_positionbar")) {
        const char *str = va_string_arg(&ap);
        fputs(",\"text\":\"", stdout); json_escape(stdout, str); fputs("\"", stdout);
    }

    emit_event_end();
    va_end(ap);
}

int main(int argc, char **argv) {
    setvbuf(stdout, NULL, _IONBF, 0);
    int runtime_rc = init_bridge_runtime();
    if (!runtime_rc) runtime_rc = bridge_mutex_init(&direct_command_mu);
    if (runtime_rc) {
        fprintf(stderr, "Cannot initialize bridge runtime: %s\n", bridge_platform_error(runtime_rc));
        return 2;
    }
    if (has_fixture_env() && (!getenv("NH_ELECTRON_TEST_FIXTURES") || strcmp(getenv("NH_ELECTRON_TEST_FIXTURES"), "1") != 0)) {
        nh_test_bridge_event("bridge_test_scenario_failed", getenv("NH_TEST_SCENARIO_ID"), "fixture scenario env vars require explicit NH_ELECTRON_TEST_FIXTURES=1 runtime gate", NULL);
        return 2;
    }
#ifndef NH_ELECTRON_TEST_FIXTURES
    if (has_fixture_env()) {
        nh_test_bridge_event("bridge_test_scenario_failed", getenv("NH_TEST_SCENARIO_ID"), "fixture scenario env vars require NH_ELECTRON_TEST_FIXTURES build", NULL);
        return 2;
    }
#endif
#ifdef NH_ELECTRON_TEST_FIXTURES
    const char *scenario_id = getenv("NH_TEST_SCENARIO_ID");
    const char *direct_scenario = getenv("NH_TEST_SCENARIO");
    if (direct_scenario && *direct_scenario) {
        nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "direct NH_TEST_SCENARIO paths are not supported; use NH_TEST_SCENARIO_ID", NULL);
        return 2;
    }
    if (scenario_id && *scenario_id) {
        size_t id_len = strlen(scenario_id);
        if (id_len > 180 || strstr(scenario_id, "..") || scenario_id[0] == '/' || strchr(scenario_id, '\\')) {
            nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "invalid scenario id", NULL);
            return 2;
        }
        for (size_t i = 0; i < id_len; ++i) {
            unsigned char ch = (unsigned char) scenario_id[i];
            if (!(isalnum(ch) || ch == '/' || ch == '_' || ch == '-')) {
                nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "invalid scenario id", NULL);
                return 2;
            }
        }
        char scenario_path[4096];
        size_t scenario_path_size = sizeof scenario_path;
        if (bridge_working_directory(scenario_path, &scenario_path_size) != 0) {
            nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "cannot resolve scenario root", NULL);
            return 2;
        }
        for (char *cursor = scenario_path; *cursor; ++cursor)
            if (*cursor == '\\') *cursor = '/';
        const char *leaf = strrchr(scenario_path, '/');
        const char *windows_leaf = strrchr(scenario_path, '\\');
        if (!leaf || (windows_leaf && windows_leaf > leaf)) leaf = windows_leaf;
        leaf = leaf ? leaf + 1 : scenario_path;
        const char *scenario_root = !strcmp(leaf, "electron-poc")
            ? "/test/scenarios/"
            : "/electron-poc/test/scenarios/";
        size_t used = strlen(scenario_path);
        int wrote = snprintf(scenario_path + used, sizeof scenario_path - used, "%s%s.json", scenario_root, scenario_id);
        if (wrote < 0 || (size_t) wrote >= sizeof scenario_path - used) {
            nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "scenario path is too long", NULL);
            return 2;
        }
        if (bridge_environment_set("NH_TEST_SCENARIO", scenario_path) != 0) {
            nh_test_bridge_event("bridge_test_scenario_failed", scenario_id, "cannot configure scenario path", NULL);
            return 2;
        }
    }
#endif
    if (!getenv("NETHACKOPTIONS") && bridge_environment_set("NETHACKOPTIONS", "!tutorial") != 0) {
        fprintf(stderr, "Cannot configure NETHACKOPTIONS\n");
        return 2;
    }
    if (!getenv("NH_SHIM_NO_CHDIR")) {
        const char *hackdir = getenv("NETHACKDIR");
        if (!hackdir || !*hackdir) hackdir = getenv("NH_TEST_PLAYGROUND");
        int chdir_rc;
        if (hackdir && *hackdir) {
            chdir_rc = bridge_change_directory(hackdir);
        } else {
            hackdir = "playground";
            chdir_rc = bridge_change_directory(hackdir);
            if (chdir_rc) {
                hackdir = "../playground";
                chdir_rc = bridge_change_directory(hackdir);
            }
        }
        if (chdir_rc) {
            fprintf(stderr, "Cannot open NetHack playground '%s': %s\n", hackdir, bridge_platform_error(chdir_rc));
            return 2;
        }
        /* Destructive reset is opt-in only; never clear shared lock files on
         * ordinary startup because another live Electron/fixture process may
         * own them and NetHack's pid guard treats that as fatal trickery. */
        if (getenv("NH_SHIM_RESET_LOCKS") && !strcmp(getenv("NH_SHIM_RESET_LOCKS"), "1")) {
            char lockname[] = "alock.0";
            for (char c = 'a'; c <= 'z'; ++c) { lockname[0] = c; (void) remove(lockname); }
        }
    }
    bridge_thread tid;
    int thread_rc = bridge_thread_start(&tid, stdin_thread, NULL);
    if (!thread_rc) thread_rc = bridge_thread_detach(&tid);
    if (thread_rc) {
        fprintf(stderr, "Cannot start bridge input thread: %s\n", bridge_platform_error(thread_rc));
        return 2;
    }
    shim_graphics_set_callback(shim_cb);

    char userarg[80];
    snprintf(userarg, sizeof userarg, "-uElectron%ld-Val-Hum-Fem-Law", bridge_process_id() % 100000L);
    char *default_argv[] = { "nh-shim-bridge", userarg, NULL };
    if (argc <= 1) {
        argc = 2;
        argv = default_argv;
    }
    emit_event_start("bridge_start"); emit_event_end();
    if (getenv("NH_BRIDGE_PROTOCOL_CONTRACT")
        && !strcmp(getenv("NH_BRIDGE_PROTOCOL_CONTRACT"), "1")) {
        int queued_before = 0, queued_after = 0;
        (void) pop_key_blocking_with_status(&queued_before, &queued_after);
        emit_event_start("bridge_exit");
        fputs(",\"code\":0,\"reason\":\"protocol-contract\"", stdout);
        emit_event_end();
        return 0;
    }
    int rc = nhmain(argc, argv);
    emit_event_start("bridge_exit"); fprintf(stdout, ",\"code\":%d", rc); emit_event_end();
    return rc;
}

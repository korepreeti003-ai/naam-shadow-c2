// Zygisk API — from Magisk project (topjohnwu/Magisk), Apache-2.0
// Embedded to avoid network dependency in CI builds
#pragma once

#include <jni.h>
#include <cstdint>
#include <functional>
#include <initializer_list>
#include <type_traits>

#define ZYGISK_API_VERSION 4

namespace zygisk {

struct AppSpecializeArgs {
    jint &uid;
    jint &gid;
    jintArray &gids;
    jint &runtime_flags;
    jint &mount_external;
    jstring &se_info;
    jstring &nice_name;
    jstring &instruction_set;
    jstring &app_data_dir;
    jboolean *const is_child_zygote;
    jboolean *const is_top_app;
    jobjectArray *const pkg_data_info_list;
    jobjectArray *const whitelisted_data_info_list;
    jboolean *const mount_data_dirs;
    jboolean *const mount_storage_dirs;
    AppSpecializeArgs() = delete;
};

struct ServerSpecializeArgs {
    jint &uid;
    jint &gid;
    jintArray &gids;
    jint &runtime_flags;
    jlong &permitted_capabilities;
    jlong &effective_capabilities;
    ServerSpecializeArgs() = delete;
};

using SystemServerSpecializeArgs = ServerSpecializeArgs;

class Api;
class ModuleBase;

using module_abi_fn = ModuleBase *(*)();

struct ModuleBase {
    virtual void onLoad([[maybe_unused]] Api *api, [[maybe_unused]] JNIEnv *env) {}
    virtual void preAppSpecialize([[maybe_unused]] AppSpecializeArgs *args) {}
    virtual void postAppSpecialize([[maybe_unused]] const AppSpecializeArgs *args) {}
    virtual void preServerSpecialize([[maybe_unused]] ServerSpecializeArgs *args) {}
    virtual void postServerSpecialize([[maybe_unused]] const ServerSpecializeArgs *args) {}
    virtual void preSystemServerSpecialize([[maybe_unused]] SystemServerSpecializeArgs *args) {}
    virtual void postSystemServerSpecialize([[maybe_unused]] const SystemServerSpecializeArgs *args) {}
    virtual ~ModuleBase() = default;
};

enum Option : int {
    FORCE_DENYLIST_UNMOUNT = 0,
    DLCLOSE_MODULE_LIBRARY = 1,
};

enum StateFlag : uint32_t {
    PROCESS_GRANTED_ROOT        = (1u << 0),
    PROCESS_ON_DENYLIST         = (1u << 1),
};

struct Api {
    void setOption(Option opt);
    uint32_t getFlags();
    bool exemptFd(int fd);
    bool isModuleUpdated(const char *name);
    void *getModuleDir();
    bool connectCompanion();
    int getModuleFileDescriptor();
};

} // namespace zygisk

#define REGISTER_ZYGISK_MODULE(clazz) \
    extern "C" [[gnu::visibility("default")]] \
    zygisk::ModuleBase *zygisk_module_entry() { \
        return new clazz(); \
    }

#define REGISTER_ZYGISK_COMPANION(func) \
    extern "C" [[gnu::visibility("default")]] \
    void zygisk_companion_entry(int client) { \
        func(client); \
    }

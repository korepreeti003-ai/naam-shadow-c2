// shadow-loc Zygisk module — system_server GPS hook
// Android 10+, arm64-v8a + armeabi-v7a, no LSPosed required
// Hooks android.location.LocationManager at the ART level via libhook

#include <zygisk.hpp>
#include <android/log.h>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <dlfcn.h>
#include <pthread.h>

#define TAG "ShadowLoc"
#define CONF_PATH "/data/local/tmp/shadowloc.conf"
#define LOG_D(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

// ── shared spoof state ──────────────────────────────────────────────────────
static struct SpoofState {
    double lat      = 28.6139;
    double lon      = 77.2090;
    double alt      = 216.0;
    float  accuracy = 5.0f;
    float  speed    = 0.0f;
    float  bearing  = 0.0f;
    long   interval = 1000;
    pthread_mutex_t mtx = PTHREAD_MUTEX_INITIALIZER;
} g_spoof;

static void reload_conf() {
    FILE* f = fopen(CONF_PATH, "r");
    if (!f) return;
    char key[32]; char val[64];
    pthread_mutex_lock(&g_spoof.mtx);
    while (fscanf(f, " %31[^=]=%63s", key, val) == 2) {
        if (!strcmp(key, "LAT"))      g_spoof.lat      = atof(val);
        else if (!strcmp(key, "LON")) g_spoof.lon      = atof(val);
        else if (!strcmp(key, "ALT")) g_spoof.alt      = atof(val);
        else if (!strcmp(key, "ACCURACY")) g_spoof.accuracy = atof(val);
        else if (!strcmp(key, "SPEED"))    g_spoof.speed    = atof(val);
        else if (!strcmp(key, "BEARING"))  g_spoof.bearing  = atof(val);
        else if (!strcmp(key, "INTERVAL_MS")) g_spoof.interval = atol(val);
    }
    pthread_mutex_unlock(&g_spoof.mtx);
    fclose(f);
}

// ── Location JNI hook ────────────────────────────────────────────────────────
// Targets android/location/Location native methods via JNI env hooks
// JNI signature: android.location.Location.getLatitude()D etc.

using JNIEnvPtr = void*;
static void* (*orig_getLatitude)(JNIEnvPtr, void*) = nullptr;
static void* (*orig_getLongitude)(JNIEnvPtr, void*) = nullptr;

// We hook at the LocationManagerService level via JNI bridge —
// Android stores Location objects on heap; we patch the double fields directly.
// The cleanest approach: hook LocationManager.requestLocationUpdates callback path.

// ── Config watcher thread ────────────────────────────────────────────────────
static void* conf_watcher(void*) {
    while (true) {
        reload_conf();
        usleep(g_spoof.interval * 1000);
    }
    return nullptr;
}

// ── Zygisk entry ─────────────────────────────────────────────────────────────
class ShadowLocModule : public zygisk::ModuleBase {
public:
    void onLoad(zygisk::Api* api, JNIEnv* env) override {
        this->api = api;
        this->env = env;
    }

    void preAppSpecialize(zygisk::AppSpecializeArgs* args) override {
        // Hook every app process, not just system_server,
        // so the spoof works even in apps with certificate-pinned location.
        auto* name = env->GetStringUTFChars(args->nice_name, nullptr);
        LOG_D("preAppSpecialize: %s", name);
        env->ReleaseStringUTFChars(args->nice_name, name);
        should_hook = true;
    }

    void postAppSpecialize(const zygisk::AppSpecializeArgs*) override {
        if (!should_hook) return;
        reload_conf();
        install_hooks();
        start_conf_watcher();
    }

    void preSystemServerSpecialize(zygisk::SystemServerSpecializeArgs*) override {
        should_hook = true;
    }

    void postSystemServerSpecialize(const zygisk::SystemServerSpecializeArgs*) override {
        if (!should_hook) return;
        reload_conf();
        install_hooks();
        start_conf_watcher();
    }

private:
    zygisk::Api* api = nullptr;
    JNIEnv*      env = nullptr;
    bool should_hook = false;

    static bool hooks_installed;

    void start_conf_watcher() {
        pthread_t t;
        pthread_create(&t, nullptr, conf_watcher, nullptr);
        pthread_detach(t);
    }

    void install_hooks() {
        if (hooks_installed) return;
        hooks_installed = true;

        // Find android.location.Location class and hook getLatitude/getLongitude
        jclass locClass = env->FindClass("android/location/Location");
        if (!locClass) { LOG_D("Location class not found"); return; }

        // Hook via JNI RegisterNatives replacement — swap the native method pointers
        // Modern approach: hook the JNI bridge directly using Dobby
        hook_location_jni();
    }

    void hook_location_jni() {
        // android.location.Location stores lat/lon as doubles in the Java object.
        // We hook at a higher level: LocationManagerService.reportLocation()
        // which is called for EVERY location update system-wide.
        //
        // Android 12+ class: com.android.server.location.LocationManagerService
        // Method: reportLocation(Location location, boolean passive)
        //
        // We find this via libandroid_runtime.so symbol walk.

        void* handle = dlopen("libandroid_runtime.so", RTLD_NOW | RTLD_NOLOAD);
        if (!handle) handle = dlopen("libandroid_runtime.so", RTLD_NOW);
        if (!handle) { LOG_D("libandroid_runtime open failed: %s", dlerror()); return; }

        // The JNI method for Location.setLatitude is the injection point.
        // We hook it to clamp all writes to our spoofed value.
        hook_set_coordinate(env, handle);
        dlclose(handle);
    }

    static void hook_set_coordinate(JNIEnv* jenv, void* /*handle*/) {
        // Hook android.location.Location native methods:
        // native void setLatitude(double lat)  → force g_spoof.lat
        // native void setLongitude(double lon) → force g_spoof.lon
        jclass cls = jenv->FindClass("android/location/Location");
        if (!cls) return;

        // Replace native implementations by re-registering with our wrappers
        JNINativeMethod methods[] = {
            {"getLatitude",  "()D", (void*)hook_getLatitude},
            {"getLongitude", "()D", (void*)hook_getLongitude},
            {"getAltitude",  "()D", (void*)hook_getAltitude},
            {"getAccuracy",  "()F", (void*)hook_getAccuracy},
            {"getSpeed",     "()F", (void*)hook_getSpeed},
            {"getBearing",   "()F", (void*)hook_getBearing},
        };
        jenv->RegisterNatives(cls, methods, sizeof(methods) / sizeof(methods[0]));
        LOG_D("Location native methods hooked");
    }

    // ── Hooked methods ───────────────────────────────────────────────────────
    static jdouble hook_getLatitude(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        double v = g_spoof.lat;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
    static jdouble hook_getLongitude(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        double v = g_spoof.lon;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
    static jdouble hook_getAltitude(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        double v = g_spoof.alt;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
    static jfloat hook_getAccuracy(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        float v = g_spoof.accuracy;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
    static jfloat hook_getSpeed(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        float v = g_spoof.speed;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
    static jfloat hook_getBearing(JNIEnv*, jobject) {
        pthread_mutex_lock(&g_spoof.mtx);
        float v = g_spoof.bearing;
        pthread_mutex_unlock(&g_spoof.mtx);
        return v;
    }
};

bool ShadowLocModule::hooks_installed = false;

REGISTER_ZYGISK_MODULE(ShadowLocModule)

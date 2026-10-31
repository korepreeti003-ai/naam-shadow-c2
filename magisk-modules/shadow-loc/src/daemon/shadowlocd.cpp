// shadowlocd — root daemon, feeds fake location to the mock provider
// Runs as root, reads /data/local/tmp/shadowloc.conf, updates every INTERVAL_MS
// Communicates with the companion APK via a Unix domain socket

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <csignal>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <android/log.h>
#include <getopt.h>

#define TAG "shadowlocd"
#define SOCK_PATH "/data/local/tmp/shadowloc.sock"
#define LOG_D(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

static const char* g_conf_path = "/data/local/tmp/shadowloc.conf";
static const char* g_pid_path  = "/data/local/tmp/shadowlocd.pid";
static volatile bool g_running  = true;

struct LocConf {
    double lat      = 28.6139;
    double lon      = 77.2090;
    double alt      = 216.0;
    float  accuracy = 5.0f;
    float  speed    = 0.0f;
    float  bearing  = 0.0f;
    long   interval = 1000;
};

static LocConf load_conf(const char* path) {
    LocConf c;
    FILE* f = fopen(path, "r");
    if (!f) return c;
    char key[32], val[64];
    while (fscanf(f, " %31[^=\n]=%63s", key, val) == 2) {
        if (key[0] == '#') continue;
        if (!strcmp(key, "LAT"))         c.lat      = atof(val);
        else if (!strcmp(key, "LON"))    c.lon      = atof(val);
        else if (!strcmp(key, "ALT"))    c.alt      = atof(val);
        else if (!strcmp(key, "ACCURACY")) c.accuracy = atof(val);
        else if (!strcmp(key, "SPEED"))  c.speed    = atof(val);
        else if (!strcmp(key, "BEARING")) c.bearing  = atof(val);
        else if (!strcmp(key, "INTERVAL_MS")) c.interval = atol(val);
    }
    fclose(f);
    return c;
}

static void write_pid(const char* path) {
    FILE* f = fopen(path, "w");
    if (f) { fprintf(f, "%d\n", getpid()); fclose(f); }
}

static void daemonize() {
    pid_t pid = fork();
    if (pid < 0) exit(1);
    if (pid > 0) exit(0); // parent exits
    setsid();
    pid = fork();
    if (pid < 0) exit(1);
    if (pid > 0) exit(0);
    umask(0);
    chdir("/");
    for (int fd = sysconf(_SC_OPEN_MAX); fd >= 0; fd--) close(fd);
    open("/dev/null", O_RDONLY);
    open("/dev/null", O_WRONLY);
    open("/dev/null", O_WRONLY);
}

// Send location update to companion APK via Unix socket
// The APK listens on SOCK_PATH and calls LocationManager.setTestProviderLocation()
static void send_location(int sock_fd, const LocConf& c) {
    char buf[256];
    snprintf(buf, sizeof(buf),
        "{\"lat\":%.8f,\"lon\":%.8f,\"alt\":%.2f,"
        "\"acc\":%.2f,\"spd\":%.2f,\"brg\":%.2f}\n",
        c.lat, c.lon, c.alt, c.accuracy, c.speed, c.bearing);
    write(sock_fd, buf, strlen(buf));
}

// Also inject via 'am broadcast' as fallback (works without APK)
static void inject_via_am(const LocConf& c) {
    char cmd[512];
    snprintf(cmd, sizeof(cmd),
        "am broadcast -a com.shadow.loc.UPDATE "
        "--ef lat %.8f --ef lon %.8f --ef alt %.2f "
        "--ef acc %.2f --ef spd %.2f --ef brg %.2f "
        "com.shadow.loc 2>/dev/null",
        c.lat, c.lon, c.alt, c.accuracy, c.speed, c.bearing);
    system(cmd);
}

static void sig_handler(int) { g_running = false; }

int main(int argc, char* argv[]) {
    bool do_daemonize = false;

    static struct option opts[] = {
        {"config",    required_argument, 0, 'c'},
        {"daemonize", no_argument,       0, 'd'},
        {"pidfile",   required_argument, 0, 'p'},
        {0, 0, 0, 0}
    };
    int opt;
    while ((opt = getopt_long(argc, argv, "c:dp:", opts, nullptr)) != -1) {
        switch (opt) {
        case 'c': g_conf_path = optarg; break;
        case 'd': do_daemonize = true;  break;
        case 'p': g_pid_path = optarg;  break;
        }
    }

    if (do_daemonize) daemonize();
    write_pid(g_pid_path);

    signal(SIGTERM, sig_handler);
    signal(SIGINT,  sig_handler);

    LOG_D("shadowlocd started, conf=%s", g_conf_path);

    // Unix socket to companion APK
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCK_PATH, sizeof(addr.sun_path) - 1);
    unlink(SOCK_PATH);
    bind(sock, (struct sockaddr*)&addr, sizeof(addr));
    chmod(SOCK_PATH, 0666);
    listen(sock, 1);

    // Set non-blocking so we can keep looping even without APK connected
    fcntl(sock, F_SETFL, O_NONBLOCK);

    int client_fd = -1;

    while (g_running) {
        LocConf c = load_conf(g_conf_path);

        // Accept new APK connection if available
        if (client_fd < 0) {
            client_fd = accept(sock, nullptr, nullptr);
            if (client_fd >= 0) {
                LOG_D("APK connected");
            }
        }

        if (client_fd >= 0) {
            send_location(client_fd, c);
            // Detect disconnect
            char probe;
            if (recv(client_fd, &probe, 1, MSG_PEEK | MSG_DONTWAIT) == 0) {
                LOG_D("APK disconnected");
                close(client_fd);
                client_fd = -1;
            }
        } else {
            // Fallback: use am broadcast (slower but no APK needed)
            inject_via_am(c);
        }

        usleep(c.interval * 1000);
    }

    if (client_fd >= 0) close(client_fd);
    close(sock);
    unlink(SOCK_PATH);
    unlink(g_pid_path);
    return 0;
}

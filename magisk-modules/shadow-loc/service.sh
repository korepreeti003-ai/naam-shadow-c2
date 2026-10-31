#!/system/bin/sh
# Shadow Location Daemon — runs post-boot, keeps alive 24hr
MODDIR="${0%/*}"
CONF=/data/local/tmp/shadowloc.conf
DAEMON="$MODDIR/shadowlocd"
LOGFILE=/data/local/tmp/shadowloc.log
PIDFILE=/data/local/tmp/shadowlocd.pid

log() { echo "[shadowloc] $1" >> "$LOGFILE"; }

# Wait for boot to complete
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 2
done
sleep 5

log "Boot complete — starting Shadow Location daemon"

# Ensure config exists
[ -f "$CONF" ] || cp "$MODDIR/shadowloc.conf" "$CONF" && chmod 666 "$CONF"

# Grant mock location to our provider package
pm grant com.shadow.loc android.permission.ACCESS_MOCK_LOCATION 2>/dev/null
appops set com.shadow.loc android:mock_location allow 2>/dev/null

# Enable mock location system-wide (disables "allow mock location" check per app)
settings put secure mock_location_providers_allowed "gps,network"

# Watchdog loop — keep daemon alive
while true; do
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if ! kill -0 "$PID" 2>/dev/null; then
            log "Daemon died (pid $PID) — restarting"
            rm -f "$PIDFILE"
        fi
    fi

    if [ ! -f "$PIDFILE" ]; then
        "$DAEMON" --config "$CONF" --daemonize --pidfile "$PIDFILE" >> "$LOGFILE" 2>&1
        log "Daemon started with pid $(cat $PIDFILE 2>/dev/null)"
    fi

    sleep 30
done &

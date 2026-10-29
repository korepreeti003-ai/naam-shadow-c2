# Keep entry points
-keep class com.base.util.apps.MainActivity    { *; }
-keep class com.base.util.apps.VpnBypassService { *; }

# Remove log calls in release
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}

# Aggressive rename everything else
-repackageclasses ''
-allowaccessmodification
-optimizationpasses 5

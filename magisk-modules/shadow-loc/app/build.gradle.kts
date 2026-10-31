plugins {
    id("com.android.application") version "8.7.3" apply true
    id("org.jetbrains.kotlin.android") version "2.0.21" apply true
}

android {
    namespace = "com.shadow.loc"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.shadow.loc"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    signingConfigs {
        // debug key used for signing — Magisk module installs via root so signing
        // is irrelevant for functionality; platform key is NOT needed when using
        // appops/root to grant ACCESS_MOCK_LOCATION instead of sharedUserId=system
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    // org.json is provided by Android SDK — no standalone dep needed
}

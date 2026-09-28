#!/bin/bash
# Install apktool + apksigner + zipalign + keytool on Ubuntu 24.04
set -e

echo "Installing Java..."
apt-get install -y openjdk-17-jdk-headless

echo "Installing zipalign + apksigner (Android build tools)..."
apt-get install -y android-sdk-build-tools 2>/dev/null || true

# zipalign fallback via aapt
if ! command -v zipalign &>/dev/null; then
  apt-get install -y aapt 2>/dev/null || true
fi

echo "Installing apktool..."
wget -q https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool \
  -O /usr/local/bin/apktool
wget -q https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar \
  -O /usr/local/bin/apktool.jar
chmod +x /usr/local/bin/apktool

echo "Installing uber-apk-signer (easier signing)..."
wget -q https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar \
  -O /usr/local/bin/uber-apk-signer.jar

echo "APK tools installed."
apktool --version

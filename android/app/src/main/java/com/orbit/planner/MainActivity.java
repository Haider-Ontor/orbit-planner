package com.orbit.planner;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class); // in-app updates (see src/lib/update.ts)
        super.onCreate(savedInstanceState);
    }
}

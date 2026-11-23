package com.orbit.planner;

import android.app.Activity;
import android.app.PendingIntent;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.util.ArrayList;
import java.util.List;

/**
 * Google Drive access on Android through Google Play Services: the system
 * account picker / consent screen, then a short-lived access token.
 * Needs an "Android" OAuth client (package com.orbit.planner + the APK's
 * SHA-1) in the same Google Cloud project as the desktop client.
 */
@CapacitorPlugin(name = "GoogleDrive")
public class GoogleDrivePlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pending;
            pending = null;
            if (call == null) return;
            // Even when the screen closes without success, Google usually puts the real reason
            // (e.g. 10 = app not registered with this package/SHA-1) in the result intent.
            try {
                AuthorizationResult r = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData());
                if (result.getResultCode() == Activity.RESULT_OK) { resolveToken(call, r); return; }
                call.reject("code:cancelled");
            } catch (ApiException e) {
                call.reject("code:" + e.getStatusCode() + ":" + e.getMessage());
            } catch (Exception e) {
                call.reject(result.getResultCode() == Activity.RESULT_OK ? "code:error:" + e.getMessage() : "code:cancelled");
            }
        });
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        List<Scope> scopes = new ArrayList<>();
        try {
            JSArray arr = call.getArray("scopes", new JSArray());
            for (int i = 0; i < arr.length(); i++) scopes.add(new Scope(arr.getString(i)));
        } catch (Exception e) {
            call.reject("Bad scopes");
            return;
        }
        if (scopes.isEmpty()) scopes.add(new Scope("https://www.googleapis.com/auth/drive.file"));
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));

        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(scopes).build();
        Identity.getAuthorizationClient(getActivity()).authorize(req)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) { call.reject("needs-consent"); return; }
                    PendingIntent pi = result.getPendingIntent();
                    if (pi == null) { call.reject("Google sign-in is not available"); return; }
                    pending = call;
                    launcher.launch(new IntentSenderRequest.Builder(pi.getIntentSender()).build());
                } else {
                    resolveToken(call, result);
                }
            })
            .addOnFailureListener(e -> {
                String code = e instanceof ApiException ? String.valueOf(((ApiException) e).getStatusCode()) : "error";
                call.reject("code:" + code + ":" + e.getMessage());
            });
    }

    private void resolveToken(PluginCall call, AuthorizationResult r) {
        String token = r.getAccessToken();
        if (token == null) { call.reject("Google did not return an access token"); return; }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        call.resolve(out);
    }
}

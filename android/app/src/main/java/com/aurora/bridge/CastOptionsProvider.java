package com.aurora.bridge;

import android.content.Context;

import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionProvider;

import java.util.List;

/** Tells the Cast framework which receiver app to launch on the TV (the App ID saved in Settings). */
public class CastOptionsProvider implements OptionsProvider {
    @Override
    public CastOptions getCastOptions(Context context) {
        String id = context.getSharedPreferences("aurora", Context.MODE_PRIVATE).getString("castAppId", "");
        return new CastOptions.Builder()
                .setReceiverApplicationId(id)
                .setStopReceiverApplicationWhenEndingSession(true)
                .build();
    }

    @Override
    public List<SessionProvider> getAdditionalSessionProviders(Context context) {
        return null;
    }
}

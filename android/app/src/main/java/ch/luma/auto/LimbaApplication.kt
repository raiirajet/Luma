package ch.luma.auto

import android.app.Application
import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import org.json.JSONObject

class LimbaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // FCM uses the default Firebase app. The named app retains the installed Auth session.
        limbaFirebaseApp(this, FirebaseApp.DEFAULT_APP_NAME)
    }
}

@Synchronized
internal fun limbaFirebaseApp(context: Context, name: String = "limba"): FirebaseApp? {
    val appContext = context.applicationContext
    FirebaseApp.getApps(appContext).find { it.name == name }?.let { return it }
    return runCatching {
        val config = JSONObject(appContext.assets.open("firebase-config.json").bufferedReader().use { it.readText() })
        val options = FirebaseOptions.Builder()
            .setApiKey(config.getString("apiKey")).setApplicationId(config.getString("appId"))
            .setProjectId(config.getString("projectId"))
            .apply {
                config.optString("storageBucket").takeIf { it.isNotBlank() }?.let(::setStorageBucket)
                config.optString("messagingSenderId").takeIf { it.isNotBlank() }?.let(::setGcmSenderId)
            }.build()
        require(options.apiKey.isNotBlank() && !options.projectId.isNullOrBlank())
        if (name == FirebaseApp.DEFAULT_APP_NAME) require(!options.gcmSenderId.isNullOrBlank())
        FirebaseApp.initializeApp(appContext, options, name).also { app ->
            if (name == "limba" && !BuildConfig.DEBUG && config.optBoolean("appCheckPlayIntegrity", true)) {
                runCatching {
                    FirebaseAppCheck.getInstance(app)
                        .installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
                }.onFailure { Log.w("LimbaFirebase", "App Check initialization failed", it) }
            }
        }
    }.getOrNull()
}

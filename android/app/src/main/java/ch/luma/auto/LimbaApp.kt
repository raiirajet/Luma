package ch.luma.auto

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import org.json.JSONObject

/** Initialise the default Firebase app early for FCM background delivery. */
class LimbaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        runCatching {
            val data = JSONObject(assets.open("firebase-config.json").bufferedReader().use { it.readText() })
            if (data.optString("projectId").isBlank() || data.optString("appId").isBlank() ||
                data.optString("messagingSenderId").isBlank() || data.optString("apiKey").isBlank()) return@runCatching
            if (FirebaseApp.getApps(this).none { it.name == FirebaseApp.DEFAULT_APP_NAME }) {
                val options = FirebaseOptions.Builder()
                    .setApiKey(data.getString("apiKey"))
                    .setApplicationId(data.getString("appId"))
                    .setProjectId(data.getString("projectId"))
                    .setGcmSenderId(data.getString("messagingSenderId"))
                    .apply { if (data.optString("storageBucket").isNotBlank()) setStorageBucket(data.getString("storageBucket")) }
                    .build()
                FirebaseApp.initializeApp(this,options)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("limba_updates","Limba Nachrichten",NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "Nachrichten und Angebotsstatus ohne private Inhalte"
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }
}

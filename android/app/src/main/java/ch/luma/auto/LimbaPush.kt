package ch.luma.auto

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.UUID
import java.util.Locale

data class LimbaPushPreferences(val messages: Boolean, val searchMatches: Boolean)
data class LimbaPushTarget(val threadId: String? = null, val listingId: String? = null)

object LimbaPush {
    private const val account = "activeAccount"
    private const val installation = "installationId"
    private const val eventExtra = "ch.luma.auto.push.event"
    private const val accountExtra = "ch.luma.auto.push.account"
    private const val threadExtra = "ch.luma.auto.push.thread"
    private const val listingExtra = "ch.luma.auto.push.listing"
    private val valueId = Regex("[A-Za-z0-9_-]{1,128}")
    @Volatile private var signingOut = false
    @Volatile private var syncedRegistration: String? = null
    private var syncedAt = 0L

    private fun storage(context: Context) = context.getSharedPreferences("limba_android_push", Context.MODE_PRIVATE)
    private fun auth(context: Context) = limbaFirebaseApp(context)?.let(FirebaseAuth::getInstance)
    private fun messaging() = runCatching { FirebaseMessaging.getInstance() }.getOrNull()
    private fun allowed(context: Context) = (Build.VERSION.SDK_INT < 33 ||
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
        context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

    fun preferences(context: Context): LimbaPushPreferences {
        val uid = auth(context)?.currentUser?.uid ?: return LimbaPushPreferences(false, false)
        return preferences(context, uid)
    }

    private fun preferences(context: Context, uid: String) = storage(context).let {
        LimbaPushPreferences(it.getBoolean("$uid.messages", false), it.getBoolean("$uid.searchMatches", false))
    }

    @Synchronized
    private fun installationId(context: Context): String {
        val store = storage(context)
        return store.getString(installation, null) ?: UUID.randomUUID().toString().also {
            store.edit().putString(installation, it).apply()
        }
    }

    fun updatePreferences(
        context: Context, firebase: LimbaFirebase, messages: Boolean, searchMatches: Boolean, locale: String
    ) {
        val uid = firebase.auth?.currentUser?.takeIf { it.isEmailVerified }?.uid ?: return
        storage(context).edit().putBoolean("$uid.messages", messages)
            .putBoolean("$uid.searchMatches", searchMatches).apply()
        sync(context, firebase, locale)
    }

    fun sync(context: Context, firebase: LimbaFirebase, locale: String) {
        if (signingOut) return
        val uid = firebase.auth?.currentUser?.takeIf { it.isEmailVerified }?.uid
        val store = storage(context)
        val previous = store.getString(account, null)
        if (previous != uid) {
            syncedRegistration = null
            context.getSystemService(NotificationManager::class.java).cancelAll()
        }
        store.edit().putString(account, uid).putString("locale", locale.take(12)).apply()
        if (uid == null) return
        val selected = preferences(context, uid)
        if (!allowed(context) || (!selected.messages && !selected.searchMatches)) {
            revoke(context, uid)
            return
        }
        messaging()?.token?.addOnSuccessListener { token -> register(context.applicationContext, uid, token) }
    }

    private fun revoke(context: Context, uid: String, done: () -> Unit = {}) {
        val app = limbaFirebaseApp(context)
        val store = storage(context)
        if (app == null || (!store.getBoolean("$uid.registered", false) && syncedRegistration == null)) {
            done()
            return
        }
        syncedRegistration = null
        FirebaseFunctions.getInstance(app, "europe-west6").getHttpsCallable("deleteAndroidPushRegistration")
            .call(mapOf("installationId" to installationId(context))).addOnCompleteListener { task ->
                if (task.isSuccessful) store.edit().remove("$uid.registered").apply()
                done()
            }
    }

    fun signOut(context: Context, firebase: LimbaFirebase) {
        val auth = firebase.auth ?: return
        val uid = auth.currentUser?.uid ?: return
        if (signingOut) return
        signingOut = true
        storage(context).edit().remove(account).apply()
        context.getSystemService(NotificationManager::class.java).cancelAll()
        val handler = Handler(Looper.getMainLooper())
        val finish = Runnable {
            if (!signingOut) return@Runnable
            signingOut = false
            if (auth.currentUser?.uid == uid) auth.signOut()
        }
        handler.postDelayed(finish, 1500)
        revoke(context, uid) {
            handler.removeCallbacks(finish)
            finish.run()
        }
    }

    internal fun refresh(context: Context, token: String) {
        storage(context).getString(account, null)?.let { register(context, it, token) }
    }

    private fun register(context: Context, uid: String, token: String) {
        val store = storage(context)
        val user = auth(context)?.currentUser?.takeIf { it.uid == uid && it.isEmailVerified } ?: return
        if (signingOut || store.getString(account, null) != user.uid || !allowed(context)) return
        val selected = preferences(context, uid)
        if (!selected.messages && !selected.searchMatches) return
        val locale = store.getString("locale", "de") ?: "de"
        val key = "$uid|$token|$selected|$locale"
        val now = System.currentTimeMillis()
        if (syncedRegistration == key && now - syncedAt < 30 * 60 * 1000) return
        val app = limbaFirebaseApp(context) ?: return
        syncedRegistration = key
        syncedAt = now
        // Persist before dispatch so logout can revoke a registration with an uncertain reply.
        store.edit().putBoolean("$uid.registered", true).apply()
        FirebaseFunctions.getInstance(app, "europe-west6").getHttpsCallable("setAndroidPushRegistration").call(mapOf(
            "installationId" to installationId(context), "token" to token,
            "messages" to selected.messages, "searchMatches" to selected.searchMatches, "locale" to locale
        )).addOnFailureListener { if (syncedRegistration == key) syncedRegistration = null }
    }

    private fun target(values: Map<String, String>): LimbaPushTarget? = when (values["kind"]) {
        "message" -> values["threadId"]?.takeIf(valueId::matches)?.let { LimbaPushTarget(threadId = it) }
        "searchMatch" -> values["listingId"]?.takeIf(valueId::matches)?.let { LimbaPushTarget(listingId = it) }
        else -> null
    }

    fun open(intent: Intent, uid: String?): LimbaPushTarget? {
        intent.getStringExtra(eventExtra)?.takeIf(valueId::matches) ?: return null
        val matches = uid != null && uid == intent.getStringExtra(accountExtra)
        val result = if (matches) LimbaPushTarget(
            intent.getStringExtra(threadExtra)?.takeIf(valueId::matches),
            intent.getStringExtra(listingExtra)?.takeIf(valueId::matches)
        ) else null
        for (extra in listOf(eventExtra, accountExtra, threadExtra, listingExtra)) intent.removeExtra(extra)
        return result?.takeIf { it.threadId != null || it.listingId != null }
    }

    internal fun display(context: Context, values: Map<String, String>) {
        val uid = values["uid"] ?: return
        val event = values["eventId"]?.takeIf(valueId::matches) ?: return
        val store = storage(context)
        val current = auth(context)?.currentUser
        if (current?.uid != uid || !current.isEmailVerified || store.getString(account, null) != uid || !allowed(context)) return
        val target = target(values) ?: return
        val selected = preferences(context, uid)
        val message = target.threadId != null
        if ((message && !selected.messages) || (!message && !selected.searchMatches)) return
        val seen = store.getString("$uid.events", "").orEmpty().split(',').filter { it.isNotEmpty() }
        if (event in seen) return
        store.edit().putString("$uid.events", (seen.takeLast(63) + event).joinToString(",")).apply()
        val channel = if (message) "limba_messages" else "limba_search_matches"
        val title = if (message) R.string.push_messages_channel else R.string.push_search_channel
        val body = if (message) R.string.push_message_body else R.string.push_search_body
        val localized = context.createConfigurationContext(Configuration(context.resources.configuration).apply {
            setLocale(Locale.forLanguageTag(store.getString("locale", "de") ?: "de"))
        })
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(NotificationChannel(channel, localized.getString(title), NotificationManager.IMPORTANCE_DEFAULT))
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(accountExtra, uid)
            putExtra(eventExtra, event)
            target.threadId?.let { putExtra(threadExtra, it) }
            target.listingId?.let { putExtra(listingExtra, it) }
        }
        val click = PendingIntent.getActivity(context, event.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        notificationManager.notify(event, 1, Notification.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_limba_notification).setContentTitle("Limba")
            .setContentText(localized.getString(body)).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(click).setAutoCancel(true).build())
    }
}

class LimbaMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) = LimbaPush.refresh(this, token)
    override fun onMessageReceived(message: RemoteMessage) = LimbaPush.display(this, message.data)
}

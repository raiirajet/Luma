package ch.luma.auto

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Generic lock-screen copy; FCM payloads must never include private messages. */
class LimbaMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val kind = message.data["type"] ?: "message"
        val body = if(kind == "offer") "Neuer Angebotsstatus" else "Neue Nachricht"
        val intent = Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(this,0,intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this,"limba_updates")
            .setSmallIcon(R.drawable.ic_luma)
            .setContentTitle("Limba")
            .setContentText(body)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(
            (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),notification)
    }
}

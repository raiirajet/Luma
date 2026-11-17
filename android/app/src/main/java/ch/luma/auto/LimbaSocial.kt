package ch.luma.auto

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.os.Build
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.view.View
import android.text.InputType
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.TimeUnit

/** All user-to-user mutations use callable Functions; only subscriptions use Firestore. */
class LimbaSocial(private val activity: Activity) {
    private val app = FirebaseApp.getApps(activity).firstOrNull { it.name == "limba" }
    private val auth = app?.let { FirebaseAuth.getInstance(it) }
    private val db = app?.let { FirebaseFirestore.getInstance(it) }
    private val functions = app?.let { FirebaseFunctions.getInstance(it,"europe-west6") }
    val ready get() = auth != null && db != null && functions != null
    val uid get() = auth?.currentUser?.uid
    val linkedPhone get() = !auth?.currentUser?.phoneNumber.isNullOrBlank()
    private val digits = Regex("^\\+[1-9][0-9]{6,14}$")

    fun callable(name:String, input:Map<String,Any?>, done:(Map<String,Any?>?,String?)->Unit) {
        val f=functions ?: return done(null,"Firebase nicht konfiguriert")
        if(auth?.currentUser == null)return done(null,"Bitte anmelden")
        f.getHttpsCallable(name).call(input).addOnSuccessListener { result ->
            @Suppress("UNCHECKED_CAST")
            done(result.data as? Map<String,Any?>,null)
        }.addOnFailureListener { done(null,it.localizedMessage ?: "Aktion fehlgeschlagen") }
    }

    fun requireVerified(next:()->Unit, error:(String)->Unit) {
        val user=auth?.currentUser ?: return error("Bitte anmelden")
        user.reload().addOnSuccessListener {
            if(!user.isEmailVerified){error("Bitte E-Mail zuerst bestätigen");return@addOnSuccessListener}
            if(user.phoneNumber.isNullOrBlank()) {linkPhone(next,error);return@addOnSuccessListener}
            user.getIdToken(true).addOnSuccessListener { next() }
                .addOnFailureListener { error(it.localizedMessage ?: "Token ungültig") }
        }.addOnFailureListener { error(it.localizedMessage ?: "Anmeldung prüfen") }
    }

    fun linkPhone(complete:()->Unit = {}, error:(String)->Unit) {
        val a=auth ?: return error("Firebase nicht eingerichtet")
        val user=a.currentUser ?: return error("Bitte anmelden")
        val phone=EditText(activity).apply {
            hint="+41…";inputType=InputType.TYPE_CLASS_PHONE
            setSingleLine(true)
        }
        val dialog=AlertDialog.Builder(activity).setTitle("Telefonnummer bestätigen")
            .setMessage("Telefon mit dem bestehenden E-Mail-Konto verknüpfen")
            .setView(phone)
            .setNegativeButton("Abbrechen",null)
            .setPositiveButton("SMS senden",null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val number=phone.text.toString().trim()
                if(!digits.matches(number)){phone.error="Mit Landesvorwahl eingeben";return@setOnClickListener}
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled=false
                val callbacks=object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                    override fun onVerificationCompleted(credential:PhoneAuthCredential) {
                        user.linkWithCredential(credential).addOnSuccessListener {
                            user.getIdToken(true).addOnCompleteListener {
                                callable("syncPublicProfile", emptyMap()) { _,_ -> }
                                dialog.dismiss();complete()
                            }
                        }.addOnFailureListener { error(it.localizedMessage ?: "Verknüpfung fehlgeschlagen") }
                    }
                    override fun onVerificationFailed(e:com.google.firebase.FirebaseException) {
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled=true
                        error(e.localizedMessage ?: "SMS-Verifizierung fehlgeschlagen")
                    }
                    override fun onCodeSent(verificationId:String,token:PhoneAuthProvider.ForceResendingToken) {
                        dialog.dismiss()
                        val code=EditText(activity).apply {
                            hint="SMS-Code";inputType=InputType.TYPE_CLASS_NUMBER
                        }
                        AlertDialog.Builder(activity).setTitle("SMS-Code bestätigen")
                            .setView(code).setNegativeButton("Abbrechen",null)
                            .setPositiveButton("Bestätigen") { _,_ ->
                                val credential=PhoneAuthProvider.getCredential(verificationId,code.text.toString().trim())
                                user.linkWithCredential(credential).addOnSuccessListener {
                                    user.getIdToken(true).addOnCompleteListener {
                                        callable("syncPublicProfile", emptyMap()) { _,_ -> }
                                        complete()
                                    }
                                }.addOnFailureListener { error(it.localizedMessage ?: "Code ungültig") }
                            }.show()
                    }
                }
                val options=PhoneAuthOptions.newBuilder(a)
                    .setPhoneNumber(number).setTimeout(60L,TimeUnit.SECONDS)
                    .setActivity(activity).setCallbacks(callbacks).build()
                PhoneAuthProvider.verifyPhoneNumber(options)
            }
        }
        dialog.show()
    }

    fun beginConversation(listingId:String, done:(String?,String?)->Unit) {
        requireVerified({
            callable("createConversation",mapOf("listingId" to listingId)) { result,e ->
                done(result?.get("conversationId") as? String,e)
            }
        },{e->done(null,e)})
    }
    fun sendMessage(id:String,text:String,done:(String?)->Unit) {
        callable("sendMessage",mapOf("conversationId" to id,"text" to text)) { _,e -> done(e) }
    }
    fun createOffer(id:String,amount:Int,done:(String?)->Unit) {
        val until=java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US).apply {
            timeZone=java.util.TimeZone.getTimeZone("UTC")
        }.format(java.util.Date(System.currentTimeMillis()+86400000))
        callable("createOffer",mapOf("conversationId" to id,"amountEur" to amount,"validUntil" to until)){_,e->done(e)}
    }
    fun respond(offerId:String,accept:Boolean,done:(String?)->Unit) {
        callable("respondToOffer",mapOf("offerId" to offerId,"action" to if(accept)"accept" else "reject")){_,e->done(e)}
    }
    fun handover(id:String,done:(String?)->Unit) {
        callable("confirmHandover",mapOf("transactionId" to id)){_,e->done(e)}
    }
    fun purchase(id:String,done:(String?)->Unit) {
        callable("confirmPurchase",mapOf("transactionId" to id)){_,e->done(e)}
    }
    fun submitReview(id:String,stars:Int,tags:List<String>,comment:String,done:(String?)->Unit) {
        callable("submitReview",mapOf("transactionId" to id,"stars" to stars,"tags" to tags,"comment" to comment)){_,e->done(e)}
    }
    fun editReview(id:String,stars:Int,tags:List<String>,comment:String,done:(String?)->Unit) {
        callable("editReview",mapOf("reviewId" to id,"stars" to stars,"tags" to tags,"comment" to comment)){_,e->done(e)}
    }
    fun withdrawReview(id:String,done:(String?)->Unit) {
        callable("withdrawReview",mapOf("reviewId" to id)){_,e->done(e)}
    }
    fun report(entityType:String,entityId:String,reason:String,done:(String?)->Unit) {
        callable("reportContent",mapOf("entityType" to entityType,"entityId" to entityId,"reason" to reason,"details" to "")){_,e->done(e)}
    }
    fun block(target:String,done:(String?)->Unit) {
        callable("blockUser",mapOf("uid" to target)){_,e->done(e)}
    }
    fun watchConversations(onData:(List<DocumentSnapshot>)->Unit,onError:(String)->Unit):ListenerRegistration? {
        val user=uid ?: return null
        return db?.collection("conversations")?.whereArrayContains("participantUids",user)
            ?.orderBy("lastMessageAt",Query.Direction.DESCENDING)?.limit(80)
            ?.addSnapshotListener { snap,e ->
                if(e!=null)onError(e.localizedMessage ?: "Nachrichten nicht verfügbar")
                else onData(snap?.documents ?: emptyList())
            }
    }
    fun watchMessages(conversationId:String,onData:(List<DocumentSnapshot>)->Unit):ListenerRegistration? =
        db?.collection("conversations")?.document(conversationId)?.collection("messages")
            ?.orderBy("createdAt",Query.Direction.ASCENDING)?.limit(100)
            ?.addSnapshotListener { snap,_ -> onData(snap?.documents ?: emptyList()) }
    fun watchOffers(conversationId:String,onData:(List<DocumentSnapshot>)->Unit):ListenerRegistration? =
        db?.collection("conversations")?.document(conversationId)?.collection("offers")
            ?.addSnapshotListener { snap,_ -> onData(snap?.documents ?: emptyList()) }
    fun watchTransaction(conversationId:String,onData:(DocumentSnapshot?)->Unit):ListenerRegistration? =
        db?.collection("transactions")?.document(conversationId)
            ?.addSnapshotListener { snap,_ -> onData(snap) }
    fun getProfile(userId:String,onData:(DocumentSnapshot?)->Unit) {
        db?.collection("profiles")?.document(userId)?.get()
            ?.addOnSuccessListener { onData(it) }
            ?.addOnFailureListener { onData(null) }
    }
    fun saveAlias(value:String,done:(String?)->Unit) {
        val user=uid ?: return done("Bitte anmelden")
        val ref=db?.collection("profiles")?.document(user) ?: return done("Firebase nicht verfügbar")
        if(value.trim().length !in 2..60)return done("Alias: 2–60 Zeichen")
        ref.get().addOnSuccessListener {
            val task=if(it.exists())ref.update("alias",value.trim()) else
                ref.set(mapOf("alias" to value.trim(),"memberSince" to FieldValue.serverTimestamp(),"photoUrl" to ""))
            task.addOnSuccessListener { done(null) }
                .addOnFailureListener { e->done(e.localizedMessage) }
        }.addOnFailureListener { done(it.localizedMessage) }
    }
    fun getReview(transactionId:String,onData:(DocumentSnapshot?)->Unit) {
        val user=uid ?: return onData(null)
        db?.collection("reviews")?.document(transactionId+"_"+user)?.get()
            ?.addOnSuccessListener { onData(it) }
            ?.addOnFailureListener { onData(null) }
    }
    fun watchReviews(userId:String,onData:(List<DocumentSnapshot>)->Unit):ListenerRegistration? =
        db?.collection("reviews")?.whereEqualTo("revieweeUid",userId)
            ?.whereEqualTo("status","visible")?.orderBy("createdAt",Query.Direction.DESCENDING)
            ?.limit(60)?.addSnapshotListener { snap,_ -> onData(snap?.documents ?: emptyList()) }

    fun enablePush(done:(String?)->Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),1500)
            return done("Bitte Benachrichtigungen erlauben und erneut aktivieren")
        }
        requireVerified({
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                callable("registerPushToken",mapOf("token" to token,"platform" to "android",
                    "appVersion" to "1.5.0")) { _,e ->done(e) }
            }.addOnFailureListener { done(it.localizedMessage) }
        },{e->done(e)})
    }
}
